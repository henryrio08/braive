import CoreMotion
import Metal
import SceneKit
import SwiftUI
import UIKit

extension UIColor {
  convenience init(hex: String) {
    let n = UInt64(hex.dropFirst(), radix: 16) ?? 0x16251f
    self.init(
      red: CGFloat((n >> 16) & 255) / 255, green: CGFloat((n >> 8) & 255) / 255,
      blue: CGFloat(n & 255) / 255, alpha: 1)
  }
}
@MainActor final class World: ObservableObject {
  private(set) var metrics = RenderMetrics()
  private var surfaceMaterials:[SCNMaterial]=[]
  private var appearanceSunDirection=SCNVector3(0,-1,0)
  private var appearanceSeed=0
  private var appearanceStyle:JSON?
  var renderTime = 0.0
  var onRuntimeIssue: ((String) -> Void)?
  private var executionBlocked = false
  var eyeAspect = 1.0
  let scene = SCNScene(), head = SCNNode(), motion = CMMotionManager()
  let headsetPanels = HeadsetPanels()
  var captureRequest: URL?
  var onCapture: ((Result<URL,Error>) -> Void)?
  var reviewTrackingSuspended = false
  func setHeadsetText(title: String, detail: String, command: String, status: String, visible: Bool) {
    headsetPanels.update(title: title, detail: detail, command: command, status: status, visible: visible)
  }
  func setBlackout(_ level: Double) { headsetPanels.setBlackout(level) }
  let left = SCNNode(), right = SCNNode()
  var nodes: [String: SCNNode] = [:], viewpoints: [String: SCNVector3] = [:],
    characters: [String: String] = [:]
  var onPortrait: ((Bool) -> Void)?
  var onTrackingAvailability: ((Bool) -> Void)? {
    didSet { onTrackingAvailability?(trackingAvailable) }
  }
  private(set) var trackingAvailable = false
  private var trackingReported = false
  private var landscapeBasis: LandscapeBasis = .right
  private var pose = HeadPose()
  private var motionPaths: [String: ViewerPath] = [:]
  private var viewerMotion: ViewerMotion?
  private var viewpointFade: (destination: SIMD3<Float>, startedAt: Double)?
  var transitionShade: Float {
    guard let fade = viewpointFade else { return 0 }
    let t = min(1, max(0, (activeElapsed - fade.startedAt) / 0.6))
    return Float(1 - abs(2 * t - 1))
  }
  private var nodeMotions: [String: (motion: ViewerMotion, face: Bool)] = [:]
  private var practiceClock = PracticeClock()
  private var animationOrigin = 0.0
  var animationTime: Double { practiceClock.hasStarted ? animationOrigin + activeElapsed : renderTime }
  private var attachmentRig: SCNNode?
  private var attachmentOrigin = SIMD3<Float>(repeating: 0)
  var activeElapsed: Double { practiceClock.elapsed }
  var hasPendingMotion: Bool { viewerMotion != nil || viewpointFade != nil || !nodeMotions.isEmpty }
  func beginPracticeClock() { animationOrigin = renderTime; practiceClock.begin() }
  func pausePracticeClock() { practiceClock.pause(); renderMotion() }
  func resumePracticeClock() { practiceClock.resume() }
  var lensK1: Float = 0
  var lensK2: Float = 0
  var fov: Double = 70 {
    didSet {
      left.camera?.fieldOfView = fov
      right.camera?.fieldOfView = fov
    }
  }
  var ipd: Float = 0.064 {
    didSet {
      left.position.x = -ipd / 2
      right.position.x = ipd / 2
    }
  }
  init() {
    head.position = SCNVector3(0, 1.6, 0)
    scene.rootNode.addChildNode(head)
    headsetPanels.attach(to: head)
    for (eye, x) in [(left, -ipd / 2), (right, ipd / 2)] {
      eye.camera = SCNCamera()
      eye.camera?.fieldOfView = 70
      eye.camera?.zNear = 0.05
      eye.camera?.zFar = 150
      eye.camera?.wantsHDR = true
      eye.camera?.screenSpaceAmbientOcclusionIntensity = 0.12
      eye.camera?.screenSpaceAmbientOcclusionRadius = 0.25
      // Fixed exposure keeps brightness stable while the head moves.
      eye.camera?.wantsExposureAdaptation = false
      eye.position.x = x
      head.addChildNode(eye)
    }
    scene.background.contents = UIColor.black
    motion.deviceMotionUpdateInterval = 1 / 60
    if motion.isDeviceMotionAvailable {
      motion.startDeviceMotionUpdates(using: .xArbitraryZVertical, to: .main) { [weak self] data, error in
        Task { @MainActor in
          guard let self else { return }
          guard error == nil, let data else { self.reportTracking(false); return }
          self.track(data)
        }
      }
    }
  }
  private func reportTracking(_ available: Bool) {
    guard !trackingReported || trackingAvailable != available else { return }
    trackingReported = true
    trackingAvailable = available
    onTrackingAvailability?(available)
  }
  #if DEBUG
  /// Explicit synthetic controller audit; never a source of tracking in normal practice.
  func reviewTrackingAvailability(_ available: Bool) {
    precondition(ProcessInfo.processInfo.arguments.contains("--post-session-audit"))
    reportTracking(available)
  }
  #endif
  func track(_ data: CMDeviceMotion) {
    if reviewTrackingSuspended { return }
    let q = data.attitude.quaternion
    // Match the actual rendered interface, including landscape-left. Keep the last
    // basis when the interface is not yet known; gravity still controls portrait pause.
    if let windowScene = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene })
      .first(where: { $0.activationState == .foregroundActive }) {
      switch windowScene.interfaceOrientation {
      case .landscapeLeft: landscapeBasis = .left
      case .landscapeRight: landscapeBasis = .right
      default: break
      }
    }
    let phone = simd_quatf(ix: Float(q.x), iy: Float(q.y), iz: Float(q.z), r: Float(q.w))
    head.simdOrientation = pose.update(landscapeBasis.cameraOrientation(phone))
    reportTracking(true)
    let g = data.gravity
    if abs(g.y) > 0.78 { onPortrait?(true) } else if abs(g.x) > 0.65 { onPortrait?(false) }
  }
  func recenter() {
    head.simdOrientation = pose.recenter()
  }
  func clear() {
    materialOverrides = [:]; actorBehaviors = [:]; environmentOverride = JSON()
    surfaceMaterials=[]
    appearanceStyle=nil
    executionBlocked=false
    motionPaths = [:]; viewerMotion = nil; viewpointFade = nil
    nodeMotions = [:]
    attachmentRig = nil
    practiceClock = PracticeClock()
    for child in scene.rootNode.childNodes where child !== head { child.removeFromParentNode() }
    nodes = [:]
    viewpoints = [:]
    characters = [:]
  }
  private var textureCache: [String: UIImage] = [:]
  private var materialOverrides: [String: JSON] = [:]
  private var actorBehaviors: [String: String] = [:]
  private var environmentOverride = JSON()
  private struct TextureEntry: Decodable {
    let id: String
    let relative_path: String
  }
  private var textureEntries: [TextureEntry]?
  private func textureEntry(_ assetID: String) -> TextureEntry? {
    if textureEntries == nil {
      guard let url = Bundle.main.url(forResource: "texture_manifest", withExtension: "json"),
        let data = try? Data(contentsOf: url),
        let entries = try? JSONDecoder().decode([TextureEntry].self, from: data) else { return nil }
      textureEntries = entries
    }
    return textureEntries?.first(where: { $0.id == assetID })
  }
  /// Registered texture delivery: only bundled texture_manifest entries load, decoded
  /// bounded to 1024px and cached. Mesh assets keep their library materials;
  /// a texture ID never replaces finished geometry appearance on failure.
  func textureImage(_ assetID: String) -> UIImage? {
    if assetID.hasPrefix("texture.generated.") { return GeneratedTextures.image(assetID) }
    if let cached = textureCache[assetID] { return cached }
    guard let entry = textureEntry(assetID), !entry.relative_path.contains(".."),
      ["png", "jpg", "jpeg"].contains((entry.relative_path as NSString).pathExtension.lowercased()),
      let url = Bundle.main.resourceURL?.appendingPathComponent(entry.relative_path),
      let image = UIImage(contentsOfFile: url.path) else { return nil }
    let maxSide: CGFloat = 1024
    let scale = min(1, maxSide / max(image.size.width, image.size.height))
    let decoded: UIImage
    if scale < 1 {
      let size = CGSize(width: image.size.width * scale, height: image.size.height * scale)
      decoded = UIGraphicsImageRenderer(size: size).image { _ in image.draw(in: CGRect(origin: .zero, size: size)) }
    } else { decoded = image }
    if textureCache.count > 24 { textureCache.removeAll() }
    textureCache[assetID] = decoded
    return decoded
  }
  func material(_ value: JSON) -> SCNMaterial {
    let m = SCNMaterial()
    if let textureID = value["texture_asset_id"].string, let image = textureImage(textureID) {
      m.diffuse.contents = image
      let scale = Float(value["texture_scale"].number ?? 1)
      m.diffuse.contentsTransform = SCNMatrix4MakeScale(scale, scale, 1)
      m.diffuse.wrapS = .repeat
      m.diffuse.wrapT = .repeat
    } else {
      m.diffuse.contents = UIColor(hex: value["color"].text)
    }
    m.roughness.contents = value["roughness"].value
    m.transparency = CGFloat(value["opacity"].number ?? 1)
    m.isDoubleSided = value["double_sided"].bool ?? false
    m.lightingModel = .physicallyBased
    if value["surface"]["profile"].text == "water" { m.transparency=CGFloat(value["opacity"].number ?? 0.72);m.isDoubleSided=true }
    if value["surface"]["profile"].text == "glass" { m.transparency=CGFloat(value["opacity"].number ?? 0.25);m.isDoubleSided=true }
    SceneAppearance.applySurface(value["surface"],to:m)
    return m
  }
  func applyMaterial(_ value: JSON, to node: SCNNode, tint: Bool = true) {
    let protectedCharacter = AssetLibrary.isCharacter(node)
    if AssetLibrary.isCharacter(node) { if tint { AssetLibrary.recolor(node,hex:value["color"].string) };return }
    func apply(_ n:SCNNode) {
      guard let geometry=n.geometry else { return }
      geometry.materials=geometry.materials.map { source in
        let m=source.copy() as! SCNMaterial
        if !protectedCharacter, let id = value["texture_asset_id"].string, let image = textureImage(id) {
          m.diffuse.contents = image
          let scale = Float(value["texture_scale"].number ?? 1)
          m.diffuse.contentsTransform = SCNMatrix4MakeScale(scale, scale, 1)
          m.diffuse.wrapS = .repeat; m.diffuse.wrapT = .repeat
        } else if tint, !protectedCharacter, let color=value["color"].string { m.diffuse.contents=UIColor(hex:color) }
        if let roughness=value["roughness"].number { m.roughness.contents=roughness }
        if let opacity=value["opacity"].number { m.transparency=CGFloat(opacity) }
        if let sided=value["double_sided"].bool { m.isDoubleSided=sided }
        if value["surface"]["profile"].text == "water" { m.transparency=CGFloat(value["opacity"].number ?? 0.72);m.isDoubleSided=true }
        if value["surface"]["profile"].text == "glass" { m.transparency=CGFloat(value["opacity"].number ?? 0.25);m.isDoubleSided=true }
        SceneAppearance.applySurface(value["surface"],to:m)
        return m
      }
    }
    apply(node);node.enumerateChildNodes { n,_ in apply(n) }
  }
  func vector(_ j: JSON) -> SCNVector3 {
    let a = j.list.map { Float($0.value) }
    return a.count == 3 ? SCNVector3(a[0], a[1], a[2]) : SCNVector3Zero
  }
  func geometry(_ j: JSON) throws -> SCNGeometry {
    let g = j["geometry"]
    switch g["kind"].text {
    case "box":
      let s = g["size"].list
      guard s.count == 3 else { throw failure("Box dimensions missing") }
      return SCNBox(width: s[0].value, height: s[1].value, length: s[2].value, chamferRadius: 0.03)
    case "plane": return SCNPlane(width: g["width"].value, height: g["height"].value)
    case "sphere": return SCNSphere(radius: g["radius"].value)
    case "cylinder": return SCNCylinder(radius: g["radius"].value, height: g["height"].value)
    default: throw failure("Unsupported asset geometry")
    }
  }
  func failure(_ text: String) -> NSError {
    NSError(domain: "Scene", code: 1, userInfo: [NSLocalizedDescriptionKey: text])
  }
  func load(_ spec: JSON, plan: JSON, install: Bool = true) throws {
    guard spec["revision"] == plan["revision"], spec["session_id"] == plan["session_id"],
      spec["stereo"]["presentation"].text == "stereographic", spec["nodes"].list.count <= 350
    else { throw failure("Scene revision or renderer budget invalid") }
    let paths = try JSONDecoder().decode([ViewerPath].self, from: JSONEncoder().encode(spec["motion_paths"].array == nil ? JSON([]) : spec["motion_paths"]))
    guard Set(paths.map(\.id)).count == paths.count else { throw failure("Duplicate motion path") }
    for path in paths {
      var previous = 0.0
      for point in path.points {
        guard point.at_seconds > previous, point.position.count == 3, point.position.allSatisfy(\.isFinite) else { throw failure("Invalid motion path") }
        previous = point.at_seconds
      }
      guard !path.points.isEmpty else { throw failure("Empty motion path") }
    }
    let viewDistance = spec["view_distance_meters"].number ?? 150
    guard (150...10000).contains(viewDistance) else { throw failure("Invalid viewing distance") }
    // Build off-scene and attach only after structural and visibility checks.
    if spec["environment"].object != nil {
      let environment=try JSONDecoder().decode(VisualEnvironmentState.self,from:JSONEncoder().encode(spec["environment"]))
      guard environment.fog.start_meters < environment.fog.end_meters, environment.fog.end_meters <= viewDistance else { throw failure("Invalid explicit environment distances") }
    }
    let root = SCNNode()
    let validationScene = SCNScene()
    validationScene.rootNode.addChildNode(root)
    defer { if root.parent === validationScene.rootNode { root.removeFromParentNode() } }
    var built: [String: SCNNode] = [:]
    let list = spec["nodes"].list
    let props = Set(plan["props"].list.map(\.text))
    if plan["experience"].object != nil {
      guard props.allSatisfy({ prop in list.contains { $0["prop_name"].text == prop } }),
        list.allSatisfy({ $0["prop_name"].string == nil || props.contains($0["prop_name"].text) })
      else { throw failure("Scene props do not match the approved task") }
    }
    let attached = Set(spec["viewer_attached_node_ids"].list.map(\.text))
    let expectedCharacters = Set(plan["characters"].list.map { $0["scene_node_id"].text })
    let visibleCharacters = Set(list.filter { $0["role"].text == "character" || $0["geometry"]["asset_id"].text.hasPrefix("character.base.") }.map { $0["id"].text })
    guard visibleCharacters == expectedCharacters else { throw failure("Scene cast does not match the approved characters") }
    for j in list {
      let id = j["id"].text
      guard built[id] == nil else { throw failure("Duplicate node ID") }
      let n: SCNNode
      if j["geometry"]["kind"].text == "asset" {
        let assetID = j["geometry"]["asset_id"].text
        let character = plan["characters"].list.first(where: { $0["scene_node_id"].text == id })
        if (j["role"].text == "character" || character != nil)
          && !assetID.hasPrefix("character.base.")
        {
          throw failure("Character must use character.base")
        }
        if let chosen = character?["asset_id"].string, chosen != assetID { throw failure("Character asset differs from the approved cast") }
        let coordinatorColor = character?["color_hex"].string
        n = try AssetLibrary.make(
          assetID, colorHex: coordinatorColor ?? j["material"]["color"].string)
        if j["animation"].text == "sit", n.animationPlayer(forKey:"braive_clip_sit") == nil { throw failure("Actor has no authored sitting pose") }
      } else {
        n = SCNNode(geometry: try geometry(j))
      }
      n.name = id
      RouteAudit.setCollisionRole(j["collision_role"].string ?? "solid", for: n)
      if j["geometry"]["kind"].text != "asset" { n.geometry?.materials = [material(j["material"])] }
      else { applyMaterial(j["material"],to:n,tint:false) }
      n.position = vector(j["position"])
      n.eulerAngles = vector(j["rotation_radians"])
      n.scale = vector(j["scale"])
      built[id] = n
    }
    for j in list {
      let id = j["id"].text
      var seen = Set([id])
      var parent = j["parent_id"].text
      while !parent.isEmpty {
        guard !seen.contains(parent), let entry = list.first(where: { $0["id"].text == parent })
        else { throw failure("Invalid hierarchy") }
        seen.insert(parent)
        parent = entry["parent_id"].text
      }
      if let p = j["parent_id"].string {
        guard let parent = built[p] else { throw failure("Missing parent") }
        parent.addChildNode(built[id]!)
      } else {
        root.addChildNode(built[id]!)
      }
    }
    for id in attached {
      guard let node = built[id] else { throw failure("Unknown viewer attachment") }
      var parent = node.parent
      while let p = parent {
        guard !attached.contains(p.name ?? "") else { throw failure("Attach only the assembly root") }
        parent = p.parent
      }
    }
    if plan["experience"].object != nil && spec["scenario"].object == nil { throw failure("Missing executable scenario") }
    if spec["scenario"].object != nil {
      let definition = try JSONDecoder().decode(ScenarioDefinition.self, from: JSONEncoder().encode(spec["scenario"]))
      _ = try ScenarioRuntime(definition)
      let planned = plan["experience"]["stages"].list
      if !planned.isEmpty {
        guard planned.map({ $0["id"].text }) == definition.steps.map(\.id),
          zip(planned, definition.steps).allSatisfy({ $0.0["action_ids"].list.map(\.text).sorted() == $0.1.actions.map(\.id).sorted() })
        else { throw failure("Scene stages/actions differ from the approved experience") }
      }
      let pathIDs = Set(paths.map(\.id))
      for op in definition.steps.flatMap({ $0.start_operations + $0.actions.flatMap(\.operations) }) where ["move_viewer","move_node"].contains(op["type"].text) {
        guard pathIDs.contains(op["path_id"].text), op["type"].text != "move_node" || built[op["node_id"].text] != nil else { throw failure("Scenario motion reference missing") }
      }
    }
    guard Set(spec["viewpoints"].list.map { $0["id"].text }).count == spec["viewpoints"].list.count
    else { throw failure("Duplicate viewpoints") }
    let views = Dictionary(
      uniqueKeysWithValues: spec["viewpoints"].list.map { ($0["id"].text, vector($0["position"])) })
    guard var initial = views[spec["initial_viewpoint_id"].text] else {
      throw failure("Missing initial viewpoint")
    }
    // Check the actual opening state, including changes made before the first
    // active frame. These idempotent changes are replayed by the runtime.
    let opening = spec["scenario"]["steps"].list.first?["start_operations"].list ?? []
    let zeroEvents = spec["events"].list.filter { $0["at_active_second"].value == 0 }.map { $0["operation"] }
    for op in opening + zeroEvents {
      switch op["type"].text {
      case "set_visible": built[op["node_id"].text]?.isHidden = !(op["visible"].bool ?? true)
      case "set_material":
        if let node = built[op["node_id"].text] {
          applyMaterial(op["material"],to:node)
        }
      case "viewpoint_transition": if let point = views[op["destination_id"].text] { initial = point }
      default: break
      }
    }
    let focusEntries = list.filter { $0["role"].text == "task_focus" }
    SCNTransaction.flush()
    // A procedural object's nearby named parts form one visible target, like a GLB subtree.
    // Otherwise a buoy's own stripe/cap is incorrectly counted as an occluder of the buoy.
    let focus = list.filter { entry in
      if entry["role"].text == "task_focus" { return true }
      guard let prop = entry["prop_name"].string, let part = built[entry["id"].text] else { return false }
      let p = part.convertPosition(SCNVector3Zero, to: root)
      return focusEntries.contains { focus in
        guard focus["prop_name"].text == prop, let node = built[focus["id"].text] else { return false }
        let q = node.convertPosition(SCNVector3Zero, to: root)
        return simd_length(SIMD3(p.x-q.x,p.y-q.y,p.z-q.z)) <= 2
      }
    }.compactMap { built[$0["id"].text] }
    guard !focus.isEmpty else { throw failure("Missing task focus") }
    // Structural checks followed by offscreen both-eye geometry visibility checks.
    guard
      focus.contains(where: { n in
        let p = n.convertPosition(SCNVector3Zero, to: root)
        return p.z < initial.z - 0.15
      })
    else { throw failure("Task focus is behind the initial viewer") }
    do {
      try ScenePreflight.check(root: root, focus: focus, position: initial, ipd: ipd, fov: fov, aspect: eyeAspect, far: viewDistance)
    } catch {
      #if DEBUG
      if ProcessInfo.processInfo.arguments.contains("--render-scenario-review") {
        let diagnostic = SCNScene(); diagnostic.rootNode.addChildNode(root)
        diagnostic.background.contents = UIColor(hex: spec["atmosphere"]["background_color"].text)
        let light = SCNNode(); light.light = SCNLight(); light.light?.type = .ambient; light.light?.intensity = CGFloat(spec["lighting"]["ambient_intensity"].value * 650); diagnostic.rootNode.addChildNode(light)
        let camera = SCNNode(); camera.camera = SCNCamera(); camera.camera?.fieldOfView = fov; camera.camera?.zFar = viewDistance; camera.position = initial; diagnostic.rootNode.addChildNode(camera)
        let renderer = SCNRenderer(device: MTLCreateSystemDefaultDevice(), options: nil); renderer.scene = diagnostic; renderer.pointOfView = camera; renderer.autoenablesDefaultLighting = true
        let folder = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("ScenarioReview")
        try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        try? renderer.snapshot(atTime: 0, with: CGSize(width:900,height:900), antialiasingMode:.multisampling4X).pngData()?.write(to: folder.appendingPathComponent("rejected-initial.png"))
        root.removeFromParentNode()
      }
      #endif
      throw error
    }
    var actualNodes = 0
    var bytes = 0
    var triangles = 0
    root.enumerateChildNodes { n, _ in
      actualNodes += 1
      if let g = n.geometry {
        for source in g.sources { bytes += source.data.count }
        for element in g.elements { triangles += element.primitiveCount }
      }
    }
    guard actualNodes + (attached.isEmpty ? 0 : 1) <= 1000, triangles <= 180000, bytes < 24_000_000 else {
      throw failure(
        "Resolved scene exceeds phone geometry budget: \(actualNodes) nodes, \(triangles) primitives, \(bytes) geometry bytes"
      )
    }
    for j in list {
      if let supportID=j["support_node_id"].string {
        guard let node=built[j["id"].text],let support=built[supportID] else { throw failure("Declared support is missing") }
        do { try RouteAudit.support(root:root,node:node,support:support,contact:j["support_contact"].array == nil ? nil : vector(j["support_contact"])) }
        catch { print("[scene quality] \(error.localizedDescription)") }
      }
    }
    try StageAudit.check(spec:spec,root:root,nodes:built,characterNodeIDs:expectedCharacters,initial:initial,ipd:ipd,fov:fov,aspect:eyeAspect,applyMaterial:{ value,node in self.applyMaterial(value,to:node) })
    var estimatedSubmissions=0
    root.enumerateChildNodes { n,_ in estimatedSubmissions += n.geometry?.elements.count ?? 0 }
    if !install { return }
    metrics=RenderMetrics()
    metrics.estimatedSubmissionsPerEye=estimatedSubmissions
    clear()
    motionPaths = Dictionary(uniqueKeysWithValues: paths.map { ($0.id, $0) })
    scene.rootNode.addChildNode(root)
    nodes = built
    viewpoints = views
    head.position = initial
    attachmentOrigin = SIMD3(initial.x, initial.y, initial.z)
    if !attached.isEmpty {
      let rig = SCNNode(); root.addChildNode(rig)
      for id in attached {
        let node = built[id]!, transform = node.simdWorldTransform
        rig.addChildNode(node); node.simdWorldTransform = transform
      }
      attachmentRig = rig
    }
    left.camera?.zFar = viewDistance; right.camera?.zFar = viewDistance
    scene.lightingEnvironment.contents=nil;scene.lightingEnvironment.intensity=0
    scene.background.contents = UIColor(hex: spec["atmosphere"]["background_color"].text)
    scene.fogColor = UIColor(hex: spec["atmosphere"]["background_color"].text)
    scene.fogStartDistance = 5
    scene.fogEndDistance = max(30, (spec["view_distance_meters"].number == nil ? 70 : viewDistance) * (1 - spec["atmosphere"]["fog_density"].value))
    let light = SCNNode()
    light.light = SCNLight()
    light.light?.type = .ambient
    light.light?.color = UIColor(hex: spec["lighting"]["ambient_color"].text)
    light.name = "braive_ambient"
    light.light?.intensity = CGFloat(spec["lighting"]["ambient_intensity"].value * 650)
    scene.rootNode.addChildNode(light)
    let sun = SCNNode()
    sun.light = SCNLight()
    sun.light?.type = .directional
    sun.name="braive_sun"
    sun.light?.intensity = CGFloat(spec["lighting"]["key_intensity"].value * 800)
    let direction = vector(spec["lighting"]["key_direction"])
    appearanceSunDirection=direction;appearanceSeed=Int(spec["construction_plan"]["seed"].value)
    let ray = SIMD3<Float>(direction.x, direction.y, direction.z)
    if simd_length(ray) > 0.001 {
      sun.simdOrientation = simd_quatf(from: SIMD3<Float>(0,0,-1), to: simd_normalize(ray))
      sun.simdPosition = SIMD3(initial.x,initial.y,initial.z) - simd_normalize(ray) * 18
    }
    sun.light?.castsShadow = true
    // Scale the shadow frustum to the authored scene so grounding shadows
    // survive beyond a fixed 18 m box without wasting resolution indoors.
    let shadowBounds = root.boundingBox
    let shadowSpan = max(shadowBounds.max.x - shadowBounds.min.x, shadowBounds.max.z - shadowBounds.min.z)
    let shadowScale: CGFloat = min(44, max(16, CGFloat(shadowSpan) * 0.75))
    sun.light?.shadowMapSize = shadowSpan <= 26 ? CGSize(width: 2048, height: 2048) : CGSize(width: 1024, height: 1024)
    sun.light?.shadowSampleCount = 4
    sun.light?.shadowRadius = 3
    sun.light?.shadowColor = UIColor.black.withAlphaComponent(0.28)
    sun.light?.orthographicScale = shadowScale
    sun.light?.zFar = max(70, shadowScale * 2.5)
    scene.rootNode.addChildNode(sun)
    for c in plan["characters"].list {
      characters[c["id"].text] = c["scene_node_id"].text
      let initialBehavior = list.first(where: { $0["id"].text == c["scene_node_id"].text })?["animation"].text ?? "idle"
      animate(c["id"].text, initialBehavior == "none" ? "idle" : initialBehavior)
    }
    if spec["environment"].object != nil {
      try SceneAppearance.applyEnvironment(spec["environment"],to:scene,sunDirection:appearanceSunDirection,seed:appearanceSeed)
      appearanceStyle=spec["environment"]["style"]
    }
    // Establish the authored opening appearance before its visual reveal.
    // Travel, time, narration and sound begin only when practice actually starts.
    let initialStep = spec["scenario"]["steps"].list.first { $0["id"].text == spec["scenario"]["initial_step_id"].text }
    for op in initialStep?["start_operations"].list ?? [] where ["set_visible","set_material","character_action","set_environment"].contains(op["type"].text) {
      operation(op,speak:{_ in},sound:{_ in})
    }
    surfaceMaterials=SceneAppearance.animatedMaterials(scene.rootNode)
  }
  func animate(_ id: String, _ behavior: String) {
    guard let n = nodes[characters[id] ?? id] else { return }
    actorBehaviors[id] = behavior
    AssetLibrary.animate(n, behavior: behavior)
  }

  func operation(_ op: JSON, speak: (String) -> Void, sound: (String) -> Void) {
    guard !executionBlocked else { return }
    switch op["type"].text {
    case "set_visible": nodes[op["node_id"].text]?.isHidden = !(op["visible"].bool ?? true)
    case "set_material":
      if let node = nodes[op["node_id"].text] {
        materialOverrides[op["node_id"].text] = op["material"]
        applyMaterial(op["material"],to:node)
        if let appearanceStyle { SceneAppearance.applyStyle(appearanceStyle,to:node) }
        surfaceMaterials=SceneAppearance.animatedMaterials(scene.rootNode)
      }
    case "character_action": animate(op["character_id"].text, op["behavior"].text)
    case "viewpoint_transition":
      if let p = viewpoints[op["destination_id"].text] { viewerMotion = nil; viewpointFade = (SIMD3(p.x,p.y,p.z), activeElapsed) }
    case "move_viewer":
      if let path = motionPaths[op["path_id"].text] {
        renderMotion()
        viewpointFade=nil
        if let expected=path.start_position, expected.count==3,
          simd_length(head.simdPosition-SIMD3(expected[0],expected[1],expected[2]))>max(0.35,path.clearance_radius_meters ?? 0.25) {
          executionBlocked=true;onRuntimeIssue?("The route's entry anchor does not match the participant position");return
        }
        let forward = head.simdWorldOrientation.act(SIMD3<Float>(0,0,-1))
        let flat = SIMD3<Float>(forward.x,0,forward.z)
        let heading = simd_length(flat) > 0.001 ? simd_quatf(from: SIMD3<Float>(0,0,-1), to: simd_normalize(flat)) : simd_quatf(angle: 0, axis: SIMD3(0,1,0))
        let candidate = ViewerMotion.start(path: path, origin: head.simdPosition, at: activeElapsed, frame: heading, replacing: viewerMotion)
        do {
          let points=[head.position]+path.points.filter { candidate.startedAt+$0.at_seconds > activeElapsed }.map { p -> SCNVector3 in
            let world=candidate.sample(at:candidate.startedAt+p.at_seconds).position
            return SCNVector3(world.x,world.y,world.z)
          }
          try RouteAudit.check(root:scene.rootNode,points:points,walking:["walk","run"].contains(path.purpose),ignored:attachmentRig.map { [$0] } ?? [],radius:path.clearance_radius_meters ?? 0.25,eyeHeight:path.eye_height_meters ?? 1.6)
          viewerMotion=candidate
        } catch { executionBlocked=true;onRuntimeIssue?(error.localizedDescription) }
      }
    case "move_node":
      let nodeID = op["node_id"].text
      if let path = motionPaths[op["path_id"].text], let node = nodes[nodeID] {
        renderMotion()
        let candidate=ViewerMotion.start(path:path,origin:node.simdWorldPosition,at:activeElapsed,frame:node.simdWorldOrientation,replacing:nodeMotions[nodeID]?.motion)
        // Use human clearance for approved characters. Animated props retain
        // their actual collision geometry without acquiring a human body.
        if characters.values.contains(nodeID) {
          let points=[node.worldPosition]+path.points.filter { candidate.startedAt+$0.at_seconds > activeElapsed }.map { p -> SCNVector3 in
            let world=candidate.sample(at:candidate.startedAt+p.at_seconds).position
            return SCNVector3(world.x,world.y,world.z)
          }
          do { try RouteAudit.check(root:scene.rootNode,points:points.map { SCNVector3($0.x,$0.y+(path.eye_height_meters ?? 1.6),$0.z) },walking:["walk","run"].contains(path.purpose),ignored:[node],radius:path.clearance_radius_meters ?? 0.25,eyeHeight:path.eye_height_meters ?? 1.6) }
          catch { executionBlocked=true;onRuntimeIssue?(error.localizedDescription);return }
        }
        nodeMotions[nodeID] = (candidate, op["face_motion"].bool ?? false)
      }
    case "set_environment":
      environmentOverride = op
      if op["environment"].object != nil {
        do {
          try SceneAppearance.applyEnvironment(op["environment"],to:scene,sunDirection:appearanceSunDirection,seed:appearanceSeed)
          appearanceStyle=op["environment"]["style"]
        }
        catch { executionBlocked=true;onRuntimeIssue?(error.localizedDescription) }
        if let intensity=op["ambient_intensity"].number { scene.rootNode.childNode(withName:"braive_ambient",recursively:false)?.light?.intensity=CGFloat(intensity*650) }
        return
      }
      scene.lightingEnvironment.contents=nil;scene.lightingEnvironment.intensity=0
      scene.background.contents = UIColor(hex: op["background_color"].text)
      scene.fogColor = UIColor(hex: op["background_color"].text)
      scene.fogEndDistance = max(8, (left.camera?.zFar ?? 150) * (1 - op["fog_density"].value))
      if let intensity = op["ambient_intensity"].number { scene.rootNode.childNode(withName: "braive_ambient", recursively: false)?.light?.intensity = CGFloat(intensity * 650) }
    case "narrate": speak(op["text"].text)
    case "play_sound": sound(op["cue_id"].text)
    default: break
    }
  }
  func checkpoint() -> JSON {
    func motionJSON(_ motion: ViewerMotion) -> [String: Any] {
      ["path_id": motion.path.id, "origin": [motion.origin.x,motion.origin.y,motion.origin.z],
       "started_at": motion.startedAt, "frame": [motion.frame.imag.x,motion.frame.imag.y,motion.frame.imag.z,motion.frame.real]]
    }
    return JSON(["elapsed":activeElapsed,"animation_origin":animationOrigin,"position":[head.position.x,head.position.y,head.position.z],
      "nodes":nodes.mapValues { n -> [String: Any] in ["position":[n.position.x,n.position.y,n.position.z], "rotation":[n.eulerAngles.x,n.eulerAngles.y,n.eulerAngles.z], "scale":[n.scale.x,n.scale.y,n.scale.z], "hidden":n.isHidden] },
      "materials":materialOverrides.mapValues(\.raw),"behaviors":actorBehaviors,"environment":environmentOverride.raw,
      "postures":characters.mapValues { id in nodes[id].map { AssetLibrary.posture($0) } ?? "stand" },
      "viewer_motion": viewerMotion.map(motionJSON) as Any? ?? NSNull(),
      "node_motions":nodeMotions.mapValues { ["motion":motionJSON($0.motion),"face":$0.face] as [String:Any] },
      "fade":viewpointFade.map { ["destination":[$0.destination.x,$0.destination.y,$0.destination.z],"started_at":$0.startedAt] as [String:Any] } as Any? ?? NSNull()])
  }
  func restore(_ saved: JSON, allowingRemoved removed: Set<String> = [], changedTransforms: Set<String> = [], changedMaterials: Set<String> = [],
    changedBehaviors: Set<String> = [], environmentChanged: Bool = false) throws {
    let elapsed = saved["elapsed"].value
    guard elapsed.isFinite, elapsed >= 0 else { throw failure("Invalid saved practice time") }
    func point(_ value: JSON) throws -> SIMD3<Float> {
      guard value.list.count == 3, value.list.allSatisfy({ $0.number?.isFinite == true }) else { throw failure("Invalid saved position") }
      return SIMD3(Float(value.list[0].value),Float(value.list[1].value),Float(value.list[2].value))
    }
    func motion(_ value: JSON) throws -> ViewerMotion? {
      guard value.object != nil else { return nil }
      guard let path = motionPaths[value["path_id"].text], value["frame"].list.count == 4 else { throw failure("Saved motion path is unavailable") }
      let q=value["frame"].list.map { Float($0.value) }
      guard q.allSatisfy(\.isFinite), value["started_at"].value.isFinite else { throw failure("Invalid saved motion") }
      return ViewerMotion(path:path,origin:try point(value["origin"]),startedAt:value["started_at"].value,frame:simd_quatf(ix:q[0],iy:q[1],iz:q[2],r:q[3]))
    }
    // Validate the complete snapshot before changing any current runtime state.
    let viewerPosition = try point(saved["position"])
    for (id,value) in saved["nodes"].object ?? [:] {
      if nodes[id] == nil {
        guard removed.contains(id) else { throw failure("Saved scene node is unavailable: " + id) }
        continue
      }
      _ = try point(value["position"]); _ = try point(value["rotation"])
      if value["scale"].array != nil { _ = try point(value["scale"]) }
    }
    let restoredViewerMotion = try motion(saved["viewer_motion"])
    var restoredNodeMotions: [String: (motion: ViewerMotion, face: Bool)] = [:]
    for (id,value) in saved["node_motions"].object ?? [:] {
      if nodes[id] == nil {
        guard removed.contains(id) else { throw failure("Saved moving node is unavailable: " + id) }
        continue
      }
      if let m = try motion(value["motion"]) { restoredNodeMotions[id] = (m,value["face"].bool ?? false) }
    }
    practiceClock.restore(elapsed:elapsed);animationOrigin=saved["animation_origin"].value
    setViewerPosition(viewerPosition)
    for (id,value) in saved["nodes"].object ?? [:] {
      guard let node=nodes[id] else { continue }
      if !changedTransforms.contains(id) {
        node.simdPosition=try point(value["position"]);node.simdEulerAngles=try point(value["rotation"])
        if value["scale"].array != nil { node.simdScale = try point(value["scale"]) }
      }
      if let hidden = value["hidden"].bool { node.isHidden = hidden }
    }
    for (id, material) in saved["materials"].object ?? [:] where !changedMaterials.contains(id) && nodes[id] != nil {
      operation(JSON(["type":"set_material","node_id":id,"material":material.raw]),speak:{_ in},sound:{_ in})
    }
    for (id, posture) in saved["postures"].object ?? [:] where posture.text == "sit" {
      let requested = changedBehaviors.contains(id) ? actorBehaviors[id] : nil
      if let requested, ["walk","run","swim"].contains(requested) { continue }
      animate(id,"sit")
      if let requested { animate(id,requested) }
    }
    for (id, behavior) in saved["behaviors"].object ?? [:] where !changedBehaviors.contains(id) {
      animate(id,behavior.text)
    }
    if !environmentChanged, saved["environment"].object != nil {
      operation(saved["environment"],speak:{_ in},sound:{_ in})
    }
    viewerMotion=restoredViewerMotion;nodeMotions=restoredNodeMotions
    if saved["fade"].object != nil { viewpointFade=(try point(saved["fade"]["destination"]),saved["fade"]["started_at"].value) }
    renderMotion()
  }
  func updateMotion() -> Set<String> {
    renderMotion()
    var completed = Set<String>()
    if let motion = viewerMotion, motion.sample(at: activeElapsed).complete { completed.insert(motion.path.id); viewerMotion = nil }
    for (id, value) in nodeMotions where value.motion.sample(at: activeElapsed).complete {
      completed.insert(value.motion.path.id); nodeMotions.removeValue(forKey: id)
    }
    return completed
  }
  func renderMotion() {
    for material in surfaceMaterials { material.setValue(Float(animationTime),forKey:"braiveTime") }
    if let fade = viewpointFade {
      if activeElapsed - fade.startedAt >= 0.3 { setViewerPosition(fade.destination) }
      if activeElapsed - fade.startedAt >= 0.6 { viewpointFade = nil }
    }
    if let motion = viewerMotion { setViewerPosition(motion.sample(at: activeElapsed).position) }
    for (id, value) in nodeMotions {
      guard let node = nodes[id] else { continue }
      let sample = value.motion.sample(at: activeElapsed)
      node.simdWorldPosition = sample.position
      let ahead = value.motion.sample(at: activeElapsed + 0.02).position
      if value.face && simd_length(ahead - sample.position) > 0.001 { node.look(at: SCNVector3(ahead.x,ahead.y,ahead.z)) }
    }
  }
  private func setViewerPosition(_ position: SIMD3<Float>) {
    head.simdPosition = position
    attachmentRig?.simdPosition = position - attachmentOrigin
  }
  #if DEBUG
  /// Native asset/lighting comparison, explicitly requested by a diagnostic launch argument.
  func renderCharacterReview(to folder: URL) throws {
    try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
    _ = try AssetLibrary.auditAll()
    clear(); motion.stopDeviceMotionUpdates()
    head.position = SCNVector3(0,1.45,0); head.eulerAngles = SCNVector3Zero
    scene.background.contents = UIColor(hex: "#a9c2c4")
    let floor = SCNNode(geometry: SCNFloor())
    (floor.geometry as? SCNFloor)?.reflectivity = 0
    floor.geometry?.firstMaterial?.diffuse.contents = UIColor(hex: "#a39d87")
    floor.geometry?.firstMaterial?.roughness.contents = 0.9
    scene.rootNode.addChildNode(floor)
    let light = SCNNode(); light.light = SCNLight(); light.light?.type = .ambient; light.light?.intensity = 500; scene.rootNode.addChildNode(light)
    let sun = SCNNode(); sun.light = SCNLight(); sun.light?.type = .directional; sun.light?.intensity = 850
    sun.eulerAngles = SCNVector3(-0.8,-0.55,0); sun.light?.castsShadow = true; sun.light?.shadowMapSize = CGSize(width:1024,height:1024); sun.light?.shadowSampleCount = 4; sun.light?.shadowColor = UIColor.black.withAlphaComponent(0.28); scene.rootNode.addChildNode(sun)
    let ids = try AssetLibrary.entries.filter { $0.id.hasPrefix("character.base.") && $0.generation_enabled != false }.map(\.id)
    var people: [SCNNode] = []
    for (i,id) in ids.enumerated() {
      let person = try AssetLibrary.make(id, colorHex: i == 2 ? "#7b9385" : "#c98b69")
      person.position = SCNVector3((Float(i)-Float(ids.count-1)/2)*1.35,0,-4); person.eulerAngles.y = .pi
      scene.rootNode.addChildNode(person); AssetLibrary.animate(person,behavior:"idle"); people.append(person)
    }
    let renderer = SCNRenderer(device:MTLCreateSystemDefaultDevice(),options:nil); renderer.scene = scene; renderer.pointOfView = left
    func capture(_ name:String, at time:Double) throws {
      renderer.sceneTime = time
      guard let png = renderer.snapshot(atTime:time,with:CGSize(width:1200,height:900),antialiasingMode:.multisampling4X).pngData() else { throw failure("Character review snapshot unavailable") }
      try png.write(to:folder.appendingPathComponent(name+".png"))
    }
    try capture("standing",at:1.2)
    AssetLibrary.animate(people[2],behavior:"sit"); try capture("seated",at:2.2)
    AssetLibrary.animate(people[2],behavior:"speak"); try capture("seated-speaking",at:2.8)
    AssetLibrary.animate(people[1],behavior:"walk"); try capture("walking",at:3.1)
    try JSONEncoder().encode(JSON(["status":"passed","asset_count":try AssetLibrary.entries.count,"registered_characters":ids])).write(to:folder.appendingPathComponent("result.json"))
  }
  /// Explicit offline review of a previously generated scene; never a normal-practice fallback.
  func renderScenarioReview(_ spec: JSON, to folder: URL) throws {
    try ScenePreflight.verifyRejections()
    try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
    let origin = head.simdPosition, orientation = head.simdOrientation
    defer { setViewerPosition(origin); head.simdOrientation = orientation; viewerMotion = nil; nodeMotions = [:] }
    let renderer = SCNRenderer(device: MTLCreateSystemDefaultDevice(), options: nil)
    renderer.scene = scene; renderer.pointOfView = left; renderer.autoenablesDefaultLighting = false
    var names: [String] = []
    var reviewedPaths = Set<String>()
    func capture(_ raw: String, pitch: Float = 0) throws {
      let name = raw.replacingOccurrences(of: "[^A-Za-z0-9_-]", with: "_", options: .regularExpression)
      head.simdOrientation = simd_quatf(angle: pitch, axis: SIMD3(1,0,0))
      renderer.sceneTime = 1.2
      let frame = renderer.snapshot(atTime: 0, with: CGSize(width: 900, height: 900), antialiasingMode: .multisampling4X)
      guard let png = frame.pngData() else { throw failure("Scene review image unavailable") }
      try png.write(to: folder.appendingPathComponent(name + ".png")); names.append(name)
    }
    func review(_ op: JSON) throws {
      if op["type"].text == "move_viewer", let path = motionPaths[op["path_id"].text], let last = path.points.last {
        guard reviewedPaths.insert(path.id).inserted else { return }
        let motion = ViewerMotion(path: path, origin: head.simdPosition, startedAt: 0)
        setViewerPosition(motion.sample(at: last.at_seconds * 0.5).position)
        try capture(path.id + "-mid")
        try capture(path.id + "-mid-down", pitch: -0.65)
        try capture(path.id + "-mid-up", pitch: 0.65)
        setViewerPosition(motion.sample(at: last.at_seconds).position)
        try capture(path.id + "-end", pitch: -0.3)
      } else { operation(op, speak: { _ in }, sound: { _ in }) }
    }
    if spec["scenario"]["steps"].list.isEmpty { try capture("initial") }
    for (i, step) in spec["scenario"]["steps"].list.enumerated() {
      for op in step["start_operations"].list { try review(op) }
      if i == 0 { try capture("initial") }
      for action in step["actions"].list {
        for op in action["operations"].list { try review(op) }
      }
    }
    try JSONEncoder().encode(JSON(["status":"passed","mode":"offline generated-scene review","frames":names])).write(to: folder.appendingPathComponent("result.json"))
  }
  #endif
  func auditAssets() throws -> Int {
    let count = try AssetLibrary.auditAll()
    clear()
    head.position = SCNVector3(0, 1.6, 0)
    scene.background.contents = UIColor(hex: "#35473f")
    let light = SCNNode()
    light.light = SCNLight()
    light.light?.type = .ambient
    light.light?.intensity = 700
    scene.rootNode.addChildNode(light)
    let all = try AssetLibrary.entries
    let sample =
      Array(all.filter { $0.id.hasPrefix("character.base.") }.prefix(1))
      + Array(all.filter { $0.category == "furniture" }.prefix(6))
    for (i, entry) in sample.enumerated() {
      let n = try AssetLibrary.make(entry.id, colorHex: "#3A8FBC")
      n.position = SCNVector3(Float(i % 4) * 1.6 - 2.4, 0, -3 - Float(i / 4) * 3)
      scene.rootNode.addChildNode(n)
    }
    return count
  }
  func lobby() {
    left.camera?.zFar = 150;right.camera?.zFar = 150
    clear();head.position = SCNVector3(0,1.6,0)
    var seed: UInt32 = 20261104
    func random() -> Float { seed = seed &* 1664525 &+ 1013904223;return Float(seed >> 8)/Float(1 << 24) }
    let ambient = SCNNode();ambient.light = SCNLight();ambient.light?.type = .ambient
    ambient.light?.color = UIColor(hex:"#d8d5bf");ambient.light?.intensity = 340;scene.rootNode.addChildNode(ambient)
    let sun = SCNNode();sun.name = "braive_sun";sun.light = SCNLight();sun.light?.type = .directional
    sun.light?.color = UIColor(hex:"#fff0d0");sun.light?.intensity = 850;sun.eulerAngles = SCNVector3(-0.7,-0.6,0)
    sun.light?.castsShadow = true;sun.light?.shadowMapSize = CGSize(width:1024,height:1024)
    sun.light?.shadowSampleCount = 4;sun.light?.shadowRadius = 4;sun.light?.shadowColor = UIColor.black.withAlphaComponent(0.26)
    sun.light?.orthographicScale = 20;sun.light?.zFar = 65;scene.rootNode.addChildNode(sun)
    let ground = SCNPlane(width:90,height:90),groundMaterial = SCNMaterial()
    groundMaterial.lightingModel = .physicallyBased;groundMaterial.roughness.contents = 0.98
    if let texture = textureImage("texture.surface.grass_01") {
      groundMaterial.diffuse.contents = texture;groundMaterial.diffuse.wrapS = .repeat;groundMaterial.diffuse.wrapT = .repeat
      groundMaterial.diffuse.contentsTransform = SCNMatrix4MakeScale(36,36,1);groundMaterial.diffuse.maxAnisotropy = 8
      groundMaterial.multiply.contents = UIColor(hex:"#a5a783")
    } else { groundMaterial.diffuse.contents = UIColor(hex:"#657450") }
    ground.materials = [groundMaterial]
    let floor = SCNNode(geometry:ground);floor.eulerAngles.x = -.pi/2;floor.position.y = -0.04;scene.rootNode.addChildNode(floor)
    let clearing = SCNCylinder(radius:2.5,height:0.025);clearing.radialSegmentCount = 48
    let soil = SCNMaterial();soil.lightingModel = .physicallyBased;soil.diffuse.contents = UIColor(hex:"#9c8c69");soil.roughness.contents = 1
    clearing.materials = [soil];let clearingNode = SCNNode(geometry:clearing);clearingNode.position.y = -0.035;scene.rootNode.addChildNode(clearingNode)
    func place(_ id: String,_ x: Float,_ z: Float,_ scale: Float) {
      guard let node = try? AssetLibrary.make(id) else { return }
      node.position = SCNVector3(x,0,z);node.eulerAngles.y = random()*Float.pi*2;node.scale = SCNVector3(scale,scale,scale)
      scene.rootNode.addChildNode(node)
    }
    let trees = ["nature.tree.nature_tree_oak_01","nature.tree.nature_tree_detailed_01","nature.tree.nature_tree_default_01"]
    // A temperate palette, layered canopy and distant trunks close the horizon.
    // The first ten meters retain a clear view along a narrow woodland path.
    for (ring,count) in [(0,12),(1,18),(2,22)] {
      for index in 0..<count {
        let angle = Float(index)/Float(count)*Float.pi*2+(random()-0.5)*0.22
        let radius = Float([7.5,13.0,19.0][ring])+(random()-0.5)*2
        let x = sin(angle)*radius,z = cos(angle)*radius
        if ring == 0 && z < 0 && abs(x) < 2.4 { continue }
        place(trees[(index+ring)%trees.count],x,z,0.96+random()*0.24)
      }
    }
    for index in 0..<34 {
      let angle = random()*Float.pi*2,radius = 3.2+random()*8.5,x = sin(angle)*radius,z = cos(angle)*radius
      if z < 0 && abs(x) < 1.5 { continue }
      place(index%3 == 0 ? "nature.bush.nature_grass_leafs_large_01" : "nature.bush.nature_plant_bush_detailed_01",x,z,0.65+random()*0.35)
    }
    for _ in 0..<24 {
      let angle = random()*Float.pi*2,radius = 2.6+random()*4.5,x = sin(angle)*radius,z = cos(angle)*radius
      if z < 0 && abs(x) < 1.3 { continue }
      place("nature.bush.nature_grass_large_01",x,z,0.35+random()*0.35)
    }
    for index in 0..<12 {
      let angle = random()*Float.pi*2,radius = 3.3+random()*9,x = sin(angle)*radius,z = cos(angle)*radius
      if z < 0 && abs(x) < 1.5 { continue }
      place(index%2 == 0 ? "nature.rock.nature_rock_small_flat_a_01" : "nature.rock.nature_rock_large_a_01",x,z,0.55+random()*0.35)
    }
    for index in 0..<5 { place("nature.ground_patch.nature_path_stone_01",sin(Float(index)*0.55)*0.8,-3.3-Float(index)*1.6,0.8) }
    let environment = JSON(["mode":"outdoor",
      "sky":["kind":"procedural","horizon_color":"#d4d9b7","zenith_color":"#90b6bd","ground_color":"#5b6550","sun_color":"#fff1ce","sun_size_degrees":5,"haze":0.22,"cloud_coverage":0.12] as [String:Any],
      "fog":["color":"#b6c1a7","start_meters":10,"end_meters":34] as [String:Any],
      "lighting_environment_intensity":0.45,"style":["light_bands":7,"strength":0.10] as [String:Any]])
    try? SceneAppearance.applyEnvironment(environment,to:scene,sunDirection:SCNVector3(-0.5,-0.7,-0.3),seed:20261104)
    metrics = RenderMetrics();scene.rootNode.enumerateChildNodes { node,_ in metrics.estimatedSubmissionsPerEye += node.geometry?.elements.count ?? 0 }
  }
}

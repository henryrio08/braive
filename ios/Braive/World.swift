import CoreMotion
import Metal
import SceneKit
import SwiftUI

extension UIColor {
  convenience init(hex: String) {
    let n = UInt64(hex.dropFirst(), radix: 16) ?? 0x16251f
    self.init(
      red: CGFloat((n >> 16) & 255) / 255, green: CGFloat((n >> 8) & 255) / 255,
      blue: CGFloat(n & 255) / 255, alpha: 1)
  }
}
@MainActor final class World: ObservableObject {
  var renderTime = 0.0
  var eyeAspect = 1.0
  let scene = SCNScene(), head = SCNNode(), motion = CMMotionManager()
  let left = SCNNode(), right = SCNNode()
  var nodes: [String: SCNNode] = [:], viewpoints: [String: SCNVector3] = [:],
    characters: [String: String] = [:]
  var onPortrait: ((Bool) -> Void)?
  private var pose = HeadPose()
  private var motionPaths: [String: ViewerPath] = [:]
  private var viewerMotion: ViewerMotion?
  private var nodeMotions: [String: (motion: ViewerMotion, face: Bool)] = [:]
  private var practiceClock = PracticeClock()
  private var animationOrigin = 0.0
  var animationTime: Double { practiceClock.hasStarted ? animationOrigin + activeElapsed : renderTime }
  private var attachmentRig: SCNNode?
  private var attachmentOrigin = SIMD3<Float>(repeating: 0)
  var activeElapsed: Double { practiceClock.elapsed }
  var hasPendingMotion: Bool { viewerMotion != nil || !nodeMotions.isEmpty }
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
    for (eye, x) in [(left, -ipd / 2), (right, ipd / 2)] {
      eye.camera = SCNCamera()
      eye.camera?.fieldOfView = 70
      eye.camera?.zNear = 0.05
      eye.camera?.zFar = 150
      eye.camera?.wantsHDR = true
      eye.camera?.screenSpaceAmbientOcclusionIntensity = 0.12
      eye.camera?.screenSpaceAmbientOcclusionRadius = 0.25
      eye.position.x = x
      head.addChildNode(eye)
    }
    lobby()
    motion.deviceMotionUpdateInterval = 1 / 60
    motion.startDeviceMotionUpdates(using: .xArbitraryZVertical, to: .main) { [weak self] data, _ in
      guard let data else { return }
      Task { @MainActor in self?.track(data) }
    }
  }
  func track(_ data: CMDeviceMotion) {
    let q = data.attitude.quaternion
    // Landscape-right phone basis to camera basis. Optical comfort must be calibrated on device.
    let phone = simd_quatf(ix: Float(q.x), iy: Float(q.y), iz: Float(q.z), r: Float(q.w))
    let correction = simd_quatf(angle: -.pi / 2, axis: SIMD3<Float>(0, 0, 1))
    let oriented = phone * correction
    head.simdOrientation = pose.update(oriented)
    let g = data.gravity
    if abs(g.y) > 0.78 { onPortrait?(true) } else if abs(g.x) > 0.65 { onPortrait?(false) }
  }
  func recenter() {
    head.simdOrientation = pose.recenter()
  }
  func clear() {
    motionPaths = [:]; viewerMotion = nil
    nodeMotions = [:]
    attachmentRig = nil
    practiceClock = PracticeClock()
    for child in scene.rootNode.childNodes where child !== head { child.removeFromParentNode() }
    nodes = [:]
    viewpoints = [:]
    characters = [:]
  }
  func material(_ value: JSON) -> SCNMaterial {
    let m = SCNMaterial()
    m.diffuse.contents = UIColor(hex: value["color"].text)
    m.roughness.contents = value["roughness"].value
    m.transparency = CGFloat(value["opacity"].number ?? 1)
    m.isDoubleSided = value["double_sided"].bool ?? false
    m.lightingModel = .physicallyBased
    return m
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
  func load(_ spec: JSON, plan: JSON) throws {
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
    let root = SCNNode()
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
      if j["geometry"]["kind"].text != "asset" { n.geometry?.materials = [material(j["material"])] }
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
          if AssetLibrary.isCharacter(node) { AssetLibrary.recolor(node, hex: op["material"]["color"].string) }
          else {
            node.enumerateChildNodes { n, _ in n.geometry?.materials = [material(op["material"])] }
            node.geometry?.materials = [material(op["material"])]
          }
        }
      case "viewpoint_transition": if let point = views[op["destination_id"].text] { initial = point }
      default: break
      }
    }
    let focusEntries = list.filter { $0["role"].text == "task_focus" }
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
    scene.background.contents = UIColor(hex: spec["atmosphere"]["background_color"].text)
    scene.fogColor = UIColor(hex: spec["atmosphere"]["background_color"].text)
    scene.fogStartDistance = 5
    scene.fogEndDistance = max(8, (spec["view_distance_meters"].number == nil ? 70 : viewDistance) * (1 - spec["atmosphere"]["fog_density"].value))
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
    sun.light?.intensity = CGFloat(spec["lighting"]["key_intensity"].value * 800)
    let direction = vector(spec["lighting"]["key_direction"])
    let ray = SIMD3<Float>(direction.x, direction.y, direction.z)
    if simd_length(ray) > 0.001 {
      sun.simdOrientation = simd_quatf(from: SIMD3<Float>(0,0,-1), to: simd_normalize(ray))
      sun.simdPosition = SIMD3(initial.x,initial.y,initial.z) - simd_normalize(ray) * 18
    }
    sun.light?.castsShadow = true
    sun.light?.shadowMapSize = CGSize(width: 1024, height: 1024)
    sun.light?.shadowSampleCount = 4
    sun.light?.shadowRadius = 3
    sun.light?.shadowColor = UIColor.black.withAlphaComponent(0.28)
    sun.light?.orthographicScale = 18
    sun.light?.zFar = 70
    scene.rootNode.addChildNode(sun)
    for c in plan["characters"].list {
      characters[c["id"].text] = c["scene_node_id"].text
      let initialBehavior = list.first(where: { $0["id"].text == c["scene_node_id"].text })?["animation"].text ?? "idle"
      animate(c["id"].text, initialBehavior == "none" ? "idle" : initialBehavior)
    }
  }
  func animate(_ id: String, _ behavior: String) {
    guard let n = nodes[characters[id] ?? id] else { return }
    AssetLibrary.animate(n, behavior: behavior)
  }

  func operation(_ op: JSON, speak: (String) -> Void, sound: (String) -> Void) {
    switch op["type"].text {
    case "set_visible": nodes[op["node_id"].text]?.isHidden = !(op["visible"].bool ?? true)
    case "set_material":
      if let node = nodes[op["node_id"].text] {
        if AssetLibrary.isCharacter(node) {
          AssetLibrary.recolor(node, hex: op["material"]["color"].string)
        } else {
          node.enumerateChildNodes { n, _ in n.geometry?.materials = [material(op["material"])] }
          node.geometry?.materials = [material(op["material"])]
        }
      }
    case "character_action": animate(op["character_id"].text, op["behavior"].text)
    case "viewpoint_transition":
      if let p = viewpoints[op["destination_id"].text] { viewerMotion = nil; setViewerPosition(SIMD3(p.x,p.y,p.z)) }
    case "move_viewer":
      if let path = motionPaths[op["path_id"].text] {
        renderMotion()
        let forward = head.simdWorldOrientation.act(SIMD3<Float>(0,0,-1))
        let flat = SIMD3<Float>(forward.x,0,forward.z)
        let heading = simd_length(flat) > 0.001 ? simd_quatf(from: SIMD3<Float>(0,0,-1), to: simd_normalize(flat)) : simd_quatf(angle: 0, axis: SIMD3(0,1,0))
        viewerMotion = ViewerMotion.start(path: path, origin: head.simdPosition, at: activeElapsed, frame: heading, replacing: viewerMotion)
      }
    case "move_node":
      if let path = motionPaths[op["path_id"].text], let node = nodes[op["node_id"].text] {
        renderMotion()
        nodeMotions[op["node_id"].text] = (ViewerMotion.start(path: path, origin: node.simdWorldPosition, at: activeElapsed, frame: node.simdWorldOrientation, replacing: nodeMotions[op["node_id"].text]?.motion), op["face_motion"].bool ?? false)
      }
    case "set_environment":
      scene.background.contents = UIColor(hex: op["background_color"].text)
      scene.fogColor = UIColor(hex: op["background_color"].text)
      scene.fogEndDistance = max(8, (left.camera?.zFar ?? 150) * (1 - op["fog_density"].value))
      if let intensity = op["ambient_intensity"].number { scene.rootNode.childNode(withName: "braive_ambient", recursively: false)?.light?.intensity = CGFloat(intensity * 650) }
    case "narrate": speak(op["text"].text)
    case "play_sound": sound(op["cue_id"].text)
    default: break
    }
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
    left.camera?.zFar = 150; right.camera?.zFar = 150
    clear()
    head.position = SCNVector3(0, 1.6, 0)
    scene.background.contents = UIColor(hex: "#9dbbb0")
    scene.fogColor = UIColor(hex: "#75968a")
    scene.fogStartDistance = 5
    scene.fogEndDistance = 27
    scene.fogDensityExponent = 1.4
    let ambient = SCNNode()
    ambient.light = SCNLight()
    ambient.light?.type = .ambient
    ambient.light?.color = UIColor(hex: "#a6c6c2")
    ambient.light?.intensity = 380
    scene.rootNode.addChildNode(ambient)
    let sun = SCNNode()
    sun.light = SCNLight()
    sun.light?.type = .directional
    sun.light?.color = UIColor(hex: "#ffe8bb")
    sun.light?.intensity = 900
    sun.eulerAngles = SCNVector3(-0.7, -0.6, 0)
    scene.rootNode.addChildNode(sun)
    func finish(_ geometry: SCNGeometry, _ color: String) -> SCNGeometry {
      let m = SCNMaterial()
      m.diffuse.contents = UIColor(hex: color)
      m.lightingModel = .physicallyBased
      m.roughness.contents = 0.95
      geometry.materials = [m]
      return geometry
    }
    let ground = SCNNode(
      geometry: finish(SCNBox(width: 90, height: 0.1, length: 90, chamferRadius: 0), "#58743F"))
    ground.position.y = -0.1
    scene.rootNode.addChildNode(ground)
    let all = (try? AssetLibrary.entries) ?? []
    if let grass = try? AssetLibrary.make("nature.ground_patch.nature_ground_grass_01") {
      let bounds = grass.boundingBox
      let span = max(bounds.max.x - bounds.min.x, bounds.max.z - bounds.min.z)
      let scale: Float = 90 / max(0.01, span)
      grass.scale = SCNVector3(scale, scale, scale)
      grass.position.y = -0.035
      grass.name = "lobby_grass_floor"
      scene.rootNode.addChildNode(grass)
    }
    for i in 0..<24 {
      if let grass = try? AssetLibrary.make("nature.bush.nature_grass_large_01") {
        let angle = Float(i) * 2.39996
        let radius = Float(1.8 + Double(i % 5) * 0.8)
        grass.position = SCNVector3(sin(angle) * radius, 0, cos(angle) * radius)
        grass.eulerAngles.y = angle
        scene.rootNode.addChildNode(grass)
      }
    }
    let trees = all.filter { $0.category == "nature" && $0.subcategory == "tree" }
    let rocks = all.filter { $0.category == "nature" && $0.subcategory == "rock" }
    for i in 0..<45 where !trees.isEmpty {
      let angle = Float(i) * 2.39996
      let radius = Float(5 + i % 18)
      let x = sin(angle) * radius
      let z = cos(angle) * radius
      if abs(x) < 2 && z < 0 { continue }
      if let n = try? AssetLibrary.make(trees[i % trees.count].id) {
        n.position = SCNVector3(x, 0, z)
        n.eulerAngles.y = Float(i) * 0.7
        scene.rootNode.addChildNode(n)
      }
    }
    for i in 0..<20 where !rocks.isEmpty {
      if let n = try? AssetLibrary.make(rocks[i % rocks.count].id) {
        let angle = Float(i) * 2.39996
        n.position = SCNVector3(sin(angle) * 4, 0, cos(angle) * 4)
        scene.rootNode.addChildNode(n)
      }
    }
  }
}

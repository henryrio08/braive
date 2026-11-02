import CoreMotion
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
    for child in scene.rootNode.childNodes where child !== head { child.removeFromParentNode() }
    nodes = [:]
    viewpoints = [:]
    characters = [:]
  }
  func material(_ value: JSON) -> SCNMaterial {
    let m = SCNMaterial()
    m.diffuse.contents = UIColor(hex: value["color"].text)
    m.roughness.contents = value["roughness"].value
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
    // Build off-scene and attach only after structural and visibility checks.
    let root = SCNNode()
    var built: [String: SCNNode] = [:]
    let list = spec["nodes"].list
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
        let coordinatorColor = character?["color_hex"].string
        n = try AssetLibrary.make(
          assetID, colorHex: coordinatorColor ?? j["material"]["color"].string)
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
    guard Set(spec["viewpoints"].list.map { $0["id"].text }).count == spec["viewpoints"].list.count
    else { throw failure("Duplicate viewpoints") }
    let views = Dictionary(
      uniqueKeysWithValues: spec["viewpoints"].list.map { ($0["id"].text, vector($0["position"])) })
    guard let initial = views[spec["initial_viewpoint_id"].text] else {
      throw failure("Missing initial viewpoint")
    }
    let focus = list.filter { $0["role"].text == "task_focus" }.compactMap { built[$0["id"].text] }
    guard !focus.isEmpty else { throw failure("Missing task focus") }
    // Structural checks followed by offscreen both-eye geometry visibility checks.
    guard
      focus.contains(where: { n in
        let p = n.convertPosition(SCNVector3Zero, to: root)
        return p.z < initial.z - 0.15
      })
    else { throw failure("Task focus is behind the initial viewer") }
    try ScenePreflight.check(
      root: root, focus: focus, position: initial, ipd: ipd, fov: fov, aspect: eyeAspect)
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
    guard actualNodes <= 650, triangles <= 180000, bytes < 24_000_000 else {
      throw failure(
        "Resolved scene exceeds phone geometry budget: \(actualNodes) nodes, \(triangles) primitives, \(bytes) geometry bytes"
      )
    }
    clear()
    scene.rootNode.addChildNode(root)
    nodes = built
    viewpoints = views
    head.position = initial
    scene.background.contents = UIColor(hex: spec["atmosphere"]["background_color"].text)
    scene.fogColor = UIColor(hex: spec["atmosphere"]["background_color"].text)
    scene.fogStartDistance = 5
    scene.fogEndDistance = max(8, 70 * (1 - spec["atmosphere"]["fog_density"].value))
    let light = SCNNode()
    light.light = SCNLight()
    light.light?.type = .ambient
    light.light?.intensity = CGFloat(spec["lighting"]["ambient_intensity"].value * 650)
    scene.rootNode.addChildNode(light)
    let sun = SCNNode()
    sun.light = SCNLight()
    sun.light?.type = .directional
    sun.light?.intensity = CGFloat(spec["lighting"]["key_intensity"].value * 800)
    sun.eulerAngles = vector(spec["lighting"]["key_direction"])
    scene.rootNode.addChildNode(sun)
    for c in plan["characters"].list {
      characters[c["id"].text] = c["scene_node_id"].text
      animate(c["id"].text, "idle")
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
      if let p = viewpoints[op["destination_id"].text] { head.position = p }
    case "narrate": speak(op["text"].text)
    case "play_sound": sound(op["cue_id"].text)
    default: break
    }
  }
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

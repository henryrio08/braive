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
  private var baseline: simd_quatf?
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
    if baseline == nil { baseline = oriented }
    head.simdOrientation = baseline!.inverse * oriented
    let g = data.gravity
    if abs(g.y) > 0.78 { onPortrait?(true) } else if abs(g.x) > 0.65 { onPortrait?(false) }
  }
  func recenter() {
    baseline = nil
    head.eulerAngles = SCNVector3Zero
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
        n = try AssetLibrary.make(j["geometry"]["asset_id"].text)
      } else {
        n = SCNNode(geometry: try geometry(j))
      }
      n.name = id
      if let torso = n.childNode(withName: "torso", recursively: true) {
        torso.geometry?.materials = [material(j["material"])]
      }
      n.geometry?.materials = [material(j["material"])]
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
    n.removeAction(forKey: "behavior")
    let amount: CGFloat = behavior == "gesture" ? 0.12 : behavior == "speak" ? 0.025 : 0.007
    if behavior == "gesture", let arm = n.childNode(withName: "right_arm", recursively: true) {
      arm.runAction(
        .sequence([
          .rotateBy(x: 0, y: 0, z: 0.55, duration: 0.3), .wait(duration: 0.4),
          .rotateBy(x: 0, y: 0, z: -0.55, duration: 0.3),
        ]))
    }
    if let mouth = n.childNode(withName: "mouth", recursively: true) {
      mouth.removeAllActions()
      if behavior == "speak" {
        mouth.runAction(
          .repeatForever(
            .sequence([.scale(to: 1.4, duration: 0.15), .scale(to: 1, duration: 0.15)])))
      }
    }
    n.runAction(
      .repeatForever(
        .sequence([
          .rotateBy(x: 0, y: amount, z: 0, duration: 0.6),
          .rotateBy(x: 0, y: -amount, z: 0, duration: 0.6),
        ])), forKey: "behavior")
  }
  func operation(_ op: JSON, speak: (String) -> Void, sound: (String) -> Void) {
    switch op["type"].text {
    case "set_visible": nodes[op["node_id"].text]?.isHidden = !(op["visible"].bool ?? true)
    case "set_material": nodes[op["node_id"].text]?.geometry?.materials = [material(op["material"])]
    case "character_action": animate(op["character_id"].text, op["behavior"].text)
    case "viewpoint_transition":
      if let p = viewpoints[op["destination_id"].text] { head.position = p }
    case "narrate": speak(op["text"].text)
    case "play_sound": sound(op["cue_id"].text)
    default: break
    }
  }
  func auditAssets() {
    clear()
    head.position = SCNVector3(0, 1.6, 0)
    scene.background.contents = UIColor(hex: "#35473f")
    scene.fogStartDistance = 15
    scene.fogEndDistance = 40
    let light = SCNNode()
    light.light = SCNLight()
    light.light?.type = .ambient
    light.light?.intensity = 600
    scene.rootNode.addChildNode(light)
    let sun = SCNNode()
    sun.light = SCNLight()
    sun.light?.type = .directional
    sun.eulerAngles = SCNVector3(-0.6, -0.5, 0)
    scene.rootNode.addChildNode(sun)
    for (id, x, z) in [
      ("person_standing", Float(-1.6), Float(-3.5)), ("person_seated", Float(1.6), Float(-3.5)),
      ("lectern", Float(0), Float(-3)), ("bookshelf", Float(-3), Float(-5)),
      ("table", Float(3), Float(-5)),
    ] {
      if let n = try? AssetLibrary.make(id) {
        n.position = SCNVector3(x, 0, z)
        if id.contains("person") { n.eulerAngles.y = .pi }
        scene.rootNode.addChildNode(n)
      }
    }
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
      geometry: finish(SCNBox(width: 90, height: 0.1, length: 90, chamferRadius: 0), "#334b39"))
    ground.position.y = -0.1
    scene.rootNode.addChildNode(ground)
    // A softly curving path establishes near/middle/far scale before practice begins.
    for i in 0..<20 {
      let z = Float(i) * (-1.3)
      let path = SCNNode(geometry: finish(SCNCylinder(radius: 1.6, height: 0.015), "#8b8d6a"))
      path.position = SCNVector3(sin(Float(i) * 0.16) * 2, 0.01, z)
      scene.rootNode.addChildNode(path)
    }
    for i in 0..<75 {
      let angle = Float(i) * 2.39996
      let radius = Float(5 + i % 22)
      let x = sin(angle) * radius
      let z = cos(angle) * radius
      if abs(x - sin(-z / 1.3 * 0.16) * 2) < 2 && z < 0 { continue }
      let height = CGFloat(5 + Float(i % 5) * 0.55)
      let trunkGeometry = SCNCylinder(radius: 0.16, height: height)
      trunkGeometry.radialSegmentCount = 10
      let trunk = SCNNode(geometry: finish(trunkGeometry, "#594d3d"))
      trunk.position = SCNVector3(x, Float(height / 2), z)
      scene.rootNode.addChildNode(trunk)
      for layer in 0..<3 {
        let crown = SCNCone(
          topRadius: 0.06, bottomRadius: CGFloat(1.7 - Float(layer) * 0.32), height: 3.2)
        crown.radialSegmentCount = 12
        let leaves = SCNNode(
          geometry: finish(crown, i % 3 == 0 ? "#345947" : i % 3 == 1 ? "#46715c" : "#2d5145"))
        leaves.position = SCNVector3(x, Float(height) - 1 + Float(layer) * 1.15, z)
        leaves.eulerAngles.y = Float(i) * 0.7
        scene.rootNode.addChildNode(leaves)
      }
    }
    for i in 0..<45 {
      let a = Float(i) * 2.39996
      let r = Float(2 + i % 8)
      let rock = SCNSphere(radius: CGFloat(0.09 + Float(i % 4) * 0.04))
      rock.segmentCount = 8
      let n = SCNNode(geometry: finish(rock, "#6f8070"))
      n.position = SCNVector3(sin(a) * r, 0.04, cos(a) * r)
      n.scale = SCNVector3(1.4, 0.65, 1)
      scene.rootNode.addChildNode(n)
    }
  }
}

import SceneKit
import UIKit

/// Original, reusable individual objects. Models still author each scene's layout and interactions.
@MainActor enum AssetLibrary {
  static let ids: Set<String> = [
    "person_standing", "person_seated", "chair", "table", "lectern", "bookshelf", "window_frame",
  ]
  static func make(_ id: String) throws -> SCNNode {
    guard ids.contains(id) else { throw ScenePreflight.error("Unregistered asset: " + id) }
    let root = SCNNode()
    func part(
      _ name: String, _ geometry: SCNGeometry, _ x: Float, _ y: Float, _ z: Float, _ color: String
    ) -> SCNNode {
      if let g = geometry as? SCNSphere { g.segmentCount = name == "head" ? 20 : 10 }
      if let g = geometry as? SCNCapsule {
        g.radialSegmentCount = 12
        g.capSegmentCount = 6
      }
      if let g = geometry as? SCNCylinder { g.radialSegmentCount = 12 }
      if let g = geometry as? SCNBox { g.chamferSegmentCount = 2 }
      let n = SCNNode(geometry: geometry)
      n.name = name
      n.position = SCNVector3(x, y, z)
      let m = SCNMaterial()
      m.diffuse.contents = UIColor(hex: color)
      m.roughness.contents = 0.8
      m.lightingModel = .physicallyBased
      geometry.materials = [m]
      root.addChildNode(n)
      return n
    }
    func box(
      _ name: String, _ w: CGFloat, _ h: CGFloat, _ d: CGFloat, _ x: Float, _ y: Float, _ z: Float,
      _ color: String
    ) {
      _ = part(name, SCNBox(width: w, height: h, length: d, chamferRadius: 0.025), x, y, z, color)
    }
    switch id {
    case "person_standing", "person_seated":
      let seated = id == "person_seated"
      let hip: Float = seated ? 0.65 : 0.95
      let head = hip + 0.65
      _ = part("head", SCNSphere(radius: 0.135), 0, head, 0, "#bc8f73")
      let hair = part("hair", SCNSphere(radius: 0.14), 0, head + 0.065, 0.015, "#302a27")
      hair.scale = SCNVector3(1, 0.65, 1)
      for x: Float in [-0.045, 0.045] {
        _ = part("eye", SCNSphere(radius: 0.012), x, head + 0.015, -0.122, "#28252b")
      }
      let nose = part("nose", SCNSphere(radius: 0.025), 0, head - 0.02, -0.14, "#b57c62")
      nose.scale = SCNVector3(0.6, 1, 1)
      box("mouth", 0.045, 0.012, 0.008, 0, head - 0.065, -0.122, "#7c5146")
      let torso = part(
        "torso", SCNCapsule(capRadius: 0.16, height: 0.48), 0, hip + 0.3, 0, "#546f83")
      torso.scale = SCNVector3(1, 1, 0.7)
      box("collar", 0.18, 0.04, 0.13, 0, hip + 0.52, 0, "#e4dfcd")
      for side: Float in [-1, 1] {
        let arm = part(
          side < 0 ? "left_arm" : "right_arm", SCNCapsule(capRadius: 0.045, height: 0.46),
          side * 0.21, hip + 0.28, 0, "#546f83")
        arm.eulerAngles.z = side * 0.12
        _ = part("hand", SCNSphere(radius: 0.048), side * 0.24, hip + 0.045, -0.01, "#bc8f73")
        let leg = part(
          "leg", SCNCapsule(capRadius: 0.065, height: seated ? 0.42 : 0.78), side * 0.09,
          seated ? 0.58 : 0.48, seated ? -0.19 : 0, "#353c4b")
        if seated {
          leg.eulerAngles.x = .pi / 2
          _ = part(
            "shin", SCNCapsule(capRadius: 0.06, height: 0.45), side * 0.09, 0.26, -0.37, "#353c4b")
        }
        box("shoe", 0.14, 0.09, 0.26, side * 0.09, 0.055, seated ? -0.42 : -0.06, "#262e33")
      }
      if seated {
        let chair = try make("chair")
        chair.position = SCNVector3(0, 0, 0.07)
        root.addChildNode(chair)
      }
    case "chair":
      box("seat", 0.5, 0.07, 0.5, 0, 0.48, 0, "#856747")
      box("back", 0.48, 0.5, 0.06, 0, 0.76, 0.23, "#856747")
      for x: Float in [-0.2, 0.2] {
        for z: Float in [-0.2, 0.2] { box("leg", 0.045, 0.46, 0.045, x, 0.23, z, "#343d3c") }
      }
    case "table":
      box("top", 1.7, 0.08, 0.85, 0, 0.76, 0, "#ae8d65")
      for x: Float in [-0.7, 0.7] {
        for z: Float in [-0.32, 0.32] { box("leg", 0.07, 0.73, 0.07, x, 0.365, z, "#4b514b") }
      }
    case "lectern":
      box("base", 0.65, 0.06, 0.5, 0, 0.03, 0, "#4f4c46")
      box("column", 0.18, 1.0, 0.18, 0, 0.55, 0, "#806746")
      let top = part(
        "sloped_top", SCNBox(width: 0.7, height: 0.06, length: 0.5, chamferRadius: 0.03), 0, 1.08,
        0, "#a88b61")
      top.eulerAngles.x = -0.18
      box("notes", 0.24, 0.01, 0.3, 0, 1.13, -0.02, "#f0ead6")
    case "bookshelf":
      for x: Float in [-0.6, 0.6] { box("side", 0.06, 2.1, 0.35, x, 1.05, 0, "#886d4d") }
      box("back", 1.2, 2.1, 0.035, 0, 1.05, 0.16, "#6d5d48")
      for row in 0..<4 {
        let y = Float(row) * 0.5
        box("shelf", 1.2, 0.04, 0.35, 0, y + 0.05, 0, "#886d4d")
        for col in 0..<9 {
          box(
            "book", 0.075, CGFloat(0.27 + Double(col % 3) * 0.04), 0.22, Float(col) * 0.115 - 0.48,
            y + 0.23, 0, ["#597b77", "#966759", "#b4a075"][col % 3])
        }
      }
    case "window_frame":
      for x: Float in [-0.65, 0, 0.65] {
        box("vertical_frame", 0.05, 1.8, 0.08, x, 0.9, 0, "#d4d6c6")
      }
      for y: Float in [0, 0.9, 1.8] {
        box("horizontal_frame", 1.35, 0.05, 0.08, 0, y, 0, "#d4d6c6")
      }
    default: break
    }
    return root
  }
}

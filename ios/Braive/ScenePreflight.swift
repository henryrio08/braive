import Metal
import SceneKit
import UIKit

/// Offscreen object-mask passes test actual geometry/occlusion before attaching a generated world.
@MainActor enum ScenePreflight {
  static func check(
    root: SCNNode, focus: [SCNNode], position: SCNVector3, ipd: Float, fov: Double, aspect: Double
  ) throws {
    guard let device = MTLCreateSystemDefaultDevice() else {
      throw error("Metal renderer unavailable")
    }
    let staging = SCNScene()
    staging.background.contents = UIColor.black
    staging.rootNode.addChildNode(root)
    defer { root.removeFromParentNode() }
    var materials: [(SCNGeometry, [SCNMaterial])] = []
    root.enumerateChildNodes { node, _ in
      if let g = node.geometry { materials.append((g, g.materials)) }
    }
    defer { for (g, saved) in materials { g.materials = saved } }
    // Depth layers follow actual scene scale, including tight enclosures.
    let distances = materials.indices.compactMap { i -> Float? in
      var found: Float?
      root.enumerateChildNodes { n, _ in
        if n.geometry === materials[i].0 {
          let p = n.convertPosition(SCNVector3Zero, to: root)
          found = simd_length(SIMD3(p.x - position.x, p.y - position.y, p.z - position.z))
        }
      }
      return found
    }.sorted()
    guard distances.count >= 3 else { throw error("Scene needs visible spatial composition") }
    let near = distances[distances.count / 3]
    let far = distances[min(distances.count - 1, distances.count * 2 / 3)]
    guard far - near > 0.1 else { throw error("Scene geometry has insufficient depth separation") }
    let renderer = SCNRenderer(device: device, options: nil)
    renderer.scene = staging
    renderer.autoenablesDefaultLighting = false
    let camera = SCNNode()
    camera.camera = SCNCamera()
    camera.camera?.fieldOfView = fov
    camera.camera?.zNear = 0.05
    camera.camera?.zFar = 150
    staging.rootNode.addChildNode(camera)
    renderer.pointOfView = camera
    defer { camera.removeFromParentNode() }
    for eye in [-ipd / 2, ipd / 2] {
      camera.position = SCNVector3(position.x + eye, position.y, position.z)
      // First pass: a red focus mask against black occluders, with real depth testing.
      root.enumerateChildNodes { n, _ in
        guard let g = n.geometry else { return }
        let m = SCNMaterial()
        m.lightingModel = .constant
        m.diffuse.contents = isFocus(n, focus) ? UIColor.red : UIColor.black
        g.materials = [m]
      }
      let focusPixels = try pixels(
        renderer.snapshot(
          atTime: 0, with: CGSize(width: 320, height: 320 / max(0.5, aspect)),
          antialiasingMode: .none))
      let visible = focusPixels.strideCount { r, g, b in r > 200 && g < 30 && b < 30 }
      guard visible >= 200 else {
        throw error(
          "Task focal point is occluded or too small in one eye (\(visible) visible pixels)")
      }
      // Second pass: visible near/middle/far geometry masks. Hidden depth nodes do not count.
      root.enumerateChildNodes { n, _ in
        guard let g = n.geometry else { return }
        let p = n.convertPosition(SCNVector3Zero, to: root)
        let d = simd_length(SIMD3(p.x - position.x, p.y - position.y, p.z - position.z))
        let m = SCNMaterial()
        m.lightingModel = .constant
        m.diffuse.contents = d <= near ? UIColor.red : d >= far ? UIColor.blue : UIColor.green
        g.materials = [m]
      }
      let mask = try pixels(
        renderer.snapshot(
          atTime: 0, with: CGSize(width: 320, height: 320 / max(0.5, aspect)),
          antialiasingMode: .none))
      guard mask.strideCount({ r, g, b in r > 180 && g < 40 && b < 40 }) > 40,
        mask.strideCount({ r, g, b in g > 180 && r < 40 && b < 40 }) > 40,
        mask.strideCount({ r, g, b in b > 180 && r < 40 && g < 40 }) > 40
      else { throw error("Foreground, middle, and far geometry must be visible in both eyes") }
    }
  }
  static func isFocus(_ node: SCNNode, _ targets: [SCNNode]) -> Bool {
    var cursor: SCNNode? = node
    while let n = cursor {
      if targets.contains(where: { $0 === n }) { return true }
      cursor = n.parent
    }
    return false
  }
  static func pixels(_ image: UIImage) throws -> [UInt8] {
    guard let cg = image.cgImage else { throw error("Offscreen scene image unavailable") }
    var bytes = [UInt8](repeating: 0, count: cg.width * cg.height * 4)
    guard
      let context = CGContext(
        data: &bytes, width: cg.width, height: cg.height, bitsPerComponent: 8,
        bytesPerRow: cg.width * 4, space: CGColorSpaceCreateDeviceRGB(),
        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
    else { throw error("Offscreen scene buffer unavailable") }
    context.draw(cg, in: CGRect(x: 0, y: 0, width: cg.width, height: cg.height))
    return bytes
  }
  static func error(_ message: String) -> NSError {
    NSError(domain: "ScenePreflight", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
  }
}
extension Array where Element == UInt8 {
  fileprivate func strideCount(_ test: (UInt8, UInt8, UInt8) -> Bool) -> Int {
    var n = 0
    for i in stride(from: 0, to: count, by: 4) {
      if test(self[i], self[i + 1], self[i + 2]) { n += 1 }
    }
    return n
  }
}

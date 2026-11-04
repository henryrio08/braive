import Metal
import SceneKit
import UIKit

/// Offscreen object-mask passes test actual geometry/occlusion before attaching a generated world.
@MainActor enum ScenePreflight {
  static func check(
    root: SCNNode, focus: [SCNNode], position: SCNVector3, ipd: Float, fov: Double, aspect: Double, far viewDistance: Double = 150,
    strictVisualReview: Bool = false
  ) throws {
    guard let device = MTLCreateSystemDefaultDevice() else {
      throw error("Metal renderer unavailable")
    }
    let staging = SCNScene()
    staging.background.contents = UIColor.black
    let originalParent = root.parent
    staging.rootNode.addChildNode(root)
    defer { root.removeFromParentNode(); originalParent?.addChildNode(root) }
    SCNTransaction.flush()
    var materials: [(SCNGeometry, [SCNMaterial])] = []
    root.enumerateChildNodes { node, _ in
      if let g = node.geometry { materials.append((g, g.materials)) }
    }
    defer { for (g, saved) in materials { g.materials = saved } }
    // Depth layers follow actual scene scale, including tight enclosures.
    let rawDistances = materials.indices.compactMap { i -> Float? in
      var found: Float?
      root.enumerateChildNodes { n, _ in
        if n.geometry === materials[i].0 {
          var visible = !materials[i].1.allSatisfy { $0.transparency <= 0 }
          var ancestor: SCNNode? = n
          while let node = ancestor {
            if node.isHidden || node.opacity <= 0 { visible = false }
            ancestor = node.parent
          }
          if visible {
            let p = n.convertPosition(SCNVector3Zero, to: root)
            if p.z < position.z { found = position.z - p.z }
          }
        }
      }
      return found
    }.sorted()
    // Multipart assets should not outweigh the entire room simply because
    // their meshes share one depth. Count distinct depth groups instead.
    var distances: [Float] = []
    for depth in rawDistances {
      if distances.last.map({ depth - $0 > 0.1 }) ?? true { distances.append(depth) }
    }
    if distances.count < 3 {
      let message = "Scene needs visible spatial composition (depth groups: \(distances))"
      if strictVisualReview { throw error(message) }
      print("[scene quality] \(message)")
    }
    // Compare view-space depth with view-space depth. Cut between depth groups,
    // not through an object's center (its front-facing surface lies nearer).
    var near: Float = 1
    var far: Float = 10
    if distances.count >= 3 {
      let nearIndex = max(1, distances.count / 3)
      let farIndex = min(distances.count - 1, max(nearIndex + 1, distances.count * 2 / 3))
      near = (distances[nearIndex - 1] + distances[nearIndex]) / 2
      far = (distances[farIndex - 1] + distances[farIndex]) / 2
      if far - near <= 0.1 {
        if strictVisualReview { throw error("Scene geometry has insufficient depth separation") }
        print("[scene quality] Scene geometry has insufficient depth separation")
        far = near + 0.2
      }
    }
    let renderer = SCNRenderer(device: device, options: nil)
    renderer.scene = staging
    renderer.autoenablesDefaultLighting = false
    let camera = SCNNode()
    camera.camera = SCNCamera()
    camera.camera?.fieldOfView = fov
    camera.camera?.zNear = 0.05
    camera.camera?.zFar = viewDistance
    staging.rootNode.addChildNode(camera)
    renderer.pointOfView = camera
    defer { camera.removeFromParentNode() }
    for eye in [-ipd / 2, ipd / 2] {
      camera.position = SCNVector3(position.x + eye, position.y, position.z)
      // First pass: a red focus mask against black occluders, with real depth testing.
      root.enumerateChildNodes { n, _ in
        guard let g = n.geometry else { return }
        g.materials = g.materials.map { source in
          let m = maskMaterial(source)
          let rgb = isFocus(n, focus) ? "float3(1,0,0)" : "float3(0,0,0)"
          var modifiers=m.shaderModifiers ?? [:]
          modifiers[.fragment]="_output.color.rgb = " + rgb + ";"
          m.shaderModifiers=modifiers
          return m
        }
      }
      let focusPixels = try pixels(
        renderer.snapshot(
          atTime: 0, with: CGSize(width: 320, height: 320 / max(0.5, aspect)),
          antialiasingMode: .none))
      let visible = focusPixels.strideCount { r, g, b in r > 200 && g < 30 && b < 30 }
      guard visible > 0 else { throw error("Task focal point is not visible in one eye (0 visible pixels)") }
      if visible < 200 {
        let message = "Task focal point is occluded or too small in one eye (\(visible) visible pixels)"
        if strictVisualReview { throw error(message) }
        print("[scene quality] \(message)")
      }
      // Second pass: distance at each visible surface fragment, rather than object origins.
      // A large floor/water plane spans several depths even when its origin is far away.
      root.enumerateChildNodes { n, _ in
        guard let g = n.geometry else { return }
        g.materials = g.materials.map { source in
        let m = maskMaterial(source)
        var modifiers=m.shaderModifiers ?? [:]
        modifiers[.fragment] = """
          float distanceFromEye = max(0.0, -_surface.position.z);
          _output.color.rgb = distanceFromEye <= \(near) ? float3(1.0, 0.0, 0.0)
            : distanceFromEye >= \(far) ? float3(0.0, 0.0, 1.0) : float3(0.0, 1.0, 0.0);
          """
        m.shaderModifiers=modifiers
        return m
        }
      }
      let mask = try pixels(
        renderer.snapshot(
          atTime: 0, with: CGSize(width: 320, height: 320 / max(0.5, aspect)),
          antialiasingMode: .none))
      let nearPixels = mask.strideCount({ r, g, b in r > 180 && g < 40 && b < 40 })
      let middlePixels = mask.strideCount({ r, g, b in g > 180 && r < 40 && b < 40 })
      let farPixels = mask.strideCount({ r, g, b in b > 180 && r < 40 && g < 40 })
      if nearPixels <= 40 || middlePixels <= 40 || farPixels <= 40 {
        let message = "Foreground, middle, and far geometry must be visible in both eyes (\(nearPixels)/\(middlePixels)/\(farPixels) pixels; cuts \(near)/\(far))"
        if strictVisualReview { throw error(message) }
        print("[scene quality] \(message)")
      }
    }
  }
  private static func maskMaterial(_ source: SCNMaterial) -> SCNMaterial {
    let m = source.copy() as! SCNMaterial
    m.lightingModel = .constant
    m.transparency = source.transparency
    m.transparencyMode = source.transparencyMode
    m.transparent.contents = source.transparent.contents
    m.isDoubleSided = source.isDoubleSided
    m.cullMode = source.cullMode
    m.readsFromDepthBuffer = source.readsFromDepthBuffer
    m.writesToDepthBuffer = source.writesToDepthBuffer
    return m
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
  #if DEBUG
  /// Negative controls for the actual GPU passes, run only by explicit scene review.
  static func verifyRejections() throws {
    for mode in ["occluded", "tiny", "flat", "transparent", "cutout"] {
      let root = SCNNode()
      var focus: [SCNNode] = []
      if mode == "flat" {
        for x: Float in [0, 2, 5] {
          let node = SCNNode(geometry: SCNBox(width: 6, height: 4, length: 0.01, chamferRadius: 0))
          node.position = SCNVector3(x, 1.6, -4); root.addChildNode(node); focus.append(node)
        }
      } else {
        let target = SCNNode(geometry: SCNSphere(radius: mode == "tiny" ? 0.005 : 0.7))
        target.position = SCNVector3(0, 1.6, -5); root.addChildNode(target); focus = [target]
        for (x, z): (Float, Float) in [(-0.9, -2), (2, -8)] {
          let node = SCNNode(geometry: SCNSphere(radius: 0.4))
          node.position = SCNVector3(x, 1.6, z); root.addChildNode(node)
        }
        if mode == "occluded" {
          let wall = SCNNode(geometry: SCNBox(width: 3, height: 3, length: 0.2, chamferRadius: 0))
          wall.position = SCNVector3(0, 1.6, -3); root.addChildNode(wall)
        }
        if mode == "transparent" || mode == "cutout" {
          let pane=SCNNode(geometry:SCNPlane(width:3,height:3))
          let source=SCNMaterial();source.isDoubleSided=true
          if mode == "transparent" { source.transparency=0 }
          else {
            let texture=UIGraphicsImageRenderer(size:CGSize(width:32,height:32)).image { context in
              UIColor.white.setFill();context.fill(CGRect(x:0,y:0,width:32,height:32))
              context.cgContext.clear(CGRect(x:4,y:4,width:24,height:24))
            }
            source.diffuse.contents=texture
          }
          pane.geometry?.materials=[source];pane.position=SCNVector3(0,1.6,-3);root.addChildNode(pane)
        }
      }
      if mode == "flat" {
        // A visible but flat composition is usable in normal playback;
        // the strict diagnostic below still detects its quality defect.
        try check(root:root,focus:focus,position:SCNVector3(0,1.6,0),ipd:0.064,fov:70,aspect:1)
      }
      if mode == "transparent" || mode == "cutout" {
        do { try check(root:root,focus:focus,position:SCNVector3(0,1.6,0),ipd:0.064,fov:70,aspect:1,strictVisualReview:true) }
        catch { throw self.error("\(mode) visibility control: " + error.localizedDescription) }
        continue
      }
      var rejected = false
      do { try check(root: root, focus: focus, position: SCNVector3(0, 1.6, 0), ipd: 0.064, fov: 70, aspect: 1, strictVisualReview: true) }
      catch {
        let expected = mode == "flat" ? ["Foreground, middle, and far", "insufficient depth separation", "visible spatial composition"] : ["Task focal point"]
        guard expected.contains(where: { error.localizedDescription.contains($0) }) else { throw error }
        rejected = true
      }
      guard rejected else { throw error("Native visibility negative control accepted \(mode) geometry") }
    }
  }
  #endif
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

import Foundation
import GLTFKit2
import SceneKit
import UIKit

struct AssetEntry: Decodable {
  struct Normalization: Decodable {
    let axis_rotation_x_radians: Float
    let forward_rotation_y_radians: Float
  }
  let id: String
  let relative_path: String
  let category: String
  let subcategory: String
  let suggested_scale_m: Float
  let y_up: Bool
  let character_rigged: Bool
  let license: String
  let normalization: Normalization
}

/// Only byte-preserved, CC0 manifest assets can enter the renderer. No procedural object fallback.
@MainActor enum AssetLibrary {
  private static let instanceIDs = NSMapTable<SCNNode, NSString>(
    keyOptions: .weakMemory, valueOptions: .strongMemory)
  static func isCharacter(_ node: SCNNode) -> Bool {
    instanceIDs.object(forKey: node)?.hasPrefix("character.base.") ?? false
  }
  private static var cachedEntries: [AssetEntry]?
  private final class RigPose: NSObject {
    let bones: [(SCNNode, simd_quatf)]
    init(_ root: SCNNode) {
      var values: [(SCNNode, simd_quatf)] = []
      root.enumerateChildNodes { n, _ in
        if n.name?.hasPrefix("Bone") == true { values.append((n, n.simdOrientation)) }
      }
      bones = values
    }
  }
  private static let poses = NSMapTable<SCNNode, RigPose>(
    keyOptions: .weakMemory, valueOptions: .strongMemory)
  private static var templates: [String: SCNNode] = [:]
  static var entries: [AssetEntry] {
    get throws {
      if let cachedEntries { return cachedEntries }
      guard let url = Bundle.main.url(forResource: "asset_manifest", withExtension: "json") else {
        throw ScenePreflight.error("Bundled asset_manifest.json is missing")
      }
      let entries = try JSONDecoder().decode([AssetEntry].self, from: Data(contentsOf: url))
      guard Set(entries.map(\.id)).count == entries.count,
        entries.allSatisfy({ $0.license == "CC0-1.0" && !$0.relative_path.contains("..") })
      else { throw ScenePreflight.error("Invalid bundled CC0 allowlist") }
      cachedEntries = entries
      return entries
    }
  }
  static func first(category: String, subcategory: String) throws -> String {
    guard
      let e = try entries.first(where: { $0.category == category && $0.subcategory == subcategory })
    else {
      throw ScenePreflight.error("Asset subcategory is empty: \(category).\(subcategory)")
    }
    return e.id
  }
  static func make(_ id: String, colorHex: String? = nil) throws -> SCNNode {
    guard let entry = try entries.first(where: { $0.id == id }) else {
      throw ScenePreflight.error("Unregistered asset: " + id)
    }
    if templates[id] == nil {
      guard let url = Bundle.main.resourceURL?.appendingPathComponent(entry.relative_path),
        FileManager.default.fileExists(atPath: url.path)
      else { throw ScenePreflight.error("Missing bundled GLB: " + entry.relative_path) }
      let asset = try GLTFAsset(url: url, options: [:])
      let source = GLTFSCNSceneSource(asset: asset)
      guard let scene = source.defaultScene else {
        throw ScenePreflight.error("GLB has no default scene: " + id)
      }
      let placement = SCNNode()
      let normalized = SCNNode()
      let frame = SCNNode()
      placement.addChildNode(normalized)
      normalized.addChildNode(frame)
      frame.scale = SCNVector3(
        entry.suggested_scale_m, entry.suggested_scale_m, entry.suggested_scale_m)
      frame.eulerAngles = SCNVector3(
        entry.normalization.axis_rotation_x_radians, entry.normalization.forward_rotation_y_radians,
        0)
      // Move the original hierarchy intact; bones and mesh nodes retain their original relative transforms.
      for n in scene.rootNode.childNodes { frame.addChildNode(n) }
      var low = SIMD3<Float>(repeating: .greatestFiniteMagnitude)
      var high = SIMD3<Float>(repeating: -.greatestFiniteMagnitude)
      var geometryCount = 0
      frame.enumerateChildNodes { n, _ in
        guard let geometry = n.geometry else { return }
        geometryCount += 1
        let bounds = geometry.boundingBox
        for x in [bounds.min.x, bounds.max.x] {
          for y in [bounds.min.y, bounds.max.y] {
            for z in [bounds.min.z, bounds.max.z] {
              let p = n.convertPosition(SCNVector3(x, y, z), to: placement)
              low = simd_min(low, SIMD3(p.x, p.y, p.z))
              high = simd_max(high, SIMD3(p.x, p.y, p.z))
            }
          }
        }
      }
      guard geometryCount > 0, low.x.isFinite, high.y.isFinite else {
        throw ScenePreflight.error("Empty GLB: " + id)
      }
      normalized.position = SCNVector3(-(low.x + high.x) / 2, -low.y, -(low.z + high.z) / 2)
      templates[id] = placement
    }
    let instance = try clone(templates[id]!)
    instanceIDs.setObject(id as NSString, forKey: instance)
    if entry.category == "character" && entry.subcategory == "base" {
      recolor(instance, hex: colorHex)
    }
    return instance
  }
  /// SCNNode.clone shares skinners' bone references; explicitly rebind them to this instance's skeleton.
  private static func clone(_ source: SCNNode) throws -> SCNNode {
    let copy = source.clone()
    var mapping: [ObjectIdentifier: SCNNode] = [:]
    func pair(_ a: SCNNode, _ b: SCNNode) {
      mapping[ObjectIdentifier(a)] = b
      for (x, y) in zip(a.childNodes, b.childNodes) { pair(x, y) }
    }
    pair(source, copy)
    for node in mapping.values { node.geometry = node.geometry?.copy() as? SCNGeometry }
    func rebind(_ original: SCNNode) throws {
      guard let target = mapping[ObjectIdentifier(original)] else { return }
      if let skin = original.skinner {
        let bones = try skin.bones.map { bone -> SCNNode in
          guard let n = mapping[ObjectIdentifier(bone)] else {
            throw ScenePreflight.error("Skin joint escaped cached asset hierarchy")
          }
          return n
        }
        let rebound = SCNSkinner(
          baseGeometry: target.geometry ?? skin.baseGeometry, bones: bones,
          boneInverseBindTransforms: skin.boneInverseBindTransforms, boneWeights: skin.boneWeights,
          boneIndices: skin.boneIndices)
        rebound.baseGeometryBindTransform = skin.baseGeometryBindTransform
        if let skeleton = skin.skeleton { rebound.skeleton = mapping[ObjectIdentifier(skeleton)] }
        target.skinner = rebound
      }
      for child in original.childNodes { try rebind(child) }
    }
    try rebind(source)
    return copy
  }
  static func recolor(_ node: SCNNode, hex: String?) {
    let color: UIColor
    if let hex, hex.range(of: "^#[0-9A-Fa-f]{6}$", options: .regularExpression) != nil {
      color = UIColor(hex: hex)
    } else {
      color = UIColor(hue: CGFloat.random(in: 0...1), saturation: 0.48, brightness: 0.82, alpha: 1)
    }
    node.enumerateChildNodes { n, _ in
      guard let geometry = n.geometry?.copy() as? SCNGeometry else { return }
      let material = SCNMaterial()
      material.diffuse.contents = color
      material.roughness.contents = 0.8
      material.lightingModel = .physicallyBased
      geometry.materials = Array(repeating: material, count: max(1, geometry.materials.count))
      n.geometry = geometry
      if let old = n.skinner {
        let skin = SCNSkinner(
          baseGeometry: geometry, bones: old.bones,
          boneInverseBindTransforms: old.boneInverseBindTransforms, boneWeights: old.boneWeights,
          boneIndices: old.boneIndices)
        skin.skeleton = old.skeleton
        skin.baseGeometryBindTransform = old.baseGeometryBindTransform
        n.skinner = skin
      }
    }
  }
  /// Preserve authored clips. The neutral rig gets small app-controlled joint motions, never new mesh data.
  static func animate(_ node: SCNNode, behavior: String) {
    guard ["idle", "listen", "speak", "gesture", "walk", "run", "swim"].contains(behavior) else { return }
    var usedClip = false
    node.enumerateChildNodes { n, _ in
      for key in n.animationKeys {
        guard let player = n.animationPlayer(forKey: key) else { continue }
        if key.lowercased().contains(behavior) {
          player.play()
          usedClip = true
        } else {
          player.stop()
        }
      }
    }
    guard !usedClip, isCharacter(node) else { return }
    let pose: RigPose
    if let saved = poses.object(forKey: node) {
      pose = saved
    } else {
      pose = RigPose(node)
      poses.setObject(pose, forKey: node)
    }
    for (bone, orientation) in pose.bones {
      bone.removeAction(forKey: "braive_behavior")
      bone.simdOrientation = orientation
    }
    if ["walk", "run", "swim"].contains(behavior) {
      // Verified neutral rig: .011/.013 thighs, .012/.014 knees, .004/.005 upper arms.
      let period = behavior == "run" ? 0.65 : behavior == "swim" ? 1.1 : 1.4
      let stride: Float = behavior == "run" ? 0.65 : behavior == "swim" ? 0.2 : 0.3
      for (bone, rest) in pose.bones {
        let name = bone.name ?? ""
        guard ["Bone.011","Bone.013","Bone.012","Bone.014","Bone.004","Bone.005"].contains(name) else { continue }
        let opposite = ["Bone.013","Bone.014","Bone.004"].contains(name)
        let phase: Float = opposite ? .pi : 0
        let arm = ["Bone.004","Bone.005"].contains(name)
        let knee = ["Bone.012","Bone.014"].contains(name)
        let lower: Float = arm ? (name == "Bone.004" ? 1 : -1) * (behavior == "swim" ? 0.2 : 1.25) : 0
        let base = rest * simd_quatf(angle: lower, axis: SIMD3(0,0,1))
        let movement = SCNAction.customAction(duration: period) { n, t in
          let wave = sin(Float(t / period) * 2 * .pi + phase)
          let amplitude = arm ? (behavior == "swim" ? 1.1 : stride * 0.8) : knee ? stride * 0.8 : stride
          n.simdOrientation = base * simd_quatf(angle: (knee ? max(0,wave) : wave) * amplitude, axis: SIMD3(1,0,0))
        }
        bone.runAction(.repeatForever(movement), forKey: "braive_behavior")
      }
      return
    }
    let target: String
    let axis: SIMD3<Float>
    let amplitude: Float
    let period: Double
    switch behavior {
    case "listen":
      target = "Bone.002"
      axis = SIMD3(1, 0, 0)
      amplitude = 0.035
      period = 2
    case "speak":
      target = "Bone.002"
      axis = SIMD3(0, 1, 0)
      amplitude = 0.035
      period = 1.2
    case "gesture":
      target = "Bone.006"
      axis = SIMD3(1, 0, 0)
      amplitude = 0.35
      period = 1.3
    default:
      target = "Bone"
      axis = SIMD3(1, 0, 0)
      amplitude = 0.006
      period = 3
    }
    guard let (bone, rest) = pose.bones.first(where: { $0.0.name == target }) else { return }  // Safe no-op for an unrecognized/absent rig.
    let movement = SCNAction.customAction(duration: period) { n, t in
      n.simdOrientation =
        rest * simd_quatf(angle: sin(Float(t / period) * 2 * .pi) * amplitude, axis: axis)
    }
    bone.runAction(.repeatForever(movement), forKey: "braive_behavior")
  }
  static func auditAll() throws -> Int {
    let all = try entries
    for entry in all {
      let node = try make(entry.id, colorHex: "#3A8FBC")
      var lowest = Float.greatestFiniteMagnitude
      node.enumerateChildNodes { n, _ in
        guard let g = n.geometry else { return }
        let b = g.boundingBox
        for x in [b.min.x, b.max.x] {
          for y in [b.min.y, b.max.y] {
            for z in [b.min.z, b.max.z] {
              lowest = min(lowest, n.convertPosition(SCNVector3(x, y, z), to: node).y)
            }
          }
        }
      }
      guard abs(lowest) < 0.001 else {
        throw ScenePreflight.error("Asset is not grounded: " + entry.id)
      }
      if entry.id.hasPrefix("character.base.") {
        var skins = 0
        node.enumerateChildNodes { n, _ in if n.skinner != nil { skins += 1 } }
        guard skins > 0 else { throw ScenePreflight.error("Neutral base lost its skin") }
        let other = try make(entry.id, colorHex: "#BC653A")
        var a: SCNSkinner?
        var b: SCNSkinner?
        node.enumerateChildNodes { n, _ in if let s = n.skinner { a = s } }
        other.enumerateChildNodes { n, _ in if let s = n.skinner { b = s } }
        guard let a, let b, a.bones.first !== b.bones.first else {
          throw ScenePreflight.error("Character instances share bones")
        }
        var colorsValid = true
        node.enumerateChildNodes { n, _ in
          if let g = n.geometry {
            for m in g.materials {
              if !(m.diffuse.contents as? UIColor ?? .clear).isEqual(UIColor(hex: "#3A8FBC")) {
                colorsValid = false
              }
            }
          }
        }
        guard colorsValid else {
          throw ScenePreflight.error("Neutral diffuse recoloring leaked between instances")
        }
        for behavior in ["idle", "listen", "speak", "gesture"] { animate(node, behavior: behavior) }
      }
    }
    return all.count
  }
}

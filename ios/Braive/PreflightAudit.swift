import Foundation

/// Deterministic renderer check, available only through the --preflight-audit development launch argument.
@MainActor enum PreflightAudit {
  static func run(_ world: World) throws {
    let id = UUID().uuidString
    func node(
      _ id: String, _ role: String, _ geometry: [String: Any], _ position: [Double],
      rotation: [Double] = [0, 0, 0]
    ) -> [String: Any] {
      [
        "id": id, "parent_id": NSNull(), "role": role, "geometry": geometry, "position": position,
        "rotation_radians": rotation, "scale": [1, 1, 1],
        "material": ["color": "#a78c64", "roughness": 0.8], "animation": "none", "description": id,
      ]
    }
    let nodes: [Any] = [
      node("lectern", "task_focus", ["kind": "asset", "asset_id": "lectern"], [0, 0, -3]),
      node(
        "neighbor", "character", ["kind": "asset", "asset_id": "person_seated"], [1.2, 0, -4],
        rotation: [0, Double.pi, 0]),
      node("foreground_chair", "prop", ["kind": "asset", "asset_id": "chair"], [-0.8, 0, -1.8]),
      node(
        "bookcase", "environment", ["kind": "asset", "asset_id": "bookshelf"], [-2, 0, -6],
        rotation: [0, Double.pi, 0]),
      node("back_wall", "environment", ["kind": "box", "size": [12, 5, 0.1]], [0, 2, -10]),
      node("floor", "environment", ["kind": "box", "size": [20, 0.1, 20]], [0, -0.1, -5]),
    ]
    let scene = JSON([
      "session_id": id, "revision": 1, "nodes": nodes,
      "viewpoints": [
        ["id": "start", "position": [0, 1.6, 0], "description": "Speaking position"]
      ], "initial_viewpoint_id": "start",
      "lighting": [
        "ambient_color": "#ffffff", "ambient_intensity": 0.6, "key_direction": [-0.5, -0.5, 0],
        "key_intensity": 1,
      ], "atmosphere": ["background_color": "#56716a", "fog_density": 0.1],
      "stereo": ["presentation": "stereographic"], "events": [], "interactions": [],
    ])
    try world.load(
      scene,
      plan: JSON([
        "session_id": id, "revision": 1,
        "characters": [["id": "neighbor", "scene_node_id": "neighbor"]],
      ]))
  }
}

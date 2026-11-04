import Foundation

@main struct ScenePatchChecks {
  static func main() {
    func expect(_ condition: Bool, _ label: String) {
      if !condition { fatalError("FAILED: \(label)") }
      print("ok: \(label)")
    }
    // EditIntent.parse
    if case .environment(let brighter) = ScenePatch.parse("more light", currentAudience: 4) {
      expect(brighter, "more light -> environment brighter")
    } else { fatalError("FAILED: more light -> environment") }
    if case .audience(let target) = ScenePatch.parse("fewer people", currentAudience: 10) {
      expect(target < 10, "fewer people -> audience decrease target<current (got \(target))")
    } else { fatalError("FAILED: fewer people -> audience") }
    if case .audience(let target) = ScenePatch.parse("make the audience 12 people", currentAudience: 4) {
      expect(target == 12, "make the audience 12 people -> target 12 (got \(target))")
    } else { fatalError("FAILED: make the audience 12 people -> audience") }
    if case .deferred = ScenePatch.parse("make it longer", currentAudience: 4) {
      print("ok: make it longer -> deferred")
    } else { fatalError("FAILED: make it longer -> deferred") }
    if case .ambiguous = ScenePatch.parse("change the audience", currentAudience: 4) {
      print("ok: change the audience -> ambiguous")
    } else { fatalError("FAILED: change the audience -> ambiguous") }

    // Fixture: host is conversation target, one existing audience member.
    let plan = JSON([
      "session_id": "s", "revision": 1, "duration_sec": 60,
      "characters": [
        ["id": "host", "name": "Host", "role": "host", "scene_node_id": "host_node",
         "asset_id": "character.base.a", "color_hex": "#111111"] as [String: Any],
        ["id": "audience_1", "name": "Ana", "role": "audience", "scene_node_id": "aud_node_1",
         "asset_id": "character.base.a", "color_hex": "#222222"] as [String: Any],
      ] as [[String: Any]],
    ])
    let scene = JSON([
      "session_id": "s", "revision": 1,
      "initial_viewpoint_id": "start",
      "viewpoints": [["id": "start", "position": [0.0, 1.6, 4.0]] as [String: Any]],
      "scenario": ["steps": [["conversation_target": "audience_1"] as [String: Any]]] as [String: Any],
      "nodes": [
        ["id": "host_node", "role": "character",
         "geometry": ["kind": "asset", "asset_id": "character.base.a"] as [String: Any],
         "position": [0.0, 0.0, 0.0], "animation": "idle"] as [String: Any],
        ["id": "aud_node_1", "role": "character",
         "geometry": ["kind": "asset", "asset_id": "character.base.a"] as [String: Any],
         "position": [0.0, 0.0, 1.0], "animation": "sit"] as [String: Any],
        ["id": "floor", "role": "environment",
         "geometry": ["kind": "box", "size": [10.0, 0.1, 10.0]] as [String: Any],
         "position": [0.0, 0.0, 0.0], "animation": "none"] as [String: Any],
      ] as [[String: Any]],
      "environment": ["lighting_environment_intensity": 1.0] as [String: Any],
    ])
    expect(ScenePatch.audienceCount(plan: plan) == 1, "audienceCount == 1")

    // Increase adds audience_edit_ cast + nodes (chair + character).
    guard let grown = ScenePatch.patchAudience(
      scene: scene, plan: plan, target: 3,
      chairAssetID: "furniture.chair.x",
      characterAssetIDs: ["character.base.a", "character.base.b"])
    else { fatalError("FAILED: patchAudience increase returned nil") }
    expect(ScenePatch.audienceCount(plan: grown.plan) == 3, "increase -> audienceCount 3")
    let grownIDs = grown.plan["characters"].list.map { $0["id"].text }
    expect(grownIDs.contains("audience_edit_1") && grownIDs.contains("audience_edit_2"),
      "increase adds audience_edit_ cast")
    let grownNodes = Set(grown.scene["nodes"].list.map { $0["id"].text })
    expect(grownNodes.contains("aud_edit_node_1") && grownNodes.contains("aud_edit_chair_1"),
      "increase adds aud_edit_node_/aud_edit_chair_ nodes")
    expect(grown.summary == "Audience is now 3 people in this same place.", "increase summary")

    // Decrease removes edit-added first, never the conversation target (audience_1).
    guard let shrunk = ScenePatch.patchAudience(
      scene: grown.scene, plan: grown.plan, target: 1,
      chairAssetID: "furniture.chair.x",
      characterAssetIDs: ["character.base.a"])
    else { fatalError("FAILED: patchAudience decrease returned nil") }
    let shrunkIDs = shrunk.plan["characters"].list.map { $0["id"].text }
    expect(!shrunkIDs.contains("audience_edit_1") && !shrunkIDs.contains("audience_edit_2"),
      "decrease removes edit-added characters")
    expect(shrunkIDs.contains("audience_1"), "decrease never removes conversation target")
    expect(shrunkIDs.contains("host"), "decrease keeps non-audience characters")
    let shrunkNodes = Set(shrunk.scene["nodes"].list.map { $0["id"].text })
    expect(!shrunkNodes.contains("aud_edit_node_1") && shrunkNodes.contains("aud_node_1"),
      "decrease removes edit nodes, keeps target node")
    // Protect: asking to go to 0 still keeps the conversation target.
    guard let floored = ScenePatch.patchAudience(
      scene: grown.scene, plan: grown.plan, target: 0,
      chairAssetID: nil, characterAssetIDs: ["character.base.a"])
    else { fatalError("FAILED: patchAudience decrease to 0 returned nil") }
    expect(floored.plan["characters"].list.map { $0["id"].text }.contains("audience_1"),
      "decrease to 0 still keeps conversation target")

    // No-change is nil.
    expect(ScenePatch.patchAudience(scene: scene, plan: plan, target: 1,
      chairAssetID: nil, characterAssetIDs: ["character.base.a"]) == nil,
      "no-change patchAudience returns nil")

    // Environment patch clamps.
    let brighterScene = ScenePatch.patchEnvironment(scene: scene, brighter: true)
    expect(abs((brighterScene["environment"]["lighting_environment_intensity"].number ?? 0) - 1.25) < 0.001,
      "patchEnvironment +0.25")
    print("ScenePatch checks passed.")
  }
}

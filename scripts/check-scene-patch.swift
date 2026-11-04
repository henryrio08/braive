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
    // Relative vs absolute counts (starting at 8).
    if case .audience(let target) = ScenePatch.parse("add 3 people", currentAudience: 8) {
      expect(target == 11, "add 3 people @8 -> 11 (got \(target))")
    } else { fatalError("FAILED: add 3 people -> audience") }
    if case .audience(let target) = ScenePatch.parse("remove 2 audience members", currentAudience: 8) {
      expect(target == 6, "remove 2 audience members @8 -> 6 (got \(target))")
    } else { fatalError("FAILED: remove 2 audience members -> audience") }
    if case .audience(let target) = ScenePatch.parse("make the audience 12 people", currentAudience: 8) {
      expect(target == 12, "make the audience 12 people @8 -> 12 (got \(target))")
    } else { fatalError("FAILED: make the audience 12 people @8 -> audience") }
    // Compound + direction: preserved lighting must not become environment.
    if case .audience(let target) = ScenePatch.parse("make the audience larger but keep the lighting", currentAudience: 8) {
      expect(target == 16, "make audience larger but keep lighting @8 -> audience 16 (got \(target))")
    } else { fatalError("FAILED: make audience larger but keep lighting -> audience (not environment)") }
    if case .environment(let brighter) = ScenePatch.parse("less light", currentAudience: 8) {
      expect(!brighter, "less light -> environment dimmer")
    } else { fatalError("FAILED: less light -> environment") }
    if case .environment(let brighter) = ScenePatch.parse("more light", currentAudience: 8) {
      expect(brighter, "more light -> environment brighter (from 8)")
    } else { fatalError("FAILED: more light @8 -> environment") }
    if case .ambiguous = ScenePatch.parse("change the audience", currentAudience: 8) {
      print("ok: change the audience @8 -> ambiguous")
    } else { fatalError("FAILED: change the audience @8 -> ambiguous") }
    if case .ambiguous = ScenePatch.parse("light", currentAudience: 8) {
      print("ok: bare light -> ambiguous(lighting)")
    } else { fatalError("FAILED: bare light -> ambiguous") }

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
    // New audience members are complete Character records.
    let newCharacters = grown.plan["characters"].list.filter { $0["id"].text.hasPrefix("audience_edit_") }
    expect(!newCharacters.isEmpty, "increase has new character records to check")
    for character in newCharacters {
      expect(character["appearance_brief"].text == "Audience member in the approved soft adult style, seated facing the participant.",
        "new character appearance_brief complete")
      expect(character["goal"].text == "Listen as part of the audience.", "new character goal complete")
      expect(character["behavior_boundaries"].list.first?.text == "Remains seated, does not approach or interrupt the participant.",
        "new character behavior_boundaries complete")
      expect(character["voice_id"].text == "default", "new character voice_id complete")
    }

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

    // Placement from an existing audience member at [2,0,-3] yaw 0.
    let placedPlan = JSON([
      "session_id": "s", "revision": 1, "duration_sec": 60,
      "characters": [
        ["id": "audience_1", "name": "Ana", "role": "audience", "scene_node_id": "aud_node_1",
         "asset_id": "character.base.a", "color_hex": "#222222"] as [String: Any],
      ] as [[String: Any]],
    ])
    let placedScene = JSON([
      "session_id": "s", "revision": 1,
      "initial_viewpoint_id": "start",
      "viewpoints": [["id": "start", "position": [0.0, 1.6, 4.0]] as [String: Any]],
      "scenario": ["steps": [] as [[String: Any]]] as [String: Any],
      "nodes": [
        ["id": "aud_node_1", "role": "character",
         "geometry": ["kind": "asset", "asset_id": "character.base.a"] as [String: Any],
         "position": [2.0, 0.0, -3.0], "rotation_radians": [0.0, 0.0, 0.0], "animation": "sit"] as [String: Any],
      ] as [[String: Any]],
      "environment": ["lighting_environment_intensity": 1.0] as [String: Any],
    ])
    guard let placed = ScenePatch.patchAudience(
      scene: placedScene, plan: placedPlan, target: 2,
      chairAssetID: "furniture.chair.x",
      characterAssetIDs: ["character.base.a"])
    else { fatalError("FAILED: patchAudience placement returned nil") }
    guard let placedNode = placed.scene["nodes"].list.first(where: { $0["id"].text == "aud_edit_node_1" })
    else { fatalError("FAILED: placement added node missing") }
    let placedPosition = placedNode["position"].list.map { $0.value }
    expect(placedPosition.count == 3 && abs(placedPosition[1] - 0.0) < 0.001,
      "placement from existing audience keeps floor y==0 (got \(placedPosition))")
    let placedDistance = placedPosition.count == 3
      ? ((placedPosition[0] - 2.0) * (placedPosition[0] - 2.0) + (placedPosition[2] + 3.0) * (placedPosition[2] + 3.0)).squareRoot() : 0
    expect(placedDistance > 1.0,
      "placement from existing audience is >1 from center [2,0,-3] (got distance \(placedDistance) at \(placedPosition))")
    let placedRotation = placedNode["rotation_radians"].list.map { $0.value }
    expect(placedRotation.count == 3 && abs(placedRotation[1] - 0.0) < 0.001,
      "placement from existing audience keeps existing yaw 0 (got \(placedRotation))")

    // New intents: material / decorative / behavior.
    if case .material(let textureID) = ScenePatch.parse("make the floor wood", currentAudience: 4) {
      expect(textureID == "texture.surface.wood_01", "make the floor wood -> material wood id (got \(textureID))")
    } else { fatalError("FAILED: make the floor wood -> material") }
    if case .material(let textureID) = ScenePatch.parse("cover the wall with stone", currentAudience: 4) {
      expect(textureID == "texture.surface.stone_01", "cover wall stone -> material stone id (got \(textureID))")
    } else { fatalError("FAILED: cover the wall with stone -> material") }
    if case .decorative(let kind) = ScenePatch.parse("add some plants", currentAudience: 4) {
      expect(kind == "plants", "add some plants -> decorative plants (got \(kind))")
    } else { fatalError("FAILED: add some plants -> decorative") }
    if case .behavior(let behavior) = ScenePatch.parse("make them wave", currentAudience: 4) {
      expect(behavior == "gesture", "make them wave -> behavior gesture (got \(behavior))")
    } else { fatalError("FAILED: make them wave -> behavior") }
    if case .ambiguous = ScenePatch.parse("make the audience nod", currentAudience:4) {
      print("ok: unsupported nod is not silently replaced with a wave")
    } else { fatalError("FAILED: unsupported nod must be clarified") }

    // patchMaterial sets texture only on the matching environment floor node.
    guard let materialPatched = ScenePatch.patchMaterial(scene: scene, textureID: "texture.surface.wood_01")
    else { fatalError("FAILED: patchMaterial returned nil for floor fixture") }
    expect(materialPatched.appliedNodeIDs == ["floor"], "patchMaterial applies only to floor (got \(materialPatched.appliedNodeIDs))")
    let materialFloor = materialPatched.scene["nodes"].list.first(where: { $0["id"].text == "floor" })
    expect(materialFloor?["material"]["texture_asset_id"].text == "texture.surface.wood_01", "patchMaterial sets texture_asset_id on floor")
    expect(materialFloor?["material"]["texture_scale"].value == 2, "patchMaterial sets texture_scale 2 on floor")
    for node in materialPatched.scene["nodes"].list where node["id"].text != "floor" {
      expect(node["material"]["texture_asset_id"].text.isEmpty, "patchMaterial leaves \(node["id"].text) texture unset")
    }
    expect(ScenePatch.patchMaterial(scene: placedScene, textureID: "texture.surface.wood_01") == nil,
      "patchMaterial with no surface node returns nil")

    // patchDecorative adds <=6 bush nodes with unique, continuing ids.
    let audienceNodes = scene["nodes"].list.filter { $0["id"].text == "aud_node_1" }
    guard let decorated = ScenePatch.patchDecorative(scene: scene, existingNodes: audienceNodes)
    else { fatalError("FAILED: patchDecorative returned nil") }
    let decorNodes = decorated.scene["nodes"].list.filter { $0["id"].text.hasPrefix("edit_decor_") }
    expect(!decorNodes.isEmpty && decorNodes.count <= 6, "patchDecorative adds <=6 nodes (got \(decorNodes.count))")
    expect(Set(decorNodes.map { $0["id"].text }).count == decorNodes.count, "patchDecorative ids unique")
    for node in decorNodes {
      expect(node["role"].text == "environment", "decor node role environment")
      expect(node["geometry"]["asset_id"].text == "nature.bush.nature_plant_bush_01", "decor node bush asset")
      expect(node["description"].text == "Decorative planting", "decor node description")
      expect(node["collision_role"].text == "none" && node["collision"].string == nil, "decor node uses only the actual collision_role contract")
      expect(node["position"].list.count == 3, "decor node has position")
    }
    guard let decoratedAgain = ScenePatch.patchDecorative(scene: decorated.scene, existingNodes: audienceNodes)
    else { fatalError("FAILED: second patchDecorative returned nil") }
    let allDecorIDs = decoratedAgain.scene["nodes"].list.filter { $0["id"].text.hasPrefix("edit_decor_") }.map { $0["id"].text }
    expect(Set(allDecorIDs).count == allDecorIDs.count, "patchDecorative continuing ids stay unique")

    // Environment patch clamps.
    let brighterScene = ScenePatch.patchEnvironment(scene: scene, brighter: true)
    expect(abs((brighterScene["environment"]["lighting_environment_intensity"].number ?? 0) - 1.25) < 0.001,
      "patchEnvironment +0.25")
    print("ScenePatch checks passed.")
  }
}

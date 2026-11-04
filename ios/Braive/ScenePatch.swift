import Foundation

enum EditIntent {
  case audience(target: Int)
  case environment(brighter: Bool)
  case material(textureID: String)
  case decorative(kind: String)
  case behavior(String)
  case deferred(String)
  case ambiguous(String)
}

/// Canonical, persistent same-world scene revisions.
/// Foundation only (no SceneKit) so it can be checked with swiftc on Linux.
enum ScenePatch {
  static func parse(_ text: String, currentAudience: Int) -> EditIntent {
    let lower = text.lowercased()
    // 1. Task-scope words shape the next attempt, not this world.
    let taskWords = ["duration", "task", "route", "path", "longer", "shorter", "minutes"]
    if taskWords.contains(where: { lower.contains($0) }) {
      return .deferred(text)
    }
    // 2. Preserved-clause handling: "keep/preserve/without changing X".
    let preservedLighting = isPreserved(lower, keywords: ["light", "lighting", "brightness", "bright"])
    let preservedAudience = isPreserved(lower, keywords: ["audience", "people", "crowd", "listeners", "seats"])
    // 2b. Material / decorative / behavior, only with clear intent.
    // Material: a registered texture word plus a surface or action word.
    let materialSurfaces = ["make", "cover", "floor", "wall", "ground", "texture", "material"]
    if materialSurfaces.contains(where: { lower.contains($0) }) {
      let textures: [(String, String)] = [
        ("wood", "texture.surface.wood_01"), ("stone", "texture.surface.stone_01"),
        ("grass", "texture.surface.grass_01"), ("fabric", "texture.surface.fabric_01"),
      ]
      for (word, textureID) in textures where lower.contains(word) {
        return .material(textureID: textureID)
      }
    }
    // Decorative: an add/place/put verb plus planting words.
    let decorativeVerbs = ["add", "place", "put"]
    let decorativeWords = ["plants", "flowers", "bushes", "greenery", "plant", "flower", "bush"]
    if decorativeVerbs.contains(where: { lower.contains($0) })
      && decorativeWords.contains(where: { lower.contains($0) }) {
      return .decorative(kind: "plants")
    }
    // Behavior: a gesture word plus who should do it (or "make").
    // Only registered behaviors are emitted; wave/nod/smile all map to gesture.
    let behaviorWords = ["wave", "gesture", "smile", "nod"]
    let behaviorTargets = ["audience", "them", "people", "make"]
    if behaviorWords.contains(where: { lower.contains($0) })
      && behaviorTargets.contains(where: { lower.contains($0) }) {
      return .behavior("gesture")
    }
    // 3. Audience (before environment, so "make the audience larger but
    //    keep the lighting" resolves to audience, not environment).
    let audienceWords = ["audience", "people", "person", "crowd", "seats", "listeners", "members", "spectators"]
    if !preservedAudience && audienceWords.contains(where: { lower.contains($0) }) {
      if let explicit = explicitNumber(lower) {
        return .audience(target: clamp(resolveCount(lower, explicit: explicit, current: currentAudience)))
      }
      let decreaseWords = ["fewer", "less", "smaller", "reduce", "remove", "down", "decrease"]
      let increaseWords = ["more", "larger", "bigger", "add", "increase"]
      let isDecrease = decreaseWords.contains(where: { lower.contains($0) })
      let isIncrease = increaseWords.contains(where: { lower.contains($0) })
      let few = lower.contains("a few")
      if isDecrease && !isIncrease {
        return .audience(target: clamp(currentAudience - (few ? 3 : 4)))
      }
      if isIncrease && !isDecrease {
        return .audience(target: clamp(currentAudience + (few ? 3 : 8)))
      }
      return .ambiguous("audience")
    }
    // 4. Environment, only if lighting is not preserved and an explicit
    //    lighting change direction exists.
    let environmentWords = ["light", "bright", "dim", "dark", "warm", "cool", "quiet", "calm"]
    if !preservedLighting && environmentWords.contains(where: { lower.contains($0) }) {
      // Dim direction first: "less light" must dim even though it
      // contains "light".
      let dimWords = ["less light", "less lighting", "less bright", "dimmer", "darker", "dim", "dark", "lower", "reduce light", "reduce the light", "reduce lighting", "cooler", "quieter", "cool", "quiet", "calm", "less"]
      if dimWords.contains(where: { lower.contains($0) }) {
        return .environment(brighter: false)
      }
      let brightWords = ["more light", "more lighting", "brighter", "brighten", "increase light", "increase lighting", "increased light", "more", "bright", "warmer", "warm", "increase"]
      if brightWords.contains(where: { lower.contains($0) }) {
        return .environment(brighter: true)
      }
      // Bare "light"/"lighting" with no direction.
      return .ambiguous("lighting")
    }
    if preservedLighting && environmentWords.contains(where: { lower.contains($0) }) && !audienceWords.contains(where: { lower.contains($0) }) {
      return .ambiguous("lighting")
    }
    return .deferred(text)
  }

  private static func clamp(_ value: Int) -> Int { min(16, max(0, value)) }

  private static func isPreserved(_ lower: String, keywords: [String]) -> Bool {
    let markers = ["keep", "preserve", "without changing", "without altering", "do not change", "don't change", "leave"]
    for marker in markers {
      if let range = lower.range(of: marker) {
        let tail = String(lower[range.lowerBound...])
        if keywords.contains(where: { tail.contains($0) }) { return true }
      }
    }
    return false
  }

  private static let numberWords: [String: Int] = [
    "zero": 0, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6,
    "seven": 7, "eight": 8, "nine": 9, "ten": 10, "eleven": 11, "twelve": 12,
    "thirteen": 13, "fourteen": 14, "fifteen": 15, "sixteen": 16,
    "seventeen": 17, "eighteen": 18, "nineteen": 19, "twenty": 20,
  ]

  /// First explicit count (digits or number word), if any.
  private static func explicitNumber(_ lower: String) -> Int? {
    let tokens = lower.split(whereSeparator: { !$0.isLetter && !$0.isNumber }).map(String.init)
    for token in tokens {
      if let value = Int(token) { return value }
      if let value = numberWords[token] { return value }
    }
    return nil
  }

  /// Absolute only with an absolute cue; otherwise relative to current.
  private static func resolveCount(_ lower: String, explicit: Int, current: Int) -> Int {
    let tokens = lower.split(whereSeparator: { !$0.isLetter && !$0.isNumber }).map(String.init)
    let tokenSet = Set(tokens)
    var isAbsolute = tokenSet.contains("exactly") || tokenSet.contains("total")
      || tokenSet.contains("set") || tokenSet.contains("sets") || tokenSet.contains("setting")
    if !isAbsolute {
      // "to N" / "audience of N" / "make/have ... N"
      for (index, token) in tokens.enumerated() {
        let isNumber = Int(token) != nil || numberWords[token] != nil
        guard isNumber else { continue }
        if index > 0 && (tokens[index - 1] == "to" || tokens[index - 1] == "of") { isAbsolute = true }
        break
      }
    }
    if !isAbsolute && (tokenSet.contains("make") || tokenSet.contains("makes") || tokenSet.contains("have")) {
      isAbsolute = true
    }
    if isAbsolute { return explicit }
    let decreaseTokens: Set<String> = ["remove", "decrease", "fewer", "less", "reduce", "smaller", "subtract"]
    let increaseTokens: Set<String> = ["add", "increase", "more", "plus", "extra"]
    if !tokenSet.isDisjoint(with: decreaseTokens) { return current - explicit }
    if !tokenSet.isDisjoint(with: increaseTokens) { return current + explicit }
    return explicit
  }

  static func isAudience(_ character: JSON) -> Bool {
    guard !character["id"].text.isEmpty else { return false }
    if character["id"].text.hasPrefix("audience_") { return true }
    return character["role"].text.lowercased().contains("audience")
  }

  static func audienceCount(plan: JSON) -> Int {
    plan["characters"].list.filter { isAudience($0) }.count
  }

  static func patchAudience(
    scene: JSON, plan: JSON, target: Int,
    chairAssetID: String?, characterAssetIDs: [String]
  ) -> (scene: JSON, plan: JSON, summary: String)? {
    let clampedTarget = clamp(target)
    let current = audienceCount(plan: plan)
    guard clampedTarget != current else { return nil }
    if clampedTarget > current {
      guard !characterAssetIDs.isEmpty else { return nil }
      var newScene = scene
      var newPlan = plan
      var characters = plan["characters"].list
      var nodes = scene["nodes"].list
      // Initial viewpoint and floor.
      let viewpoints = scene["viewpoints"].list
      let initialID = scene["initial_viewpoint_id"].text
      let viewpoint = viewpoints.first(where: { $0["id"].text == initialID }) ?? viewpoints.first
      let vp = viewpoint?["position"].list.map { $0.value } ?? []
      let vx = vp.count == 3 ? vp[0] : 0.0
      let vy = vp.count == 3 ? vp[1] : 1.6
      let vz = vp.count == 3 ? vp[2] : 4.0
      // Placement derived from an existing audience when present.
      var nodeByID: [String: JSON] = [:]
      for node in nodes { nodeByID[node["id"].text] = node }
      let audienceNodes = characters.filter { isAudience($0) }
        .compactMap { nodeByID[$0["scene_node_id"].text] }
        .filter { $0["position"].list.count == 3 }
      let useExistingAudience = !audienceNodes.isEmpty
      var existingFloorY = vy - 1.6
      var centerX = vx
      var centerZ = vz
      var existingMaxDistance = 0.0
      var existingYaw = 0.0
      if useExistingAudience {
        let positions = audienceNodes.map { $0["position"].list.map { $0.value } }
        existingFloorY = positions.map { $0[1] }.min() ?? (vy - 1.6)
        centerX = positions.map { $0[0] }.reduce(0, +) / Double(positions.count)
        centerZ = positions.map { $0[2] }.reduce(0, +) / Double(positions.count)
        existingMaxDistance = positions.map { sqrt(pow($0[0] - centerX, 2) + pow($0[2] - centerZ, 2)) }.max() ?? 0.0
        let firstRotation = audienceNodes[0]["rotation_radians"].list.map { $0.value }
        existingYaw = firstRotation.count >= 2 ? firstRotation[1] : 0.0
      }
      let characterYs = nodes.filter { $0["role"].text == "character" }.compactMap { node -> Double? in
        let position = node["position"].list.map { $0.value }
        return position.count == 3 ? position[1] : nil
      }
      let fallbackFloorY = characterYs.min() ?? (vy - 1.6)
      // Next edit index.
      var maxEdit = 0
      for character in characters {
        let id = character["id"].text
        if id.hasPrefix("audience_edit_"), let n = Int(id.dropFirst("audience_edit_".count)) {
          maxEdit = max(maxEdit, n)
        }
      }
      let palette = ["#c98b69", "#7b9385", "#8d6e5d", "#a87f5f"]
      let needed = clampedTarget - current
      for offset in 0..<needed {
        let n = maxEdit + offset + 1
        let i = current + offset
        let assetID = characterAssetIDs[i % characterAssetIDs.count]
        let color = palette[i % palette.count]
        let row = i / 6
        let seat = i % 6
        let angle = (Double(seat) - 2.5) * 0.20 + Double(row) * 0.06
        var px = 0.0
        var pz = 0.0
        var py = fallbackFloorY
        var yaw = 0.0
        if useExistingAudience {
          let radius = existingMaxDistance + 1.2 * Double(row + 1)
          px = centerX + sin(angle) * radius
          pz = centerZ + cos(angle) * radius
          py = existingFloorY
          yaw = existingYaw
        } else {
          // In front of the viewpoint: viewer forward is -Z.
          let radius = 3.6 + Double(row) * 1.5
          px = vx + sin(angle) * radius
          pz = vz - cos(angle) * radius
          py = fallbackFloorY
          yaw = atan2(-(vx - px), -(vz - pz))
        }
        let characterID = "audience_edit_\(n)"
        let nodeID = "aud_edit_node_\(n)"
        characters.append(JSON([
          "id": characterID, "name": "Audience member", "role": "audience",
          "scene_node_id": nodeID, "asset_id": assetID, "color_hex": color,
          "appearance_brief": "Audience member in the approved soft adult style, seated facing the participant.",
          "goal": "Listen as part of the audience.",
          "behavior_boundaries": ["Remains seated, does not approach or interrupt the participant."],
          "voice_id": "default",
        ]))
        if let chairAssetID {
          nodes.append(JSON([
            "id": "aud_edit_chair_\(n)", "parent_id": NSNull(), "role": "environment",
            "geometry": ["kind": "asset", "asset_id": chairAssetID] as [String: Any],
            "position": [px, py, pz], "rotation_radians": [0.0, yaw, 0.0], "scale": [1.0, 1.0, 1.0],
            "material": ["color": "#a78c64", "roughness": 0.8] as [String: Any],
            "animation": "none", "description": "Audience chair",
          ]))
        }
        nodes.append(JSON([
          "id": nodeID, "parent_id": NSNull(), "role": "character",
          "geometry": ["kind": "asset", "asset_id": assetID] as [String: Any],
          "position": [px, py, pz], "rotation_radians": [0.0, yaw, 0.0], "scale": [1.0, 1.0, 1.0],
          "material": ["color": color, "roughness": 0.8] as [String: Any],
          "animation": chairAssetID != nil ? "sit" : "idle", "description": "Audience member",
        ]))
      }
      newPlan["characters"] = JSON(characters.map(\.raw))
      newScene["nodes"] = JSON(nodes.map(\.raw))
      let summary = "Audience is now \(clampedTarget) people in this same place."
      return (newScene, newPlan, summary)
    } else {
      // Decrease: edit-added first (highest N), then other audience members.
      let protected = Set(
        scene["scenario"]["steps"].list.map { $0["conversation_target"].text }.filter { !$0.isEmpty })
      var characters = plan["characters"].list
      let audience = characters.filter { isAudience($0) && !protected.contains($0["id"].text) }
      func editIndex(_ character: JSON) -> Int? {
        let id = character["id"].text
        guard id.hasPrefix("audience_edit_") else { return nil }
        return Int(id.dropFirst("audience_edit_".count))
      }
      let editAdded = audience.filter { editIndex($0) != nil }
        .sorted { (editIndex($0) ?? 0) > (editIndex($1) ?? 0) }
      let others = audience.filter { editIndex($0) == nil }.reversed()
      let ordered: [JSON] = editAdded + Array(others)
      let removeCount = current - clampedTarget
      let toRemove = Array(ordered.prefix(removeCount))
      guard !toRemove.isEmpty else { return nil }
      let removeIDs = Set(toRemove.map { $0["id"].text })
      var removeNodeIDs = Set<String>()
      for character in toRemove {
        removeNodeIDs.insert(character["scene_node_id"].text)
        if let n = editIndex(character) { removeNodeIDs.insert("aud_edit_chair_\(n)") }
      }
      characters.removeAll { removeIDs.contains($0["id"].text) }
      var nodes = scene["nodes"].list
      nodes.removeAll { removeNodeIDs.contains($0["id"].text) }
      var newScene = scene
      var newPlan = plan
      newPlan["characters"] = JSON(characters.map(\.raw))
      newScene["nodes"] = JSON(nodes.map(\.raw))
      let newCount = audienceCount(plan: newPlan)
      let summary = "Audience is now \(newCount) people in this same place."
      return (newScene, newPlan, summary)
    }
  }

  static func patchMaterial(scene: JSON, textureID: String) -> (scene: JSON, appliedNodeIDs: [String], summary: String)? {
    let surfaceWords = ["floor", "ground", "wall", "path"]
    var nodes = scene["nodes"].list
    var applied: [String] = []
    for index in nodes.indices {
      guard applied.count < 6 else { break }
      let node = nodes[index]
      guard node["role"].text.lowercased() == "environment" else { continue }
      let idText = node["id"].text.lowercased()
      let descriptionText = node["description"].text.lowercased()
      guard surfaceWords.contains(where: { idText.contains($0) || descriptionText.contains($0) }) else { continue }
      var material = node["material"]
      material["texture_asset_id"] = JSON(textureID)
      material["texture_scale"] = JSON(2)
      var updated = node
      updated["material"] = material
      nodes[index] = updated
      applied.append(node["id"].text)
    }
    guard !applied.isEmpty else { return nil }
    var newScene = scene
    newScene["nodes"] = JSON(nodes.map(\.raw))
    let textureName = ["wood", "stone", "grass", "fabric"].first(where: { textureID.contains($0) }) ?? textureID
    let summary = applied.count == 1
      ? "This same place now has a \(textureName) surface."
      : "This same place now has \(textureName) surfaces."
    return (newScene, applied, summary)
  }

  static func patchDecorative(scene: JSON, existingNodes: [JSON]) -> (scene: JSON, summary: String)? {
    var nodes = scene["nodes"].list
    var maxDecor = 0
    for node in nodes {
      let id = node["id"].text
      if id.hasPrefix("edit_decor_"), let n = Int(id.dropFirst("edit_decor_".count)) {
        maxDecor = max(maxDecor, n)
      }
    }
    // Placement, mirroring patchAudience: ring around an existing audience
    // center, otherwise flanking the area in front of the initial viewpoint.
    let viewpoints = scene["viewpoints"].list
    let initialID = scene["initial_viewpoint_id"].text
    let viewpoint = viewpoints.first(where: { $0["id"].text == initialID }) ?? viewpoints.first
    let vp = viewpoint?["position"].list.map { $0.value } ?? []
    let vx = vp.count == 3 ? vp[0] : 0.0
    let vy = vp.count == 3 ? vp[1] : 1.6
    let vz = vp.count == 3 ? vp[2] : 4.0
    let audiencePositions = existingNodes
      .filter { $0["position"].list.count == 3 }
      .map { $0["position"].list.map { $0.value } }
    let characterYs = nodes.filter { $0["role"].text == "character" }.compactMap { node -> Double? in
      let position = node["position"].list.map { $0.value }
      return position.count == 3 ? position[1] : nil
    }
    let count = 6
    var placements: [(x: Double, y: Double, z: Double)] = []
    if !audiencePositions.isEmpty {
      let floorY = audiencePositions.map { $0[1] }.min() ?? (vy - 1.6)
      let centerX = audiencePositions.map { $0[0] }.reduce(0, +) / Double(audiencePositions.count)
      let centerZ = audiencePositions.map { $0[2] }.reduce(0, +) / Double(audiencePositions.count)
      let maxDistance = audiencePositions.map { sqrt(pow($0[0] - centerX, 2) + pow($0[2] - centerZ, 2)) }.max() ?? 0.0
      let radius = maxDistance + 0.8
      for i in 0..<count {
        let angle = (Double(i) / Double(count)) * 2 * Double.pi
        placements.append((centerX + sin(angle) * radius, floorY, centerZ + cos(angle) * radius))
      }
    } else {
      guard viewpoint != nil else { return nil }
      let floorY = characterYs.min() ?? (vy - 1.6)
      let angles = [-0.95, -0.6, -0.3, 0.3, 0.6, 0.95]
      for angle in angles {
        let radius = 3.4
        placements.append((vx + sin(angle) * radius, floorY, vz - cos(angle) * radius))
      }
    }
    guard !placements.isEmpty else { return nil }
    for (offset, placement) in placements.enumerated() {
      let n = maxDecor + offset + 1
      nodes.append(JSON([
        "id": "edit_decor_\(n)", "parent_id": NSNull(), "role": "environment",
        "geometry": ["kind": "asset", "asset_id": "nature.bush.nature_plant_bush_01"] as [String: Any],
        "position": [placement.x, placement.y, placement.z], "rotation_radians": [0.0, 0.0, 0.0], "scale": [1.0, 1.0, 1.0],
        "material": ["color": "#5d7a4a", "roughness": 0.9] as [String: Any],
        "animation": "none", "description": "Decorative planting",
        "collision": "none", "collision_role": "none",
      ]))
    }
    var newScene = scene
    newScene["nodes"] = JSON(nodes.map(\.raw))
    return (newScene, "Added decorative planting in this same place.")
  }

  static func patchEnvironment(scene: JSON, brighter: Bool) -> JSON {
    var newScene = scene
    var environment = scene["environment"]
    let current = environment["lighting_environment_intensity"].number ?? 1.0
    let adjusted = min(1.4, max(0.35, current + (brighter ? 0.25 : -0.25)))
    environment["lighting_environment_intensity"] = JSON(adjusted)
    newScene["environment"] = environment
    return newScene
  }
}

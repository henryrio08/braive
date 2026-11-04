import Foundation

enum EditIntent {
  case audience(target: Int)
  case environment(brighter: Bool)
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
    // 2. Environment before audience, so "more light" is not an audience change.
    let environmentWords = ["light", "bright", "dim", "dark", "warm", "cool", "quiet", "calm"]
    if environmentWords.contains(where: { lower.contains($0) }) {
      let dimmerWords = ["dimmer", "darker", "cooler", "quieter", "dim", "dark", "cool", "quiet", "calm"]
      let brighterWords = ["more", "brighter", "warmer", "bright", "light", "warm"]
      if dimmerWords.contains(where: { lower.contains($0) }) && !lower.contains("more") && !lower.contains("brighter") {
        return .environment(brighter: false)
      }
      if brighterWords.contains(where: { lower.contains($0) }) {
        return .environment(brighter: true)
      }
      return .environment(brighter: false)
    }
    // 3. Audience.
    let audienceWords = ["audience", "people", "crowd", "seats", "listeners"]
    if audienceWords.contains(where: { lower.contains($0) }) {
      if let explicit = explicitCount(lower) {
        return .audience(target: clamp(explicit))
      }
      let decreaseWords = ["fewer", "less", "smaller", "reduce", "remove", "down"]
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
      if few && !isDecrease && !isIncrease {
        return .ambiguous("audience")
      }
      return .ambiguous("audience")
    }
    return .deferred(text)
  }

  private static func clamp(_ value: Int) -> Int { min(16, max(0, value)) }

  private static func explicitCount(_ lower: String) -> Int? {
    // Digits first, e.g. "to 12" or "12 people".
    var digits = ""
    var found: Int? = nil
    for ch in lower + " " {
      if ch.isNumber {
        digits.append(ch)
      } else {
        if let value = Int(digits), found == nil { found = value }
        digits = ""
      }
    }
    if let found { return found }
    let words: [String: Int] = [
      "zero": 0, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6,
      "seven": 7, "eight": 8, "nine": 9, "ten": 10, "eleven": 11, "twelve": 12,
      "thirteen": 13, "fourteen": 14, "fifteen": 15, "sixteen": 16,
      "seventeen": 17, "eighteen": 18, "nineteen": 19, "twenty": 20,
    ]
    let tokens = lower.split(whereSeparator: { !$0.isLetter }).map(String.init)
    // Avoid treating "a few" (handled by caller) or indefinite articles as counts.
    for token in tokens {
      if let value = words[token] { return value }
    }
    return nil
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
      let floorY = vy - 1.6
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
        let radius = 3.6 + Double(row) * 1.5
        let px = vx + sin(angle) * radius
        let pz = vz + cos(angle) * radius
        let py = floorY
        let yaw = atan2(-(vx - px), -(vz - pz))
        let characterID = "audience_edit_\(n)"
        let nodeID = "aud_edit_node_\(n)"
        characters.append(JSON([
          "id": characterID, "name": "Audience member", "role": "audience",
          "scene_node_id": nodeID, "asset_id": assetID, "color_hex": color,
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

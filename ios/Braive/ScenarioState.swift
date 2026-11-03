import Foundation

struct ScenarioDefinition: Codable {
  struct Action: Codable {
    let id: String, label: String, phrases: [String], operations: [JSON]
    let next_step_id: String?
  }
  struct Completion: Codable {
    let trigger: String, next_step_id: String
    let after_seconds: Double?
    let motion_path_id: String?
  }
  struct Step: Codable {
    let id: String, prompt: String, terminal: Bool
    let announce_on_entry: Bool?
    let conversation_target: String?
    let start_operations: [JSON], actions: [Action]
    let completion: Completion?
  }
  let objective: String, initial_step_id: String, dialogue_policy: String, steps: [Step]
  let progression: String?
}
struct ScenarioUpdate {
  let prompt: String, operations: [JSON], stepID: String
  let actionID: String?
  let terminal: Bool
  let announce: Bool
}
struct ScenarioRuntime {
  let definition: ScenarioDefinition
  private(set) var index = 0
  private var enteredAt = 0.0
  private var completedPaths = Set<String>()
  private var motionOwners: [String: String] = [:]
  struct Snapshot: Codable { let index: Int; let enteredAt: Double; let completedPaths: Set<String>; let motionOwners: [String: String] }
  var snapshot: Snapshot { Snapshot(index: index, enteredAt: enteredAt, completedPaths: completedPaths, motionOwners: motionOwners) }
  mutating func restore(_ saved: Snapshot) throws {
    guard definition.steps.indices.contains(saved.index), saved.enteredAt.isFinite, saved.enteredAt >= 0 else { throw CocoaError(.coderInvalidValue) }
    index = saved.index; enteredAt = saved.enteredAt; completedPaths = saved.completedPaths; motionOwners = saved.motionOwners
  }
  var step: ScenarioDefinition.Step { definition.steps[index] }
  var isGuided: Bool { definition.progression == "guided" }
  var conversationTarget: String? { isGuided && definition.dialogue_policy == "natural" ? step.conversation_target : nil }
  init(_ definition: ScenarioDefinition) throws {
    guard !definition.steps.isEmpty, definition.steps.first?.id == definition.initial_step_id,
      Set(definition.steps.map(\.id)).count == definition.steps.count else { throw CocoaError(.coderInvalidValue) }
    for (i, step) in definition.steps.enumerated() {
      if definition.progression == "guided" {
        guard step.actions.isEmpty, step.terminal || step.completion != nil,
          !step.terminal || step.conversation_target == nil else { throw CocoaError(.coderInvalidValue) }
      }
      guard !step.terminal || (step.actions.isEmpty && step.completion == nil) else { throw CocoaError(.coderInvalidValue) }
      guard Set(step.actions.map(\.id)).count == step.actions.count else { throw CocoaError(.coderInvalidValue) }
      let destinations = step.actions.compactMap(\.next_step_id) + [step.completion?.next_step_id].compactMap { $0 }
      guard destinations.allSatisfy({ id in definition.steps.firstIndex(where: { $0.id == id }).map { $0 > i } == true }) else { throw CocoaError(.coderInvalidValue) }
    }
    self.definition = definition
  }
  mutating func start(at time: Double) -> ScenarioUpdate {
    index = 0; enteredAt = time; completedPaths = []; motionOwners = [:]
    return update()
  }
  mutating func hear(_ text: String, at time: Double) -> ScenarioUpdate? {
    guard !isGuided else { return nil }
    let words = VoiceAnswer.normalized(text)
    let padded = " " + words + " "
    guard !["don't", "do not", "not ready", "not yet", "wait", "cancel"].contains(where: { padded.contains(" " + $0 + " ") }) else { return nil }
    guard let action = step.actions.first(where: { action in
      action.phrases.contains { padded.contains(" " + VoiceAnswer.normalized($0) + " ") }
    }) else { return nil }
    let sourceStep = step.id
    var operations = action.operations
    if let destination = action.next_step_id, let next = definition.steps.firstIndex(where: { $0.id == destination }) {
      index = next; enteredAt = time; operations += step.start_operations
    }
    return update(operations: operations, actionID: sourceStep + "/" + action.id, announce: action.next_step_id != nil)
  }
  mutating func tick(at time: Double, completedMotion: String?) -> ScenarioUpdate? {
    tick(at: time, completedMotions: Set([completedMotion].compactMap { $0 }))
  }
  mutating func receiveCompletedMotions(_ paths: Set<String>) { completedPaths.formUnion(paths) }
  mutating func tick(at time: Double, completedMotions: Set<String>) -> ScenarioUpdate? {
    completedPaths.formUnion(completedMotions)
    guard let completion = step.completion else { return nil }
    let ready = completion.trigger == "after_seconds"
      ? time - enteredAt >= (completion.after_seconds ?? .infinity)
      : completion.motion_path_id.map { completedPaths.contains($0) } == true
    guard ready, let next = definition.steps.firstIndex(where: { $0.id == completion.next_step_id }) else { return nil }
    index = next; enteredAt = time
    return update()
  }
  private mutating func update(operations: [JSON]? = nil, actionID: String? = nil, announce: Bool = true) -> ScenarioUpdate {
    let operations = operations ?? step.start_operations
    for op in operations {
      let type = op["type"].text
      let owner = type == "move_viewer" || type == "viewpoint_transition" ? "viewer" : type == "move_node" ? "node:" + op["node_id"].text : ""
      guard !owner.isEmpty else { continue }
      if let old = motionOwners[owner] { completedPaths.remove(old) }
      let path = op["path_id"].text
      completedPaths.remove(path); motionOwners[owner] = path.isEmpty ? nil : path
    }
    return ScenarioUpdate(prompt: step.prompt, operations: operations,
      stepID: step.id, actionID: actionID, terminal: step.terminal, announce: announce && (step.announce_on_entry ?? true))
  }
  static func requestedCharacter(_ text: String, characters: [(id: String, name: String, role: String)]) -> String? {
    let words = VoiceAnswer.normalized(text)
    guard words.hasPrefix("ask ") || words.hasPrefix("talk to ") else { return nil }
    let padded = " " + words + " "
    func matches(_ value: String) -> Bool {
      let key = VoiceAnswer.normalized(value)
      return !key.isEmpty && padded.contains(" " + key + " ")
    }
    let named = characters.filter { matches($0.name) }
    if named.count == 1 { return named[0].id }
    let roles = characters.filter { matches($0.role) }
    return roles.count == 1 ? roles[0].id : nil
  }
}

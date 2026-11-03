import Foundation
import simd

struct PracticeClock {
  private let now: () -> Double
  private var accumulated = 0.0
  private var resumedAt: Double?
  private var started = false
  init(now: @escaping () -> Double = { ProcessInfo.processInfo.systemUptime }) { self.now = now }
  var elapsed: Double { accumulated + (resumedAt.map { max(0, now() - $0) } ?? 0) }
  var hasStarted: Bool { started }
  mutating func begin() { accumulated = 0; started = true; resumedAt = now() }
  mutating func pause() { accumulated = elapsed; resumedAt = nil }
  mutating func resume() { if started && resumedAt == nil { resumedAt = now() } }
}

struct ViewerPath: Decodable {
  struct Point: Decodable { let at_seconds: Double; let position: [Float] }
  let id: String, purpose: String, interpolation: String
  let coordinate_space: String?
  let points: [Point]
}
struct ViewerMotion {
  let path: ViewerPath, origin: SIMD3<Float>, startedAt: Double
  let frame: simd_quatf
  init(path: ViewerPath, origin: SIMD3<Float>, startedAt: Double, frame: simd_quatf = simd_quatf(angle: 0, axis: SIMD3(0,1,0))) {
    self.path = path; self.origin = origin; self.startedAt = startedAt; self.frame = frame
  }
  static func start(path: ViewerPath, origin: SIMD3<Float>, at time: Double, frame: simd_quatf, replacing current: ViewerMotion?) -> ViewerMotion {
    if let current, current.path.id == path.id, path.coordinate_space != "relative", !current.sample(at: time).complete { return current }
    return ViewerMotion(path: path, origin: origin, startedAt: time, frame: frame)
  }
  func sample(at time: Double) -> (position: SIMD3<Float>, complete: Bool) {
    let elapsed = max(0, time - startedAt)
    var previous = origin, previousTime = 0.0
    for point in path.points {
      let value = SIMD3(point.position[0], point.position[1], point.position[2])
      let next = path.coordinate_space == "relative" ? origin + frame.act(value) : value
      if elapsed < point.at_seconds {
        var t = Float((elapsed - previousTime) / (point.at_seconds - previousTime))
        t = min(1, max(0, t))
        if path.interpolation == "smooth" { t = t * t * (3 - 2 * t) }
        return (previous + (next - previous) * t, false)
      }
      previous = next; previousTime = point.at_seconds
    }
    return (previous, true)
  }
}

struct ScenarioDefinition: Decodable {
  struct Action: Decodable {
    let id: String, label: String, phrases: [String], operations: [JSON]
    let next_step_id: String?
  }
  struct Completion: Decodable {
    let trigger: String, next_step_id: String
    let after_seconds: Double?
    let motion_path_id: String?
  }
  struct Step: Decodable {
    let id: String, prompt: String, terminal: Bool
    let start_operations: [JSON], actions: [Action]
    let completion: Completion?
    let conversation_target: String?
  }
  let objective: String, initial_step_id: String, dialogue_policy: String, steps: [Step]
  let progression: String?
}
struct ScenarioUpdate {
  let prompt: String, operations: [JSON], stepID: String
  let actionID: String?
  let terminal: Bool
}
struct ScenarioRuntime {
  let definition: ScenarioDefinition
  private(set) var index = 0
  private var enteredAt = 0.0
  var step: ScenarioDefinition.Step { definition.steps[index] }
  var isGuided: Bool { definition.progression == "guided" }
  var conversationTarget: String? { isGuided && definition.dialogue_policy == "natural" ? step.conversation_target : nil }
  init(_ definition: ScenarioDefinition) throws {
    guard !definition.steps.isEmpty, definition.steps.first?.id == definition.initial_step_id,
      Set(definition.steps.map(\.id)).count == definition.steps.count else { throw CocoaError(.coderInvalidValue) }
    for (i, step) in definition.steps.enumerated() {
      guard step.terminal == (i == definition.steps.count - 1) else { throw CocoaError(.coderInvalidValue) }
      if definition.progression == "guided" {
        guard step.actions.isEmpty, step.terminal || step.completion != nil,
          !step.terminal || (step.completion == nil && step.conversation_target == nil) else { throw CocoaError(.coderInvalidValue) }
      }
      guard Set(step.actions.map(\.id)).count == step.actions.count else { throw CocoaError(.coderInvalidValue) }
      let destinations = step.actions.compactMap(\.next_step_id) + [step.completion?.next_step_id].compactMap { $0 }
      guard destinations.allSatisfy({ $0 == definition.steps.dropFirst(i + 1).first?.id }) else { throw CocoaError(.coderInvalidValue) }
    }
    self.definition = definition
  }
  mutating func start(at time: Double) -> ScenarioUpdate {
    index = 0; enteredAt = time
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
    return update(operations: operations, actionID: sourceStep + "/" + action.id)
  }
  mutating func tick(at time: Double, completedMotion: String?) -> ScenarioUpdate? {
    tick(at: time, completedMotions: Set([completedMotion].compactMap { $0 }))
  }
  mutating func tick(at time: Double, completedMotions: Set<String>) -> ScenarioUpdate? {
    guard let completion = step.completion else { return nil }
    let ready = completion.trigger == "after_seconds"
      ? time - enteredAt >= (completion.after_seconds ?? .infinity)
      : completion.motion_path_id.map { completedMotions.contains($0) } == true
    guard ready, let next = definition.steps.firstIndex(where: { $0.id == completion.next_step_id }) else { return nil }
    index = next; enteredAt = time
    return update()
  }
  private func update(operations: [JSON]? = nil, actionID: String? = nil) -> ScenarioUpdate {
    ScenarioUpdate(prompt: step.prompt, operations: operations ?? step.start_operations,
      stepID: step.id, actionID: actionID, terminal: step.terminal)
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

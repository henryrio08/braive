import Foundation

/// Speech-model finality is about a range of audio, not the user's intent to move on.
/// Keep provisional words visible, but never submit them as a finished turn.
struct SpeechTurnBuffer {
  private(set) var stable = "", draft = ""
  private(set) var id = UUID().uuidString
  private(set) var consumedThrough = -Double.infinity
  private var stableEnd = -Double.infinity
  private var speaking = false
  private var quietSince = 0.0
  var text: String { [stable, draft].filter { !$0.isEmpty }.joined(separator: " ") }

  mutating func receive(_ text: String, final: Bool, start: Double, end: Double, now: Double) -> Bool {
    guard end > consumedThrough + 0.02, start >= consumedThrough - 0.02 else { return false }
    let text = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !text.isEmpty else { return false }
    if final {
      guard end > stableEnd + 0.02 else { return false }
      stable = [stable, text].filter { !$0.isEmpty }.joined(separator: " ")
      stableEnd = end
      draft = ""
    } else { draft = text }
    quietSince = now
    return true
  }
  mutating func detectSpeech(_ value: Bool, now: Double) {
    if value != speaking { quietSince = now }
    speaking = value
  }
  func delay(now: Double) -> Double? {
    guard !speaking, draft.isEmpty, !stable.isEmpty else { return nil }
    let quick = ["start", "yes", "no", "retry", "cancel", "begin practice", "start over"]
      .contains(VoiceAnswer.normalized(stable))
    return max(0, quietSince + (quick ? 0.7 : 1.8) - now)
  }
  mutating func take(now: Double) -> (text: String, id: String)? {
    guard let delay = delay(now: now), delay <= 0 else { return nil }
    let result = (stable, id)
    consumedThrough = stableEnd
    stable = ""; draft = ""; id = UUID().uuidString
    return result
  }
}

/// An intake answer stays open across any number of speech segments and pauses.
/// Completion and creation are separate, explicit user actions.
struct VoiceAnswer {
  enum Action: Equatable { case listening, waiting, cleared, empty, complete(String) }
  private(set) var text = ""
  static func normalized(_ text: String) -> String {
    text.lowercased().replacingOccurrences(of: "’", with: "'")
      .split(whereSeparator: { !$0.isLetter && !$0.isNumber && $0 != "'" }).joined(separator: " ")
  }
  static func needsTime(_ text: String) -> Bool {
    let words = normalized(text)
    return ["one second", "just a second", "give me a second", "wait", "wait a second",
      "hold on", "hold on a second", "let me think", "i need a moment", "i don't know yet",
      "i'm thinking", "um", "uh"].contains(words)
  }
  static func confirmsPractice(_ text: String) -> Bool {
    ["begin practice", "begin practice please"].contains(normalized(text))
  }
  mutating func receive(_ input: String) -> Action {
    if Self.needsTime(input) { return .waiting }
    if Self.normalized(input) == "start over" { text = ""; return .cleared }
    // Only a trailing completion phrase is a command; preserve internal uses of these words.
    let pattern = #"(?i)(?<![\p{L}\p{N}])(?:that['’]?s all|that is all|i['’]?m done|i am done)[\s.!?]*$"#
    let ending = input.range(of: pattern, options: .regularExpression)
    let content = (ending.map { String(input[..<$0.lowerBound]) } ?? input)
      .trimmingCharacters(in: .whitespacesAndNewlines)
    if !content.isEmpty && !Self.needsTime(content) {
      text = [text, content].filter { !$0.isEmpty }.joined(separator: " ")
    }
    guard ending != nil else { return .listening }
    return text.isEmpty ? .empty : .complete(text)
  }
}

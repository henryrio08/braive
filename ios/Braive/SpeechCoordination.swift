import Foundation

/// Activity and final transcription both matter: silence alone isn't a completed user turn.
struct SpeechFloor {
  private var speaking = false
  private var awaitingFinal = false
  private var lastActivity = -Double.infinity
  mutating func detect(_ value: Bool, now: Double) {
    if value || speaking != value { lastActivity = now }
    speaking = value
  }
  mutating func receive(final: Bool, now: Double) {
    awaitingFinal = !final
    lastActivity = now
  }
  func available(now: Double) -> Bool {
    !speaking && !awaitingFinal && now - lastActivity >= 0.8
  }
}

/// Timed guidance yields to conversation. Identical scene events and narrator beats speak once.
struct NarrationQueue {
  private struct Cue { let text: String; let at: Double }
  private var cues: [Cue] = []
  private var lastSpoken = ""
  private var lastSpokenAt = -Double.infinity
  mutating func enqueue(_ text: String, at: Double) {
    let key = VoiceAnswer.normalized(text)
    guard !key.isEmpty, !cues.contains(where: { VoiceAnswer.normalized($0.text) == key }),
      key != lastSpoken || at - lastSpokenAt > 2 else { return }
    cues.append(Cue(text: text, at: at))
  }
  mutating func take(at: Double) -> String? {
    cues.removeAll { at - $0.at > 15 }
    guard !cues.isEmpty else { return nil }
    let cue = cues.removeFirst()
    markSpoken(cue.text, at: at)
    return cue.text
  }
  mutating func markSpoken(_ text: String, at: Double) {
    lastSpoken = VoiceAnswer.normalized(text); lastSpokenAt = at
    cues.removeAll { VoiceAnswer.normalized($0.text) == lastSpoken }
  }
  mutating func clearPending() { cues.removeAll() }
}

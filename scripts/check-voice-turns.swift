import Foundation

@main struct VoiceTurnChecks {
  static func main() {
    var count = 0
    func check(_ condition: Bool, _ name: String) {
      guard condition else { fatalError(name) }
      count += 1
    }
    var turn = SpeechTurnBuffer()
    check(turn.receive("I need to present", final: false, start: 0, end: 1, now: 1), "Partial visible")
    check(turn.take(now: 60) == nil, "Silence must never submit provisional transcription")
    check(turn.receive("I need to present a proposal", final: true, start: 0, end: 2, now: 2), "Final replaces partial")
    check(turn.take(now: 2.7) == nil, "A short pause is not an endpoint")
    turn.detectSpeech(true, now: 3)
    check(turn.take(now: 10) == nil, "Speech cancels endpoint")
    _ = turn.receive("to eight neighbors", final: true, start: 3, end: 4, now: 4)
    turn.detectSpeech(false, now: 4)
    turn.detectSpeech(false, now: 5) // Repeated detector silence must not extend the deadline.
    let first = turn.take(now: 6)
    check(first?.text == "I need to present a proposal to eight neighbors", "Retain complete multi-segment turn")
    check(!turn.receive("to eight neighbors", final: true, start: 3, end: 4, now: 7), "Late final cannot replay")
    _ = turn.receive("That's all", final: true, start: 8, end: 9, now: 9)
    let next = turn.take(now: 11)
    check(next?.id != first?.id && next?.text == "That's all", "Next utterance has its own ID")
    _ = turn.receive("yes", final: true, start: 12, end: 13, now: 13)
    check(turn.take(now: 13.8)?.text == "yes", "Brief commands stay responsive")

    var answer = VoiceAnswer()
    check(answer.receive("One second.") == .waiting && answer.text.isEmpty, "Thinking is not an answer")
    check(answer.receive("That's all.") == .empty, "Cannot finish an empty answer")
    check(answer.receive("I need to present") == .listening, "User's reported fragment must not advance setup")
    check(answer.receive("a community garden proposal to eight neighbors") == .listening, "Continue after an arbitrarily long pause")
    check(answer.receive("Let me think") == .waiting && !answer.text.contains("think"), "Thinking preserves earlier details")
    check(answer.receive("in a sunny library. That’s all.") == .complete("I need to present a community garden proposal to eight neighbors in a sunny library."), "Explicit finish preserves entire answer")
    check(answer.receive("Start over") == .cleared && answer.text.isEmpty, "Replace answer without old details")
    check(answer.receive("I'm done feeling rushed during interviews") == .listening, "Internal completion words are ordinary content")
    _ = answer.receive("start over")
    check(answer.receive("Keep it friendly. I am done.") == .complete("Keep it friendly."), "Completion alternative")
    check(!VoiceAnswer.confirmsPractice("one second"), "Hesitation cannot create a scene")
    check(!VoiceAnswer.confirmsPractice("don't begin practice"), "Negation cannot create a scene")
    check(!VoiceAnswer.confirmsPractice("Say begin practice to create it or start over to change it"), "Readback echo cannot authorize generation")
    check(VoiceAnswer.confirmsPractice("Begin practice!"), "Deliberate spoken creation command")
    check(VoiceAnswer.confirmsHeadset("Yes."), "Headset confirmation remains compatible")
    check(VoiceAnswer.confirmsHeadset("My headset is ready."), "Spoken readiness centers the scene")
    check(!VoiceAnswer.confirmsHeadset("Not ready"), "Negative readiness cannot center or advance")
    check(!VoiceAnswer.confirmsHeadset("Say yes to center your practice here"), "Prompt echo cannot confirm readiness")
    var reflection = SpokenReflection()
    check(reflection.receive("Save reflection.") == .empty, "Do not write an empty reflection")
    check(reflection.receive("I finished my opening. Save reflection!") == .save("I finished my opening."), "Preserve words in the same turn as the save command")
    reflection = SpokenReflection()
    check(reflection.receive("I took my time.") == .listening, "Reflection stays open across pauses")
    check(reflection.receive("One second") == .listening && reflection.text == "I took my time.", "Thinking does not pollute a reflection")
    check(reflection.receive("And answered a question. Save reflection.") == .save("I took my time. And answered a question."), "A later save keeps all reflection segments")
    reflection = SpokenReflection()
    check(reflection.receive("I can save reflection later") == .listening, "Internal save words do not save prematurely")
    check(reflection.receive("skip") == .skip, "Reflection can be skipped explicitly")
    print("Voice turn checks passed: \(count). No microphone, network, or paid API calls.")
  }
}

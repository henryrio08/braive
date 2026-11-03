import Foundation

@main struct SpeechCoordinationChecks {
  static func main() {
    var count = 0
    func check(_ condition: Bool, _ message: String) {
      guard condition else { fatalError(message) }
      count += 1
    }
    var floor = SpeechFloor()
    check(floor.available(now: 0), "Initial quiet scene can introduce the task")
    floor.detect(true, now: 1)
    check(!floor.available(now: 20), "Timer cue cannot interrupt detected speech")
    floor.receive(final: false, now: 21)
    floor.detect(false, now: 22)
    check(!floor.available(now: 40), "A long pause cannot bypass pending transcription")
    floor.receive(final: true, now: 41)
    check(!floor.available(now: 41.5), "Allow a quiet gap after the finished turn")
    check(floor.available(now: 42), "Completed turn releases the floor")
    floor.detect(false, now: 43)
    check(floor.available(now: 43), "Repeated silence does not extend the gap")
    floor.detect(true, now: 44)
    check(!floor.available(now: 45), "Resumed speech holds a pending character reply")
    floor = SpeechFloor()
    check(floor.available(now: 50), "Pause/reconnect reset cannot strand a half-heard turn")

    var queue = NarrationQueue()
    queue.enqueue("A neighbor will ask a gentle question.", at: 60)
    queue.enqueue("A neighbor will ask a gentle question!", at: 60)
    check(queue.take(at: 62) == "A neighbor will ask a gentle question.", "Deliver one copy of overlapping scene/narrator guidance")
    check(queue.take(at: 62) == nil, "Duplicate guidance is removed")
    queue.enqueue("A neighbor will ask a gentle question.", at: 63)
    check(queue.take(at: 63) == nil, "A just-spoken reply cannot immediately repeat as an operation")
    queue.enqueue("A neighbor will ask a gentle question.", at: 120)
    check(queue.take(at: 120) != nil, "Legitimate later guidance remains possible")
    queue.enqueue("An outdated prompt", at: 130)
    check(queue.take(at: 146) == nil, "Do not blurt out stale guidance after a long user answer")
    queue.enqueue("Wait here", at: 150)
    queue.clearPending()
    check(queue.take(at: 151) == nil, "New conversation supersedes pending guidance")
    queue.enqueue("Thanks for explaining.", at: 160)
    queue.markSpoken("Thanks for explaining!", at: 160)
    check(queue.take(at: 161) == nil, "A reply and its matching narrate operation speak once")
    check(!scenarioCanFinish(terminalAt: 0, active: 4, motionPending: true), "Terminal travel cannot be cut off by the three-second grace period")
    check(!scenarioCanFinish(terminalAt: nil, active: 20, motionPending: false), "An ordinary stage is not completed by quiet alone")
    check(scenarioCanFinish(terminalAt: 0, active: 10, motionPending: false), "Terminal arrival can finish after movement ends")
    print("Speech coordination checks passed: \(count). No microphone or provider calls.")
  }
}

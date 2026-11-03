import Foundation

enum TipContext: String, CaseIterable {
  case launch, lobby, headset, intake, ability, review, history, planning, selfReport, reflection, feedback, saving, repeatPractice
}
struct LoadingTip {
  let id: String
  let text: String
  let tags: Set<TipContext>
}
enum TipBank {
  static let stop = LoadingTip(id: "planning.stop", text: "To stop at any time, just say STOP!", tags: [.planning])
  static let all: [LoadingTip] = [
    .init(id: "launch.voice", text: "Your voice leads the way.", tags: [.launch]),
    .init(id: "launch.practice", text: "A little practice. A fresh perspective.", tags: [.launch]),
    .init(id: "lobby.start", text: "Say START when you’re ready.", tags: [.lobby]),
    .init(id: "lobby.return", text: "There’s room for another try.", tags: [.lobby, .repeatPractice]),
    .init(id: "headset.forward", text: "Face your forward before confirming you’re ready.", tags: [.headset]),
    .init(id: "headset.comfort", text: "Settle the viewer comfortably before you begin.", tags: [.headset, .launch]),
    .init(id: "intake.moment", text: "Picture a moment you’d like to practice.", tags: [.intake]),
    .init(id: "intake.place", text: "Describe the place and what happens there.", tags: [.intake]),
    .init(id: "intake.finish", text: "Finish your answer with “that’s all.”", tags: [.intake, .ability]),
    .init(id: "ability.boundaries", text: "Share what feels manageable—and what doesn’t.", tags: [.ability]),
    .init(id: "ability.pace", text: "Your comfort and boundaries shape the practice.", tags: [.ability]),
    .init(id: "review.listen", text: "Listen back before you begin.", tags: [.review]),
    .init(id: "review.change", text: "Say START OVER to change your answers.", tags: [.review]),
    .init(id: "history.choice", text: "Using past sessions is your choice.", tags: [.history]),
    .init(id: "history.current", text: "What you need today comes first.", tags: [.history, .ability]),
    stop,
    .init(id: "planning.builder", text: "Say HEY BUILDER to add a detail.", tags: [.planning]),
    .init(id: "planning.look", text: "You can look around as the experience unfolds.", tags: [.planning]),
    .init(id: "planning.still", text: "Stay comfortably in place as your viewpoint moves.", tags: [.planning]),
    .init(id: "planning.ready", text: "You’ll hear an introduction before the scene appears.", tags: [.planning]),
    .init(id: "report.honest", text: "There’s no right score. Share how it felt.", tags: [.selfReport]),
    .init(id: "report.skip", text: "You can skip a rating.", tags: [.selfReport]),
    .init(id: "reflection.optional", text: "A reflection is optional. A few words are enough.", tags: [.reflection]),
    .init(id: "reflection.notice", text: "What would you like to remember next time?", tags: [.reflection]),
    .init(id: "feedback.optional", text: "You can choose whether to hear feedback.", tags: [.feedback]),
    .init(id: "feedback.evidence", text: "Feedback draws on what happened in your practice.", tags: [.feedback]),
    .init(id: "saving.local", text: "Your sessions are saved on this iPhone.", tags: [.saving]),
    .init(id: "saving.reflection", text: "Saved reflections stay with your session history.", tags: [.saving]),
    .init(id: "repeat.adjust", text: "Another try can build on this one.", tags: [.repeatPractice]),
    .init(id: "repeat.choice", text: "Go again, or take a break. It’s your choice.", tags: [.repeatPractice])
  ]
  static func matching(_ context: TipContext) -> [LoadingTip] { all.filter { $0.tags.contains(context) } }
}

/// Uses active UI time, so a pause also pauses the tip. Rotation never speaks or plays audio.
struct LoadingTips {
  static let interval = 8.0
  private var tips: [LoadingTip]
  private var index = 0
  private var elapsed = 0.0
  var current: LoadingTip { tips[index] }
  init(_ context: TipContext) {
    var candidates = TipBank.matching(context).shuffled()
    if context == .planning {
      candidates.removeAll { $0.id == TipBank.stop.id }
      candidates.insert(TipBank.stop, at: 0)
    }
    tips = candidates
  }
  mutating func advance(by seconds: Double) -> LoadingTip? {
    guard seconds.isFinite, seconds > 0, tips.count > 1 else { return nil }
    elapsed += seconds
    guard elapsed >= Self.interval else { return nil }
    let steps = Int(min(elapsed / Self.interval, Double(Int.max / 2)))
    elapsed.formTruncatingRemainder(dividingBy: Self.interval)
    index = (index + steps % tips.count) % tips.count
    return current
  }
}

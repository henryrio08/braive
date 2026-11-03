import Foundation

enum RatingAnswer: Equatable {
  case value(Int), skip, invalid
  static func parse(_ text: String) -> RatingAnswer {
    let key = VoiceAnswer.normalized(text)
    guard !VoiceAnswer.needsTime(text), !key.contains("minus"), !key.contains("negative"),
      text.range(of: #"-\s*\d"#, options: .regularExpression) == nil else { return .invalid }
    if ["skip", "skip please", "no thanks", "prefer not to say"].contains(key) { return .skip }
    let names = ["zero","one","two","three","four","five","six","seven","eight","nine","ten"]
    let words = key.split(separator: " ").map(String.init)
    let outsideRange = Set(["eleven","twelve","thirteen","fourteen","fifteen","sixteen","seventeen","eighteen","nineteen","twenty","thirty","forty","fifty","hundred"])
    guard words.allSatisfy({ !outsideRange.contains($0) }) else { return .invalid }
    // A single clear score, including “I'd say five”. Reject ranges and out-of-range numbers.
    let numbers = words.compactMap { Int($0) ?? names.firstIndex(of: $0) }
    guard numbers.count == 1, let value = numbers.first, (0...10).contains(value),
      !words.contains("not"), !key.contains("don't") else { return .invalid }
    return .value(value)
  }
}

enum PracticeHistory {
  static func chain(_ authorized: [JSON], completed: JSON) -> [JSON] {
    var seen = Set<String>()
    return (authorized + [completed]).filter {
      !$0["session_id"].text.isEmpty && seen.insert($0["session_id"].text).inserted
    }
  }
}

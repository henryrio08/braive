import Foundation
@main struct TipChecks {
 static func main() {
  precondition(Set(TipBank.all.map(\.id)).count == TipBank.all.count)
  for context in TipContext.allCases { precondition(!TipBank.matching(context).isEmpty) }
  precondition(TipBank.all.allSatisfy { $0.text.count <= 75 && !$0.tags.isEmpty })
  var tips = LoadingTips(.planning)
  precondition(tips.current.id == TipBank.stop.id)
  precondition(tips.advance(by: 7.9) == nil)
  precondition(tips.advance(by: 0) == nil)
  precondition(tips.advance(by: 0.1)?.id != TipBank.stop.id)
  var seen = Set([tips.current.id, TipBank.stop.id])
  for _ in 0..<(TipBank.matching(.planning).count - 2) { seen.insert(tips.advance(by: 8)!.id) }
  precondition(seen.count == TipBank.matching(.planning).count)
  for context in TipContext.allCases {
   var selection = LoadingTips(context)
   for _ in 0..<30 { precondition(selection.current.tags.contains(context)); _ = selection.advance(by: 8) }
  }
  print("Tip checks passed: tagged context coverage, short copy, STOP first, rotation timing, no repeats within cycle.")
 }
}

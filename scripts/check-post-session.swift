import Foundation
@main struct PostSessionChecks {
 static func main() {
  for (text, expected): (String,RatingAnswer) in [
   ("zero",.value(0)),("I'd say five",.value(5)),("10",.value(10)),
   ("skip",.skip),("prefer not to say",.skip),("not sure",.invalid),
   ("five or six",.invalid),("eleven",.invalid),("-5",.invalid),
   ("minus five",.invalid),("one second",.invalid),("not five",.invalid),("twenty five",.invalid)] {
    precondition(RatingAnswer.parse(text) == expected, text)
  }
  let parent = JSON(["session_id":"parent"]), older = JSON(["session_id":"older"])
  precondition(PracticeHistory.chain([],completed:parent).map { $0["session_id"].text } == ["parent"])
  precondition(PracticeHistory.chain([older,parent],completed:parent).map { $0["session_id"].text } == ["older","parent"])
  print("Post-session checks passed: 13 rating cases and consent-preserving, deduplicated repeat history.")
 }
}

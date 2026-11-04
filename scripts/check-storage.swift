import Foundation

@main struct StorageCheck {
  @MainActor static func main() throws {
    let dir = FileManager.default.temporaryDirectory.appendingPathComponent(
      "braive-storage-" + UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: dir) }
    let store = SessionStore(root: dir)
    let id = UUID().uuidString
    var row = JSON([
      "session_id": id, "started_at": "2026-10-31T14:00:00Z", "topic_short": "=untrusted topic",
      "plan": ["duration_sec": 60, "topic": "Public speaking"], "active_seconds": 17,
      "outcome": "user_ended", "reported_difficulty": NSNull(), "reported_readiness": 0,
      "intensity_1_10": 3,
    ])
    try store.save(row)
    row["active_seconds"] = JSON(18)
    try store.save(row)
    let csv = try String(contentsOf: dir.appendingPathComponent("SESSIONS.csv"), encoding: .utf8)
    guard store.records.count == 1, csv.contains("'=untrusted topic"),
      csv.components(separatedBy: "\r\n").count == 2
    else { fatalError("Idempotent/formula-safe spreadsheet failure") }
    let reflection = try store.reflection(
      "I finished my opening sentence.", topic: "A / title: with unsafe paths")
    guard
      FileManager.default.fileExists(
        atPath: dir.appendingPathComponent(reflection["relative_file_path"].text).path)
    else { fatalError("Reflection file missing") }
    let reopened = SessionStore(root: dir)
    guard reopened.records.count == 1, reopened.records[0]["reported_difficulty"].number == nil,
      reopened.records[0]["reported_readiness"].number == 0
    else { fatalError("Nullable ratings or durable recovery failed") }
    var interrupted = row
    interrupted["outcome"] = JSON("running")
    interrupted["scene"] = JSON(["description":"Retained generated scene"])
    interrupted["checkpoint"] = JSON(["version":1,"world":["elapsed":17.5],"scenario":["index":1]])
    try store.save(interrupted,rebuild:false)
    let recovered=SessionStore(root:dir)
    guard recovered.recoverable?["checkpoint"]["world"]["elapsed"].number == 17.5,
      recovered.recoverable?["outcome"].text == "interrupted" else { fatalError("Running checkpoint recovery failed") }
    interrupted["outcome"] = JSON("completed")
    try recovered.save(interrupted)
    guard SessionStore(root:dir).recoverable == nil else { fatalError("Completed runs must not offer practice recovery") }
    var prepared = row
    let preparedID = UUID().uuidString
    prepared["session_id"] = JSON(preparedID)
    prepared["started_at"] = JSON("2026-11-04T20:00:00Z")
    prepared["active_seconds"] = JSON(0)
    prepared["outcome"] = JSON("prepared")
    prepared["scene"] = JSON(["description":"Prepared, not yet practiced"])
    try recovered.save(prepared)
    let preparedStore = SessionStore(root:dir)
    guard preparedStore.recoverable?["session_id"].text == preparedID,
      preparedStore.recoverable?["outcome"].text == "prepared",
      !(try String(contentsOf:dir.appendingPathComponent("SESSIONS.csv"),encoding:.utf8)).contains(preparedID),
      !preparedStore.relevant("Public speaking").contains(where: { $0["session_id"].text == preparedID })
    else { fatalError("Prepared draft must recover without inventing a performance or history row") }
    try preparedStore.removeUnstartedAttempt(preparedID)
    guard !preparedStore.records.contains(where: { $0["session_id"].text == preparedID }),
      !FileManager.default.fileExists(atPath:dir.appendingPathComponent("Sessions/\(preparedID).json").path),
      SessionStore(root:dir).recoverable == nil
    else { fatalError("Cancelling an unstarted draft must delete its durable recovery entry") }
    var startedAtZero = prepared
    startedAtZero["outcome"] = JSON("interrupted")
    startedAtZero["checkpoint"] = JSON(["version":1,"world":["elapsed":0]])
    try preparedStore.save(startedAtZero)
    try preparedStore.removeUnstartedAttempt(preparedID)
    guard preparedStore.recoverable?["session_id"].text == preparedID,
      FileManager.default.fileExists(atPath:dir.appendingPathComponent("Sessions/\(preparedID).json").path)
    else { fatalError("A checkpointed attempt at time zero must survive setup cancellation") }
    try preparedStore.deleteAll()
    let fixed = Date(timeIntervalSince1970: 1793635200)
    let topic = String(repeating: "A",count:40) + "/unsafe"
    let first = try store.reflection("Exact first words.",topic:topic,date:fixed)
    let second = try store.reflection("Exact second words.",topic:topic,date:fixed)
    guard first["display_title"].text.hasSuffix(String(topic.prefix(30))),
      first["relative_file_path"].text != second["relative_file_path"].text,
      !first["relative_file_path"].text.contains(":"),
      try String(contentsOf:dir.appendingPathComponent(second["relative_file_path"].text),encoding:.utf8) == "Exact second words."
    else { fatalError("Reflection title, collision or content failure") }
    var pending = row; pending["session_id"] = JSON(UUID().uuidString); pending["outcome"] = JSON("interrupted")
    try recovered.save(pending)
    guard !recovered.relevant("Public speaking").contains(where: { $0["session_id"].text == pending["session_id"].text })
    else { fatalError("Unfinished practice leaked into relevant completed history") }
    print(
      "Storage checks passed: idempotent save, CSV escaping, reflection files, interrupted/prepared recovery, draft cancellation, checkpoint preservation, null versus zero ratings."
    )
  }
}

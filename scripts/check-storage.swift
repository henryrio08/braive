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
    print(
      "Storage checks passed: idempotent save, CSV escaping, reflection file, durable recovery, null versus zero ratings."
    )
  }
}

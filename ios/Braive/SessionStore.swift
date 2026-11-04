import Foundation

@MainActor final class SessionStore {
  let root: URL
  var records: [JSON] = []
  init(root rootOverride: URL? = nil) {
    self.root =
      rootOverride ?? FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
    try? FileManager.default.createDirectory(
      at: root.appendingPathComponent("Sessions"), withIntermediateDirectories: true)
    try? FileManager.default.createDirectory(
      at: root.appendingPathComponent("Reflections"), withIntermediateDirectories: true)
    for url
      in (try? FileManager.default.contentsOfDirectory(
        at: root.appendingPathComponent("Sessions"), includingPropertiesForKeys: nil)) ?? []
    {
      if let data = try? Data(contentsOf: url),
        var r = try? JSONDecoder().decode(JSON.self, from: data)
      {
        if r["outcome"].text == "running" {
          r["outcome"] = JSON("interrupted")
          try? JSONEncoder().encode(r).write(to: url, options: .atomic)
        }
        records.append(r)
      }
    }
    records.sort { $0["started_at"].text < $1["started_at"].text }
    try? rebuildCSV()
  }
  var recoverable: JSON? {
    records.reversed().first { $0["outcome"].text == "interrupted" && $0["checkpoint"]["version"].value == 1 && $0["scene"].object != nil }
  }
  func save(_ record: JSON, rebuild: Bool = true) throws {
    let id = record["session_id"].text
    guard UUID(uuidString: id) != nil else { throw CocoaError(.fileWriteInvalidFileName) }
    try JSONEncoder().encode(record).write(
      to: root.appendingPathComponent("Sessions/\(id).json"), options: .atomic)
    records.removeAll { $0["session_id"].text == id }
    records.append(record)
    records.sort { $0["started_at"].text < $1["started_at"].text }
    if rebuild { try rebuildCSV() }
  }
  func reflection(_ text: String, topic: String, date: Date = Date()) throws -> JSON {
    let d = DateFormatter()
    d.locale = Locale(identifier: "en_US_POSIX")
    d.calendar = Calendar(identifier: .gregorian)
    d.dateFormat = "yyyy-MM-dd"
    let day = d.string(from: date)
    d.dateFormat = "HH:mm"
    let time = d.string(from: date)
    let short = String(topic.prefix(30))
    let safe = short.map { "/\\:\n\r".contains($0) ? "-" : String($0) }.joined()
    let id = UUID().uuidString
    let title = "\(day) \(time) - \(short)"
    let base = "Reflections/\(day) \(time.replacingOccurrences(of: ":", with: "-")) - \(safe)"
    let collision = FileManager.default.fileExists(
      atPath: root.appendingPathComponent(base + ".txt").path)
    let path = base + (collision ? "-\(id.prefix(6))" : "") + ".txt"
    try text.write(to: root.appendingPathComponent(path), atomically: true, encoding: .utf8)
    return JSON([
      "id": id, "display_title": title, "relative_file_path": path, "transcript": text,
      "created_at": ISO8601DateFormatter().string(from: date), "local_date": day,
      "local_time": time, "timezone": TimeZone.current.identifier,
    ])
  }
  func relevant(_ topic: String) -> [JSON] {
    let words = Set(
      topic.lowercased().split(whereSeparator: { !$0.isLetter }).map(String.init).filter {
        $0.count > 3
      })
    return Array(
      records.reversed().filter { r in
        guard ["completed", "user_ended"].contains(r["outcome"].text) else { return false }
        return !words.isDisjoint(
          with: Set(
            r["plan"]["topic"].text.lowercased().split(whereSeparator: { !$0.isLetter }).map(
              String.init)))
      }.prefix(10))
  }
  func history(_ rows: [JSON]) -> [Any] {
    rows.map { r in
      var row: [String: Any] = [
        "session_id": r["session_id"].text, "topic": r["plan"]["topic"].text,
        "intensity": r["plan"]["intensity"].raw, "intensity_1_10": r["intensity_1_10"].value,
        "planned_seconds": r["plan"]["duration_sec"].value,
        "active_seconds": r["active_seconds"].value, "outcome": r["outcome"].text,
      ]
      for key in ["reported_difficulty", "reported_readiness"] {
        if let n = r[key].number { row[key] = n }
      }
      return row
    }
  }
  func rebuildCSV() throws {
    let keys = [
      "session_id", "started_at_utc", "topic_short", "intensity_1_10", "planned_seconds",
      "active_seconds", "outcome", "stop_count", "early_end", "use_history", "chained_rerun",
      "reported_difficulty", "reported_readiness", "reflection_file", "parent_session_id",
    ]
    func escape(_ s: String) -> String {
      let trimmed = s.trimmingCharacters(in: .whitespacesAndNewlines)
      let t = ["=", "+", "-", "@"].contains(String(trimmed.prefix(1))) ? "'" + s : s
      return "\"" + t.replacingOccurrences(of: "\"", with: "\"\"") + "\""
    }
    let lines = records.map { r -> String in
      let vals: [String] = keys.map { k in
        let v: JSON =
          k == "started_at_utc"
          ? r["started_at"] : k == "planned_seconds" ? r["plan"]["duration_sec"] : r[k]
        if let s = v.string { return s }
        if let n = v.number { return String(n) }
        if let b = v.bool { return String(b) }
        return ""
      }
      return vals.map(escape).joined(separator: ",")
    }
    try ([keys.joined(separator: ",")] + lines).joined(separator: "\r\n").write(
      to: root.appendingPathComponent("SESSIONS.csv"), atomically: true, encoding: .utf8)
  }
  func deleteAll() throws {
    for directory in ["Sessions", "Reflections", "PreparationDiagnostics"] {
      let folder = root.appendingPathComponent(directory)
      guard FileManager.default.fileExists(atPath: folder.path) else { continue }
      for file in try FileManager.default.contentsOfDirectory(
        at: folder, includingPropertiesForKeys: nil)
      { try FileManager.default.removeItem(at: file) }
    }
    records = []
    try rebuildCSV()
  }
}

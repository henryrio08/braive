import Foundation

private struct PendingDeletion: Codable {
  var attempts: Set<String> = []
  var textures: Set<String> = []
}

extension Session {
  private var deletionFile: URL { store.root.appendingPathComponent("PendingDeletes.json") }
  private func pendingDeletion() -> PendingDeletion {
    (try? Data(contentsOf:deletionFile)).flatMap { try? JSONDecoder().decode(PendingDeletion.self,from:$0) } ?? PendingDeletion()
  }
  private func saveDeletion(_ value: PendingDeletion) throws {
    try JSONEncoder().encode(value).write(to:deletionFile,options:.atomic)
  }
  func queueHistoryDeletion() throws {
    var value = pendingDeletion()
    value.attempts.formUnion(store.records.map { $0["session_id"].text }.filter { UUID(uuidString:$0) != nil })
    for record in store.records { value.textures.formUnion(GeneratedTextures.identifiers(in:record)) }
    try saveDeletion(value)
  }
  /// User-authorized deletion survives a disconnected computer and app restart.
  /// The queue contains only opaque IDs, never reflections or conversation text.
  func flushHistoryDeletion() {
    guard historyCleanupTask == nil,!server.isEmpty else { return }
    let endpoint = api
    historyCleanupTask = Task { [weak self] in
      guard let self else { return }
      defer { historyCleanupTask = nil }
      do {
        var pending = pendingDeletion()
        for id in pending.attempts.sorted() {
          do { _ = try await endpoint.call("/v1/worlds/"+id,method:"DELETE",timeout:5) }
          catch let error as NSError where error.domain == "Braive" && error.code == 404 { }
          var latest = pendingDeletion();latest.attempts.remove(id);try saveDeletion(latest)
        }
        pending = pendingDeletion()
        for id in pending.textures.sorted() {
          do { _ = try await endpoint.call("/v1/assets/"+id,method:"DELETE",timeout:5) }
          catch let error as NSError where error.domain == "Braive" && error.code == 404 { }
          var latest = pendingDeletion();latest.textures.remove(id);try saveDeletion(latest)
        }
      } catch {
        if [.setup,.lobby].contains(phase) { setupNotice = "History is deleted from this phone. Computer cleanup will retry when connected." }
      }
    }
  }
}

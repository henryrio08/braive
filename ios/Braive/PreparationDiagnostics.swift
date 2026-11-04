import Foundation

/// Build and preparation evidence contains identifiers and fixed codes, never
/// recognized speech, scene content, addresses, credentials or remote messages.
struct NativeBuildIdentity: Codable {
  let version: String
  let build: String
  let source_revision: String
  static func revision(_ value: String) -> String {
    value.range(of: #"^[0-9a-f]{7,40}(?:-dirty)?$"#, options: .regularExpression) == nil ? "unknown" : value
  }
  static var current: NativeBuildIdentity {
    let source = Bundle.main.url(forResource: "BuildIdentity", withExtension: "json")
      .flatMap { try? Data(contentsOf: $0) }
      .flatMap { try? JSONDecoder().decode([String: String].self, from: $0) }
    return NativeBuildIdentity(
      version: Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "unknown",
      build: Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "unknown",
      source_revision: revision(source?["source_revision"] ?? ""))
  }
}

struct BackendBuildIdentity: Codable {
  var source_revision = "unknown"
  var automatic_scene_repair: Bool?
  var visual_strictness: String?
  init() {}
  init(_ value: JSON) {
    source_revision = NativeBuildIdentity.revision(value["backend_revision"].text)
    automatic_scene_repair = value["automatic_scene_repair"].bool
    let strictness = value["visual_strictness"].text
    visual_strictness = ["permissive", "standard"].contains(strictness) ? strictness : nil
  }
}

struct PreparationDiagnosticError: Codable, Equatable {
  let code: String
  let number: Int?
  let segment: Int?
  let sample: Int?
  let node_id: String?
  init(_ error: Error) {
    let error = error as NSError
    let remote = error.userInfo["BraiveErrorCode"] as? String ?? ""
    let permitted = ["INVALID_INPUT", "UNAUTHORIZED", "RATE_LIMITED", "PROVIDER_UNAVAILABLE", "TIMEOUT", "INVALID_MODEL_OUTPUT", "CANCELLED", "CONFLICT"]
    // The detail is inspected locally only; it is never copied into the report.
    let detail = error.localizedDescription.lowercased()
    let local = error.domain == "ScenePreflight" || error.domain == "Scene"
    func captured(_ pattern: String) -> String? {
      guard let match = error.localizedDescription.range(of: pattern, options: .regularExpression) else { return nil }
      return String(error.localizedDescription[match])
    }
    segment = local ? captured(#"(?<=segment )[0-9]{1,5}"#).flatMap(Int.init) : nil
    sample = local ? captured(#"(?<=sample )[0-9]{1,5}"#).flatMap(Int.init) : nil
    node_id = local ? captured(#"(?<=\(node )[A-Za-z0-9_-]{1,64}(?=\))"#) : nil
    if local {
      if detail.contains("route clearance") { code = "NATIVE_ROUTE_BLOCKED" }
      else if detail.contains("route support") || detail.contains("supporting surface") { code = "NATIVE_ROUTE_UNSUPPORTED" }
      else if detail.contains("entry anchor") { code = "NATIVE_ROUTE_ORIGIN_MISMATCH" }
      else if detail.contains("focal point") || detail.contains("task focus") { code = "NATIVE_FOCUS_UNAVAILABLE" }
      else if detail.contains("budget") || detail.contains("geometry bytes") { code = "NATIVE_RESOURCE_LIMIT" }
      else { code = "NATIVE_SCENE_REJECTED" }
      number = nil
    } else if error.domain == NSURLErrorDomain {
      code = "CONNECTION_ERROR"; number = error.code
    } else if permitted.contains(remote) {
      code = remote; number = nil
    } else if error.domain == "Braive" {
      code = "SERVER_HTTP_ERROR"; number = error.code
    } else if error.domain == "BraiveConnection" {
      code = "CONNECTION_ERROR"; number = nil
    } else if detail.contains("deadline") {
      code = "TIMEOUT"; number = nil
    } else {
      code = "PREPARATION_FAILED"; number = nil
    }
  }
}

struct PreparationDiagnostics: Encodable {
  enum Outcome: String, Codable { case submitted, backendReady, nativeAccepted, nativeRejected, failed, cancelled }
  struct Event: Codable {
    let outcome: Outcome
    let elapsed_seconds: Double
    let error: PreparationDiagnosticError?
  }
  let schema_version = 1
  let session_id: String
  let revision: Int
  var job_id: String?
  let app: NativeBuildIdentity
  let backend: BackendBuildIdentity
  let started_at: String
  var events: [Event] = []
  private let startedUptime: Double
  private(set) var finished = false
  enum CodingKeys: String, CodingKey {
    case schema_version, session_id, revision, job_id, app, backend, started_at, events
  }
  init(sessionID: String, revision: Int, backend: BackendBuildIdentity,
    app: NativeBuildIdentity = .current, now: Double = ProcessInfo.processInfo.systemUptime) {
    // These IDs are app-generated; validate again before creating a filename.
    session_id = UUID(uuidString: sessionID)?.uuidString ?? UUID().uuidString
    self.revision = max(0, revision); self.backend = backend; self.app = app
    started_at = ISO8601DateFormatter().string(from: Date()); startedUptime = now
  }
  mutating func record(_ outcome: Outcome, jobID: String? = nil, error: Error? = nil,
    now: Double = ProcessInfo.processInfo.systemUptime) {
    guard !finished else { return }
    if let jobID, let id = UUID(uuidString: jobID) { job_id = id.uuidString }
    let elapsed = now - startedUptime
    events.append(Event(outcome: outcome, elapsed_seconds: elapsed.isFinite ? max(0, elapsed) : 0,
      error: error.map(PreparationDiagnosticError.init)))
    if events.count > 16 { events.removeFirst(events.count - 16) }
    finished = [.nativeAccepted, .failed, .cancelled].contains(outcome)
  }
  func write(to root: URL) throws {
    let folder = root.appendingPathComponent("PreparationDiagnostics", isDirectory: true)
    try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
    let encoder = JSONEncoder(); encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
    try encoder.encode(self).write(to: folder.appendingPathComponent("\(session_id)-\(revision).json"), options: .atomic)
  }
}

struct NativeAuditEvidence: Encodable {
  let status: String
  let app = NativeBuildIdentity.current
  let requested_checks: [String]
  let error: PreparationDiagnosticError?
  init(passed: Bool, checks: [String], error: Error? = nil) {
    status = passed ? "passed" : "failed"; requested_checks = checks
    self.error = error.map(PreparationDiagnosticError.init)
  }
  func write(to url: URL) throws {
    try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
    let encoder = JSONEncoder(); encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
    try encoder.encode(self).write(to: url, options: .atomic)
  }
}

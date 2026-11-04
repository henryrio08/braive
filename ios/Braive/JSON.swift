import CoreFoundation
import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

// Lossless project-contract transport. Validation stays in the shared OpenAPI and native preflight.
struct JSON: Codable, Equatable {
  var object: [String: JSON]?
  var array: [JSON]?
  var string: String?
  var number: Double?
  var bool: Bool?
  init(_ value: Any = NSNull()) {
    if let v = value as? [String: Any] {
      object = v.mapValues { JSON($0) }
    } else if let v = value as? [Any] {
      array = v.map { JSON($0) }
    } else if let v = value as? String {
      string = v
    } else if value is NSNull {
    } else if let v = value as? NSNumber {
      if CFGetTypeID(v) == CFBooleanGetTypeID() {
        bool = v.boolValue
      } else {
        number = v.doubleValue
      }
    }
  }
  init(from decoder: Decoder) throws {
    let c = try decoder.singleValueContainer()
    if c.decodeNil() { return }
    if let v = try? c.decode([String: JSON].self) {
      object = v
    } else if let v = try? c.decode([JSON].self) {
      array = v
    } else if let v = try? c.decode(String.self) {
      string = v
    } else if let v = try? c.decode(Bool.self) {
      bool = v
    } else {
      number = try c.decode(Double.self)
    }
  }
  func encode(to encoder: Encoder) throws {
    var c = encoder.singleValueContainer()
    if let v = object {
      try c.encode(v)
    } else if let v = array {
      try c.encode(v)
    } else if let v = string {
      try c.encode(v)
    } else if let v = number {
      try c.encode(v)
    } else if let v = bool {
      try c.encode(v)
    } else {
      try c.encodeNil()
    }
  }
  subscript(_ key: String) -> JSON {
    get { object?[key] ?? JSON() }
    set {
      if object == nil { object = [:] }
      object?[key] = newValue
    }
  }
  var text: String { string ?? "" }
  var value: Double { number ?? 0 }
  var list: [JSON] { array ?? [] }
  var raw: Any {
    if let object { return object.mapValues(\.raw) }
    if let array { return array.map(\.raw) }
    return string as Any? ?? number as Any? ?? bool as Any? ?? NSNull()
  }
}

/// User copy is independent of backend diagnostics and geometry error wording.
enum PreparationCopy {
  static func progress(_ stage: String) -> String {
    let stage = stage.lowercased()
    if stage.contains("adjust") || stage.contains("repair") { return "Adjusting your practice…" }
    if stage.contains("ready for device") || stage.contains("ready to begin") { return "Getting ready to begin…" }
    if stage.contains("building") || stage.contains("surroundings") { return "Creating your surroundings…" }
    if stage.contains("review") || stage.contains("checking the details") { return "Checking the details…" }
    if stage.contains("planning") || stage.contains("shaping") { return "Shaping your practice…" }
    return "Getting your practice ready…"
  }

  static func failure(_ error: Error) -> String {
    let failure = error as NSError
    let code = failure.userInfo["BraiveErrorCode"] as? String ?? ""
    let detail = failure.localizedDescription.lowercased()
    if failure.domain == "Braive" && failure.code == 401 {
      return "Your phone needs to reconnect to the practice computer. Check the pairing code in Settings."
    }
    if code == "TIMEOUT" || (failure.domain == NSURLErrorDomain && failure.code == URLError.timedOut.rawValue) || detail.contains("deadline") {
      return "This practice took too long to prepare. Your description is still here."
    }
    if failure.domain == "BraiveConnection" || API.isTransientConnection(error) {
      return "We lost the connection to the practice computer. Check the connection in Settings. Your description is still here."
    }
    if code == "PROVIDER_UNAVAILABLE" || code == "RATE_LIMITED" {
      return "Practice preparation is unavailable right now. Your description is still here, so you can try again later."
    }
    if detail.contains("route clearance") || detail.contains("supporting surface") {
      return "We couldn’t make a clear path through this practice. Your description is still here."
    }
    if detail.contains("focal point") {
      return "We couldn’t get a clear view of your practice. Your description is still here."
    }
    return "We couldn’t get this practice ready. Your description is still here."
  }
}

struct API {
  var base: String
  var token: String
  var session: URLSession = .shared
  static func isTransientConnection(_ error: Error) -> Bool {
    let error = error as NSError
    return error.domain == NSURLErrorDomain && [
      URLError.timedOut.rawValue, URLError.networkConnectionLost.rawValue,
      URLError.notConnectedToInternet.rawValue, URLError.cannotConnectToHost.rawValue,
      URLError.cannotFindHost.rawValue, URLError.dnsLookupFailed.rawValue,
    ].contains(error.code)
  }
  /// Only read requests and idempotent generation submissions may be replayed.
  /// The caller supplies the original deadline; reconnecting never extends it.
  func callResuming(_ path: String, _ body: JSON? = nil, deadline: Double,
    retryDelay: Duration = .seconds(1), onReconnect: (@MainActor () -> Void)? = nil) async throws -> JSON {
    guard body == nil || ["/v1/session-plans", "/v1/scene-revisions"].contains(path) else {
      throw URLError(.unsupportedURL)
    }
    try Task.checkCancellation()
    let encoded = try body.map { try JSONEncoder().encode($0) }
    while true {
      try Task.checkCancellation()
      let remaining = deadline - ProcessInfo.processInfo.systemUptime
      guard remaining > 0 else { throw URLError(.timedOut) }
      do { return try await send(path, body: encoded, method: nil, timeout: min(8, remaining)) }
      catch where Self.isTransientConnection(error) {
        try Task.checkCancellation()
        guard ProcessInfo.processInfo.systemUptime < deadline else { throw URLError(.timedOut) }
        await onReconnect?()
        let retryTime = deadline - ProcessInfo.processInfo.systemUptime
        guard retryTime > 0 else { throw URLError(.timedOut) }
        try await Task.sleep(for: min(max(.zero, retryDelay), .seconds(retryTime)))
      }
    }
  }
  /// Establish reachability and pairing without generating a scene or renewing paid access.
  func checkConnection() async throws {
    let health = try await call("/health", timeout: 5)
    guard health["status"].text == "ok" else { throw URLError(.badServerResponse) }
    let pairing = try await call("/v1/connection", timeout: 5)
    guard pairing["status"].text == "ok" else { throw URLError(.badServerResponse) }
  }
  /// The server owns an accepted job. Retry reads of that job, never another paid POST.
  func pollJob(_ id: String, deadline: Double, retryDelay: TimeInterval = 0.6,
    onReconnect: (@MainActor () -> Void)? = nil) async throws -> JSON {
    while ProcessInfo.processInfo.systemUptime < deadline {
      try Task.checkCancellation()
      do {
        let job = try await call("/v1/jobs/" + id,
          timeout: max(0.01, min(35, deadline - ProcessInfo.processInfo.systemUptime)))
        guard job["job_id"].text == id,
          ["pending", "running", "succeeded", "failed", "cancelled"].contains(job["status"].text)
        else { throw URLError(.badServerResponse) }
        return job
      } catch where Self.isTransientConnection(error) {
        let remaining = deadline - ProcessInfo.processInfo.systemUptime
        guard remaining > 0 else { break }
        await onReconnect?()
        try await Task.sleep(for: .seconds(min(max(0, retryDelay), remaining)))
      }
    }
    try Task.checkCancellation()
    throw NSError(domain: NSURLErrorDomain, code: URLError.timedOut.rawValue,
      userInfo: [NSLocalizedDescriptionKey: "Scene readiness deadline reached. Retry, revise, or cancel."])
  }
  func call(_ path: String, _ body: JSON? = nil, method: String? = nil, timeout: TimeInterval = 35) async throws -> JSON {
    try Task.checkCancellation()
    return try await send(path, body: body.map { try JSONEncoder().encode($0) }, method: method, timeout: timeout)
  }
  private func send(_ path: String, body: Data?, method: String?, timeout: TimeInterval) async throws -> JSON {
    try Task.checkCancellation()
    let address = base.trimmingCharacters(in: .whitespacesAndNewlines).replacingOccurrences(of: #"/+$"#, with: "", options: .regularExpression)
    guard let components = URLComponents(string: address),
      ["http", "https"].contains(components.scheme?.lowercased() ?? ""),
      let host = components.host, !host.isEmpty,
      components.user == nil, components.password == nil, components.query == nil, components.fragment == nil,
      let url = URL(string: address + path) else {
      throw URLError(.badURL)
    }
    var req = URLRequest(url: url)
    req.httpMethod = method ?? (body == nil ? "GET" : "POST")
    req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    if let body {
      req.httpBody = body
      req.setValue("application/json", forHTTPHeaderField: "Content-Type")
    }
    req.timeoutInterval = timeout
    let (data, response) = try await session.data(for: req)
    guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
      let result = try? JSONDecoder().decode(JSON.self, from: data)
      let status = (response as? HTTPURLResponse)?.statusCode ?? 0
      let detail = result?["message"].text ?? ""
      throw NSError(
        domain: "Braive", code: status, userInfo: [NSLocalizedDescriptionKey: detail.isEmpty ? "The practice server returned HTTP \(status)." : detail,
          "BraiveErrorCode": result?["code"].text ?? "", "BraiveRequestID": result?["request_id"].text ?? ""])
    }
    try Task.checkCancellation()
    return data.isEmpty ? JSON() : try JSONDecoder().decode(JSON.self, from: data)
  }
}

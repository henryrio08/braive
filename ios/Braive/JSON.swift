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

struct API {
  var base: String
  var token: String
  var session: URLSession = .shared
  /// Establish reachability and pairing without generating a scene or renewing paid access.
  func checkConnection() async throws {
    let health = try await call("/health", timeout: 5)
    guard health["status"].text == "ok" else { throw URLError(.badServerResponse) }
    let pairing = try await call("/v1/connection", timeout: 5)
    guard pairing["status"].text == "ok" else { throw URLError(.badServerResponse) }
  }
  /// The server owns an accepted job. Retry reads of that job, never another paid POST.
  func pollJob(_ id: String, deadline: Double, retryDelay: TimeInterval = 0.6) async throws -> JSON {
    while ProcessInfo.processInfo.systemUptime < deadline {
      try Task.checkCancellation()
      do {
        let job = try await call("/v1/jobs/" + id,
          timeout: max(0.01, min(35, deadline - ProcessInfo.processInfo.systemUptime)))
        guard job["job_id"].text == id,
          ["pending", "running", "succeeded", "failed", "cancelled"].contains(job["status"].text)
        else { throw URLError(.badServerResponse) }
        return job
      } catch let error as URLError where [.timedOut, .networkConnectionLost, .cannotConnectToHost, .notConnectedToInternet].contains(error.code) {
        let remaining = deadline - ProcessInfo.processInfo.systemUptime
        guard remaining > 0 else { break }
        try await Task.sleep(for: .seconds(min(max(0, retryDelay), remaining)))
      }
    }
    try Task.checkCancellation()
    throw NSError(domain: NSURLErrorDomain, code: URLError.timedOut.rawValue,
      userInfo: [NSLocalizedDescriptionKey: "Scene readiness deadline reached. Retry, revise, or cancel."])
  }
  func call(_ path: String, _ body: JSON? = nil, method: String? = nil, timeout: TimeInterval = 35) async throws -> JSON {
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
      req.httpBody = try JSONEncoder().encode(body)
      req.setValue("application/json", forHTTPHeaderField: "Content-Type")
    }
    req.timeoutInterval = timeout
    let (data, response) = try await session.data(for: req)
    guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
      let result = try? JSONDecoder().decode(JSON.self, from: data)
      let status = (response as? HTTPURLResponse)?.statusCode ?? 0
      let detail = result?["message"].text ?? ""
      throw NSError(
        domain: "Braive", code: status, userInfo: [NSLocalizedDescriptionKey: detail.isEmpty ? "The practice server returned HTTP \(status)." : detail])
    }
    try Task.checkCancellation()
    return data.isEmpty ? JSON() : try JSONDecoder().decode(JSON.self, from: data)
  }
}

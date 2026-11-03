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
    while true {
      try Task.checkCancellation()
      let remaining = deadline - ProcessInfo.processInfo.systemUptime
      guard remaining > 0 else { throw URLError(.timedOut) }
      do { return try await call(path, body, timeout: min(8, remaining)) }
      catch {
        guard Self.isTransientConnection(error), ProcessInfo.processInfo.systemUptime < deadline else { throw error }
        await onReconnect?()
        try await Task.sleep(for: retryDelay)
      }
    }
  }
  func call(_ path: String, _ body: JSON? = nil, method: String? = nil, timeout: TimeInterval = 35) async throws -> JSON {
    try Task.checkCancellation()
    guard let url = URL(string: base + path), ["http", "https"].contains(url.scheme ?? "") else {
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

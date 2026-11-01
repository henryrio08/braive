import CoreFoundation
import Foundation

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
  func call(_ path: String, _ body: JSON? = nil, method: String? = nil, timeout: TimeInterval = 35) async throws -> JSON {
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
    let (data, response) = try await URLSession.shared.data(for: req)
    let result = data.isEmpty ? JSON() : try JSONDecoder().decode(JSON.self, from: data)
    guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
      throw NSError(
        domain: "Braive", code: 1, userInfo: [NSLocalizedDescriptionKey: result["message"].text])
    }
    return result
  }
}

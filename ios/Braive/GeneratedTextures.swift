import CryptoKit
import Foundation
import ImageIO
import UIKit

/// Registered images only. The scene carries IDs, never arbitrary download URLs.
/// Content and metadata survive app/server restarts independently of the GPU cache.
@MainActor enum GeneratedTextures {
  struct Entry: Codable {
    let id: String
    let sha256: String
    let bytes: Int
    let width: Int
    let height: Int
    let purpose: String?
  }
  static let downloadLimit = 12 * 1024 * 1024
  static let decodedLimit = 64 * 1024 * 1024
  private static let images = NSCache<NSString, UIImage>()
  private static var entries: [String: Entry]?
  private static var directory: URL {
    FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
      .appendingPathComponent("Braive/GeneratedTextures", isDirectory: true)
  }
  static func identifiers(in value: JSON) -> Set<String> {
    var result = Set<String>()
    func visit(_ value: JSON) {
      if let object = value.object {
        for (key, child) in object {
          if key == "texture_asset_id", child.text.hasPrefix("texture.generated.") { result.insert(child.text) }
          else { visit(child) }
        }
      }
      value.list.forEach(visit)
    }
    visit(value); return result
  }
  private static func registry() -> [String: Entry] {
    if let entries { return entries }
    let data = try? Data(contentsOf: directory.appendingPathComponent("index.json"))
    entries = data.flatMap { try? JSONDecoder().decode([String: Entry].self, from: $0) } ?? [:]
    images.totalCostLimit = decodedLimit
    return entries ?? [:]
  }
  private static func valid(_ entry: Entry) -> Bool {
    guard entry.id.range(of: #"^texture\.generated\.[a-f0-9]{16,64}$"#, options: .regularExpression) != nil,
      entry.sha256.range(of: #"^[a-f0-9]{64}$"#, options: .regularExpression) != nil,
      entry.sha256.hasPrefix(String(entry.id.dropFirst("texture.generated.".count))),
      entry.bytes > 0, entry.bytes <= downloadLimit, entry.width > 0, entry.height > 0,
      entry.width <= (entry.purpose == "distant" ? 2048 : 1024), entry.height <= 1024 else { return false }
    return true
  }
  private static func file(_ entry: Entry) -> URL { directory.appendingPathComponent(entry.sha256 + ".image") }
  private static func decode(_ data: Data, entry: Entry) -> UIImage? {
    guard valid(entry), data.count == entry.bytes,
      SHA256.hash(data: data).map({ String(format: "%02x", $0) }).joined() == entry.sha256,
      let source = CGImageSourceCreateWithData(data as CFData, [kCGImageSourceShouldCache: false] as CFDictionary),
      let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
      (properties[kCGImagePropertyPixelWidth] as? Int) == entry.width,
      (properties[kCGImagePropertyPixelHeight] as? Int) == entry.height,
      let cgImage = CGImageSourceCreateThumbnailAtIndex(source, 0, [
        kCGImageSourceCreateThumbnailFromImageAlways: true,
        kCGImageSourceCreateThumbnailWithTransform: true,
        kCGImageSourceShouldCacheImmediately: true,
        kCGImageSourceThumbnailMaxPixelSize: entry.purpose == "distant" ? 2048 : 1024,
      ] as CFDictionary) else { return nil }
    return UIImage(cgImage: cgImage)
  }
  static func image(_ id: String) -> UIImage? {
    if let cached = images.object(forKey: id as NSString) { return cached }
    guard let entry = registry()[id], valid(entry),
      let data = try? Data(contentsOf: file(entry), options: .mappedIfSafe),
      let image = decode(data, entry: entry) else { return nil }
    images.setObject(image, forKey: id as NSString, cost: entry.width * entry.height * 4)
    return image
  }
  static func prepare(scene: JSON, api: API) async throws {
    var compressed = 0, decoded = 0
    for id in identifiers(in: scene).sorted() {
      try Task.checkCancellation()
      var entry = registry()[id]
      if entry == nil || image(id) == nil {
        guard id.range(of: #"^texture\.generated\.[a-f0-9]{16,64}$"#, options: .regularExpression) != nil else { throw URLError(.badURL) }
        let metadata = try await api.call("/v1/assets/" + id + "/metadata", timeout: 8)
        let fetched = try JSONDecoder().decode(Entry.self, from: JSONEncoder().encode(metadata))
        guard fetched.id == id, valid(fetched) else { throw URLError(.cannotDecodeContentData) }
        entry = fetched
      }
      guard let entry, valid(entry) else { throw URLError(.cannotDecodeContentData) }
      compressed += entry.bytes; decoded += entry.width * entry.height * 4
      guard compressed <= downloadLimit, decoded <= decodedLimit else { throw URLError(.dataLengthExceedsMaximum) }
      if image(id) == nil {
        let data = try await download(api: api, id: id, expectedBytes: entry.bytes)
        guard let image = decode(data, entry: entry) else { throw URLError(.cannotDecodeContentData) }
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        try data.write(to: file(entry), options: .atomic)
        var index = registry(); index[id] = entry; entries = index
        try JSONEncoder().encode(index).write(to: directory.appendingPathComponent("index.json"), options: .atomic)
        images.setObject(image, forKey: id as NSString, cost: entry.width * entry.height * 4)
      }
    }
  }
  nonisolated private static func download(api: API, id: String, expectedBytes: Int) async throws -> Data {
    let address = api.base.trimmingCharacters(in: .whitespacesAndNewlines).replacingOccurrences(of: #"/+$"#, with: "", options: .regularExpression)
    guard let base = URLComponents(string: address), ["http", "https"].contains(base.scheme ?? ""),
      base.host != nil, base.user == nil, base.password == nil, base.query == nil, base.fragment == nil,
      let url = URL(string: address + "/v1/assets/" + id) else { throw URLError(.badURL) }
    var request = URLRequest(url: url); request.timeoutInterval = 15
    request.setValue("Bearer " + api.token, forHTTPHeaderField: "Authorization")
    let connection = URLSession(configuration: .ephemeral, delegate: AssetRedirectPolicy(origin: url), delegateQueue: nil)
    defer { connection.invalidateAndCancel() }
    let (stream, response) = try await connection.bytes(for: request)
    guard let http = response as? HTTPURLResponse, http.statusCode == 200,
      response.expectedContentLength <= expectedBytes else { throw URLError(.badServerResponse) }
    var data = Data(); data.reserveCapacity(expectedBytes)
    for try await byte in stream {
      guard data.count < expectedBytes else { throw URLError(.dataLengthExceedsMaximum) }
      data.append(byte)
    }
    guard data.count == expectedBytes else { throw URLError(.cannotDecodeContentData) }
    return data
  }
  static func removeUnreferenced(retaining records: [JSON]) throws {
    let retained = records.reduce(into: Set<String>()) { $0.formUnion(identifiers(in: $1)) }
    var index = registry()
    for (id, entry) in index where !retained.contains(id) {
      if valid(entry) { try? FileManager.default.removeItem(at: file(entry)) }
      images.removeObject(forKey: id as NSString); index.removeValue(forKey: id)
    }
    entries = index
    if FileManager.default.fileExists(atPath: directory.path) {
      try JSONEncoder().encode(index).write(to: directory.appendingPathComponent("index.json"), options: .atomic)
    }
  }
}

private final class AssetRedirectPolicy: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
  let origin: URL
  init(origin: URL) { self.origin = origin }
  func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
    let target = request.url
    completionHandler(target?.host == origin.host && target?.scheme == origin.scheme && target?.port == origin.port ? request : nil)
  }
}

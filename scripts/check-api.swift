import Foundation
final class OfflineProtocol: URLProtocol {
 nonisolated(unsafe) static var status = 200
 nonisolated(unsafe) static var payload = Data()
 override class func canInit(with request: URLRequest) -> Bool { true }
 override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
 override func startLoading() {
  let response = HTTPURLResponse(url:request.url!,statusCode:Self.status,httpVersion:nil,headerFields:nil)!
  client?.urlProtocol(self,didReceive:response,cacheStoragePolicy:.notAllowed)
  client?.urlProtocol(self,didLoad:Self.payload);client?.urlProtocolDidFinishLoading(self)
 }
 override func stopLoading() {}
}
@main struct APIChecks {
 static func main() async throws {
  let config=URLSessionConfiguration.ephemeral;config.protocolClasses=[OfflineProtocol.self]
  let api=API(base:"https://offline.invalid",token:"offline-placeholder",session:URLSession(configuration:config))
  for (status,payload,expected) in [(503,"<html>Unavailable</html>","HTTP 503"),(401,"{\"message\":\"Pair this phone\"}","Pair this phone")] {
   OfflineProtocol.status=status;OfflineProtocol.payload=Data(payload.utf8)
   do { _ = try await api.call("/v1/test");fatalError("Expected HTTP failure") }
   catch { precondition((error as NSError).code == status && error.localizedDescription.contains(expected)) }
  }
  OfflineProtocol.status=204;OfflineProtocol.payload=Data()
  let empty=try await api.call("/v1/test",method:"DELETE");precondition(empty == JSON())
  OfflineProtocol.status=200;OfflineProtocol.payload=Data("{\"status\":\"ok\"}".utf8)
  let result=try await api.call("/v1/test");precondition(result["status"].text == "ok")
  print("API checks passed: HTML HTTP errors, JSON errors, empty cancellation response and success. No network.")
 }
}

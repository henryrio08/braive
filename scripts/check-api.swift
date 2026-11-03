import Foundation
final class OfflineProtocol: URLProtocol {
 nonisolated(unsafe) static var status = 200
 nonisolated(unsafe) static var payload = Data()
 nonisolated(unsafe) static var failures = 0
 nonisolated(unsafe) static var starts = 0
 override class func canInit(with request: URLRequest) -> Bool { true }
 override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
 override func startLoading() {
  Self.starts += 1
  if Self.failures > 0 {
   Self.failures -= 1
   client?.urlProtocol(self,didFailWithError:URLError(.timedOut));return
  }
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
  OfflineProtocol.failures=1;OfflineProtocol.starts=0
  let resumed=try await api.callResuming("/v1/jobs/test",deadline:ProcessInfo.processInfo.systemUptime+5,retryDelay:.zero)
  precondition(resumed["status"].text == "ok" && OfflineProtocol.starts == 2)
  OfflineProtocol.starts=0
  do { _ = try await api.callResuming("/v1/jobs/test",deadline:ProcessInfo.processInfo.systemUptime-1);fatalError("Expired deadline must stop") }
  catch { precondition((error as? URLError)?.code == .timedOut && OfflineProtocol.starts == 0) }
  OfflineProtocol.status=401;OfflineProtocol.starts=0
  do { _ = try await api.callResuming("/v1/jobs/test",deadline:ProcessInfo.processInfo.systemUptime+5,retryDelay:.zero);fatalError("Pairing errors cannot retry") }
  catch { precondition((error as NSError).code == 401 && OfflineProtocol.starts == 1) }
  OfflineProtocol.starts=0
  do { _ = try await api.callResuming("/v1/dialogue",JSON(["text":"test"]),deadline:ProcessInfo.processInfo.systemUptime+5);fatalError("Paid dialogue cannot replay") }
  catch { precondition((error as? URLError)?.code == .unsupportedURL && OfflineProtocol.starts == 0) }
  print("API checks passed: HTTP errors, empty/success responses, lost-poll recovery, deadline preservation and no unsafe POST replay. No network.")
 }
}

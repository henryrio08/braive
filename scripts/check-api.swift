import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

final class OfflineProtocol: URLProtocol {
 struct Reply {
  var status = 200
  var text = ""
  var error: URLError?
 }
 private static let lock = NSLock()
 nonisolated(unsafe) private static var replies: [Reply] = []
 nonisolated(unsafe) private static var captured: [URLRequest] = []
 static func configure(_ values: [Reply]) {
  lock.lock(); defer { lock.unlock() }
  replies = values; captured = []
 }
 static var requests: [URLRequest] {
  lock.lock(); defer { lock.unlock() }
  return captured
 }
 override class func canInit(with request: URLRequest) -> Bool { true }
 override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
 override func startLoading() {
  Self.lock.lock()
  Self.captured.append(request)
  let reply = Self.replies.isEmpty ? nil : Self.replies.removeFirst()
  Self.lock.unlock()
  guard let reply else { client?.urlProtocol(self,didFailWithError:URLError(.unknown)); return }
  if let error = reply.error { client?.urlProtocol(self,didFailWithError:error); return }
  let response = HTTPURLResponse(url:request.url!,statusCode:reply.status,httpVersion:nil,headerFields:nil)!
  client?.urlProtocol(self,didReceive:response,cacheStoragePolicy:.notAllowed)
  client?.urlProtocol(self,didLoad:Data(reply.text.utf8));client?.urlProtocolDidFinishLoading(self)
 }
 override func stopLoading() {}
}
@main struct APIChecks {
 static func isURLFailure(_ error: Error, _ code: URLError.Code) -> Bool {
  let failure=error as NSError
  return failure.domain == NSURLErrorDomain && failure.code == code.rawValue
 }
 static func main() async throws {
  let config=URLSessionConfiguration.ephemeral;config.protocolClasses=[OfflineProtocol.self]
  let api=API(base:"https://offline.invalid",token:"offline-placeholder",session:URLSession(configuration:config))
  for (status,payload,expected) in [(503,"<html>Unavailable</html>","HTTP 503"),(401,"{\"message\":\"Pair this phone\"}","Pair this phone")] {
   OfflineProtocol.configure([.init(status:status,text:payload)])
   do { _ = try await api.call("/v1/test");fatalError("Expected HTTP failure") }
   catch { precondition((error as NSError).code == status && error.localizedDescription.contains(expected)) }
  }
  OfflineProtocol.configure([.init(status:204)])
  let empty=try await api.call("/v1/test",method:"DELETE");precondition(empty == JSON())
  OfflineProtocol.configure([.init(text:"{\"status\":\"ok\"}")])
  let result=try await api.call("/v1/test");precondition(result["status"].text == "ok")

  // Voice readiness must prove both transport reachability and the pairing token.
  OfflineProtocol.configure([.init(text:"{\"status\":\"ok\"}"),.init(text:"{\"status\":\"ok\"}")])
  try await api.checkConnection()
  precondition(OfflineProtocol.requests.map { $0.url!.path } == ["/health","/v1/connection"])
  precondition(OfflineProtocol.requests.allSatisfy { $0.httpMethod == "GET" && $0.value(forHTTPHeaderField:"Authorization") == "Bearer offline-placeholder" })

  OfflineProtocol.configure([.init(text:"{\"status\":\"ok\"}"),.init(status:401,text:"{\"message\":\"Pair this phone\"}")])
  do { try await api.checkConnection();fatalError("Pairing failure must prevent readiness") }
  catch { precondition((error as NSError).code == 401 && error.localizedDescription.contains("Pair this phone")) }
  precondition(OfflineProtocol.requests.count == 2)

  OfflineProtocol.configure([.init(text:"{\"status\":\"not-ready\"}")])
  do { try await api.checkConnection();fatalError("Invalid health must prevent the authenticated probe") }
  catch { precondition(isURLFailure(error,.badServerResponse)) }
  precondition(OfflineProtocol.requests.map { $0.url!.path } == ["/health"])

  let slashAPI=API(base:"https://offline.invalid/",token:"offline-placeholder",session:api.session)
  OfflineProtocol.configure([.init(text:"{\"status\":\"ok\"}"),.init(text:"{\"status\":\"ok\"}")])
  try await slashAPI.checkConnection()
  precondition(OfflineProtocol.requests.map { $0.url!.absoluteString } == ["https://offline.invalid/health","https://offline.invalid/v1/connection"])

  let id="c36a8c25-43c2-46fc-b3bc-c48bb8d43192"
  let success="{\"job_id\":\"\(id)\",\"status\":\"succeeded\"}"
  OfflineProtocol.configure([.init(error:URLError(.timedOut)),.init(error:URLError(.networkConnectionLost)),.init(text:success)])
  let job=try await api.pollJob(id,deadline:ProcessInfo.processInfo.systemUptime+5,retryDelay:0)
  precondition(job["status"].text == "succeeded")
  precondition(OfflineProtocol.requests.count == 3)
  precondition(OfflineProtocol.requests.allSatisfy { $0.httpMethod == "GET" && $0.url!.path == "/v1/jobs/\(id)" && $0.httpBody == nil })

  // An authorization failure is final; polling must never retry or create a new paid job.
  OfflineProtocol.configure([.init(status:401,text:"{\"message\":\"Pair again\"}")])
  do { _ = try await api.pollJob(id,deadline:ProcessInfo.processInfo.systemUptime+5,retryDelay:0);fatalError("HTTP failures are final") }
  catch { precondition((error as NSError).code == 401) }
  precondition(OfflineProtocol.requests.count == 1)

  OfflineProtocol.configure([.init(text:"not JSON")])
  do { _ = try await api.pollJob(id,deadline:ProcessInfo.processInfo.systemUptime+5,retryDelay:0);fatalError("Corrupt job JSON is final") }
  catch { precondition(error is DecodingError) }
  precondition(OfflineProtocol.requests.count == 1)

  for payload in ["{\"job_id\":\"different-job\",\"status\":\"succeeded\"}","{\"job_id\":\"\(id)\",\"status\":\"invented\"}","{\"status\":\"running\"}"] {
   OfflineProtocol.configure([.init(text:payload)])
   do { _ = try await api.pollJob(id,deadline:ProcessInfo.processInfo.systemUptime+5,retryDelay:0);fatalError("Job identity and status must validate") }
   catch { precondition(isURLFailure(error,.badServerResponse)) }
   precondition(OfflineProtocol.requests.count == 1)
  }

  OfflineProtocol.configure([])
  do { _ = try await api.pollJob(id,deadline:ProcessInfo.processInfo.systemUptime-1,retryDelay:0);fatalError("Expired jobs must not poll") }
  catch { precondition(isURLFailure(error,.timedOut)) }
  precondition(OfflineProtocol.requests.isEmpty)

  OfflineProtocol.configure([.init(error:URLError(.cannotConnectToHost))])
  let deadlineStarted=ProcessInfo.processInfo.systemUptime
  do { _ = try await api.pollJob(id,deadline:deadlineStarted+0.02,retryDelay:1);fatalError("A transient connection error must stop at readiness deadline") }
  catch { precondition(isURLFailure(error,.timedOut)) }
  precondition(OfflineProtocol.requests.count == 1)
  precondition(ProcessInfo.processInfo.systemUptime-deadlineStarted < 0.5,"Retry sleep must be bounded by the deadline")

  OfflineProtocol.configure([.init(error:URLError(.notConnectedToInternet))])
  let polling=Task { try await api.pollJob(id,deadline:ProcessInfo.processInfo.systemUptime+30,retryDelay:10) }
  let cancellationWait=ProcessInfo.processInfo.systemUptime+2
  while OfflineProtocol.requests.isEmpty && ProcessInfo.processInfo.systemUptime<cancellationWait { await Task.yield() }
  precondition(OfflineProtocol.requests.count == 1)
  polling.cancel()
  do { _ = try await polling.value;fatalError("Cancelled polling must stop") }
  catch { precondition(error is CancellationError || isURLFailure(error,.cancelled)) }
  precondition(OfflineProtocol.requests.count == 1)

  // A lost acknowledgement may replay only the same idempotent generation body.
  OfflineProtocol.configure([.init(error:URLError(.timedOut)),.init(text:success)])
  let submission=JSON(["session_id":id,"revision":1])
  let resumed=try await api.callResuming("/v1/session-plans",submission,deadline:ProcessInfo.processInfo.systemUptime+5,retryDelay:.zero)
  precondition(resumed["job_id"].text == id && OfflineProtocol.requests.count == 2)
  precondition(OfflineProtocol.requests.allSatisfy { $0.httpMethod == "POST" && $0.httpBody == OfflineProtocol.requests.first?.httpBody })
  OfflineProtocol.configure([])
  do { _ = try await api.callResuming("/v1/jobs/test",deadline:ProcessInfo.processInfo.systemUptime-1);fatalError("Expired deadline must stop") }
  catch { precondition(isURLFailure(error,.timedOut) && OfflineProtocol.requests.isEmpty) }
  do { _ = try await api.callResuming("/v1/dialogue",JSON(["text":"test"]),deadline:ProcessInfo.processInfo.systemUptime+5);fatalError("Paid dialogue cannot replay") }
  catch { precondition(isURLFailure(error,.unsupportedURL) && OfflineProtocol.requests.isEmpty) }

  print("API checks passed: readiness/pairing, same-job recovery, idempotent submission replay, invalid-job rejection, deadline, cancellation and no unsafe POST replay. No network or paid calls.")
 }
}

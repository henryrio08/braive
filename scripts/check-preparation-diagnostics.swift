import Foundation

@main enum CheckPreparationDiagnostics {
  static func main() throws {
    let privateText = "private spoken description / pairing-secret"
    let remote = NSError(domain: "Braive", code: 503, userInfo: [
      NSLocalizedDescriptionKey: privateText, "BraiveErrorCode": "PROVIDER_UNAVAILABLE"])
    let native = NSError(domain: "ScenePreflight", code: 1, userInfo: [
      NSLocalizedDescriptionKey: "Route clearance failed on segment 2: body intersects solid geometry (node floor_3)"])
    let safe = PreparationDiagnosticError(native)
    precondition(safe.code == "NATIVE_ROUTE_BLOCKED" && safe.segment == 2 && safe.node_id == "floor_3")
    let unsupported = PreparationDiagnosticError(NSError(domain: "ScenePreflight", code: 1, userInfo: [
      NSLocalizedDescriptionKey: "Route support missing on segment 1 near sample 4 (0 hits)"]))
    precondition(unsupported.code == "NATIVE_ROUTE_UNSUPPORTED" && unsupported.sample == 4)
    let source = String(repeating: "a", count: 40) + "-dirty"
    let identity = BackendBuildIdentity(JSON(["backend_revision": source, "automatic_scene_repair": false, "visual_strictness": "permissive"]))
    precondition(identity.source_revision == source && identity.automatic_scene_repair == false)
    precondition(BackendBuildIdentity(JSON(["backend_revision": privateText])).source_revision == "unknown")
    let session = UUID().uuidString, job = UUID().uuidString
    var report = PreparationDiagnostics(sessionID: session, revision: 3, backend: identity,
      app: NativeBuildIdentity(version: "0.4", build: "8", source_revision: source), now: 100)
    report.record(.submitted, now: 100)
    report.record(.backendReady, jobID: job, now: 101)
    report.record(.nativeRejected, error: native, now: 102)
    report.record(.failed, error: remote, now: 103)
    report.record(.submitted, now: 104) // A finished report cannot be overwritten by a late callback.
    let folder = FileManager.default.temporaryDirectory.appendingPathComponent("BraiveDiagnosticCheck-" + UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: folder) }
    try report.write(to: folder)
    let data = try Data(contentsOf: folder.appendingPathComponent("PreparationDiagnostics/\(session)-3.json"))
    let decoded = try JSONDecoder().decode(JSON.self, from: data)
    let serialized = String(decoding: data, as: UTF8.self)
    precondition(!serialized.contains(privateText) && !serialized.contains("pairing-secret"))
    precondition(decoded["job_id"].text == job && decoded["events"].list.count == 4)
    precondition(decoded["events"].list[2]["error"]["code"].text == "NATIVE_ROUTE_BLOCKED")
    precondition(decoded["events"].list[3]["elapsed_seconds"].value == 3)
    var accepted = PreparationDiagnostics(sessionID: session, revision: 4, backend: identity, now: 100)
    accepted.record(.nativeAccepted, now: 101); accepted.record(.failed, error: remote, now: 102)
    precondition(accepted.events.count == 1)
    let auditURL = folder.appendingPathComponent("PreflightAudit.json")
    try NativeAuditEvidence(passed: false, checks: ["route_segment_and_support_controls"], error: native).write(to: auditURL)
    let audit = try JSONDecoder().decode(JSON.self, from: Data(contentsOf: auditURL))
    precondition(audit["status"].text == "failed" && audit["app"]["source_revision"].string != nil)
    print("Preparation diagnostics passed: identities, original native rejection, route details, bounded outcomes, redaction and audit evidence")
  }
}

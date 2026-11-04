import Foundation

@main enum CheckPreparationCopy {
  static func main() {
    precondition(PreparationCopy.progress("Repairing device visibility checks") == "Adjusting your practice…")
    precondition(PreparationCopy.progress("Ready for device validation") == "Getting ready to begin…")
    precondition(PreparationCopy.progress("Creating your surroundings…") == "Creating your surroundings…")
    precondition(PreparationCopy.progress("INTERNAL raw provider stage 503") == "Getting your practice ready…")
    let geometry = NSError(domain: "Generation", code: 1, userInfo: [NSLocalizedDescriptionKey: "Construction constraints require repair: /nodes/5 zone_fit"])
    let copy = PreparationCopy.failure(geometry)
    precondition(copy.contains("Your description is still here"))
    precondition(!copy.contains("zone_fit") && !copy.contains("/nodes") && !copy.contains("repair"))
    let timeout = NSError(domain: "Generation", code: 1, userInfo: ["BraiveErrorCode": "TIMEOUT"])
    precondition(PreparationCopy.failure(timeout).contains("took too long"))
    let provider = NSError(domain: "Generation", code: 1, userInfo: ["BraiveErrorCode": "PROVIDER_UNAVAILABLE"])
    precondition(PreparationCopy.failure(provider).contains("unavailable right now"))
    precondition(PreparationCopy.failure(URLError(.networkConnectionLost)).contains("Check the connection in Settings"))
    precondition(PreparationCopy.failure(NSError(domain: "Braive", code: 401)).contains("pairing code"))
    let route = NSError(domain: "ScenePreflight", code: 1, userInfo: [NSLocalizedDescriptionKey: "Route clearance failed on segment 2: node floor"])
    precondition(PreparationCopy.failure(route).contains("clear path"))
    print("Preparation copy checks passed: progress, technical-detail filtering, retained input, connection, pairing, timeout, service and route failures.")
  }
}

import Foundation

extension Session {
  func syncGenerationPause(changed: Bool = false) {
    if changed { generationPauseSequence += 1 }
    guard !jobID.isEmpty, generationPauseAcknowledged != generationPauseSequence else { return }
    generationPauseTask?.cancel()
    let job = jobID, endpoint = api, sequence = generationPauseSequence, paused = !pauses.isEmpty
    generationPauseTask = Task { [weak self] in
      guard let self else { return }
      do {
        _ = try await endpoint.call("/v1/jobs/"+job+"/pause",JSON(["paused":paused,"sequence":sequence]),timeout:3)
        guard jobID == job, generationPauseSequence == sequence else { return }
        generationPauseAcknowledged = sequence
      } catch { /* Polling retries the same sequenced state; reveal stays locally paused. */ }
    }
  }
}

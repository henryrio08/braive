import Foundation

extension Session {
  func waitForFeedbackDelivery(nonce: UUID, owner: String, revision expected: Int) async throws {
    while !pauses.isEmpty {
      try await Task.sleep(for:.milliseconds(100))
      guard nonce == feedbackNonce,owner == sessionID,revision == expected,phase == .feedback else { throw CancellationError() }
    }
    try Task.checkCancellation()
  }
  func leavePostSession() {
    cancelFeedback();repeatToken = UUID();repeatPreparing = false
    pendingPhase = nil;loading = false;transitionID = UUID();audio.silence()
    pauses.remove("user_stop");reflectionDraft = SpokenReflection()
    persistPostSession { [weak self] in
      guard let self else { return }
      repeatAfterHeadset = false;world.lobby();world.scene.isPaused = !pauses.isEmpty
      audio.lobby();if !pauses.isEmpty { audio.pause() }
      go(.lobby,"Your practice is saved. Say START whenever you're ready.")
    }
  }
  func resumeAfterInterruption() {
    pause("recovery_resume",enabled:false)
    if phase == .repeatPreparation,pauses.isEmpty { beginPreparedAttempt() }
  }
}

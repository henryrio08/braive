import Foundation
import UIKit

extension Session {
  func cancelNativeReview() { reviewTask?.cancel();world.captureRequest = nil }
  func runNativePerformanceReview() {
    guard [.setup,.lobby].contains(phase),!reviewRunning,!connecting else { return }
    reviewRunning = true;reviewFiles = [];reviewStatus = "Preparing sixteen people. Keep Braive open and horizontal for three minutes."
    let folder = store.root.appendingPathComponent("WorldReview/\(UUID().uuidString)")
    reviewTask = Task { [weak self] in
      guard let self else { return }
      let oldPhase = phase;world.reviewTrackingSuspended = true
      defer {
        world.reviewTrackingSuspended = false;world.setBlackout(0);world.lobby()
        world.scene.isPaused = !pauses.isEmpty;reviewRunning = false;reviewTask = nil;phase = oldPhase;refreshHeadsetPanels()
      }
      do {
        try world.showPeopleReview(count:16);world.scene.isPaused = false;world.beginPracticeClock()
        world.setHeadsetText(title:"",detail:"",command:"",status:"Performance check · 16 people",visible:true)
        try await Task.sleep(for:.seconds(2));world.metrics.reset()
        let started = ProcessInfo.processInfo.systemUptime
        while ProcessInfo.processInfo.systemUptime-started < 181 {
          try await Task.sleep(for:.milliseconds(250))
          guard UIApplication.shared.applicationState == .active else { throw world.failure("The check was interrupted. Keep Braive open and try again.") }
          reviewStatus = "Sixteen-person check: \(max(0,181-Int(ProcessInfo.processInfo.systemUptime-started))) seconds remaining."
        }
        let measured = world.metrics.report
        let passed = measured["sustained_three_minutes"].bool == true && measured["average_presented_fps"].value >= 59 && measured["p95_present_interval_ms"].value < 20
        let picture = try await captureRenderedFrame(to:folder.appendingPathComponent("sixteen-people-stereo.png"))
        let report = JSON(["status":"measured","origin":"synthetic stress case with 16 registered animated people, 8 matched chairs and ground",
          "renderer":"production SceneKit eyes and Metal optical compositor","metrics":measured.raw,"target_passed":passed,
          "targets":["seconds":180,"nominal_fps":60,"minimum_average_fps":59,"p95_present_interval_below_ms":20],
          "limitation":"This measures the constructed stress case; a generated world and in-viewer comfort require their own acceptance."])
        let destination = folder.appendingPathComponent("performance.json")
        try JSONEncoder().encode(report).write(to:destination,options:.atomic)
        reviewLastFrame = picture;reviewReport = destination;reviewFiles = [picture,destination]
        reviewStatus = passed ? "The three-minute check met its frame-rate targets. Pictures and measurements are saved." : "The three-minute check finished below its targets. Measurements are saved for improvement."
      } catch is CancellationError { reviewStatus = "Check cancelled. Your practice is unchanged." }
      catch { reviewStatus = error.localizedDescription }
    }
  }
}

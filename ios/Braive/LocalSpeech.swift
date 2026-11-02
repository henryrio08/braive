import AVFoundation
import CoreMedia
import Speech

/// Apple's on-device, long-form recognizer. Audio never crosses a network boundary.
@available(iOS 26.0, *)
@MainActor final class LocalSpeech {
  private var analyzer: SpeechAnalyzer?
  private var resultsTask: Task<Void, Never>?
  private var detectorTask: Task<Void, Never>?
  private var endpointTask: Task<Void, Never>?
  private var sink: LocalSpeechSink?
  private var turn = SpeechTurnBuffer()
  private var stopped = false
  private let onText: (String, Bool, String) -> Void
  private let onError: (String) -> Void
  private let onActivity: (Bool) -> Void
  init(onText: @escaping (String, Bool, String) -> Void, onError: @escaping (String) -> Void,
    onActivity: @escaping (Bool) -> Void) {
    self.onText = onText; self.onError = onError; self.onActivity = onActivity
  }
  func prepare(inputFormat: AVAudioFormat, status: (String) -> Void) async throws -> LocalSpeechSink {
    guard let locale = await SpeechTranscriber.supportedLocale(equivalentTo: Locale(identifier: "en-US")) else {
      throw failure("English on-device speech recognition is not available on this iPhone.")
    }
    let transcriber = SpeechTranscriber(locale: locale, transcriptionOptions: [],
      reportingOptions: [.volatileResults, .fastResults], attributeOptions: [])
    let detector = SpeechDetector(detectionOptions: .init(sensitivityLevel: .medium), reportResults: true)
    let modules: [any SpeechModule] = [transcriber, detector]
    status("Preparing voice on this iPhone…")
    if let installation = try await AssetInventory.assetInstallationRequest(supporting: modules) {
      status("Setting up offline voice for the first time…")
      try await installation.downloadAndInstall()
    }
    guard let target = await SpeechAnalyzer.bestAvailableAudioFormat(compatibleWith: modules, considering: inputFormat) else {
      throw failure("The microphone format is not supported by on-device speech recognition.")
    }
    let analyzer = SpeechAnalyzer(modules: modules)
    self.analyzer = analyzer
    let context = AnalysisContext()
    context.contextualStrings[.general] = ["START", "STOP", "yes", "no", "hey builder",
      "that's all", "begin practice", "start over", "save reflection"]
    try await analyzer.setContext(context)
    let (inputs, continuation) = AsyncStream<AnalyzerInput>.makeStream(bufferingPolicy: .bufferingNewest(20))
    let sink = try LocalSpeechSink(input: inputFormat, target: target, continuation: continuation) { [weak self] reason in
      Task { @MainActor in self?.reportFailure(reason) }
    }
    self.sink = sink
    resultsTask = Task { [weak self] in
      do {
        for try await result in transcriber.results {
          guard let self, !self.stopped, !Task.isCancelled else { return }
          let start = CMTimeGetSeconds(result.range.start)
          let end = CMTimeGetSeconds(CMTimeRangeGetEnd(result.range))
          guard self.turn.receive(String(result.text.characters), final: result.isFinal,
            start: start, end: end, now: ProcessInfo.processInfo.systemUptime) else { continue }
          self.onText(self.turn.text, false, self.turn.id)
          self.scheduleEndpoint()
        }
      } catch { if !Task.isCancelled { self?.reportFailure(error.localizedDescription) } }
    }
    detectorTask = Task { [weak self] in
      do {
        for try await result in detector.results {
          guard let self, !self.stopped, !Task.isCancelled else { return }
          self.turn.detectSpeech(result.speechDetected, now: ProcessInfo.processInfo.systemUptime)
          self.onActivity(result.speechDetected)
          self.scheduleEndpoint()
        }
      } catch { if !Task.isCancelled { self?.reportFailure(error.localizedDescription) } }
    }
    try await analyzer.prepareToAnalyze(in: target)
    try await analyzer.start(inputSequence: inputs)
    return sink
  }
  private func scheduleEndpoint() {
    endpointTask?.cancel()
    endpointTask = nil
    guard let delay = turn.delay(now: ProcessInfo.processInfo.systemUptime) else { return }
    endpointTask = Task { [weak self] in
      do { try await Task.sleep(for: .seconds(delay)) } catch { return }
      guard let self, !self.stopped, !Task.isCancelled else { return }
      self.endpointTask = nil
      if let result = self.turn.take(now: ProcessInfo.processInfo.systemUptime) {
        self.onText(result.text, true, result.id)
      }
    }
  }
  func stop() {
    stopped = true
    sink?.finish(); sink = nil
    resultsTask?.cancel(); detectorTask?.cancel(); endpointTask?.cancel()
    if let analyzer { Task { await analyzer.cancelAndFinishNow() } }
    analyzer = nil
  }
  private func reportFailure(_ reason: String) { if !stopped { stop(); onError(reason) } }
  private func failure(_ message: String) -> NSError {
    NSError(domain: "LocalSpeech", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
  }
}

@available(iOS 26.0, *)
final class LocalSpeechSink: @unchecked Sendable {
  private let converter: AVAudioConverter
  private let input: AVAudioFormat, target: AVAudioFormat
  private let continuation: AsyncStream<AnalyzerInput>.Continuation
  private let onError: @Sendable (String) -> Void
  init(input: AVAudioFormat, target: AVAudioFormat, continuation: AsyncStream<AnalyzerInput>.Continuation,
    onError: @escaping @Sendable (String) -> Void) throws {
    guard let converter = AVAudioConverter(from: input, to: target) else { throw CocoaError(.coderInvalidValue) }
    self.converter = converter; self.input = input; self.target = target
    self.continuation = continuation; self.onError = onError
  }
  func append(_ buffer: AVAudioPCMBuffer) {
    let capacity = AVAudioFrameCount(ceil(Double(buffer.frameLength) * target.sampleRate / input.sampleRate)) + 64
    guard let output = AVAudioPCMBuffer(pcmFormat: target, frameCapacity: capacity) else { return }
    var supplied = false
    var error: NSError?
    converter.convert(to: output, error: &error) { _, status in
      if supplied { status.pointee = .noDataNow; return nil }
      supplied = true; status.pointee = .haveData; return buffer
    }
    if let error { onError(error.localizedDescription); return }
    guard output.frameLength > 0 else { return }
    if case .dropped = continuation.yield(AnalyzerInput(buffer: output)) {
      onError("On-device voice could not keep up with the microphone. Please reconnect voice.")
    }
  }
  func finish() { continuation.finish() }
}

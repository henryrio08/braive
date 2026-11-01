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
  private var speaking = false
  private var stable = "", draft = ""
  private var turnID = UUID().uuidString
  private var consumedThrough = -Double.infinity
  private var latestEnd = 0.0
  private var stopped = false
  private let onText: (String, Bool, String) -> Void
  private let onError: (String) -> Void
  init(onText: @escaping (String, Bool, String) -> Void, onError: @escaping (String) -> Void) {
    self.onText = onText; self.onError = onError
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
    context.contextualStrings[.general] = ["START", "STOP", "yes", "no", "hey builder", "save reflection"]
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
          // A late final for an already-delivered utterance must not replay its commands.
          guard end > self.consumedThrough + 0.02, start >= self.consumedThrough - 0.02 else { continue }
          let text = String(result.text.characters).trimmingCharacters(in: .whitespacesAndNewlines)
          guard !text.isEmpty else { continue }
          if result.isFinal { self.stable = self.join(self.stable, text); self.draft = "" }
          else { self.draft = text }
          self.latestEnd = max(self.latestEnd, end)
          self.onText(self.join(self.stable, self.draft), false, self.turnID)
          self.scheduleEndpoint()
        }
      } catch { if !Task.isCancelled { self?.reportFailure(error.localizedDescription) } }
    }
    detectorTask = Task { [weak self] in
      do {
        for try await result in detector.results {
          guard let self, !self.stopped, !Task.isCancelled else { return }
          self.speaking = result.speechDetected
          if self.speaking { self.endpointTask?.cancel(); self.endpointTask = nil }
          else { self.scheduleEndpoint() }
        }
      } catch { if !Task.isCancelled { self?.reportFailure(error.localizedDescription) } }
    }
    try await analyzer.prepareToAnalyze(in: target)
    try await analyzer.start(inputSequence: inputs)
    return sink
  }
  private func scheduleEndpoint() {
    guard !speaking, endpointTask == nil, !join(stable, draft).isEmpty else { return }
    endpointTask = Task { [weak self] in
      do { try await Task.sleep(for: .milliseconds(650)) } catch { return }
      guard let self, !self.stopped, !self.speaking, !Task.isCancelled else { return }
      self.endpointTask = nil
      let text = self.join(self.stable, self.draft)
      guard !text.isEmpty else { return }
      let id = self.turnID
      self.consumedThrough = self.latestEnd
      self.stable = ""; self.draft = ""; self.turnID = UUID().uuidString
      self.onText(text, true, id)
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
  private func join(_ a: String, _ b: String) -> String { [a, b].filter { !$0.isEmpty }.joined(separator: " ") }
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

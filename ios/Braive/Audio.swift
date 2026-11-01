import AVFoundation

@MainActor final class Audio: NSObject, AVSpeechSynthesizerDelegate {
  let speech = AVSpeechSynthesizer()
  let promptSpeech = AVSpeechSynthesizer()
  let measureSpeech = AVSpeechSynthesizer()
  let engine = AVAudioEngine()
  var players: [String: AVAudioPlayer] = [:]
  var ready = false
  var receivedAudioSeconds = 0.0
  var lastProgressAt = 0.0
  var onText: ((String, Bool, String) -> Void)?
  var onDisconnect: ((String) -> Void)?
  private var stopRecognition: (() -> Void)?
  var onStatus: ((String) -> Void)?
  private var tapped = false
  let captureStats = CaptureStats()
  var schedule = JSON()
  var activeLayers = Set<String>()
  var cueAssets: [String: String] = [:]
  var utteranceID: ObjectIdentifier?
  var narrated = false
  var finished: (() -> Void)?
  override init() {
    super.init()
    speech.delegate = self
  }
  func start(api: API) async throws {
    stopCapture()
    guard await AVAudioApplication.requestRecordPermission() else {
      throw NSError(domain: "Microphone", code: 1,
        userInfo: [NSLocalizedDescriptionKey: "Allow microphone access in Settings before starting practice."])
    }
    guard #available(iOS 26.0, *) else {
      throw NSError(domain: "LocalSpeech", code: 1,
        userInfo: [NSLocalizedDescriptionKey: "On-device voice practice requires iOS 26 or later."])
    }
    let session = AVAudioSession.sharedInstance()
    try session.setCategory(.playAndRecord, mode: .voiceChat,
      options: [.defaultToSpeaker, .allowBluetoothHFP])
    try session.setActive(true)
    let input = engine.inputNode
    try input.setVoiceProcessingEnabled(true)
    let format = input.outputFormat(forBus: 0)
    let recognition = LocalSpeech(onText: { [weak self] text, final, id in
      self?.onText?(text, final, id)
    }, onError: { [weak self] reason in
      self?.ready = false
      self?.onDisconnect?(reason)
    })
    stopRecognition = { recognition.stop() }
    let sink = try await recognition.prepare(inputFormat: format) { [weak self] message in
      self?.onStatus?(message)
    }
    let stats = captureStats
    stats.reset(sampleRate: format.sampleRate)
    input.installTap(onBus: 0, bufferSize: 1920, format: format) { buffer, _ in
      stats.input(buffer)
      sink.append(buffer)
    }
    tapped = true
    engine.prepare()
    try engine.start()
    ready = true
  }
  func stopCapture() {
    ready = false
    engine.stop()
    if tapped { engine.inputNode.removeTap(onBus: 0); tapped = false }
    stopRecognition?(); stopRecognition = nil
  }
  func fitIntro(_ text: String) async -> String {
    let duration = await measure(text)
    if duration <= 8 && duration > 0 { return text }
    let concise = "Practice your opening. To stop at any time, just say STOP!"
    _ = await measure(concise)
    return concise
  }
  private func measure(_ text: String) async -> Double {
    await withCheckedContinuation { continuation in
      let u = AVSpeechUtterance(string: text)
      u.voice = AVSpeechSynthesisVoice(language: "en-US")
      u.rate = 0.48
      let accumulator = SpeechDuration(continuation)
      measureSpeech.write(u) { buffer in accumulator.add(buffer) }
    }
  }
  func say(_ text: String, completion: (() -> Void)? = nil) {
    speech.stopSpeaking(at: .immediate)
    finished = completion
    narrated = true
    for p in players.values { p.volume *= 0.25 }
    let u = AVSpeechUtterance(string: text)
    u.voice = AVSpeechSynthesisVoice(language: "en-US")
    u.rate = 0.48
    utteranceID = ObjectIdentifier(u)
    speech.speak(u)
  }
  nonisolated func speechSynthesizer(
    _ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance
  ) {
    let id = ObjectIdentifier(utterance)
    Task { @MainActor [weak self] in
      guard let self, self.utteranceID == id else { return }
      self.speechFinished()
    }
  }
  func speechFinished() {
    narrated = false
    let f = finished
    finished = nil
    for p in players.values { p.volume = min(0.2, p.volume * 4) }
    f?()
  }
  func confirmQuit() {
    let utterance = AVSpeechUtterance(string: "Quit simulation?")
    promptSpeech.speak(utterance)
  }
  func pause() {
    speech.pauseSpeaking(at: .immediate)
    for p in players.values { p.pause() }
  }
  func resume() {
    promptSpeech.stopSpeaking(at: .immediate)
    speech.continueSpeaking()
    for p in players.values { p.play() }
  }
  func silence() {
    promptSpeech.stopSpeaking(at: .immediate)
    speech.stopSpeaking(at: .immediate)
    finished = nil
    for p in players.values { p.stop() }
    players = [:]
  }
  func play(_ name: String, loop: Bool = true, gain: Float = 0.14) {
    guard let url = Bundle.main.url(forResource: name, withExtension: "wav"),
      let p = try? AVAudioPlayer(contentsOf: url)
    else { return }
    p.numberOfLoops = loop ? -1 : 0
    p.volume = gain
    p.play()
    players[name] = p
  }
  func lobby() {
    silence()
    play("forest")
    play("piano", gain: 0.12)
  }
  func apply(_ plan: JSON) {
    for p in players.values { p.stop() }
    players = [:]
    activeLayers = []
    schedule = plan
    cueAssets = Dictionary(
      uniqueKeysWithValues: plan["layers"].list.map { ($0["id"].text, $0["asset_id"].text) })
    update(active: 0)
  }
  func cue(_ id: String) { if let asset = cueAssets[id] { play(asset, loop: false) } }
  func update(active: Double) {
    for l in schedule["layers"].list {
      let id = l["id"].text
      let asset = l["asset_id"].text
      let start = l["start_active_second"].value
      let end = l["end_active_second"].number ?? .infinity
      guard active >= start else { continue }
      if active >= end {
        players[asset]?.stop()
        continue
      }
      if activeLayers.insert(id).inserted {
        play(asset, loop: l["loop"].bool ?? true, gain: Float(l["gain"].value) * 0.3)
      }
      var gain = l["gain"].value
      for ramp in l["ramps"].list.sorted(by: {
        $0["at_active_second"].value < $1["at_active_second"].value
      }) {
        let at = ramp["at_active_second"].value
        guard active >= at else { continue }
        let blend = min(1, (active - at) / max(0.01, ramp["fade_seconds"].value))
        gain += (ramp["gain"].value - gain) * blend
      }
      players[asset]?.volume =
        Float(gain) * 0.3
        * (narrated ? Float(schedule["duck_gain_during_speech"].number ?? 0.25) : 1)
    }
  }
}

private final class SpeechDuration: @unchecked Sendable {
  private let lock = NSLock()
  private var seconds = 0.0
  private var completed = false
  private let continuation: CheckedContinuation<Double, Never>
  init(_ continuation: CheckedContinuation<Double, Never>) { self.continuation = continuation }
  func add(_ buffer: AVAudioBuffer) {
    lock.lock()
    defer { lock.unlock() }
    guard !completed, let pcm = buffer as? AVAudioPCMBuffer else { return }
    if pcm.frameLength == 0 {
      completed = true
      continuation.resume(returning: seconds)
    } else {
      seconds += Double(pcm.frameLength) / pcm.format.sampleRate
    }
  }
}

/// Numeric capture diagnostics only. No raw audio or recognized text is retained.
final class CaptureStats: @unchecked Sendable {
  private let lock = NSLock()
  private var started = 0.0, sampleRate = 0.0, inputFrames = 0.0, outputFrames = 0.0
  private var callbacks = 0, errors = 0, queuedBytes = 0, completedBytes = 0
  private var peak = 0.0
  private var lastError = ""
  func reset(sampleRate: Double) {
    lock.lock(); defer { lock.unlock() }
    started = ProcessInfo.processInfo.systemUptime
    self.sampleRate = sampleRate
    inputFrames = 0; outputFrames = 0; callbacks = 0; errors = 0; queuedBytes = 0; completedBytes = 0; peak = 0; lastError = ""
  }
  func input(_ buffer: AVAudioPCMBuffer) {
    var amplitude = 0.0
    if let channel = buffer.floatChannelData?[0] {
      for i in 0..<Int(buffer.frameLength) { amplitude = max(amplitude, Double(abs(channel[i]))) }
    }
    lock.lock(); defer { lock.unlock() }
    callbacks += 1; inputFrames += Double(buffer.frameLength); peak = amplitude
  }
  func queued(bytes: Int) { lock.lock(); queuedBytes += bytes; lock.unlock() }
  func completed(bytes: Int) { lock.lock(); completedBytes += bytes; lock.unlock() }
  func output(frames: AVAudioFrameCount) {
    lock.lock(); defer { lock.unlock() }
    outputFrames += Double(frames)
  }
  func conversionFailed(_ reason: String) {
    lock.lock(); defer { lock.unlock() }
    errors += 1; lastError = reason
  }
  func snapshot(engineRunning: Bool) -> [String: Any] {
    lock.lock(); defer { lock.unlock() }
    return ["wall_seconds": ProcessInfo.processInfo.systemUptime - started,
      "input_sample_rate": sampleRate, "input_seconds": inputFrames / max(1, sampleRate),
      "output_seconds": outputFrames / 24000, "callbacks": callbacks,
      "conversion_errors": errors, "last_error": lastError, "peak": peak,
      "engine_running": engineRunning, "queued_audio_seconds": Double(queuedBytes) / 48000,
      "completed_audio_seconds": Double(completedBytes) / 48000]
  }
}

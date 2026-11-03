import AVFoundation

@MainActor final class Audio: NSObject, AVSpeechSynthesizerDelegate {
  let speech = AVSpeechSynthesizer()
  let promptSpeech = AVSpeechSynthesizer()
  let measureSpeech = AVSpeechSynthesizer()
  private let previewSpeech = AVSpeechSynthesizer()
  private var introVoice: AVSpeechSynthesisVoice?
  let engine = AVAudioEngine()
  var players: [String: AVAudioPlayer] = [:]
  private var gains: [String: Float] = [:]
  private func refreshGains() {
    let duck = Float(schedule["duck_gain_during_speech"].number ?? 0.25)
    for (key, player) in players { player.volume = (gains[key] ?? 0) * (narrated ? duck : 1) }
  }
  private var pausedPlayers = Set<String>()
  var ready = false
  var receivedAudioSeconds = 0.0
  var lastProgressAt = 0.0
  var onText: ((String, Bool, String) -> Void)?
  var onActivity: ((Bool) -> Void)?
  var onDisconnect: ((String) -> Void)?
  private var stopRecognition: (() -> Void)?
  private var updateRecognitionContext: (([String]) -> Void)?
  private var discardRecognition: ((Double) -> Void)?
  private var confirmationID: ObjectIdentifier?
  private var confirmationFinished: (() -> Void)?
  private var spokenText = "", confirmationText = ""
  private var playbackEndedAt = -Double.infinity
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
    promptSpeech.delegate = self
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
      guard let self else { return }
      let playbackActive = self.narrated || self.promptSpeech.isSpeaking || ProcessInfo.processInfo.systemUptime - self.playbackEndedAt < 0.8
      if playbackActive && [self.spokenText,self.confirmationText].contains(where: { SpokenEcho.matches(text,spoken:$0) }) { return }
      self.onText?(text, final, id)
    }, onError: { [weak self] reason in
      self?.ready = false
      self?.onDisconnect?(reason)
    }, onActivity: { [weak self] speaking in self?.onActivity?(speaking) })
    stopRecognition = { recognition.stop() }
    updateRecognitionContext = { phrases in Task { await recognition.setCommandPhrases(phrases) } }
    discardRecognition = { tail in recognition.discardPending(tail: tail) }
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
    updateRecognitionContext = nil
    discardRecognition = nil
  }
  func setCommandPhrases(_ phrases: [String]) { updateRecognitionContext?(phrases) }
  func fitIntro(_ text: String) async throws -> String {
    introVoice = SpeechVoice.selected
    let duration = await measure(text, voice: introVoice)
    if duration <= 8 && duration > 0 { return text }
    // Keep this neutral across action and conversation experiences.
    let concise = "Your practice is ready. To stop at any time, just say STOP!"
    let fallbackDuration = await measure(concise, voice: introVoice)
    guard fallbackDuration > 0 && fallbackDuration <= 8 else {
      throw NSError(domain: "Intro", code: 1, userInfo: [NSLocalizedDescriptionKey:
        "The selected voice cannot fit the introduction into eight seconds. Choose another voice and retry."])
    }
    return concise
  }
  private func measure(_ text: String, voice: AVSpeechSynthesisVoice?) async -> Double {
    await withCheckedContinuation { continuation in
      let u = SpeechVoice.utterance(text, voice: voice)
      let accumulator = SpeechDuration(continuation)
      measureSpeech.write(u) { buffer in accumulator.add(buffer) }
    }
  }
  func say(_ text: String, intro: Bool = false, completion: (() -> Void)? = nil) {
    speech.stopSpeaking(at: .immediate)
    finished = completion
    narrated = true
    spokenText = text
    refreshGains()
    let u = SpeechVoice.utterance(text, voice: intro ? introVoice : SpeechVoice.selected)
    utteranceID = ObjectIdentifier(u)
    speech.speak(u)
  }
  nonisolated func speechSynthesizer(
    _ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance
  ) {
    let id = ObjectIdentifier(utterance)
    Task { @MainActor [weak self] in
      if let self, self.confirmationID == id {
        self.confirmationID = nil
        self.playbackEndedAt = ProcessInfo.processInfo.systemUptime
        self.discardRecognition?(0.35)
        let completion = self.confirmationFinished; self.confirmationFinished = nil; completion?()
        return
      }
      guard let self, self.utteranceID == id else { return }
      self.speechFinished()
    }
  }
  func speechFinished() {
    narrated = false
    playbackEndedAt = ProcessInfo.processInfo.systemUptime
    let f = finished
    finished = nil
    refreshGains()
    f?()
  }
  func interruptSpeech() {
    guard narrated || speech.isSpeaking else { return }
    utteranceID = nil
    speech.stopSpeaking(at: .immediate)
    speechFinished()
  }
  func confirmQuit(completion: @escaping () -> Void) {
    promptSpeech.stopSpeaking(at: .immediate)
    discardRecognition?(0)
    confirmationText = "Practice paused. Would you like to end it?"
    let utterance = SpeechVoice.utterance(confirmationText)
    confirmationID = ObjectIdentifier(utterance); confirmationFinished = completion
    promptSpeech.speak(utterance)
  }
  func previewVoice(using voice: AVSpeechSynthesisVoice?) throws {
    // Settings can open before voice capture has configured an audio session.
    // Playback must remain audible with the phone's silent switch enabled.
    if !engine.isRunning {
      let session = AVAudioSession.sharedInstance()
      try session.setCategory(.playback, mode: .default)
      try session.setActive(true)
    }
    previewSpeech.stopSpeaking(at: .immediate)
    previewSpeech.speak(SpeechVoice.utterance("Take your time. We’ll practice this together, one step at a time.", voice: voice))
  }
  func stopVoicePreview() { previewSpeech.stopSpeaking(at: .immediate) }
  func pause() {
    speech.pauseSpeaking(at: .immediate)
    pausedPlayers = Set(players.filter { $0.value.isPlaying }.map(\.key))
    for p in players.values { p.pause() }
  }
  func resume() {
    confirmationID = nil; confirmationFinished = nil
    promptSpeech.stopSpeaking(at: .immediate)
    speech.continueSpeaking()
    for key in pausedPlayers { players[key]?.play() }
    pausedPlayers = []
  }
  func silence() {
    confirmationID = nil; confirmationFinished = nil
    stopVoicePreview()
    utteranceID = nil
    narrated = false
    promptSpeech.stopSpeaking(at: .immediate)
    speech.stopSpeaking(at: .immediate)
    finished = nil
    for p in players.values { p.stop() }
    players = [:]
    gains = [:]
    pausedPlayers = []
  }
  func play(_ name: String, loop: Bool = true, gain: Float = 0.14, key: String? = nil, offset: Double = 0) {
    guard let url = Bundle.main.url(forResource: name, withExtension: "wav"),
      let p = try? AVAudioPlayer(contentsOf: url)
    else { return }
    p.numberOfLoops = loop ? -1 : 0
    p.volume = gain
    if offset > 0, p.duration > 0 {
      if !loop && offset >= p.duration { return }
      p.currentTime = loop ? offset.truncatingRemainder(dividingBy:p.duration) : offset
    }
    p.play()
    players[key ?? name]?.stop()
    players[key ?? name] = p
    gains[key ?? name] = gain
    refreshGains()
  }
  func lobby() {
    silence()
    play("forest")
    play("piano", gain: 0.12)
  }
  func apply(_ plan: JSON, active: Double = 0) {
    for p in players.values { p.stop() }
    players = [:]
    gains = [:]
    activeLayers = []
    schedule = plan
    cueAssets = [:]
    // Defensive even for old saved output: never trap on duplicate IDs.
    for layer in plan["layers"].list {
      guard cueAssets[layer["id"].text] == nil else { continue }
      cueAssets[layer["id"].text] = layer["asset_id"].text
    }
    update(active: active)
  }
  func cue(_ id: String) { if let asset = cueAssets[id] { play(asset, loop: false, key: "cue:" + id) } }
  func update(active: Double) {
    for l in schedule["layers"].list {
      let id = l["id"].text
      let asset = l["asset_id"].text
      let start = l["start_active_second"].value
      let end = l["end_active_second"].number ?? .infinity
      guard active >= start else { continue }
      if active >= end {
        players.removeValue(forKey: "layer:" + id)?.stop()
        gains.removeValue(forKey: "layer:" + id)
        continue
      }
      if activeLayers.insert(id).inserted {
        play(asset, loop: l["loop"].bool ?? true, gain: Float(l["gain"].value) * 0.3, key: "layer:" + id, offset: max(0, active - start))
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
      gains["layer:" + id] = Float(gain) * 0.3
    }
    refreshGains()
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

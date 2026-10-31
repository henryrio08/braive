import AVFoundation

@MainActor final class Audio: NSObject, AVSpeechSynthesizerDelegate {
  let speech = AVSpeechSynthesizer()
  let promptSpeech = AVSpeechSynthesizer()
  let measureSpeech = AVSpeechSynthesizer()
  let engine = AVAudioEngine()
  var players: [String: AVAudioPlayer] = [:]
  var socket: URLSessionWebSocketTask?
  var ready = false
  var onText: ((String, Bool, String) -> Void)?
  var onDisconnect: (() -> Void)?
  private var converter: AVAudioConverter?
  private var tapped = false
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
    guard await AVAudioApplication.requestRecordPermission() else {
      throw NSError(
        domain: "Microphone", code: 1,
        userInfo: [
          NSLocalizedDescriptionKey:
            "Allow microphone access in Settings before placing the phone in the viewer."
        ])
    }
    let session = AVAudioSession.sharedInstance()
    try session.setCategory(
      .playAndRecord, mode: .voiceChat, options: [.defaultToSpeaker, .allowBluetoothHFP])
    try session.setActive(true)
    var url = URLComponents(string: api.base)!
    url.scheme = url.scheme == "https" ? "wss" : "ws"
    url.path = "/v1/transcribe"
    var request = URLRequest(url: url.url!)
    request.setValue("Bearer \(api.token)", forHTTPHeaderField: "Authorization")
    let task = URLSession.shared.webSocketTask(with: request)
    socket = task
    task.resume()
    Task { await receive(task) }
    let input = engine.inputNode
    try input.setVoiceProcessingEnabled(true)
    let format = input.outputFormat(forBus: 0)
    let target = AVAudioFormat(
      commonFormat: .pcmFormatInt16, sampleRate: 24000, channels: 1, interleaved: true)!
    converter = AVAudioConverter(from: format, to: target)
    if tapped { input.removeTap(onBus: 0) }
    input.installTap(onBus: 0, bufferSize: 1920, format: format) { [weak self] buffer, _ in
      // Audio buffers remain on the realtime callback; conversion runs synchronously before release.
      guard let converter = self?.converter,
        let pcm = AVAudioPCMBuffer(
          pcmFormat: target,
          frameCapacity: AVAudioFrameCount(
            Double(buffer.frameLength) * 24000 / format.sampleRate + 32))
      else { return }
      var supplied = false
      var error: NSError?
      converter.convert(to: pcm, error: &error) { _, status in
        if supplied {
          status.pointee = .noDataNow
          return nil
        }
        supplied = true
        status.pointee = .haveData
        return buffer
      }
      guard error == nil, let bytes = pcm.int16ChannelData else { return }
      let data = Data(bytes: bytes[0], count: Int(pcm.frameLength) * 2)
      Task { @MainActor [weak self] in
        guard let self, self.ready else { return }
        do { try await task.send(.data(data)) } catch {
          self.ready = false
          self.onDisconnect?()
        }
      }
    }
    tapped = true
    engine.prepare()
    try engine.start()
  }
  func receive(_ task: URLSessionWebSocketTask) async {
    do {
      while task === socket {
        let message = try await task.receive()
        let data: Data
        switch message {
        case .data(let d): data = d
        case .string(let s): data = Data(s.utf8)
        @unknown default: continue
        }
        guard let j = try? JSONDecoder().decode(JSON.self, from: data) else { continue }
        if j["sessionId"].string != nil && j["type"].string == nil { ready = true }
        if ["transcript", "speechComplete"].contains(j["type"].text) {
          onText?(
            j["transcript"].text, j["type"].text == "speechComplete", String(j["turnId"].value))
        }
        if j["type"].text == "error" {
          ready = false
          onDisconnect?()
        }
      }
    } catch {
      if task === socket {
        ready = false
        onDisconnect?()
      }
    }
  }
  func stopCapture() {
    ready = false
    socket?.cancel(with: .normalClosure, reason: nil)
    socket = nil
    engine.stop()
    if tapped {
      engine.inputNode.removeTap(onBus: 0)
      tapped = false
    }
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

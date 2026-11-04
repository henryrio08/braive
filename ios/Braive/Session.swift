import AVFoundation
import Combine
import SwiftUI

@MainActor final class Session: ObservableObject {
  enum Phase: String {
    case setup, lobby, headset, intake, ability, history, planning, intro, reveal, active,
      selfReport, readiness, reflectionPrompt, reflection, feedbackPrompt, feedback, saving,
      repeatPrompt, error
  }
  @Published var phase: Phase = .setup
  @Published var message = "Welcome to Braive"
  @Published var transcript = ""
  @Published var pauses = Set<String>()
  @Published var headsetReady = false
  @Published var loading = false
  @Published var launching = true
  @Published var loadingTip = TipBank.all[0].text
  private var tips = LoadingTips(.launch)
  private var launchRemaining = 1.2
  @Published var remaining = 0.0
  @Published var reveal = 0.0
  var revealFadeProgress: Double { revealProgress("fade_seconds") }
  var revealBlurProgress: Double { revealProgress("blur_to_clear_seconds") }
  private func revealProgress(_ key: String) -> Double {
    let fade = scene["reveal"]["fade_seconds"].number ?? 1.5
    let blur = scene["reveal"]["blur_to_clear_seconds"].number ?? 1.5
    return min(1, reveal * max(fade, blur) / max(0.1, scene["reveal"][key].number ?? 1.5))
  }
  @Published var connection = "Not connected"
  @Published var server =
    UserDefaults.standard.string(forKey: "server") ?? ""
  @Published var token = UserDefaults.standard.string(forKey: "token") ?? ""
  @Published var remoteConsent = false
  @Published var liveEnabled = false
  @Published var connecting = false
  @Published var voiceListening = false
  @Published var speechFeedback = ""
  @Published var voicePreviewStatus = ""
  private var speechFeedbackExpiresAt = 0.0
  @Published var setupNotice = ""
  @Published var scenarioActions: [String] = []
  var isSpeaking: Bool { audio.narrated || audio.speech.isSpeaking || audio.promptSpeech.isSpeaking }
  @Published var characterReplyPending = false
  var scenario: ScenarioRuntime?
  var scenarioCompletedAt: Double?
  var appliedOperations: [JSON] = []
  var lastCheckpoint = -Double.infinity
  var pendingRecovery: JSON?
  func requestRecovery() {
    guard let saved = store.recoverable else { audio.say("There is no interrupted practice to resume."); return }
    pendingRecovery = saved
    go(.headset, "An interrupted practice is saved. Look forward and say yes to resume from its saved position.")
  }
  func checkpoint(force: Bool = false) {
    guard phase == .active, record.object != nil, force || active - lastCheckpoint >= 5 else { return }
    lastCheckpoint = active
    do {
      let scenarioState = try scenario.map { try JSONDecoder().decode(JSON.self,from:JSONEncoder().encode($0.snapshot)) } ?? JSON()
      record["checkpoint"] = JSON(["version":1,"world":world.checkpoint().raw,"scenario":scenarioState.raw,
        "fired":Array(fired),"beats":Array(beatFired),"terminal_at":scenarioCompletedAt as Any? ?? NSNull(),
        "fear":fear,"ability":ability,"use_history":useHistory,
        "history_ids":useHistory ? history.map { $0["session_id"].text } : []])
      record["render_metrics"] = world.metrics.report
      record["active_seconds"] = JSON(active); record["stop_count"] = JSON(stopCount)
      record["observations"] = JSON(observations); record["turns"] = JSON(turns)
      record["applied_operations"] = JSON(appliedOperations.map(\.raw))
      try store.save(record,rebuild:false)
    } catch { setupNotice = "Practice checkpoint could not be saved: " + error.localizedDescription }
  }
  func restorePractice(_ saved: JSON) throws {
    guard saved["checkpoint"]["version"].value == 1 else { throw world.failure("Saved practice version is unsupported") }
    newSession()
    record=saved;plan=saved["plan"];scene=saved["scene"];audioPlan=saved["audio"]
    sessionID=saved["session_id"].text; revision=Int(saved["scene_revision"].value)
    try world.load(scene,plan:plan)
    let definition=try JSONDecoder().decode(ScenarioDefinition.self,from:JSONEncoder().encode(scene["scenario"]))
    scenario=try ScenarioRuntime(definition)
    try scenario?.restore(JSONDecoder().decode(ScenarioRuntime.Snapshot.self,from:JSONEncoder().encode(saved["checkpoint"]["scenario"])))
    appliedOperations=saved["applied_operations"].list
    // Motion is restored from its exact clock/origin snapshot, not restarted by
    // replaying old travel commands against the initial viewer position.
    for op in appliedOperations where ["set_visible","set_material","character_action","set_environment"].contains(op["type"].text) {
      world.operation(op,speak:{ _ in },sound:{ _ in })
    }
    try world.restore(saved["checkpoint"]["world"])
    active=world.activeElapsed;remaining=max(0,plan["duration_sec"].value-active)
    fired=Set(saved["checkpoint"]["fired"].list.map { Int($0.value) });beatFired=Set(saved["checkpoint"]["beats"].list.map { Int($0.value) })
    scenarioCompletedAt=saved["checkpoint"]["terminal_at"].number
    fear=saved["checkpoint"]["fear"].text;ability=saved["checkpoint"]["ability"].text
    useHistory=saved["checkpoint"]["use_history"].bool ?? false;parent=saved["parent_session_id"].string
    let authorizedIDs = Set(saved["checkpoint"]["history_ids"].list.map(\.text))
    history = useHistory ? store.records.filter { authorizedIDs.contains($0["session_id"].text) } : []
    observations=saved["observations"].list.map(\.raw);turns=saved["turns"].list.map(\.raw);stopCount=Int(saved["stop_count"].value)
    phase = .active;loading=false;pendingPhase=nil;intakeApproved=true;record["outcome"]=JSON("running")
    message=scenario?.step.prompt ?? plan["task_instruction"].text
    audio.setCommandPhrases(definition.steps.flatMap { $0.actions.flatMap(\.phrases) })
    audio.apply(audioPlan,active:active)
    world.scene.isPaused = !pauses.isEmpty
    if pauses.isEmpty { world.resumePracticeClock() } else { audio.pause() }
    checkpoint(force:true)
  }
  var feedbackTask: Task<Void, Never>?
  var feedbackNonce = UUID()
  var pendingPostSave: (() -> Void)?
  func cancelFeedback() { feedbackTask?.cancel(); feedbackTask = nil; feedbackNonce = UUID() }
  let world = World(), audio = Audio()
  let store: SessionStore = {
    #if DEBUG
    if ProcessInfo.processInfo.arguments.contains("--post-session-audit") {
      return SessionStore(root: FileManager.default.temporaryDirectory.appendingPathComponent("PostSessionAudit-" + UUID().uuidString))
    }
    #endif
    return SessionStore()
  }()
  var api: API { API(base: server.trimmingCharacters(in: .whitespacesAndNewlines), token: token) }
  var plan = JSON(), scene = JSON(), audioPlan = JSON(), record = JSON(), reflection = JSON()
  var observations: [Any] = []
  var sessionID = UUID().uuidString
  var revision = 0
  var generation: Task<Void, Never>?
  var jobID = ""
  var seen = Set<String>()
  var fear = "", ability = "", additions: [String] = [], history: [JSON] = []
  var answer = VoiceAnswer()
  var reflectionDraft = SpokenReflection()
  var intakeApproved = false
  var repeatAfterHeadset = false
  var adapting = false
  var useHistory = false
  var parent: String?
  var builder = false
  var active = 0.0, lastTick = ProcessInfo.processInfo.systemUptime, introTime = 0.0, stopCount = 0
  var fired = Set<Int>(), beatFired = Set<Int>()
  var turns: [Any] = []
  var turnTask: Task<Void, Never>?
  var turnNonce = UUID()
  var speechFloor = SpeechFloor()
  var stopConfirmation = StopConfirmation()
  var narration = NarrationQueue()
  var outcome = "completed"
  var generationDeadline = 0.0
  var timer: AnyCancellable?
  var transitionID = UUID()
  var interrupted = false
  var transitionRemaining = 0.0
  var pendingPhase: Phase?
  var pendingText = ""
  var adaptation = JSON()
  init() {
    let pairingURL = store.root.appendingPathComponent("LocalPairing.json")
    if let data = try? Data(contentsOf: pairingURL),
      let config = try? JSONDecoder().decode(JSON.self, from: data)
    {
      if !config["server"].text.isEmpty {
        server = config["server"].text
        UserDefaults.standard.set(server, forKey: "server")
      }
      if !config["token"].text.isEmpty {
        token = config["token"].text
        UserDefaults.standard.set(token, forKey: "token")
      }
      try? FileManager.default.removeItem(at: pairingURL)
    }
    world.onRuntimeIssue = { [weak self] reason in
      guard let self else { return }
      self.world.pausePracticeClock();self.world.scene.isPaused=true
      self.fail(self.world.failure(reason))
    }
    world.onPortrait = { [weak self] portrait in self?.pause("portrait", enabled: portrait) }
    world.onTrackingAvailability = { [weak self] available in
      self?.pause("tracking_unavailable", enabled: !available)
    }
    audio.onStatus = { [weak self] status in self?.setupNotice = status }
    audio.onText = { [weak self] text, final, id in self?.heard(text, final: final, id: id) }
    audio.onActivity = { [weak self] speaking in
      self?.speechFloor.detect(speaking, now: ProcessInfo.processInfo.systemUptime)
      self?.speechFeedback = speaking ? "Hearing you…" : "Finishing your words…"
      self?.speechFeedbackExpiresAt = ProcessInfo.processInfo.systemUptime + (speaking ? 5 : 2)
    }
    audio.onDisconnect = { [weak self] reason in
      self?.connection = "Voice disconnected: " + reason
      self?.pause("command_channel_unavailable", enabled: true)
    }
    timer = Timer.publish(every: 0.05, on: .main, in: .common).autoconnect().sink { [weak self] _ in
      self?.tick()
    }
    #if DEBUG
    if ProcessInfo.processInfo.arguments.contains("--appearance-audit") {
      preview();audio.silence()
      do { try AppearanceAudit.run(to:store.root.appendingPathComponent("AppearanceReview")) }
      catch { message="Appearance review failed: "+error.localizedDescription }
    }
    #endif
    if ProcessInfo.processInfo.arguments.contains("--asset-audit") {
      preview()
      do {
        let count = try world.auditAssets()
        message =
          "Offline GLB audit passed: \(count) manifest assets; neutral skin and isolated bones verified"
      } catch { message = "Offline GLB audit failed: " + error.localizedDescription }
    }
    if ProcessInfo.processInfo.arguments.contains("--preflight-audit") {
      preview()
      do {
        try PreflightAudit.run(world)
        message = "Offline preflight audit passed — no generated practice or Meta calls"
        try? JSONEncoder().encode(JSON(["status":"passed"])).write(to:store.root.appendingPathComponent("PreflightAudit.json"),options:.atomic)
      } catch {
        message = "Offline preflight audit failed: " + error.localizedDescription
        try? JSONEncoder().encode(JSON(["status":"failed","error":error.localizedDescription])).write(to:store.root.appendingPathComponent("PreflightAudit.json"),options:.atomic)
      }
    }
    if ProcessInfo.processInfo.arguments.contains("--generated-audit") {
      preview()
      do {
        guard let url = Bundle.main.url(forResource: "generated-session", withExtension: "json")
        else {
          throw NSError(
            domain: "Review", code: 1,
            userInfo: [
              NSLocalizedDescriptionKey: "No local generated output was bundled for review"
            ])
        }
        let job = try JSONDecoder().decode(JSON.self, from: Data(contentsOf: url))
        let result = job["result"]
        try world.load(result["scene"], plan: result["plan"])
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--render-scenario-review") {
          try world.renderScenarioReview(result["scene"], to: store.root.appendingPathComponent("ScenarioReview"))
        }
        #endif
        message = "Generated-scene replay — native preflight passed; no live model calls"
      } catch {
        message = "Generated scene rejected by native preflight: " + error.localizedDescription
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--render-scenario-review") {
          let folder = store.root.appendingPathComponent("ScenarioReview")
          try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
          try? JSONEncoder().encode(JSON(["status":"failed","error":error.localizedDescription])).write(to: folder.appendingPathComponent("result.json"))
        }
        #endif
      }
    }
    NotificationCenter.default.addObserver(
      forName: AVAudioSession.interruptionNotification, object: nil, queue: .main
    ) { [weak self] n in Task { @MainActor in self?.pause("audio_interruption", enabled: true) } }
    #if DEBUG
    if ProcessInfo.processInfo.arguments.contains("--character-review") {
      preview(); audio.silence()
      do { try world.renderCharacterReview(to: store.root.appendingPathComponent("CharacterReview")) }
      catch {
        let folder = store.root.appendingPathComponent("CharacterReview")
        try? FileManager.default.createDirectory(at:folder,withIntermediateDirectories:true)
        try? JSONEncoder().encode(JSON(["status":"failed","error":error.localizedDescription])).write(to:folder.appendingPathComponent("result.json"))
      }
    }
    if ProcessInfo.processInfo.arguments.contains("--hud-layout-review") {
      let savedPhase = phase, savedMessage = message
      var copies: [(String, HeadsetCopy)] = []
      for next: Phase in [.intake, .intro, .active, .feedback, .error] {
        phase = next
        message = String(repeating: "Follow the marked path to the gathering point, then choose the next action when you are ready. ", count: 12)
        copies.append((next.rawValue, headsetCopy))
      }
      for context in TipContext.allCases {
        for tip in TipBank.matching(context) {
          copies.append(("tip-" + tip.id, HeadsetCopy(title: "Shaping your practice…", detail: tip.text, hint: "STOP to pause")))
        }
      }
      phase = savedPhase; message = savedMessage
      try? HeadsetHUD.renderReview(copies, to: store.root.appendingPathComponent("HUDReview"))
    }
    #endif
    #if DEBUG
    if ProcessInfo.processInfo.arguments.contains("--post-session-audit") { runPostSessionAudit() }
    #endif
  }
  func preview() {
    headsetReady = true
    phase = .lobby
    connection = "Offline forest preview — no Meta calls"
    message =
      "Forest preview. Use Settings to calibrate. Live practice requires connection and approved Meta use."
    world.lobby()
    audio.lobby()
  }
  func connect() {
    guard !connecting, !audio.ready else { return }
    guard remoteConsent, liveEnabled else {
      setupNotice = "Allow speech processing to begin voice practice."
      return
    }
    UserDefaults.standard.set(server, forKey: "server")
    UserDefaults.standard.set(token, forKey: "token")
    setupNotice = ""
    connecting = true
    Task {
      defer { connecting = false }
      do {
        connection = "Checking your connection…"
        do {
          try await api.checkConnection()
        } catch {
          let failure = error as NSError
          let detail: String
          if server.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            detail = "Open Settings → Connection setup to connect this phone to the practice computer. You’ll need its address and pairing code."
          } else if failure.domain == "Braive" && failure.code == 401 {
            detail = "The pairing code doesn’t match. Check it in Settings → Connection setup."
          } else if failure.domain == "Braive" && failure.code == 404 {
            detail = "The phone and practice computer need the same Braive update. Update both, then reconnect."
          } else {
            detail = "We couldn’t reach the practice computer. Check that both devices are connected and check Connection setup in Settings."
          }
          throw NSError(domain: "BraiveConnection", code: 1, userInfo: [
            NSLocalizedDescriptionKey: detail
          ])
        }
        connection = "Connected · Getting voice ready…"
        try await audio.start(api: api)
        setupNotice = ""
        connection = "Connected · Voice ready"
        go(.lobby, "When you’re ready to start, say START!")
        headsetReady = false
        world.scene.isPaused = !pauses.isEmpty
        audio.lobby()
      } catch {
        audio.stopCapture()
        phase = .setup
        loading = false
        pendingPhase = nil
        connection = "Not connected"
        print("[practice connection] \(error.localizedDescription)")
        setupNotice = (error as NSError).domain == "BraiveConnection" ? error.localizedDescription : "Voice couldn’t start. Check microphone and speech access in iPhone Settings, then try again."
      }
    }
  }
  func reconnect() {
    guard !connecting else { return }
    connecting = true
    audio.stopCapture()
    Task {
      defer { connecting = false }
      do {
        try await api.checkConnection()
        try await audio.start(api: api)
        audio.setCommandPhrases(scenario?.definition.steps.flatMap { $0.actions.flatMap(\.phrases) } ?? [])
        pause("command_channel_unavailable", enabled: false)
        pause("audio_interruption", enabled: false)
      } catch { message = error.localizedDescription }
    }
  }
  func pause(_ reason: String, enabled: Bool) {
    if phase == .setup { pauses.remove(reason); return }
    let was = pauses.isEmpty
    if enabled { pauses.insert(reason) } else { pauses.remove(reason) }
    if was && !pauses.isEmpty {
      speechFloor = SpeechFloor()
      world.pausePracticeClock()
      active = world.activeElapsed
      checkpoint(force:true)
      world.scene.isPaused = true
      audio.pause()
    } else if !was && pauses.isEmpty {
      world.scene.isPaused = false
      if phase == .active { world.resumePracticeClock() }
      audio.resume()
      lastTick = ProcessInfo.processInfo.systemUptime
    }
  }
  var canStop: Bool {
    [.planning, .intro, .reveal, .active].contains(phase) || (loading && pendingPhase == .planning)
  }
  func stop() {
    guard canStop else { return }
    guard !pauses.contains("user_stop") else { return }
    stopCount += 1
    stopConfirmation.begin()
    pause("user_stop", enabled: true)
    audio.confirmQuit { self.stopConfirmation.arm(at: ProcessInfo.processInfo.systemUptime + 0.35) }
  }
  func confirmStop(end: Bool) {
    guard pauses.contains("user_stop") else { return }
    stopConfirmation.begin()
    if end { pauses.remove("user_stop"); finish(early:true) }
    else { pause("user_stop",enabled:false) }
  }
  func go(_ next: Phase, _ text: String) {
    if next == .headset { headsetReady = false }
    beginTips(for: next)
    transitionID = UUID()
    loading = true
    transitionRemaining = 0.45
    pendingPhase = next
    pendingText = text
    audio.play("whoosh", loop: false, gain: 0.15)
    message = next == .planning ? "To stop at any time, just say STOP!" : text

  }
  func beginTips(for destination: Phase) {
    let context: TipContext
    switch destination {
    case .setup: context = .launch
    case .lobby: context = .lobby
    case .headset: context = .headset
    case .intake: context = .intake
    case .ability: context = .ability
    case .history: context = .history
    case .planning, .intro, .reveal, .active: context = .planning
    case .selfReport, .readiness: context = .selfReport
    case .reflectionPrompt, .reflection: context = .reflection
    case .feedbackPrompt, .feedback: context = .feedback
    case .saving: context = .saving
    case .repeatPrompt: context = .repeatPractice
    case .error: context = .lobby
    }
    tips = LoadingTips(context)
    loadingTip = tips.current.text
  }
  func heard(_ text: String, final: Bool, id: String) {
    if pauses.contains("phone_controls") {
      // Consume partial IDs too, so a delayed final from voice preview cannot replay on dismissal.
      seen.insert(id)
      return
    }
    transcript = text
    speechFeedback = final ? "Got it" : "Hearing your words…"
    speechFeedbackExpiresAt = ProcessInfo.processInfo.systemUptime + (final ? 1.5 : 3)
    let words = text.lowercased().split(whereSeparator: { !$0.isLetter }).map(String.init)
    // Conservative STOP works on partials. Device voice processing handles playback echo; verify in goggles.
    if canStop && words.contains("stop") {
      stop()
      return
    }
    if phase == .active && pauses.isEmpty && !seen.contains(id) {
      speechFloor.receive(final: final, now: ProcessInfo.processInfo.systemUptime)
      if !final { audio.interruptSpeech() }
    }
    guard final else { return }
    guard seen.insert(id).inserted else { return }
    if pauses.contains("user_stop") {
      if let answer = stopConfirmation.answer(text,at:ProcessInfo.processInfo.systemUptime) { confirmStop(end:answer == .end) }
      return
    }
    guard pauses.isEmpty, !loading, !adapting else { return }
    let yes = VoiceAnswer.binary(text) == true
    let no = VoiceAnswer.binary(text) == false
    if phase == .planning {
      if builder {
        collectAnswer(text)
      } else if text.lowercased().contains("hey builder") {
        // A scene must not reveal while the user is still adding details.
        generation?.cancel()
        revision += 1
        let old = jobID, api = api
        jobID = ""
        if !old.isEmpty { Task { _ = try? await api.call("/v1/jobs/" + old, method: "DELETE") } }
        builder = true
        answer = VoiceAnswer()
        message = builderPrompt
        audio.say(builderPrompt)
      }
      return
    }
    switch phase {
    case .lobby:
      if VoiceAnswer.normalized(text) == "resume practice" { requestRecovery(); return }
      if words.contains("start") {
        repeatAfterHeadset = false
        go(.headset, headsetPrompt)
      }
    case .headset:
      if VoiceAnswer.confirmsHeadset(text) {
        guard world.trackingAvailable else {
          pause("tracking_unavailable", enabled: true)
          return
        }
        world.recenter()
        headsetReady = true
        if let saved = pendingRecovery {
          pendingRecovery=nil
          do { try restorePractice(saved) } catch { fail(error) }
          return
        }
        world.lobby()
        world.scene.isPaused = !pauses.isEmpty
        if repeatAfterHeadset { adapt() }
        else {
          newSession()
          go(.intake, intakePrompt)
        }
      }
    case .intake, .ability: collectAnswer(text)
    case .history:
      if yes || no {
        useHistory = yes
        generate()
      }
    case .active: perform(text)
    case .selfReport:
      guard acceptRating(text, key: "reported_difficulty") else { return }
      persistPostSession { [weak self] in self?.go(.readiness, "How ready do you feel now, from zero to ten? You can skip.") }
    case .readiness:
      guard acceptRating(text, key: "reported_readiness") else { return }
      persistPostSession { [weak self] in self?.go(.reflectionPrompt, "Would you like to save a spoken reflection?") }
    case .reflectionPrompt:
      if yes {
        reflectionDraft = SpokenReflection()
        go(.reflection, "Share your reflection. Say save reflection when you’re finished, or skip to leave it.")
      } else if no {
        go(.feedbackPrompt, "Would you like to hear feedback on your experience?")
      }
    case .reflection:
      switch reflectionDraft.receive(text) {
      case .save(let content):
        do {
          reflection = try store.reflection(
            content, topic: plan["topic_short"].text)
          reflection["session_id"] = JSON(sessionID)
          reflection["topic"] = plan["topic"]
          record["reflection"] = reflection
          record["reflection_id"] = reflection["id"]
          record["reflection_file"] = reflection["relative_file_path"]
          persistPostSession { [weak self] in self?.go(.feedbackPrompt, "Would you like to hear feedback on your experience?") }
        } catch {
          message = "Your reflection couldn’t be saved. Say SAVE REFLECTION to try again, or SKIP."
          audio.say(message)
        }
      case .empty:
        message = "Share a reflection first, then say save reflection. Or say skip to leave it."
        audio.say(message)
      case .skip:
        go(.feedbackPrompt, "Would you like to hear feedback on your experience?")
      case .listening: break
      }
    case .feedbackPrompt: if yes { feedback() } else if no { save() }
    case .feedback: if yes || text.lowercased().contains("continue") { save() }
    case .repeatPrompt:
      if yes {
        repeatAfterHeadset = true
        go(.headset, headsetPrompt)
      } else if no {
        world.lobby()
        world.scene.isPaused = !pauses.isEmpty
        audio.lobby()
        go(.lobby, "When you’re ready to start, say START!")
      }
    case .error:
      if let retry = pendingPostSave {
        if VoiceAnswer.normalized(text) == "retry" { persistPostSession(after: retry) }
        return
      }
      if text.lowercased().contains("retry") {
        generate()
      } else if text.lowercased().contains("revise") {
        if intakeApproved && !fear.isEmpty {
          builder = true
          go(.planning, "Your situation and boundaries are kept. Say what you’d like to change or add, then say ‘that’s all’ when you’ve finished.")
        } else { restartIntake() }
      } else if text.lowercased().contains("cancel") {
        world.lobby()
        go(.lobby, "When you’re ready to start, say START!")
      }
    default: break
    }
  }
  var headsetPrompt: String {
    "Look straight ahead in a comfortable position. Is your headset ready? Say yes to center your practice here."
  }
  var intakePrompt: String {
    "What would you like to practice? Describe the situation, where you are, and who’s there. Take your time. Say ‘that’s all’ when you’ve finished."
  }
  var abilityPrompt: String {
    "What feels manageable, and what should we avoid? Take your time. Say ‘that’s all’ when you’ve finished."
  }
  var builderPrompt: String { "What would you like to add? Take your time. Say ‘that’s all’ when you’ve finished." }
  var isCollectingAnswer: Bool { ([.intake, .ability].contains(phase) || (phase == .planning && builder)) && !loading }
  func restartIntake() {
    answer = VoiceAnswer(); fear = ""; ability = ""; intakeApproved = false
    additions = []; history = []; useHistory = false; adaptation = JSON(); builder = false
    go(.intake, intakePrompt)
  }
  func collectAnswer(_ text: String) {
    switch answer.receive(text) {
    case .waiting:
      message = "Take your time. I’ll wait. Say ‘that’s all’ when you’ve finished your answer."
    case .listening:
      message = "Keep going whenever you’re ready. Say ‘that’s all’ when you’ve finished."
    case .cleared:
      message = phase == .intake ? intakePrompt : phase == .ability ? abilityPrompt : builderPrompt
      audio.say(message)
    case .empty:
      message = phase == .intake ? intakePrompt : phase == .ability ? abilityPrompt : builderPrompt
      audio.say(message)
    case .complete(let value):
      answer = VoiceAnswer()
      if phase == .intake {
        fear = value
        go(.ability, abilityPrompt)
      } else if phase == .ability {
        ability = value
        guard !fear.isEmpty else { restartIntake(); return }
        intakeApproved = true
        history = store.relevant(fear)
        if history.isEmpty { generate() }
        else { go(.history, "Would you like to use your past sessions for this practice? Say yes or no.") }
      } else if phase == .planning && builder {
        additions.append(value)
        builder = false
        generate()
      }
    }
  }
  func acceptRating(_ text: String, key: String) -> Bool {
    switch RatingAnswer.parse(text) {
    case .value(let value): record[key] = JSON(value)
    case .skip: record[key] = JSON()
    case .invalid:
      message = "Say one number from zero to ten, or SKIP."
      audio.say(message); return false
    }
    observe("self_report", "user_report", text)
    return true
  }
  func persistPostSession(after action: @escaping () -> Void) {
    guard !plan["session_id"].text.isEmpty else { pendingPostSave = nil; action(); return }
    record["ended_at"] = record["ended_at"].string == nil ? JSON(ISO8601DateFormatter().string(from: Date())) : record["ended_at"]
    record["active_seconds"] = JSON(active); record["stop_count"] = JSON(stopCount)
    record["early_end"] = JSON(outcome == "user_ended" && active < plan["duration_sec"].value)
    record["outcome"] = JSON(outcome); record["observations"] = JSON(observations)
    do { try store.save(record); pendingPostSave = nil; action() }
    catch {
      pendingPostSave = action
      audio.silence(); loading = false; pendingPhase = nil; phase = .error
      message = "Your session couldn’t be saved. Say RETRY to save it again."
      setupNotice = error.localizedDescription; audio.say(message)
    }
  }
  func newSession() {
    generation?.cancel(); generation = nil
    if !jobID.isEmpty {
      let old = jobID, endpoint = api
      Task { _ = try? await endpoint.call("/v1/jobs/" + old, method: "DELETE", timeout: 3) }
    }
    jobID = ""
    pendingPostSave = nil
    cancelFeedback()
    sessionID = UUID().uuidString
    revision = 0
    additions = []
    history = []
    useHistory = false
    parent = nil
    plan = JSON()
    scene = JSON()
    audioPlan = JSON()
    record = JSON()
    reflection = JSON()
    reflectionDraft = SpokenReflection()
    observations = []
    turns = []
    scenario = nil; scenarioActions = []; scenarioCompletedAt = nil
    audio.setCommandPhrases([])
    turnTask?.cancel(); turnTask = nil; turnNonce = UUID(); characterReplyPending = false
    speechFloor = SpeechFloor()
    narration = NarrationQueue()
    active = 0
    appliedOperations=[];pendingRecovery=nil;lastCheckpoint = -.infinity
    stopCount = 0
    fired = []
    beatFired = []
    seen = []
    outcome = "completed"
    adaptation = JSON()
    answer = VoiceAnswer()
    fear = ""; ability = ""; intakeApproved = false; builder = false
    repeatAfterHeadset = false
  }
  func deleteHistory() throws {
    try store.deleteAll()
    // Forget in-memory consent/history too, so a later repeat cannot send deleted rows.
    newSession()
    pause("user_stop", enabled: false)
    world.lobby(); world.scene.isPaused = !pauses.isEmpty
    audio.lobby()
    if !pauses.isEmpty { audio.pause() }
    go(.lobby, "Your history and reflections are deleted. Say START when you’re ready.")
  }
  func request() -> JSON {
    var preferences: [String] = []
    if adaptation["intensity_1_10"].number != nil {
      let intent =
        "Preserve this scenario. Adapt to intensity \(Int(adaptation["intensity_1_10"].value)), duration \(Int(adaptation["duration_seconds"].value)) seconds. "
        + adaptation["spoken_summary"].text
      preferences = [String(intent.prefix(400))]
    }
    var r: [String: Any] = [
      "schema_version": "1", "session_id": sessionID, "revision": revision,
      "fear_description": fear, "current_ability": ability, "preferences": preferences,
      "relevant_history": store.history(useHistory ? history : []),
      "history_choice": parent != nil
        ? "chain_reuse" : useHistory ? "accepted" : history.isEmpty ? "not_available" : "declined",
      "builder_additions": additions, "use_history": useHistory, "chained_rerun": parent != nil,
    ]
    if let parent { r["parent_session_id"] = parent }
    return JSON(r)
  }
  func generate() {
    guard intakeApproved else {
      restartIntake()
      return
    }
    guard remoteConsent && liveEnabled else {
      message = "You can explore the forest here. To prepare a personal practice, connect in Settings and allow your practice details to be processed."
      audio.say(message)
      return
    }
    generation?.cancel()
    let old = jobID
    let api = api
    if !old.isEmpty { Task { _ = try? await api.call("/v1/jobs/" + old, method: "DELETE") } }
    revision += 1
    generationDeadline = ProcessInfo.processInfo.systemUptime + 600
    let rev = revision
    let owner = sessionID
    jobID = ""
    go(
      .planning,
      "I’ll prepare your practice. To add something, say ‘hey builder.’"
    )
    generation = Task {
      do {
        let job: JSON
        do {
          job = try await api.callResuming("/v1/session-plans", request(),
            deadline: min(generationDeadline, ProcessInfo.processInfo.systemUptime + 20)) {
              self.message = "Reconnecting to the practice computer…"
            }
        } catch {
          if API.isTransientConnection(error) {
            throw NSError(domain: "BraiveConnection", code: 1, userInfo: [NSLocalizedDescriptionKey: "Couldn’t reach the practice computer."])
          }
          throw error
        }
        guard !Task.isCancelled, owner == sessionID, rev == revision else {
          _ = try? await api.call("/v1/jobs/" + job["job_id"].text, method: "DELETE")
          return
        }
        jobID = job["job_id"].text
        message = "Getting your practice ready…"
        while !Task.isCancelled {
          guard ProcessInfo.processInfo.systemUptime < generationDeadline else {
            _ = try? await api.call("/v1/jobs/" + jobID, method: "DELETE")
            throw NSError(domain: "Generation", code: 1, userInfo: [
              NSLocalizedDescriptionKey: "Ten-minute generation deadline reached."
            ])
          }
          try await Task.sleep(for: .milliseconds(600))
          let j = try await api.pollJob(jobID, deadline: generationDeadline) {
            self.message = "Reconnecting. We’re keeping your place."
          }
          guard owner == sessionID, rev == revision, !Task.isCancelled else { return }
          message = PreparationCopy.progress(j["stage"].text)
          if j["status"].text == "failed" {
            throw NSError(
              domain: "Generation", code: 1,
              userInfo: [NSLocalizedDescriptionKey: j["error"]["message"].text,
                "BraiveErrorCode": j["error"]["code"].text, "BraiveRequestID": j["error"]["request_id"].text])
          }
          if j["status"].text == "cancelled" { throw world.failure("Scene preparation was cancelled. Retry, revise, or cancel.") }
          if j["status"].text == "succeeded" {
            var result = j["result"]
            while !pauses.isEmpty {
              try await Task.sleep(for: .milliseconds(100))
              try Task.checkCancellation()
            }
            guard owner == sessionID, rev == revision else { return }
            let fittedIntro = try await audio.fitIntro(result["plan"]["narrator_intro_8s"].text)
            try Task.checkCancellation()
            while !pauses.isEmpty {
              try await Task.sleep(for: .milliseconds(100))
              try Task.checkCancellation()
            }
            guard owner == sessionID, rev == revision else { return }
            guard ProcessInfo.processInfo.systemUptime < generationDeadline else {
              throw NSError(
                domain: "Generation", code: 1,
                userInfo: [
                  NSLocalizedDescriptionKey: "Ten-minute scene readiness deadline reached."
                ])
            }
            result["plan"]["narrator_intro_8s"] = JSON(fittedIntro)
            var nextScenario: ScenarioRuntime?
            do {
              if result["scene"]["scenario"].object != nil {
                let definition = try JSONDecoder().decode(ScenarioDefinition.self, from: JSONEncoder().encode(result["scene"]["scenario"]))
                nextScenario = try ScenarioRuntime(definition)
              }
              try world.load(result["scene"], plan: result["plan"])
            } catch {
              let preflightError = error
              do {
                _ = try await api.call(
                  "/v1/jobs/" + jobID + "/validation", JSON(["message": error.localizedDescription]),
                  timeout: max(0.1, min(8, generationDeadline - ProcessInfo.processInfo.systemUptime)))
                // The backend grants the repair its own bounded window; keep
                // polling for its result instead of expiring mid-repair.
                generationDeadline = max(generationDeadline, ProcessInfo.processInfo.systemUptime + 300)
              } catch {
                // The repair may already be running if its acknowledgement was lost.
                // Poll its existing job; never blindly repeat a paid repair request.
                if !API.isTransientConnection(error) { throw preflightError }
              }
              continue
            }
            guard ProcessInfo.processInfo.systemUptime < generationDeadline else { throw world.failure("Scene loading exceeded the ten-minute readiness deadline") }
            plan = result["plan"]
            scene = result["scene"]
            scenario = nextScenario; scenarioCompletedAt = nil; scenarioActions = []
            audio.setCommandPhrases(nextScenario?.definition.steps.flatMap { $0.actions.flatMap(\.phrases) } ?? [])
            audioPlan = result["audio"]
            remaining = plan["duration_sec"].value
            introTime = 0
            active = 0
            fired = []
            beatFired = []
            record = JSON([
              "schema_version": "1", "session_id": sessionID,
              "started_at": ISO8601DateFormatter().string(from: Date()), "outcome": "running",
              "scene": scene.raw, "audio": audioPlan.raw,
              "plan": plan.raw, "topic_short": plan["topic_short"].raw,
              "intensity_1_10": plan["intensity_1_10"].raw, "use_history": useHistory,
              "chained_rerun": parent != nil, "scene_revision": revision,
              "reported_difficulty": NSNull(), "reported_readiness": NSNull(),
              "generation_provenance": ["mode": "live", "model_ids": [], "request_ids": []],
            ])
            if let parent { record["parent_session_id"] = JSON(parent) }
            record["adaptation"] = adaptation
            try store.save(record)
            transitionID = UUID()
            loading = false
            pendingPhase = nil
            audio.silence()
            world.scene.isPaused = false
            phase = .intro
            message = plan["narrator_intro_8s"].text
            audio.say(message, intro: true)
            if plan["safety"]["decision"].text == "soften" {
              phase = .planning
              audio.say(plan["safety"]["reason"].text) {
                self.phase = .intro
                self.introTime = 0
                self.audio.say(fittedIntro, intro: true)
              }
            }
            return
          }
        }
      } catch { if !Task.isCancelled && rev == revision { fail(error) } }
    }
  }
  func tick() {
    let now = ProcessInfo.processInfo.systemUptime
    if !speechFeedback.isEmpty && now >= speechFeedbackExpiresAt { speechFeedback = "" }
    let dt = min(0.2, now - lastTick)
    lastTick = now
    guard pauses.isEmpty else { return }
    if launching {
      launchRemaining -= dt
      if launchRemaining <= 0 { launching = false }
      return
    }
    if loading || (phase == .planning && !builder) || phase == .saving
      || (phase == .feedback && message == "Reviewing your session…") || adapting {
      if let tip = tips.advance(by: dt) { loadingTip = tip.text }
    }
    world.renderTime += dt
    if loading {
      transitionRemaining -= dt
      if transitionRemaining <= 0, let next = pendingPhase {
        phase = next
        pendingPhase = nil
        loading = false
        message = pendingText
        audio.say(message)
      }
      return
    }
    let listening = audio.ready && audio.engine.isRunning
      && (audio.captureStats.snapshot(engineRunning: true)["callbacks"] as? Int ?? 0) > 0
    if voiceListening != listening { voiceListening = listening }
    if phase == .intro {
      introTime += dt
      if introTime >= 8 {
        guard !audio.speech.isSpeaking else {
          fail(
            NSError(
              domain: "Intro", code: 1,
              userInfo: [
                NSLocalizedDescriptionKey: "Narration exceeds eight seconds. Revise and retry."
              ]))
          return
        }
        phase = .reveal
        reveal = 0
      }
    } else if phase == .reveal {
      let duration = max(scene["reveal"]["fade_seconds"].number ?? 1.5, scene["reveal"]["blur_to_clear_seconds"].number ?? 1.5)
      reveal += dt / max(0.1, duration)
      if reveal >= 1 {
        phase = .active
        world.beginPracticeClock()
        audio.apply(audioPlan)
        message = plan["task_instruction"].text
        if let update = scenario?.start(at: active) { applyScenario(update) }
      }
    } else if phase == .active {
      active = world.activeElapsed
      let completedMotion = world.updateMotion()
      scenario?.receiveCompletedMotions(completedMotion)
      let canAdvance = scenario?.step.conversation_target == nil || (turnTask == nil && !audio.narrated && speechFloor.available(now:now))
      if canAdvance, let update = scenario?.tick(at: active, completedMotions: completedMotion) { applyScenario(update) }
      guard phase == .active else { return }
      audio.update(active: active)
      checkpoint()
      remaining = max(0, plan["duration_sec"].value - active)
      for (i, e) in scene["events"].list.enumerated()
      where e["at_active_second"].value <= active && !fired.contains(i) {
        fired.insert(i)
        operation(e["operation"])
      }
      for (i, b) in plan["narrator_beats"].list.enumerated()
      where b["at_active_second"].value <= active && !beatFired.contains(i) {
        beatFired.insert(i)
        narration.enqueue(b["text"].text, at: active)
      }
      if remaining <= 0 || (scenarioCanFinish(terminalAt: scenarioCompletedAt, active: active, motionPending: world.hasPendingMotion) && !audio.narrated && !narration.hasPending && speechFloor.available(now: now)) { finish(early: false) }
      else if turnTask == nil, !audio.narrated,
        speechFloor.available(now: now), let text = narration.take(at: active) {
        audio.say(text)
      }
    }
  }
  func operation(_ op: JSON) {
    appliedOperations.append(op)
    world.operation(op, speak: { narration.enqueue($0, at: active) }, sound: { audio.cue($0) })
  }
  func applyScenario(_ update: ScenarioUpdate) {
    turnTask?.cancel(); turnTask = nil; turnNonce = UUID(); characterReplyPending = false
    narration.clearPending()
    message = update.prompt
    scenarioActions = scenario?.step.actions.map(\.label) ?? []
    for op in update.operations { operation(op) }
    if update.announce { narration.enqueue(update.prompt, at: active) }
    if let action = update.actionID { observe("task_action", "app_event", "Scenario action: " + action) }
    observe("task_action", "app_event", "Scenario stage: " + update.stepID)
    if update.terminal { scenarioCompletedAt = active }
    checkpoint(force:true)
  }
  func perform(_ text: String) {
    observe("speech_excerpt", "transcript", text)
    if scenario?.isGuided == true {
      guard !VoiceAnswer.needsTime(text), let target = scenario?.conversationTarget,
        let character = plan["characters"].list.first(where: { $0["id"].text == target }) else { return }
      dialogue(text,character:character)
      return
    }
    if let update = scenario?.hear(text, at: active) { applyScenario(update); return }
    if scenario == nil {
      for choice in scene["interactions"].list.flatMap({ $0["choices"].list }) {
        let phrases = [choice["label"].text] + choice["intent_examples"].list.map(\.text)
        if phrases.contains(where: { !$0.isEmpty && text.lowercased().contains($0.lowercased()) }) {
          for op in choice["operations"].list { operation(op) }; return
        }
      }
    }
    let words = VoiceAnswer.normalized(text)
    if ["help", "what next", "what do i do", "repeat instructions"].contains(words) {
      turnTask?.cancel(); turnTask = nil; turnNonce = UUID(); characterReplyPending = false
      narration.enqueue(scenario?.step.prompt ?? plan["task_instruction"].text, at: active); return
    }
    // Network conversation is an explicit optional action, never the fallback for arbitrary speech.
    guard scenario?.definition.dialogue_policy != "disabled",
      words.hasPrefix("ask ") || words.hasPrefix("talk to ") else { return }
    let people = plan["characters"].list
    let id = ScenarioRuntime.requestedCharacter(text, characters: people.map { (id: $0["id"].text, name: $0["name"].text, role: $0["role"].text) })
    guard let character = people.first(where: { $0["id"].text == id }) else { narration.enqueue("Say ask followed by the character’s name and your question.", at: active); return }
    dialogue(text, character: character)
  }
  func dialogue(_ text: String, character: JSON) {
    guard remoteConsent && liveEnabled else { return }
    narration.clearPending()
    turnTask?.cancel(); turnTask = nil; turnNonce = UUID()
    audio.interruptSpeech()
    let nonce = turnNonce
    let rev = revision
    let turn = UUID().uuidString
    world.animate(character["id"].text, "listen")
    turnTask = Task {
      characterReplyPending = true
      defer { if nonce == turnNonce { turnTask = nil; characterReplyPending = false } }
      do {
        let req = JSON([
          "schema_version": "1", "session_id": sessionID, "revision": rev, "turn_id": turn,
          "character_id": character["id"].text, "user_utterance": text,
          "recent_turns": Array(turns.suffix(6)), "context_summary": scenario?.step.prompt ?? plan["task_instruction"].text,
          "remaining_seconds": remaining,
          "available_choices": [],
        ])
        let result = try await api.call("/v1/dialogue", req)
        // A completed model reply must still yield to the user's current speech and any pause.
        // A newer completed user turn cancels this stale reply through the nonce.
        while !pauses.isEmpty || !speechFloor.available(now: ProcessInfo.processInfo.systemUptime)
          || audio.narrated {
          try await Task.sleep(for: .milliseconds(100))
          try Task.checkCancellation()
        }
        guard !Task.isCancelled, remoteConsent && liveEnabled, nonce == turnNonce, rev == revision, phase == .active,
          pauses.isEmpty
        else { return }
        turns.append(["speaker_id": "user", "text": text])
        turns.append(["speaker_id": character["id"].text, "text": result["reply"].text])
        observe("dialogue_turn", "app_event", result["reply"].text)
        for op in result["operations"].list { operation(op) }
        narration.markSpoken(result["reply"].text, at: active)
        world.animate(character["id"].text, "speak")
        audio.say(result["reply"].text) { self.world.animate(character["id"].text, "listen") }
      } catch {
        if !Task.isCancelled {
          message = scenario?.step.prompt ?? "Continue with the available scenario actions."
          setupNotice = "Optional character reply unavailable: " + error.localizedDescription
          observe("task_action", "app_event", "Character reply unavailable: " + error.localizedDescription)
        }
      }
    }
  }
  func observe(_ kind: String, _ source: String, _ value: Any) {
    observations.append([
      "id": UUID().uuidString, "session_id": sessionID, "kind": kind, "source": source,
      "value": value, "at_active_second": active,
    ])
  }
  func finish(early: Bool) {
    generation?.cancel()
    turnTask?.cancel()
    turnTask = nil
    turnNonce = UUID()
    characterReplyPending = false
    narration.clearPending()
    transitionID = UUID()
    loading = false
    audio.silence()
    world.pausePracticeClock()
    world.scene.isPaused = true
    pendingPhase = nil
    if !jobID.isEmpty {
      let id = jobID
      Task { _ = try? await api.call("/v1/jobs/" + id, method: "DELETE") }
    }
    outcome = early ? "user_ended" : "completed"
    record["checkpoint"]=JSON()
    record["outcome"]=JSON(outcome);record["active_seconds"]=JSON(active)
    observe("active_duration", "app_event", active)
    observe("stop_count", "app_event", stopCount)
    persistPostSession { [weak self] in self?.go(.selfReport, "How difficult did that feel, from zero to ten? You can skip.") }
  }
  func feedback() {
    beginTips(for: .feedback)
    if plan["session_id"].text.isEmpty {
      message =
        "No practice scene began, so there is no performance feedback. Say continue to save."
      phase = .feedback
      audio.say(message)
      return
    }
    phase = .feedback
    guard remoteConsent && liveEnabled else {
      message = "Online feedback is turned off. Your session will be saved."
      audio.say(message) { [weak self] in self?.save() }
      return
    }
    message = "Reviewing your session…"
    cancelFeedback()
    let nonce = feedbackNonce, owner = sessionID, rev = revision
    feedbackTask = Task { [weak self] in
      guard let self else { return }
      do {
        let f = try await api.call(
          "/v1/feedback", JSON(["plan": plan.raw, "observations": observations]))
        guard !Task.isCancelled, nonce == feedbackNonce, owner == sessionID,
          rev == revision, phase == .feedback else { return }
        deliverFeedback(f, nonce: nonce)
      } catch {
        guard !Task.isCancelled, nonce == feedbackNonce, owner == sessionID,
          rev == revision, phase == .feedback else { return }
        message = "Feedback is unavailable. Your practice will still be saved."
        audio.say(message) { [weak self] in
          guard let self, self.feedbackNonce == nonce, self.phase == .feedback else { return }
          self.save()
        }
      }
    }
  }
  func deliverFeedback(_ f: JSON, nonce: UUID) {
    guard feedbackNonce == nonce, phase == .feedback else { return }
    record["feedback"] = f
    var parts: [String] = []
    if !f["did_well"].list.isEmpty { parts.append("Here’s what you did well. " + f["did_well"].list.map { $0["text"].text }.joined(separator: " ")) }
    if !f["noticed"].list.isEmpty { parts.append("I also noticed. " + f["noticed"].list.map { $0["text"].text }.joined(separator: " ")) }
    if !f["one_quick_fix"].text.isEmpty { parts.append(f["one_quick_fix"].text) }
    let spoken = parts.isEmpty ? "There isn’t enough recorded detail for specific feedback this time." : parts.joined(separator: " ")
    persistPostSession { [weak self] in
      guard let self else { return }
      self.phase = .feedback
      self.message = spoken
      self.audio.say(spoken) { [weak self] in
        guard let self, self.feedbackNonce == nonce, self.phase == .feedback else { return }
        self.save()
      }
    }
  }
  func save() {
    beginTips(for: .saving)
    cancelFeedback()
    if plan["session_id"].text.isEmpty {
      world.lobby()
      world.scene.isPaused = !pauses.isEmpty
      audio.lobby()
      go(
        .lobby, "Setup ended before a practice scene began. When you’re ready to start, say START!")
      return
    }
    phase = .saving
    record["render_metrics"] = world.metrics.report
    record["active_seconds"] = JSON(active)
    record["stop_count"] = JSON(stopCount)
    record["early_end"] = JSON(outcome == "user_ended" && active < plan["duration_sec"].value)
    record["outcome"] = JSON(outcome)
    record["observations"] = JSON(observations)
    let owner = sessionID, endpoint = api
    persistPostSession { [weak self] in
      guard let self else { return }
      self.go(.repeatPrompt, "Based on your last performance, would you like to go again?")
      // Metadata is optional. Local records and the spreadsheet are already durable.
      guard self.remoteConsent, self.liveEnabled else { return }
      Task { [weak self] in
        guard let provenance = try? await endpoint.call("/v1/provenance/" + owner, timeout: 3),
          let self, var latest = self.store.records.first(where: { $0["session_id"].text == owner }) else { return }
        latest["generation_provenance"] = provenance
        do {
          try self.store.save(latest)
          if self.sessionID == owner { self.record["generation_provenance"] = provenance }
        } catch { self.setupNotice = "Session saved; metadata update unavailable." }
      }
    }
  }
  func adapt() {
    guard !adapting else { return }
    guard remoteConsent && liveEnabled else {
      phase = .repeatPrompt
      audio.say("Online practice is turned off. Say NO to return to the lobby.")
      return
    }
    beginTips(for: .repeatPrompt)
    adapting = true
    let owner = sessionID, rev = revision
    message = "Getting your next practice ready…"
    Task {
      defer { adapting = false }
      do {
        let result = try await api.call(
          "/v1/adaptations",
          JSON([
            "previous_plan": plan.raw, "observations": observations,
            "relevant_history": store.history(useHistory ? history : []), "user_preferences": [],
          ]))
        guard owner == sessionID, rev == revision, repeatAfterHeadset, phase == .headset else { return }
        let previous = record
        let summary = result["spoken_summary"].text
        let f = fear
        let a = ability
        let oldHistory = useHistory ? history : []
        newSession()
        parent = previous["session_id"].text
        fear = f
        ability = a
        intakeApproved = true // The explicit repeat-session answer authorizes the adapted rerun.
        history = PracticeHistory.chain(oldHistory, completed: previous)
        useHistory = true
        additions = [summary] + result["changes"].list.map { change in
          "Adapt \(change["dimension"].text) from \(change["before"].text) to \(change["after"].text). Reason: \(change["reason"].text)"
        }
        adaptation = result
        audio.say(summary)
        let child = sessionID
        while audio.narrated {
          try await Task.sleep(for: .milliseconds(100))
          guard sessionID == child else { return }
        }
        generate()
      } catch {
        guard owner == sessionID, rev == revision else { return }
        phase = .repeatPrompt
        message = "Adaptation unavailable. Say yes to retry, or no to return."
        audio.say(message)
      }
    }
  }
  func fail(_ error: Error) {
    cancelFeedback()
    pendingPhase = nil
    audio.silence()
    phase = .error
    loading = false
    print("[practice preparation] \((error as NSError).domain): \(error.localizedDescription)")
    message = PreparationCopy.failure(error)
    audio.say(message + " Say RETRY to try again, REVISE to change the details, or CANCEL to return to the forest.")
  }
}

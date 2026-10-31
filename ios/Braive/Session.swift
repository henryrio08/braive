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
  @Published var loading = false
  @Published var remaining = 0.0
  @Published var reveal = 0.0
  @Published var connection = "Not connected"
  @Published var server =
    UserDefaults.standard.string(forKey: "server") ?? "http://braive.local:8787"
  @Published var token = UserDefaults.standard.string(forKey: "token") ?? ""
  @Published var remoteConsent = false
  @Published var liveEnabled = false
  let world = World(), audio = Audio(), store = SessionStore()
  var api: API { API(base: server.trimmingCharacters(in: .whitespacesAndNewlines), token: token) }
  var plan = JSON(), scene = JSON(), audioPlan = JSON(), record = JSON(), reflection = JSON()
  var observations: [Any] = []
  var sessionID = UUID().uuidString
  var revision = 0
  var generation: Task<Void, Never>?
  var jobID = ""
  var seen = Set<String>()
  var fear = "", ability = "", additions: [String] = [], history: [JSON] = []
  var useHistory = false
  var parent: String?
  var builder = false
  var active = 0.0, lastTick = ProcessInfo.processInfo.systemUptime, introTime = 0.0, stopCount = 0
  var fired = Set<Int>(), beatFired = Set<Int>()
  var turns: [Any] = []
  var turnTask: Task<Void, Never>?
  var turnNonce = UUID()
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
    world.onPortrait = { [weak self] portrait in self?.pause("portrait", enabled: portrait) }
    audio.onText = { [weak self] text, final, id in self?.heard(text, final: final, id: id) }
    audio.onDisconnect = { [weak self] in
      self?.connection = "Voice connection lost"
      self?.pause("command_channel_unavailable", enabled: true)
    }
    timer = Timer.publish(every: 0.05, on: .main, in: .common).autoconnect().sink { [weak self] _ in
      self?.tick()
    }
    if ProcessInfo.processInfo.arguments.contains("--asset-audit") {
      preview()
      world.auditAssets()
      message = "Offline renderer asset audit — reusable objects, no model calls"
    }
    if ProcessInfo.processInfo.arguments.contains("--preflight-audit") {
      preview()
      do {
        try PreflightAudit.run(world)
        message = "Offline preflight audit passed — no generated practice or Meta calls"
      } catch { message = "Offline preflight audit failed: " + error.localizedDescription }
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
        message = "Generated-scene replay — native preflight passed; no live model calls"
      } catch {
        message = "Generated scene rejected by native preflight: " + error.localizedDescription
      }
    }
    NotificationCenter.default.addObserver(
      forName: AVAudioSession.interruptionNotification, object: nil, queue: .main
    ) { [weak self] n in Task { @MainActor in self?.pause("audio_interruption", enabled: true) } }
  }
  func preview() {
    phase = .lobby
    connection = "Offline forest preview — no Meta calls"
    message =
      "Forest preview. Use Settings to calibrate. Live practice requires connection and approved Meta use."
    world.lobby()
    audio.lobby()
  }
  func connect() {
    guard remoteConsent, liveEnabled else {
      message =
        "Enable remote processing and live Meta use to connect. Live use requires permission from Henry."
      return
    }
    UserDefaults.standard.set(server, forKey: "server")
    UserDefaults.standard.set(token, forKey: "token")
    Task {
      do {
        try await audio.start(api: api)
        connection = "Connecting voice…"
        go(.lobby, "When you’re ready to start, say START!")
        world.lobby()
        audio.lobby()
      } catch { fail(error) }
    }
  }
  func reconnect() {
    audio.stopCapture()
    Task {
      do {
        try await audio.start(api: api)
        pause("command_channel_unavailable", enabled: false)
      } catch { message = error.localizedDescription }
    }
  }
  func pause(_ reason: String, enabled: Bool) {
    let was = pauses.isEmpty
    if enabled { pauses.insert(reason) } else { pauses.remove(reason) }
    if was && !pauses.isEmpty {
      world.scene.isPaused = true
      audio.pause()
      turnNonce = UUID()
      turnTask?.cancel()
    } else if !was && pauses.isEmpty {
      world.scene.isPaused = false
      audio.resume()
      lastTick = ProcessInfo.processInfo.systemUptime
    }
  }
  func stop() {
    guard phase != .setup else { return }
    guard !pauses.contains("user_stop") else { return }
    stopCount += 1
    pause("user_stop", enabled: true)
    audio.confirmQuit()
  }
  func go(_ next: Phase, _ text: String) {
    transitionID = UUID()
    loading = true
    transitionRemaining = 0.45
    pendingPhase = next
    pendingText = text
    audio.play("whoosh", loop: false, gain: 0.15)
    message = next == .planning ? "To stop at any time, just say STOP!" : text

  }
  func heard(_ text: String, final: Bool, id: String) {
    transcript = text
    let words = text.lowercased().split(whereSeparator: { !$0.isLetter }).map(String.init)
    // Conservative STOP works on partials. Device voice processing handles playback echo; verify in goggles.
    if words.contains("stop") {
      stop()
      return
    }
    guard final else { return }
    let key = "\(id):\(text)"
    guard seen.insert(key).inserted else { return }
    if pauses.contains("user_stop") {
      if words.contains("yes") {
        pauses.remove("user_stop")
        finish(early: true)
      } else if words.contains("no") {
        pause("user_stop", enabled: false)
      }
      return
    }
    guard pauses.isEmpty, !loading else { return }
    let yes = words.contains("yes")
    let no = words.contains("no")
    if phase == .planning {
      if builder {
        additions.append(text)
        builder = false
        generate()
      } else if text.lowercased().contains("hey builder") {
        builder = true
        audio.say("What would you like to add?")
      }
      return
    }
    switch phase {
    case .lobby:
      if words.contains("start") { go(.headset, "Is your headset ready? Say yes to begin.") }
    case .headset:
      if yes {
        newSession()
        go(.intake, "What situation would you like to practice?")
      }
    case .intake:
      fear = text
      go(
        .ability,
        "How comfortable are you with this situation, and what boundaries should I respect?")
    case .ability:
      ability = text
      history = store.relevant(fear)
      if history.isEmpty {
        generate()
      } else {
        go(
          .history,
          "I see we’ve explored this situation before! Would you like to consider past sessions for this simulation?"
        )
      }
    case .history:
      if yes || no {
        useHistory = yes
        if no { history = [] }
        generate()
      }
    case .active: dialogue(text)
    case .selfReport:
      record["reported_difficulty"] = rating(text)
      observe("self_report", "user_report", text)
      go(.readiness, "How ready do you feel now, from zero to ten? You can skip.")
    case .readiness:
      record["reported_readiness"] = rating(text)
      observe("self_report", "user_report", text)
      go(.reflectionPrompt, "Would you like to save a spoken reflection?")
    case .reflectionPrompt:
      if yes {
        go(.reflection, "Share your reflection. Say save reflection when you’re finished.")
      } else if no {
        go(.feedbackPrompt, "Would you like to hear feedback on your experience?")
      }
    case .reflection:
      if text.lowercased().contains("save reflection") {
        do {
          reflection = try store.reflection(
            reflection["transcript"].text, topic: plan["topic_short"].text)
          reflection["session_id"] = JSON(sessionID)
          reflection["topic"] = plan["topic"]
          record["reflection"] = reflection
          record["reflection_id"] = reflection["id"]
          record["reflection_file"] = reflection["relative_file_path"]
          go(.feedbackPrompt, "Would you like to hear feedback on your experience?")
        } catch { fail(error) }
      } else {
        reflection["transcript"] = JSON(reflection["transcript"].text + " " + text)
      }
    case .feedbackPrompt: if yes { feedback() } else if no { save() }
    case .feedback: if yes || text.lowercased().contains("continue") { save() }
    case .repeatPrompt:
      if yes {
        adapt()
      } else if no {
        world.lobby()
        audio.lobby()
        go(.lobby, "When you’re ready to start, say START!")
      }
    case .error:
      if text.lowercased().contains("retry") {
        generate()
      } else if text.lowercased().contains("revise") {
        go(.intake, "Describe the situation you’d like instead.")
      } else if text.lowercased().contains("cancel") {
        world.lobby()
        go(.lobby, "When you’re ready to start, say START!")
      }
    default: break
    }
  }
  func rating(_ text: String) -> JSON {
    if text.lowercased().contains("skip") { return JSON() }
    let names = [
      "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
    ]
    for w in text.lowercased().split(whereSeparator: { !$0.isLetter && !$0.isNumber }) {
      if let n = Int(w), (0...10).contains(n) { return JSON(n) }
      if let n = names.firstIndex(of: String(w)) { return JSON(n) }
    }
    return JSON()
  }
  func newSession() {
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
    observations = []
    turns = []
    active = 0
    stopCount = 0
    fired = []
    beatFired = []
    seen = []
    outcome = "completed"
    adaptation = JSON()
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
    guard liveEnabled else {
      message = "This is an offline forest preview. Live practice needs approved Meta access."
      audio.say(message)
      return
    }
    generation?.cancel()
    let old = jobID
    let api = api
    if !old.isEmpty { Task { _ = try? await api.call("/v1/jobs/" + old, method: "DELETE") } }
    revision += 1
    generationDeadline = ProcessInfo.processInfo.systemUptime + 120
    let rev = revision
    jobID = ""
    go(
      .planning,
      "I’ll get the scene ready. If there’s anything additional you’d like to say, just say ‘hey builder!’ and let me know!"
    )
    generation = Task {
      do {
        let job = try await api.call("/v1/session-plans", request())
        guard !Task.isCancelled, rev == revision else { return }
        jobID = job["job_id"].text
        while !Task.isCancelled {
          try await Task.sleep(for: .milliseconds(600))
          let j = try await api.call("/v1/jobs/" + jobID)
          guard rev == revision, !Task.isCancelled else { return }
          message = j["stage"].text + " · Say hey builder to add details"
          if j["status"].text == "failed" {
            throw NSError(
              domain: "Generation", code: 1,
              userInfo: [NSLocalizedDescriptionKey: j["error"]["message"].text])
          }
          if j["status"].text == "succeeded" {
            var result = j["result"]
            while !pauses.isEmpty {
              try await Task.sleep(for: .milliseconds(100))
              try Task.checkCancellation()
            }
            guard rev == revision else { return }
            let fittedIntro = await audio.fitIntro(result["plan"]["narrator_intro_8s"].text)
            try Task.checkCancellation()
            guard ProcessInfo.processInfo.systemUptime < generationDeadline else {
              throw NSError(
                domain: "Generation", code: 1,
                userInfo: [
                  NSLocalizedDescriptionKey: "Two-minute scene readiness deadline reached."
                ])
            }
            result["plan"]["narrator_intro_8s"] = JSON(fittedIntro)
            do { try world.load(result["scene"], plan: result["plan"]) } catch {
              _ = try await api.call(
                "/v1/jobs/" + jobID + "/validation", JSON(["message": error.localizedDescription]))
              continue
            }
            plan = result["plan"]
            scene = result["scene"]
            audioPlan = result["audio"]
            remaining = plan["duration_sec"].value
            introTime = 0
            active = 0
            fired = []
            beatFired = []
            record = JSON([
              "schema_version": "1", "session_id": sessionID,
              "started_at": ISO8601DateFormatter().string(from: Date()), "outcome": "running",
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
            phase = .intro
            message = plan["narrator_intro_8s"].text
            audio.say(message)
            if plan["safety"]["decision"].text == "soften" {
              phase = .planning
              audio.say(plan["safety"]["reason"].text) {
                self.phase = .intro
                self.introTime = 0
                self.audio.say(fittedIntro)
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
    let dt = min(0.2, now - lastTick)
    lastTick = now
    guard pauses.isEmpty else { return }
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
    if audio.ready { connection = "Voice connected" }
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
      reveal += dt / 1.5
      if reveal >= 1 {
        phase = .active
        audio.apply(audioPlan)
        message = plan["task_instruction"].text
      }
    } else if phase == .active {
      active += dt
      audio.update(active: active)
      remaining = max(0, plan["duration_sec"].value - active)
      for (i, e) in scene["events"].list.enumerated()
      where e["at_active_second"].value <= active && !fired.contains(i) {
        fired.insert(i)
        operation(e["operation"])
      }
      for (i, b) in plan["narrator_beats"].list.enumerated()
      where b["at_active_second"].value <= active && !beatFired.contains(i) {
        beatFired.insert(i)
        audio.say(b["text"].text)
      }
      if remaining <= 0 { finish(early: false) }
    }
  }
  func operation(_ op: JSON) {
    world.operation(op, speak: { audio.say($0) }, sound: { audio.cue($0) })
  }
  func dialogue(_ text: String) {
    observe("speech_excerpt", "transcript", text)
    for i in scene["interactions"].list {
      for c in i["choices"].list {
        let phrases = [c["label"].text] + c["intent_examples"].list.map(\.text)
        if phrases.contains(where: { text.lowercased().contains($0.lowercased()) }) {
          for op in c["operations"].list { operation(op) }
          observe("task_action", "app_event", c["label"].text)
          return
        }
      }
    }
    guard let character = plan["characters"].list.first else {
      audio.say("You can inspect the scene or choose one of the available actions.")
      return
    }
    audio.speech.stopSpeaking(at: .immediate)
    turnTask?.cancel()
    turnNonce = UUID()
    let nonce = turnNonce
    let rev = revision
    let turn = UUID().uuidString
    world.animate(character["id"].text, "listen")
    turnTask = Task {
      do {
        let req = JSON([
          "schema_version": "1", "session_id": sessionID, "revision": rev, "turn_id": turn,
          "character_id": character["id"].text, "user_utterance": text,
          "recent_turns": Array(turns.suffix(12)), "context_summary": plan["task_instruction"].text,
          "remaining_seconds": remaining,
          "available_choices": scene["interactions"].list.flatMap { $0["choices"].list.map(\.raw) },
        ])
        let result = try await api.call("/v1/dialogue", req)
        guard !Task.isCancelled, nonce == turnNonce, rev == revision, phase == .active,
          pauses.isEmpty
        else { return }
        turns.append(["speaker_id": "user", "text": text])
        turns.append(["speaker_id": character["id"].text, "text": result["reply"].text])
        observe("dialogue_turn", "app_event", result["reply"].text)
        for op in result["operations"].list { operation(op) }
        world.animate(character["id"].text, "speak")
        audio.say(result["reply"].text) { self.world.animate(character["id"].text, "listen") }
      } catch {
        if !Task.isCancelled { message = "Character connection interrupted. Try speaking again." }
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
    turnNonce = UUID()
    transitionID = UUID()
    loading = false
    audio.silence()
    world.scene.isPaused = true
    pendingPhase = nil
    if !jobID.isEmpty {
      let id = jobID
      Task { _ = try? await api.call("/v1/jobs/" + id, method: "DELETE") }
    }
    outcome = early ? "user_ended" : "completed"
    observe("active_duration", "app_event", active)
    observe("stop_count", "app_event", stopCount)
    go(.selfReport, "How difficult did that feel, from zero to ten? You can skip.")
  }
  func feedback() {
    if plan["session_id"].text.isEmpty {
      message =
        "No practice scene began, so there is no performance feedback. Say continue to save."
      phase = .feedback
      audio.say(message)
      return
    }
    phase = .feedback
    message = "Reviewing your session…"
    Task {
      do {
        let f = try await api.call(
          "/v1/feedback", JSON(["plan": plan.raw, "observations": observations]))
        record["feedback"] = f
        message =
          "Here’s what you did well. "
          + f["did_well"].list.map { $0["text"].text }.joined(separator: " ") + " I also noticed. "
          + f["noticed"].list.map { $0["text"].text }.joined(separator: " ") + " "
          + f["one_quick_fix"].text + " Say continue to save."
        audio.say(message)
      } catch {
        message = "Feedback unavailable. Say continue to save your session."
        audio.say(message)
      }
    }
  }
  func save() {
    if plan["session_id"].text.isEmpty {
      world.lobby()
      audio.lobby()
      go(
        .lobby, "Setup ended before a practice scene began. When you’re ready to start, say START!")
      return
    }
    phase = .saving
    record["ended_at"] = JSON(ISO8601DateFormatter().string(from: Date()))
    record["active_seconds"] = JSON(active)
    record["stop_count"] = JSON(stopCount)
    record["early_end"] = JSON(outcome == "user_ended" && active < plan["duration_sec"].value)
    record["outcome"] = JSON(outcome)
    record["observations"] = JSON(observations)
    Task {
      do {
        record["generation_provenance"] = try await api.call("/v1/provenance/" + sessionID)
        try store.save(record)
        go(.repeatPrompt, "Based on your last performance, would you like to go again?")
      } catch {
        do {
          try store.save(record)
          go(
            .repeatPrompt,
            "Session saved locally. Based on your last performance, would you like to go again?")
        } catch { fail(error) }
      }
    }
  }
  func adapt() {
    Task {
      do {
        let result = try await api.call(
          "/v1/adaptations",
          JSON([
            "previous_plan": plan.raw, "observations": observations,
            "relevant_history": store.history(useHistory ? history : []), "user_preferences": [],
          ]))
        let previous = record
        let summary = result["spoken_summary"].text
        let f = fear
        let a = ability
        let oldHistory = history
        let wasUsing = useHistory
        newSession()
        parent = previous["session_id"].text
        fear = f
        ability = a
        history = oldHistory + [previous]
        useHistory = true
        additions = [summary]
        adaptation = result
        _ = wasUsing
        audio.say(summary)
        generate()
      } catch {
        message = "Adaptation unavailable. Say yes to retry, or no to return."
        audio.say(message)
      }
    }
  }
  func fail(_ error: Error) {
    pendingPhase = nil
    audio.silence()
    phase = .error
    loading = false
    message = error.localizedDescription + " Say retry, revise, or cancel."
    audio.say(message)
  }
}

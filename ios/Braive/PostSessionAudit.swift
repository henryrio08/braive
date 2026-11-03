import Foundation

#if DEBUG
@MainActor extension Session {
  /// Explicit synthetic controller walkthrough; no microphone, provider, or real user files.
  func runPostSessionAudit() {
    var checks = 0
    func check(_ condition: Bool, _ name: String) throws {
      guard condition else { throw NSError(domain:"PostSessionAudit", code:1, userInfo:[NSLocalizedDescriptionKey:name]) }
      checks += 1
    }
    func flush() {
      audio.silence()
      if let next = pendingPhase { phase = next; pendingPhase = nil; loading = false }
    }
    func say(_ text: String) { heard(text, final:true, id:UUID().uuidString); flush() }
    func seed() {
      newSession(); phase = .active; active = 17; stopCount = 1
      plan = JSON(["session_id":sessionID,"duration_sec":60,"topic":"Garden proposal","topic_short":"Garden proposal"])
      record = JSON(["session_id":sessionID,"plan":plan.raw,"started_at":ISO8601DateFormatter().string(from:Date()),"topic_short":"Garden proposal","intensity_1_10":3,"use_history":false,"chained_rerun":false])
    }
    do {
      launching = false
      try check(!headsetReady && world.scene.rootNode.childNodes.count == 1, "Forest must not load before initial readiness")
      phase = .lobby; go(.headset, headsetPrompt); flush()
      try check(!headsetReady, "Headset question must keep the spatial view hidden")
      say("yes")
      try check(headsetReady && phase == .intake && world.scene.rootNode.childNodes.count > 1, "Readiness must center and reveal the forest before intake")
      try store.save(JSON(["session_id":UUID().uuidString,"outcome":"completed","plan":["topic":"Garden proposal"]]))
      say("I want to practice a garden proposal. That's all.")
      say("Keep it friendly. That's all.")
      try check(intakeApproved && phase == .history, "Completed ability goes directly to history consent without readback")
      try store.deleteAll()
      seed(); finish(early:true); flush()
      try check(store.records.count == 1 && store.records[0]["stop_count"].value == 1, "Run must be saved before optional answers")
      say("not sure")
      try check(phase == .selfReport && record["reported_difficulty"].number == nil, "Ambiguous rating must not advance")
      say("five"); say("zero")
      try check(store.records[0]["reported_difficulty"].value == 5 && store.records[0]["reported_readiness"].number == 0, "Ratings must be durable immediately, including zero")
      say("yes"); say("I finished my opening. Save reflection.")
      let path = record["reflection_file"].text
      let contents = try String(contentsOf:store.root.appendingPathComponent(path),encoding:.utf8)
      try check(contents == "I finished my opening." && store.records[0]["reflection_file"].text == path, "Reflection words/file/reference must persist together")
      say("no")
      try check(phase == .repeatPrompt && store.records.count == 1, "Declined feedback saves without duplicate rows")
      let parent = record
      history = [JSON(["session_id":UUID().uuidString,"plan":["topic":"Older garden practice"]])]; useHistory = false
      try check(request()["relevant_history"].list.isEmpty && request()["history_choice"].text == "declined", "Declined older history must not enter a fresh request")
      try check(PracticeHistory.chain([],completed:parent).count == 1, "Repeat includes current run despite older-history refusal")
      try check(PracticeHistory.chain([parent],completed:parent).count == 1, "Repeat history is deduplicated")
      say("no"); try check(phase == .lobby, "No repeat returns to forest lobby")
      seed(); finish(early:false); flush(); say("skip"); say("skip"); say("no"); say("no")
      try check(phase == .repeatPrompt && store.records.count == 2 && record["reflection_file"].text.isEmpty, "Declining both options still saves")
      let reopened = SessionStore(root:store.root)
      try check(reopened.records.count == 2 && reopened.records.allSatisfy { $0["outcome"].text != "running" }, "Completed records survive reopening")
      let csv = store.root.appendingPathComponent("SESSIONS.csv")
      try FileManager.default.removeItem(at:csv)
      try FileManager.default.createDirectory(at:csv,withIntermediateDirectories:false)
      save(); try check(pendingPostSave != nil && phase == .error, "Write failure must expose local-save retry")
      try FileManager.default.removeItem(at:csv)
      say("retry")
      try check(phase == .repeatPrompt && pendingPostSave == nil && store.records.count == 2, "Retry must save locally without new generation")
      phase = .feedback; let nonce = feedbackNonce
      deliverFeedback(JSON(["did_well":[["text":"You finished your opening."]],"noticed":[]]),nonce:nonce)
      try check(store.records.first(where: { $0["session_id"].text == sessionID })?["feedback"].object != nil, "Feedback must persist before playback finishes")
      audio.speechFinished(); flush()
      try check(phase == .repeatPrompt && store.records.count == 2, "Feedback completion must save and advance automatically")
      deliverFeedback(JSON(["one_quick_fix":"Stale feedback"]),nonce:nonce)
      try check(phase == .repeatPrompt && !message.contains("Stale feedback"), "Late feedback cannot speak on the repeat screen")
      audio.silence(); audio.play("forest", gain:0.14)
      audio.say("First narration.")
      try check(abs((audio.players["forest"]?.volume ?? -1) - 0.035) < 0.001, "Narration ducks the intended gain")
      audio.say("Replacement narration.")
      try check(abs((audio.players["forest"]?.volume ?? -1) - 0.035) < 0.001, "Replacing speech must not compound ducking")
      audio.speechFinished()
      try check(abs((audio.players["forest"]?.volume ?? -1) - 0.14) < 0.001, "Speech completion restores the exact intended gain")
      history = [parent]; useHistory = true
      try deleteHistory(); flush()
      try check(store.records.isEmpty && history.isEmpty && !useHistory && plan.object == nil, "Delete must clear durable and in-memory session/history state")
      let result = JSON(["status":"passed","checks":checks,"mode":"synthetic native controller audit; no microphone or provider calls"])
      try JSONEncoder().encode(result).write(to:FileManager.default.urls(for:.documentDirectory,in:.userDomainMask)[0].appendingPathComponent("PostSessionAudit.json"),options:.atomic)
    } catch {
      try? JSONEncoder().encode(JSON(["status":"failed","checks":checks,"error":error.localizedDescription])).write(to:FileManager.default.urls(for:.documentDirectory,in:.userDomainMask)[0].appendingPathComponent("PostSessionAudit.json"),options:.atomic)
    }
    audio.silence()
  }
}
#endif

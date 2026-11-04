import Foundation

extension Session {
  func prepareSameWorldAttempt(_ result: JSON, token: UUID) async -> Bool {
    let previousID = sessionID, previousRecord = record, worldIdentity = currentWorldID
    let nextID = UUID().uuidString, transaction = UUID().uuidString, endpoint = api, baseRevision = revision
    var nextScene = scene, nextPlan = plan, nextAudio = audioPlan
    var applied: [String] = [], appliedDeferred: [String] = [], remainingDeferred: [String] = []
    let queued = deferredChanges
    @MainActor func ownsRequest() -> Bool { repeatToken == token && repeatPreparing && sessionID == previousID && revision == baseRevision }
    @MainActor func change(_ operations: [JSON]? = nil, text: String? = nil) async throws -> JSON {
      guard ownsRequest() else { throw CancellationError() }
      while !pauses.isEmpty { try await Task.sleep(for:.milliseconds(100));guard ownsRequest() else { throw CancellationError() } }
      var body: [String:Any] = ["session_id":previousID,"expected_revision":baseRevision,"scope":"next_attempt",
        "candidate":["plan":nextPlan.raw,"scene":nextScene.raw,"audio":nextAudio.raw]]
      if let operations { body["edit"] = ["operations":operations.map(\.raw),"question":""] as [String:Any] }
      else { body["text"] = text ?? "" }
      let value = try await endpoint.call(operations == nil ? "/v1/world-edit-plans" : "/v1/world-edit-operations",JSON(body),timeout:25)
      guard ownsRequest() else { throw CancellationError() }
      if value["status"].text == "ready" {
        nextScene = value["scene"];nextPlan = value["plan"];nextAudio = value["audio"]
        applied.append(value["summary"].text)
      }
      return value
    }
    @MainActor func population(_ target: Int) -> JSON? {
      let all = nextPlan["characters"].list.filter(ScenePatch.isAudience), protected = ScenePatch.protectedCharacterIDs(scene:nextScene,plan:nextPlan)
      let editable = all.filter { !protected.contains($0["id"].text) }, amount = target-(all.count-editable.count)
      guard !editable.isEmpty, amount >= 0 else { return nil }
      return JSON(["op":"population","character_ids":editable.map { $0["id"].text },"target_count":amount])
    }
    do {
      // Explicit requests own their dimensions. The recommendation already saw
      // them, so applying both would double relative additions or extensions.
      let audienceQueued = queued.contains { text in ["audience","crowd","people"].contains(where:text.lowercased().contains) }
      let lightQueued = queued.contains { text in ["light","bright","dark"].contains(where:text.lowercased().contains) }
      let durationQueued = queued.contains { AttemptTiming.requestedDuration($0,current:plan["duration_sec"].value) != nil }
      if result["direction"].text != "maintain" {
        let oldIntensity = plan["intensity_1_10"].value, requested = result["intensity_1_10"].number ?? oldIntensity
        for proposal in result["changes"].list {
          let dimension = proposal["dimension"].text.lowercased(), after = proposal["after"].text
          if !audienceQueued, ["audience","crowd","people"].contains(where:dimension.contains) {
            if ScenePatch.audienceCount(plan:nextPlan) > 0,case .audience(let target) = ScenePatch.parse("make the audience " + after,currentAudience:ScenePatch.audienceCount(plan:nextPlan)),let operation = population(target) { _ = try? await change([operation]) }
            else { _ = try? await change(text:"For the next attempt, set the " + dimension + " to " + after + ". Keep this same place and preserve required conversation partners.") }
          } else if !lightQueued, ["light","bright"].contains(where:dimension.contains),
            case .environment(let brighter) = ScenePatch.parse("make the lighting " + after,currentAudience:ScenePatch.audienceCount(plan:nextPlan)) {
            _ = try? await change([JSON(["op":"lighting","change":brighter ? "brighter" : "dimmer"])])
          } else if !["duration","time"].contains(where:dimension.contains) {
            _ = try? await change(text:"For the next attempt, change " + dimension + " from " + proposal["before"].text + " to " + after + ". Preserve this same place and all explicit boundaries.")
          }
        }
        if !durationQueued, let duration = result["duration_seconds"].number, duration != nextPlan["duration_sec"].value {
          _ = try? await change([JSON(["op":"duration","seconds":duration])])
        }
        if !applied.isEmpty {
          nextPlan["intensity_1_10"] = JSON(result["direction"].text == "ease" ? min(oldIntensity,requested) : requested)
          if result["intensity"].object != nil { nextPlan["intensity"] = result["intensity"] }
        }
      }
      for text in queued {
        guard ownsRequest() else { throw CancellationError() }
        do {
          let value: JSON
          if let duration = AttemptTiming.requestedDuration(text,current:nextPlan["duration_sec"].value), !text.lowercased().contains(" and ") {
            value = try await change([JSON(["op":"duration","seconds":duration])])
          } else if case .audience(let count) = ScenePatch.parse(text,currentAudience:ScenePatch.audienceCount(plan:nextPlan)),
            !text.lowercased().contains(" and "), let operation = population(count) { value = try await change([operation]) }
          else { value = try await change(text:text) }
          if ["ready","unchanged"].contains(value["status"].text), value["deferred"].list.isEmpty { appliedDeferred.append(text) }
          else { remainingDeferred.append(text) }
        } catch is CancellationError { throw CancellationError() }
        catch { remainingDeferred.append(text) }
      }
      for key in ["session_id","revision"] {
        let value = key == "session_id" ? JSON(nextID) : JSON(1)
        nextScene[key] = value;nextPlan[key] = value;nextAudio[key] = value
      }
      nextPlan["narrator_intro_8s"] = JSON(try await audio.fitIntro(nextPlan["narrator_intro_8s"].text))
      guard ownsRequest() else { throw CancellationError() }
      let prepared = try await endpoint.call("/v1/world-preparations",revisionBody(scene:nextScene,plan:nextPlan,audio:nextAudio,expected:0,transaction:transaction,worldID:worldIdentity),timeout:12)
      try await prepareTextureAssets(prepared["scene"])
      try world.load(prepared["scene"],plan:prepared["plan"],install:false)
      var preparedRuntime: ScenarioRuntime?
      var preparedDefinition: ScenarioDefinition?
      if prepared["scene"]["scenario"].object != nil {
        let definition = try JSONDecoder().decode(ScenarioDefinition.self,from:JSONEncoder().encode(prepared["scene"]["scenario"]))
        preparedRuntime = try ScenarioRuntime(definition);preparedDefinition = definition
      }
      while !pauses.isEmpty { try await Task.sleep(for:.milliseconds(100));guard ownsRequest() else { throw CancellationError() } }
      guard ownsRequest() else { throw CancellationError() }
      var nextRecord = JSON(["schema_version":"1","session_id":nextID,"parent_session_id":previousID,"world_id":worldIdentity,
        "started_at":ISO8601DateFormatter().string(from:Date()),"outcome":"prepared","scene":prepared["scene"].raw,"plan":prepared["plan"].raw,"audio":prepared["audio"].raw,
        "scene_revision":1,"topic_short":prepared["plan"]["topic_short"].text,"intensity_1_10":prepared["plan"]["intensity_1_10"].value,
        "active_seconds":0,"stop_count":0,"early_end":false,"use_history":true,"chained_rerun":true,
        "reported_difficulty":NSNull(),"reported_readiness":NSNull(),"observations":[],"turns":[],
        "deferred_applied":appliedDeferred,"deferred_changes":remainingDeferred,"adaptation":result.raw,"adaptation_applied":applied,
        "generation_provenance":previousRecord["generation_provenance"].raw,"pending_world_transaction":transaction,
        "setup_context":["fear":fear,"ability":ability,"use_history":useHistory,"history_ids":useHistory ? history.map { $0["session_id"].text } : []]])
      try store.save(nextRecord,rebuild:false)
      let accepted = try await sendWorldCommit(revisionBody(scene:prepared["scene"],plan:prepared["plan"],audio:prepared["audio"],expected:0,transaction:transaction,worldID:worldIdentity),endpoint:endpoint)
      guard ownsRequest() else { throw CancellationError() }
      try world.load(accepted["scene"],plan:accepted["plan"])
      nextRecord.object?.removeValue(forKey:"pending_world_transaction")
      try store.save(nextRecord)
      let priorFear = fear, priorAbility = ability, authorizedHistory = useHistory ? history : []
      newSession()
      sessionID = nextID;revision = 1;parent = previousID
      fear = priorFear;ability = priorAbility;intakeApproved = true
      history = PracticeHistory.chain(authorizedHistory,completed:previousRecord);useHistory = true
      scene = accepted["scene"];plan = accepted["plan"];audioPlan = accepted["audio"];record = nextRecord
      deferredChanges = remainingDeferred;adaptation = result;scenario = preparedRuntime
      audio.setCommandPhrases(preparedDefinition?.steps.flatMap { $0.actions.flatMap(\.phrases) } ?? [])
      remaining = plan["duration_sec"].value
      phase = .repeatPreparation;loading = false;pendingPhase = nil
      message = (applied.isEmpty ? "Your next attempt keeps the same place and difficulty." : applied.joined(separator:" "))
        + (remainingDeferred.isEmpty ? "" : " Still pending: " + remainingDeferred.joined(separator:"; ") + ".")
      audio.say(message + " You can say HEY BUILDER to change this place before starting.") { [weak self] in
        guard let self, sessionID == nextID, phase == .repeatPreparation, pauses.isEmpty else { return }
        beginPreparedAttempt()
      }
      return true
    } catch {
      _ = try? await endpoint.call("/v1/world-transactions/" + transaction + "/cancel",JSON([:]),timeout:8)
      try? store.removeUnstartedAttempt(nextID)
      setupNotice = error is CancellationError ? "" : error.localizedDescription
      return false
    }
  }
  func beginPreparedAttempt() {
    guard phase == .repeatPreparation, pauses.isEmpty else { return }
    introTime = 0;transitionID = UUID();phase = .intro;message = plan["narrator_intro_8s"].text
    audio.say(message,intro:true)
  }
}

import Foundation

struct FrozenWorldEdit {
  let scene: JSON
  let plan: JSON
  let audio: JSON
  let record: JSON
  let revision: Int
  let checkpoint: JSON
  let transactionID: String
  let deferred: [String]
}

extension Session {
  var currentWorldID: String { record["world_id"].string ?? record["parent_session_id"].string ?? sessionID }

  func revisionBody(scene: JSON, plan: JSON, audio: JSON, expected: Int, transaction: String? = nil, worldID: String? = nil) -> JSON {
    var body: [String: Any] = ["session_id":plan["session_id"].text,"expected_revision":expected,
      "revision":plan["revision"].value,"scene":scene.raw,"plan":plan.raw,"audio":audio.raw,"world_id":worldID ?? currentWorldID]
    if let transaction { body["transaction_id"] = transaction }
    return JSON(body)
  }
  func prepareTextureAssets(_ spec: JSON) async throws {
    do { try await GeneratedTextures.prepare(scene: spec,api: api) }
    catch is CancellationError { throw CancellationError() }
    catch {
      try Task.checkCancellation()
      setupNotice = "Some optional surface images could not load. The finished base materials remain available."
    }
  }
  /// Only this idempotent commit may be replayed after a lost response. Generation
  /// and user speech are never replayed here.
  func sendWorldCommit(_ body: JSON, endpoint: API) async throws -> JSON {
    do { return try await endpoint.call("/v1/world-commits",body,timeout:8) }
    catch {
      guard API.isTransientConnection(error) else { throw error }
      try Task.checkCancellation()
      return try await endpoint.call("/v1/world-commits",body,timeout:8)
    }
  }
  func applyWorldEdit(_ text: String) {
    guard editTask == nil, !editPreparing else { return }
    let lower = text.lowercased()
    if [" and ","warmer","cooler","quiet","calm","fog","sky","move ","friendl","tougher"].contains(where:lower.contains) {
      requestInterpretedEdit(text); return
    }
    switch ScenePatch.parse(text,currentAudience:ScenePatch.audienceCount(plan:plan)) {
    case .audience(let count):
      let all = plan["characters"].list.filter(ScenePatch.isAudience), protected = ScenePatch.protectedCharacterIDs(scene:scene,plan:plan)
      let editable = all.filter { !protected.contains($0["id"].text) }
      guard !editable.isEmpty else { requestInterpretedEdit(text);return }
      let target = count-(all.count-editable.count)
      guard target >= 0 else { editClarification("This scene has required conversational people who must stay. Choose a larger audience count.");return }
      requestInterpretedEdit(text,operations:[JSON(["op":"population","character_ids":editable.map { $0["id"].text },"target_count":target])]);return
    case .environment(let brighter):
      requestInterpretedEdit(text,operations:[JSON(["op":"lighting","change":brighter ? "brighter" : "dimmer"])]);return
    case .material(let texture):
      let lower = text.lowercased()
      let target = ["floor","wall","ground","path"].first(where:lower.contains)
      guard let result = ScenePatch.patchMaterial(scene:scene,textureID:texture,target:target) else {
        editClarification("Which surface should change? Name the floor, walls, ground, or path, then say THAT'S ALL."); return
      }
      requestInterpretedEdit(text,operations:[JSON(["op":"material","node_ids":result.appliedNodeIDs,"texture_asset_id":texture,"texture_scale":2])]);return
    case .decorative, .behavior:
      requestInterpretedEdit(text); return
    case .deferred(let request):
      if !["duration","task","route","path","longer","shorter","minute","second"].contains(where:lower.contains) {
        requestInterpretedEdit(text); return
      }
      if phase == .repeatPreparation, let duration = AttemptTiming.requestedDuration(text,current:plan["duration_sec"].value),
        let timed = try? AttemptTiming.retime(plan:plan,scene:scene,audio:audioPlan,duration:duration) {
        startWorldRevision(scene:timed.scene,plan:timed.plan,summary:"This attempt will last \(Int(duration)) seconds.",audio:timed.audio);return
      }
      deferredChanges.append(request); record["deferred_changes"] = JSON(deferredChanges)
      revisionReady = true; builderEditing = false
      message = "I've kept that request for your next attempt. I'll confirm what can be applied."
      persistEditRecord(); audio.say(message); return
    case .ambiguous(let target):
      editClarification(target == "lighting" ? "Should the lighting get brighter or dimmer?" : target == "population_limit" ? "This version supports up to sixteen people. What audience count would you like within that limit?" : "Should the audience get larger or smaller, or is there an exact number?"); return
    }
  }
  func requestInterpretedEdit(_ text: String, operations: [JSON]? = nil) {
    let owner = UUID(), attempt = sessionID, base = revision, endpoint = api
    editOwner = owner;editPreparing = true;builderEditing = false;revisionReady = false
    message = "Understanding your change. Your place stays paused."
    editTask = Task { [weak self] in
      guard let self else { return }
      do {
        var body: [String:Any] = ["session_id":attempt,"expected_revision":base,"scope":phase == .repeatPreparation ? "next_attempt" : "active"]
        if let operations { body["edit"] = ["operations":operations.map(\.raw),"question":""] as [String:Any] }
        else { body["text"] = text }
        let result = try await endpoint.call(operations == nil ? "/v1/world-edit-plans" : "/v1/world-edit-operations",JSON(body),timeout:25)
        guard owner == editOwner, attempt == sessionID, base == revision, pauses.contains("builder_edit") else { return }
        editTask = nil; editPreparing = false
        if result["status"].text == "clarify" { editClarification(result["question"].text);return }
        if result["status"].text == "unchanged" {
          revisionReady = true;builderEditing = false
          message = result["summary"].text + " Your place is unchanged. Say RESUME when ready.";audio.say(message);return
        }
        let queued = result["deferred"].list.map(\.text)
        if result["status"].text == "deferred" {
          deferredChanges += queued;record["deferred_changes"] = JSON(deferredChanges);persistEditRecord()
          revisionReady = true;builderEditing = false;message = "Your request is kept for the next attempt. Say RESUME when ready.";audio.say(message);return
        }
        startWorldRevision(scene:result["scene"],plan:result["plan"],summary:result["summary"].text,audio:result["audio"],deferred:queued)
      } catch {
        guard owner == editOwner, attempt == sessionID else { return }
        editTask = nil;editPreparing = false
        editClarification("I couldn't prepare that change: " + error.localizedDescription + " Your place is unchanged.")
      }
    }
  }
  func editClarification(_ prompt: String) {
    answer = VoiceAnswer(); builderEditing = true; revisionReady = false; message = prompt; audio.say(prompt)
  }
  func startWorldRevision(scene candidateScene: JSON, plan candidatePlan: JSON, summary: String, audio candidateAudio: JSON? = nil, deferred queued: [String] = []) {
    let token = UUID(); editOwner = token
    let frozen = FrozenWorldEdit(scene:scene,plan:plan,audio:audioPlan,record:record,revision:revision,
      checkpoint:world.checkpoint(),transactionID:UUID().uuidString,deferred:deferredChanges)
    editSnapshot = frozen; editPreparing = true; builderEditing = false; revisionReady = false
    message = "Preparing your change. Your practice stays paused."
    let attempt = sessionID, endpoint = api
    var nextScene = candidateScene, nextPlan = candidatePlan, nextAudio = candidateAudio ?? audioPlan
    nextScene["revision"] = JSON(revision+1); nextPlan["revision"] = JSON(revision+1); nextAudio["revision"] = JSON(revision+1)
    let request = revisionBody(scene:nextScene,plan:nextPlan,audio:nextAudio,expected:revision,transaction:frozen.transactionID)
    editTask = Task { [weak self] in
      guard let self else { return }
      do {
        let prepared = try await endpoint.call("/v1/world-preparations",request,timeout:12)
        guard editOwner == token, sessionID == attempt else { throw CancellationError() }
        let compiledScene = prepared["scene"], compiledPlan = prepared["plan"], compiledAudio = prepared["audio"]
        try await prepareTextureAssets(compiledScene)
        try world.load(compiledScene,plan:compiledPlan,install:false)
        while !pauses.subtracting(["builder_edit"]).isEmpty {
          try await Task.sleep(for:.milliseconds(100)); try Task.checkCancellation()
        }
        guard editOwner == token, sessionID == attempt, [.active,.repeatPreparation].contains(phase), pauses.contains("builder_edit") else { throw CancellationError() }
        record["pending_world_transaction"] = JSON(frozen.transactionID)
        try store.save(record,rebuild:false)
        let commit = revisionBody(scene:compiledScene,plan:compiledPlan,audio:compiledAudio,expected:frozen.revision,transaction:frozen.transactionID)
        let accepted = try await sendWorldCommit(commit,endpoint:endpoint)
        guard editOwner == token, sessionID == attempt, [.active,.repeatPreparation].contains(phase) else { throw CancellationError() }
        let oldIDs = Set(frozen.scene["nodes"].list.map { $0["id"].text })
        let newIDs = Set(accepted["scene"]["nodes"].list.map { $0["id"].text })
        var oldNodes: [String:JSON] = [:]
        frozen.scene["nodes"].list.forEach { oldNodes[$0["id"].text] = $0 }
        let changedMaterials = Set(accepted["scene"]["nodes"].list.filter { oldNodes[$0["id"].text]?["material"] != $0["material"] }.map { $0["id"].text })
        let changedTransforms = Set(accepted["scene"]["nodes"].list.filter { node in
          guard let old = oldNodes[node["id"].text] else { return false }
          return ["position","rotation_radians","scale"].contains { old[$0] != node[$0] }
        }.map { $0["id"].text })
        let changedBehaviors = Set(accepted["plan"]["characters"].list.filter { character in
          let node = accepted["scene"]["nodes"].list.first { $0["id"].text == character["scene_node_id"].text }
          return node?["animation"] != oldNodes[character["scene_node_id"].text]?["animation"]
        }.map { $0["id"].text })
        try world.load(accepted["scene"],plan:accepted["plan"])
        try world.restore(frozen.checkpoint,allowingRemoved:oldIDs.subtracting(newIDs),changedTransforms:changedTransforms,changedMaterials:changedMaterials,
          changedBehaviors:changedBehaviors,environmentChanged:frozen.scene["environment"] != accepted["scene"]["environment"])
        for node in accepted["scene"]["nodes"].list where changedMaterials.contains(node["id"].text) {
          let original = oldNodes[node["id"].text]?["material"] ?? JSON()
          let live = frozen.checkpoint["materials"][node["id"].text].object != nil ? frozen.checkpoint["materials"][node["id"].text] : original
          let material = ScenePatch.mergeAppearance(base:original,changed:node["material"],current:live)
          world.operation(JSON(["type":"set_material","node_id":node["id"].text,"material":material.raw]),speak:{_ in},sound:{_ in})
        }
        if frozen.scene["environment"] != accepted["scene"]["environment"] {
          let live = frozen.checkpoint["environment"]["environment"].object != nil ? frozen.checkpoint["environment"]["environment"] : frozen.scene["environment"]
          let environment = ScenePatch.mergeAppearance(base:frozen.scene["environment"],changed:accepted["scene"]["environment"],current:live)
          var operation = frozen.checkpoint["environment"].object != nil ? frozen.checkpoint["environment"] : JSON(["type":"set_environment"])
          operation["environment"] = environment
          if let ambient = operation["ambient_intensity"].number {
            operation["ambient_intensity"] = JSON(min(1,max(0,ambient+accepted["scene"]["lighting"]["ambient_intensity"].value-frozen.scene["lighting"]["ambient_intensity"].value)))
          }
          world.operation(operation,speak:{_ in},sound:{_ in})
        }
        scene = accepted["scene"]; plan = accepted["plan"]; audioPlan = accepted["audio"]; revision = Int(plan["revision"].value)
        record["scene"] = scene; record["plan"] = plan; record["audio"] = audioPlan
        record["scene_revision"] = JSON(revision); record["world_id"] = accepted["world_id"]
        deferredChanges += queued;record["deferred_changes"] = JSON(deferredChanges)
        if accepted["audio"] != frozen.audio { audio.apply(audioPlan,active:world.activeElapsed);if !pauses.isEmpty { audio.pause() } }
        record.object?.removeValue(forKey:"pending_world_transaction")
        checkpoint(force:true)
        try store.save(record)
        editPreparing = false; editTask = nil; revisionReady = true; builderEditing = false
        message = summary + " Say RESUME when you're ready."; audio.say(message)
      } catch {
        guard editOwner == token, sessionID == attempt else { return }
        editTask = nil
        await restoreCancelledEdit(frozen,endpoint:endpoint,token:token)
      }
    }
  }
  func restoreCancelledEdit(_ frozen: FrozenWorldEdit, endpoint: API, token: UUID) async {
    do {
      let cancelled = try await endpoint.call("/v1/world-transactions/" + frozen.transactionID + "/cancel",JSON([:]),timeout:8)
      guard editOwner == token else { return }
      let restoredScene = cancelled["scene"].object != nil ? cancelled["scene"] : frozen.scene
      let restoredPlan = cancelled["plan"].object != nil ? cancelled["plan"] : frozen.plan
      try world.load(restoredScene,plan:restoredPlan); try world.restore(frozen.checkpoint)
      scene = restoredScene; plan = restoredPlan; audioPlan = cancelled["audio"].object != nil ? cancelled["audio"] : frozen.audio
      audio.apply(audioPlan,active:world.activeElapsed);if !pauses.isEmpty { audio.pause() }
      revision = Int(plan["revision"].value); record = frozen.record
      deferredChanges = frozen.deferred
      record["scene"] = scene; record["plan"] = plan; record["audio"] = audioPlan; record["scene_revision"] = JSON(revision)
      record.object?.removeValue(forKey:"pending_world_transaction")
      checkpoint(force:true); try store.save(record)
      editPreparing = false; editTask = nil; editSnapshot = nil; revisionReady = false; builderEditing = false
      message = "Your original place is kept. Say RESUME to continue or HEY BUILDER to try another change."; audio.say(message)
      if endAfterEditCancellation { endAfterEditCancellation = false; finish(early:true) }
    } catch {
      guard editOwner == token else { return }
      editPreparing = false; editTask = nil
      setupNotice = error.localizedDescription
      message = "I couldn't confirm the change was cancelled. Your practice stays paused. Say CANCEL to retry."; audio.say(message)
    }
  }
  func cancelWorldEdit() {
    editTask?.cancel(); editTask = nil
    editOwner = UUID();editPreparing = false
    guard let frozen = editSnapshot else { revisionReady = false; builderEditing = false; message = "Your place is unchanged. Say RESUME when ready."; audio.say(message); return }
    let token = UUID(); editOwner = token; editPreparing = true
    let endpoint = api
    editTask = Task { [weak self] in await self?.restoreCancelledEdit(frozen,endpoint:endpoint,token:token) }
  }
}

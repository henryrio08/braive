import Foundation

extension Session {
  func requireRestoration(_ owner: UUID) throws {
    try Task.checkCancellation()
    guard owner == restorationToken else { throw CancellationError() }
  }
  /// Prepared worlds are durable without inventing an interrupted performance.
  func restorePreparedAttempt(_ original: JSON, owner: UUID) async throws {
    try requireRestoration(owner)
    let endpoint = api
    var saved = original
    if let transaction = saved["pending_world_transaction"].string {
      let rolledBack = try await endpoint.call("/v1/world-transactions/"+transaction+"/cancel",JSON([:]),timeout:8)
      try requireRestoration(owner)
      if rolledBack["scene"].object != nil {
        saved["scene"] = rolledBack["scene"];saved["plan"] = rolledBack["plan"];saved["audio"] = rolledBack["audio"]
        saved["scene_revision"] = rolledBack["plan"]["revision"]
      }
      saved.object?.removeValue(forKey:"pending_world_transaction")
    }
    sessionID = saved["session_id"].text;record = saved
    plan = saved["plan"];scene = saved["scene"];audioPlan = saved["audio"];revision = Int(plan["revision"].value)
    let registration = revisionBody(scene:scene,plan:plan,audio:audioPlan,expected:0)
    do {
      let current = try await endpoint.call("/v1/worlds/"+sessionID,timeout:8)
      try requireRestoration(owner)
      guard current["plan"]["revision"] == plan["revision"] else { throw world.failure("The practice computer has another revision of this saved place.") }
    } catch let error as NSError where error.domain == "Braive" && error.code == 404 {
      try requireRestoration(owner)
      _ = try await endpoint.call("/v1/world-commits",registration,timeout:12)
      try requireRestoration(owner)
    } catch {
      try requireRestoration(owner)
      guard API.isTransientConnection(error) else { throw error }
      setupNotice = "Your saved place is available offline. Online replies and changes need the practice computer."
    }
    try requireRestoration(owner)
    try await prepareTextureAssets(scene)
    try requireRestoration(owner)
    let definition = try JSONDecoder().decode(ScenarioDefinition.self,from:JSONEncoder().encode(scene["scenario"]))
    let runtime = try ScenarioRuntime(definition)
    try world.load(scene,plan:plan)
    scenario = runtime;audio.setCommandPhrases(definition.steps.flatMap { $0.actions.flatMap(\.phrases) })
    fear = saved["setup_context"]["fear"].text;ability = saved["setup_context"]["ability"].text
    useHistory = saved["setup_context"]["use_history"].bool ?? false
    let ids = Set(saved["setup_context"]["history_ids"].list.map(\.text))
    history = useHistory ? store.records.filter { ids.contains($0["session_id"].text) } : []
    parent = saved["parent_session_id"].string;deferredChanges = saved["deferred_changes"].list.map(\.text)
    adaptation = saved["adaptation"];intakeApproved = true;attemptBegan = false;remaining = plan["duration_sec"].value
    try store.save(record)
    phase = .repeatPreparation;loading = false;pendingPhase = nil
    message = "Your saved place is ready. Say START to begin, or HEY BUILDER to make a change."
    world.scene.isPaused = !pauses.isEmpty;audio.say(message)
  }
}

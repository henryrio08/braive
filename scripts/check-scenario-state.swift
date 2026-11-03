import Foundation

@main struct ScenarioStateChecks {
 static func main() throws {
  let data = Data(#"{"objective":"Route","initial_step_id":"start","dialogue_policy":"disabled","steps":[{"id":"start","prompt":"Start","terminal":false,"actions":[],"start_operations":[{"type":"move_viewer","path_id":"route"}],"completion":{"trigger":"after_seconds","after_seconds":5,"next_step_id":"wait"}},{"id":"wait","prompt":"Wait","terminal":false,"actions":[],"start_operations":[],"completion":{"trigger":"motion_complete","motion_path_id":"route","next_step_id":"done"}},{"id":"done","prompt":"Arrived","terminal":true,"actions":[],"start_operations":[]}] }"#.utf8)
  let definition = try JSONDecoder().decode(ScenarioDefinition.self, from:data)
  var runtime = try ScenarioRuntime(definition); _ = runtime.start(at:0)
  runtime.receiveCompletedMotions(["route"]) // Conversation may defer tick this frame.
  assert(runtime.tick(at:1,completedMotion:nil) == nil)
  assert(runtime.tick(at:5,completedMotion:nil)?.stepID == "wait")
  let saved = try JSONEncoder().encode(runtime.snapshot)
  var resumed = try ScenarioRuntime(definition)
  try resumed.restore(JSONDecoder().decode(ScenarioRuntime.Snapshot.self,from:saved))
  assert(resumed.tick(at:5.1,completedMotion:nil)?.stepID == "done", "Completion survives earlier frames and checkpoint restore")
  assert(runtime.tick(at:5.1,completedMotion:nil)?.stepID == "done")
  let guidedDefinition=try JSONDecoder().decode(ScenarioDefinition.self,from:Data(contentsOf:URL(fileURLWithPath:"tests/fixtures/guided-scenario.json")))
  var guided=try ScenarioRuntime(guidedDefinition);_ = guided.start(at:0)
  assert(guided.isGuided && guided.hear("walk",at:1) == nil)
  assert(guided.tick(at:6,completedMotion:"approach")?.stepID == "conversation")
  assert(guided.conversationTarget == "host")
  let guidedState=try JSONEncoder().encode(guided.snapshot)
  var restoredGuided=try ScenarioRuntime(guidedDefinition)
  try restoredGuided.restore(JSONDecoder().decode(ScenarioRuntime.Snapshot.self,from:guidedState))
  assert(restoredGuided.conversationTarget == "host")
  print("Scenario state checks passed: latched completion, timed entry, Codable checkpoint and exact stage restore.")
 }
}

import Foundation
import simd

@main struct ScenarioChecks {
  struct Fixture: Decodable {
    let initial_position: [Float], scenario: ScenarioDefinition, motion_paths: [ViewerPath]
  }
  static func main() throws {
    let fixture = try JSONDecoder().decode(Fixture.self, from: Data(contentsOf: URL(fileURLWithPath: "tests/fixtures/motion-scenario.json")))
    var count = 0
    func check(_ value: Bool, _ message: String) { guard value else { fatalError(message) }; count += 1 }
    var wall = 100.0
    var clock = PracticeClock(now: { wall })
    clock.resume(); wall += 10
    check(clock.elapsed == 0, "Intake and introduction do not start the active motion clock")
    clock.begin(); wall += 2.25
    check(clock.elapsed == 2.25, "Rendering has a continuous clock between UI ticks")
    clock.pause(); wall += 100
    check(clock.elapsed == 2.25, "STOP freezes motion and countdown for the full wall-clock pause")
    clock.resume(); wall += 0.5
    check(clock.elapsed == 2.75, "NO resumes the exact accumulated motion time")
    var scenario = try ScenarioRuntime(fixture.scenario)
    check(scenario.start(at: 0).stepID == "exit", "Start at the planned first stage")
    check(scenario.hear("deploy parachute", at: 1) == nil, "Future commands cannot skip the cabin exit")
    check(scenario.hear("do not jump", at: 1) == nil, "Negative commands never move the user")
    check(scenario.hear("I wonder what falling is like", at: 1) == nil, "Unrelated speech does not trigger chat or motion")
    let jump = scenario.hear("Jump!", at: 2)!
    check(jump.stepID == "fall" && jump.operations.first?["type"].text == "move_viewer", "Jump starts a real trajectory")
    let fall = ViewerMotion(path: fixture.motion_paths[0], origin: SIMD3(0,80,0), startedAt: 2)
    check(fall.sample(at: 2).position.y == 80, "Motion starts exactly at the current viewpoint")
    let mid = fall.sample(at: 6)
    check(abs(mid.position.y - 60) < 0.001 && !mid.complete, "Fall interpolates continuously")
    check(fall.sample(at: 6).position == mid.position, "Frozen active time preserves the exact paused position")
    let resumed = fall.sample(at: 7)
    check(resumed.position.y < mid.position.y, "Resume continues rather than restarting")
    check(scenario.hear("jump", at: 7) == nil, "Past actions cannot retrigger in a later stage")
    let deploy = scenario.hear("Deploy parachute", at: 7)!
    check(deploy.stepID == "glide" && deploy.operations.first?["path_id"].text == "glide_path", "Deployment changes motion locally")
    let glide = ViewerMotion(path: fixture.motion_paths[1], origin: resumed.position, startedAt: 7)
    check(glide.sample(at: 7).position == resumed.position, "Interrupting freefall does not teleport to a fixed path origin")
    check(scenario.tick(at: 8, completedMotion: "freefall") == nil, "Old motion completion cannot advance the new stage")
    let landing = glide.sample(at: 17)
    check(landing.complete && abs(landing.position.y - 1.6) < 0.001, "Glide reaches landing eye height")
    let terminal = scenario.tick(at: 17, completedMotion: "glide_path")!
    check(terminal.terminal && terminal.stepID == "land", "Finishing motion completes the actual activity")
    check(scenario.hear("jump", at: 18) == nil, "A completed scenario does not restart from unrelated speech")
    var automatic = try ScenarioRuntime(fixture.scenario)
    _ = automatic.start(at: 0); _ = automatic.hear("jump", at: 1)
    check(automatic.tick(at: 21, completedMotion: "freefall")?.stepID == "glide", "Authored guided progression works without a dialogue request")
    let people = [(id:"maya",name:"Maya",role:"neighbor"),(id:"ann",name:"Ann",role:"neighbor")]
    check(ScenarioRuntime.requestedCharacter("I want to talk about watering", characters:people) == nil, "Ordinary speech does not trigger optional dialogue")
    check(ScenarioRuntime.requestedCharacter("Ask Maya about watering", characters:people) == "maya", "Explicit conversation addresses the named character")
    check(ScenarioRuntime.requestedCharacter("Ask Joanne", characters:people) == nil, "A partial name does not select an unrelated character")
    check(ScenarioRuntime.requestedCharacter("Ask neighbor", characters:people) == nil, "Ambiguous roles do not select the first random character")
    var timedData = try JSONSerialization.jsonObject(with: Data(contentsOf: URL(fileURLWithPath:"tests/fixtures/motion-scenario.json"))) as! [String:Any]
    var timedScenario = timedData["scenario"] as! [String:Any]
    var steps = timedScenario["steps"] as! [[String:Any]]
    steps[0]["completion"] = ["trigger":"after_seconds","after_seconds":3,"next_step_id":"fall"]
    timedScenario["steps"] = steps; timedData["scenario"] = timedScenario
    let timedFixture = try JSONDecoder().decode(Fixture.self, from: JSONSerialization.data(withJSONObject:timedData))
    var timed = try ScenarioRuntime(timedFixture.scenario); _ = timed.start(at: 10)
    check(timed.tick(at:12.9, completedMotion:nil) == nil, "Timed stages do not advance early")
    check(timed.tick(at:13, completedMotion:nil)?.stepID == "fall", "Timed environmental events advance locally")
    for purpose in ["run","swim","walk","climb","ride","other"] {
      let data = try JSONSerialization.data(withJSONObject:["id":purpose,"purpose":purpose,"interpolation":"linear","points":[["at_seconds":10,"position":[20,2,-30]]]])
      let path = try JSONDecoder().decode(ViewerPath.self, from:data)
      let movement = ViewerMotion(path:path,origin:SIMD3(0,2,0),startedAt:0)
      check(movement.sample(at:5).position == SIMD3(10,2,-15), "Generic \(purpose) motion executes actual spatial progress")
    }
    let relativeData = try JSONSerialization.data(withJSONObject:["id":"forward","purpose":"swim","interpolation":"linear","coordinate_space":"relative","points":[["at_seconds":2,"position":[0,0,-5]]]])
    let relative = try JSONDecoder().decode(ViewerPath.self, from:relativeData)
    let heading = simd_quatf(angle: .pi/2, axis: SIMD3<Float>(0,1,0))
    let first = ViewerMotion(path:relative,origin:SIMD3(10,2,10),startedAt:0,frame:heading).sample(at:2).position
    check(simd_length(first - SIMD3(5,2,10)) < 0.001, "Relative movement follows captured heading without changing altitude")
    let second = ViewerMotion(path:relative,origin:first,startedAt:2,frame:heading).sample(at:4).position
    check(simd_length(second - SIMD3(0,2,10)) < 0.001, "Repeating swim forward makes further progress rather than reusing a fixed destination")
    var commandTurn = SpeechTurnBuffer(); commandTurn.fastPhrases = ["swim to buoy"]
    _ = commandTurn.receive("Swim to buoy",final:true,start:0,end:1,now:1)
    check(commandTurn.take(now:1.8)?.text == "Swim to buoy", "Generated action phrases use the responsive local-command window")
    let continuing = ViewerMotion.start(path:fixture.motion_paths[0],origin:mid.position,at:6,frame:heading,replacing:fall)
    check(continuing.startedAt == fall.startedAt && continuing.sample(at:6).position == mid.position, "Repeating an in-flight absolute route continues rather than rewinding")
    print("Scenario/movement checks passed: \(count). No network, microphone, or provider calls.")
  }
}

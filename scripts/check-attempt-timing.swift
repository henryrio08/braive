import Foundation

@main struct AttemptTimingChecks {
  static func main() throws {
    func expect(_ value: Bool, _ description: String) { precondition(value,description) }
    expect(AttemptTiming.requestedDuration("make the route shorter",current:60) == nil,"Route length must not become a time edit")
    expect(AttemptTiming.requestedDuration("add two minutes",current:60) == 180,"Relative minutes")
    expect(AttemptTiming.requestedDuration("make it thirty seconds",current:60) == 30,"Absolute seconds")
    expect(AttemptTiming.requestedDuration("make it ten seconds shorter",current:60) == 50,"Relative seconds")
    let plan = JSON(["duration_sec":60,"narrator_beats":[["at_active_second":20,"text":"Continue"]],"tool_calls":[]])
    let scene = JSON(["motion_paths":[["id":"approach","points":[["at_seconds":5,"position":[0,1.6,-1]]]]],
      "scenario":["steps":[
        ["id":"arrive","terminal":false,"start_operations":[["type":"move_viewer","path_id":"approach"]],"completion":["trigger":"motion_complete","motion_path_id":"approach"]],
        ["id":"hold","terminal":false,"start_operations":[],"completion":["trigger":"after_seconds","after_seconds":50]],
        ["id":"done","terminal":true,"start_operations":[]]]],
      "events":[["at_active_second":20,"operation":["type":"narrate","text":"Continue"]]]])
    let audio = JSON(["layers":[["id":"room","start_active_second":0,"end_active_second":60,"ramps":[["at_active_second":20,"fade_seconds":2,"gain":0.2]]]]])
    let value = try AttemptTiming.retime(plan:plan,scene:scene,audio:audio,duration:120)
    expect(value.scene["motion_paths"] == scene["motion_paths"],"Travel geometry and velocity remain unchanged")
    expect(value.scene["scenario"]["steps"].list[1]["completion"]["after_seconds"].value == 110,"Hold uses the additional minute")
    expect(value.plan["narrator_beats"].list[0]["at_active_second"].value == 38,"Narration follows the revised stage")
    expect(value.audio["layers"].list[0]["ramps"].list[0]["at_active_second"].value == 38,"Audio follows the same stage")
    expect(value.audio["layers"].list[0]["end_active_second"].value == 120,"Sound ends with the attempt")
    expect(plan["duration_sec"].value == 60,"Inputs remain unchanged")
    print("Attempt timing checks passed.")
  }
}

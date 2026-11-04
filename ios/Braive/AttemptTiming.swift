import Foundation

/// Retiming changes timed holds, not the geometry or velocity of authored travel.
/// Global narration/events/audio follow the revised stage timeline together.
enum AttemptTiming {
  static func requestedDuration(_ text: String, current: Double) -> Double? {
    let lower = text.lowercased()
    if ["route","path","walk","distance"].contains(where:lower.contains), !["duration","minute","second","time"].contains(where:lower.contains) { return nil }
    guard ["duration","longer","shorter","minute","second","more time","less time"].contains(where:lower.contains) else { return nil }
    let words = lower.split(whereSeparator:{ !$0.isLetter && !$0.isNumber }).map(String.init)
    let numbers = ["one":1.0,"two":2,"three":3,"four":4,"five":5,"six":6,"seven":7,"eight":8,"nine":9,"ten":10,"fifteen":15,"twenty":20,"thirty":30,"forty":40,"sixty":60]
    let amount = words.compactMap { Double($0) ?? numbers[$0] }.first
    let seconds = (amount ?? (lower.contains("second") ? 30 : 1)) * (lower.contains("second") ? 1 : 60)
    let relative = ["longer","shorter","add","extra","more time","less time","reduce","increase","decrease"].contains(where:lower.contains)
    let decrease = ["shorter","less time","reduce","decrease"].contains(where:lower.contains)
    let proposed = relative ? current + (decrease ? -seconds : seconds) : seconds
    return (10...3600).contains(proposed) ? proposed.rounded() : nil
  }

  static func retime(plan: JSON, scene: JSON, audio: JSON, duration: Double) throws -> (plan: JSON, scene: JSON, audio: JSON) {
    guard duration.isFinite, (10...3600).contains(duration), let oldDuration = plan["duration_sec"].number, oldDuration > 0 else { throw failure("Duration must be between ten seconds and one hour.") }
    var nextPlan = plan, nextScene = scene, nextAudio = audio
    var steps = scene["scenario"]["steps"].list
    let paths = scene["motion_paths"].list
    func routeDuration(_ id: String) -> Double {
      paths.first(where:{ $0["id"].text == id })?["points"].list.map { $0["at_seconds"].value }.max() ?? 0
    }
    var oldTimes: [Double] = [], minimums: [Double] = [], timed: [Int] = []
    for (index,step) in steps.enumerated() {
      if step["terminal"].bool == true { oldTimes.append(0); minimums.append(0); continue }
      let completion = step["completion"]
      let movement = step["start_operations"].list.filter { ["move_viewer","move_node"].contains($0["type"].text) }
        .map { routeDuration($0["path_id"].text) }.max() ?? 0
      if completion["trigger"].text == "after_seconds" {
        oldTimes.append(completion["after_seconds"].value); minimums.append(max(0.5,movement > 0 ? movement + 0.1 : 0.5)); timed.append(index)
      } else {
        let seconds = routeDuration(completion["motion_path_id"].text)
        oldTimes.append(seconds); minimums.append(seconds)
      }
    }
    guard !timed.isEmpty || duration == oldDuration else { throw failure("This route has no timed stage to extend. Change its stages for the next attempt instead.") }
    let oldTotal = oldTimes.reduce(0,+), reserve = min(max(3,oldDuration-oldTotal),max(3,duration*0.1))
    let minimumTotal = minimums.reduce(0,+)
    guard minimumTotal + reserve <= duration else { throw failure("That duration is too short to finish the existing movement and stages.") }
    let weights = timed.map { max(0.5,oldTimes[$0]-minimums[$0]) }, weightTotal = weights.reduce(0,+)
    var newTimes = minimums
    for (offset,index) in timed.enumerated() {
      newTimes[index] += (duration-reserve-minimumTotal) * weights[offset] / max(0.5,weightTotal)
      steps[index]["completion"]["after_seconds"] = JSON(newTimes[index])
    }
    func time(_ original: Double) -> Double {
      var oldStart = 0.0, newStart = 0.0
      for index in oldTimes.indices {
        let end = oldStart+oldTimes[index]
        if oldTimes[index] > 0, original <= end {
          return newStart+(original-oldStart)*newTimes[index]/oldTimes[index]
        }
        oldStart = end; newStart += newTimes[index]
      }
      let slack = max(0.001,oldDuration-oldStart)
      return min(duration,max(0,newStart+(original-oldStart)*(duration-newStart)/slack))
    }
    nextPlan["duration_sec"] = JSON(duration)
    nextPlan["narrator_beats"] = JSON(plan["narrator_beats"].list.map { beat -> Any in var b=beat; b["at_active_second"] = JSON(time(beat["at_active_second"].value)); return b.raw })
    nextPlan["tool_calls"] = JSON(plan["tool_calls"].list.map { call -> Any in
      var value=call
      if call["tool"].text == "plan_audio" { value["arguments"]["duration_sec"] = JSON(duration) }
      return value.raw
    })
    if scene["scenario"].object != nil { nextScene["scenario"]["steps"] = JSON(steps.map(\.raw)) }
    nextScene["events"] = JSON(scene["events"].list.map { event -> Any in var e=event; e["at_active_second"] = JSON(time(event["at_active_second"].value)); return e.raw })
    nextAudio["layers"] = JSON(audio["layers"].list.map { layer -> Any in
      var value=layer
      let start=time(layer["start_active_second"].value), end=time(layer["end_active_second"].number ?? oldDuration)
      value["start_active_second"] = JSON(start)
      if layer["end_active_second"].number != nil { value["end_active_second"] = JSON(end) }
      value["ramps"] = JSON(layer["ramps"].list.map { ramp -> Any in
        var r=ramp; let at=time(ramp["at_active_second"].value)
        r["at_active_second"] = JSON(at); r["fade_seconds"] = JSON(max(0,min(60,end-at,time(ramp["at_active_second"].value+ramp["fade_seconds"].value)-at)))
        return r.raw
      })
      return value.raw
    })
    return (nextPlan,nextScene,nextAudio)
  }
  private static func failure(_ message: String) -> NSError { NSError(domain:"AttemptTiming",code:1,userInfo:[NSLocalizedDescriptionKey:message]) }
}

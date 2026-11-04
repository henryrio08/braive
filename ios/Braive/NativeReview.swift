import Foundation
import SceneKit
import UIKit

extension Session {
  func captureRenderedFrame(to url: URL) async throws -> URL {
    guard world.captureRequest == nil else { throw world.failure("A picture is already being saved.") }
    captureResult = nil; world.captureRequest = url
    let deadline = ProcessInfo.processInfo.systemUptime + 12
    while captureResult == nil {
      guard ProcessInfo.processInfo.systemUptime < deadline else { world.captureRequest = nil; throw world.failure("The app did not draw a review frame. Keep it open and try again.") }
      try await Task.sleep(for:.milliseconds(50))
    }
    return try captureResult!.get()
  }
  func captureCurrentView() {
    guard !reviewRunning else { return }
    let destination = store.root.appendingPathComponent("WorldReview/\(UUID().uuidString)/stereo.png")
    Task { [weak self] in
      guard let self else { return }
      do { reviewLastFrame = try await captureRenderedFrame(to:destination); reviewStatus = "Your headset view is saved." }
      catch { reviewStatus = error.localizedDescription }
    }
  }
  /// Runs from Settings in the installed app. The frames come from the actual
  /// two-eye Metal/lens pipeline; no developer disk image or launch flags needed.
  func runNativeReview() {
    guard [.setup,.lobby].contains(phase), !reviewRunning, !connecting else { return }
    reviewRunning = true; reviewStatus = "Preparing the visual check…"
    reviewFiles = []
    let folder = store.root.appendingPathComponent("WorldReview/\(UUID().uuidString)")
    reviewTask = Task { [weak self] in
      guard let self else { return }
      let oldPhase = phase
      world.reviewTrackingSuspended = true
      defer {
        world.reviewTrackingSuspended = false; world.setBlackout(0); world.lobby()
        world.scene.isPaused = !pauses.isEmpty; reviewRunning = false;reviewTask = nil;phase = oldPhase
        refreshHeadsetPanels()
      }
      do {
        world.scene.isPaused = false
        var frames: [[String:Any]] = []
        @MainActor func capture(_ name: String, origin: String) async throws {
          try await Task.sleep(for:.milliseconds(200))
          let url = try await captureRenderedFrame(to:folder.appendingPathComponent(name+".png"))
          reviewLastFrame = url; reviewFiles.append(url);frames.append(["file":url.lastPathComponent,"origin":origin,"metrics":world.metrics.report.raw])
        }
        world.lobby(); world.setBlackout(0)
        world.head.eulerAngles = SCNVector3Zero
        world.setHeadsetText(title:"Make room for your next try.",detail:"",command:"Say START when ready",status:"Forest preview",visible:true)
        try await capture("forest-stereo",origin:"bundled forest, native stereo")
        world.setBlackout(1)
        world.setHeadsetText(title:"Listen. Picture yourself here.",detail:"",command:"STOP to pause",status:"Introduction preview",visible:true)
        try await capture("black-intro-stereo",origin:"app-owned blackout and optical text")
        world.setBlackout(0);try world.showPeopleReview()
        world.setHeadsetText(title:"",detail:"",command:"",status:"Character preview",visible:true)
        world.renderTime = 1.2
        try await capture("people-stereo",origin:"registered character and furniture review")
        var samples = store.records.reversed().filter { $0["scene"].object != nil }.map { JSON(["plan":$0["plan"].raw,"scene":$0["scene"].raw,"audio":$0["audio"].raw]) }
        if samples.count < 6, !server.isEmpty {
          reviewStatus = "Loading saved worlds from your computer…"
          let saved = try await api.call("/v1/review-worlds",timeout:10)
          samples += saved["worlds"].list
        }
        var seen = Set<String>()
        for sample in samples where seen.count < 6 {
          let id = sample["plan"]["session_id"].text
          guard seen.insert(id).inserted else { continue }
          reviewStatus = "Checking saved world \(seen.count)…"
          try await prepareTextureAssets(sample["scene"])
          try world.load(sample["scene"],plan:sample["plan"])
          world.renderTime = 1.2;world.setHeadsetText(title:"",detail:"",command:"",status:"Saved world preview",visible:true)
          try await capture("world-\(seen.count)-stereo",origin:"previously approved world \(id)")
        }
        let report = JSON(["status":"rendered","renderer":"production SceneKit eyes and Metal optical compositor",
          "visual_approval":"requires human inspection","frames":frames,"saved_world_count":seen.count])
        try JSONEncoder().encode(report).write(to:folder.appendingPathComponent("report.json"),options:.atomic)
        reviewReport = folder.appendingPathComponent("report.json")
        reviewFiles.append(folder.appendingPathComponent("report.json"))
        reviewStatus = seen.isEmpty
          ? "Saved the forest and character previews. No generated worlds are available on the connected backend."
          : "Saved \(frames.count) headset pictures, including \(seen.count) generated worlds. Open or share them to review the result."
      } catch { reviewStatus = "The check stopped: " + error.localizedDescription }
    }
  }
}

extension World {
  func showPeopleReview(count: Int = 4) throws {
    clear();head.position = SCNVector3(0,1.5,0);head.eulerAngles = SCNVector3Zero
    scene.background.contents = UIColor(hex:"#b9c7c6")
    let floor = SCNNode(geometry:SCNBox(width:20,height:0.1,length:20,chamferRadius:0))
    floor.position = SCNVector3(0,-0.05,-4);floor.geometry?.firstMaterial?.diffuse.contents = UIColor(hex:"#a9a08c");scene.rootNode.addChildNode(floor)
    let ambient = SCNNode();ambient.light = SCNLight();ambient.light?.type = .ambient;ambient.light?.intensity = 550;scene.rootNode.addChildNode(ambient)
    let sun = SCNNode();sun.light = SCNLight();sun.light?.type = .directional;sun.light?.intensity = 600
    sun.eulerAngles = SCNVector3(-0.7,-0.45,0);sun.light?.castsShadow = true;scene.rootNode.addChildNode(sun)
    let ids = try AssetLibrary.entries.filter { $0.character_rigged && $0.generation_enabled != false }.prefix(4).map(\.id)
    guard !ids.isEmpty else { throw failure("No registered character assets") }
    for index in 0..<min(16,max(1,count)) {
      let id = ids[index%ids.count]
      let person = try AssetLibrary.make(id);person.position = SCNVector3((Float(index%4)-1.5)*1.05,0,-4-Float(index/4)*1.3)
      person.eulerAngles.y = .pi;scene.rootNode.addChildNode(person)
      AssetLibrary.animate(person,behavior:index%4 >= 2 ? "sit" : "idle")
      if index%4 >= 2 {
        let chair = try AssetLibrary.make(AssetLibrary.first(category:"furniture",subcategory:"chair"))
        chair.position = person.position
        let chairID = try AssetLibrary.first(category:"furniture",subcategory:"chair")
        chair.eulerAngles.y = .pi + ((try AssetLibrary.entries.first { $0.id == chairID })?.semantic_front_yaw_radians ?? 0)
        scene.rootNode.addChildNode(chair)
      }
    }
  }
}

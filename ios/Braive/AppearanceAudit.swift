import Metal
import SceneKit
import UIKit

#if DEBUG
/// Explicit synthetic shader/sky review. Never bundled as a practice fallback.
@MainActor enum AppearanceAudit {
  static func run(to folder:URL) throws {
    try FileManager.default.createDirectory(at:folder,withIntermediateDirectories:true)
    guard let device=MTLCreateSystemDefaultDevice() else { throw ScenePreflight.error("Appearance review needs Metal") }
    let scene=SCNScene(),camera=SCNNode()
    camera.camera=SCNCamera();camera.camera?.fieldOfView=70;camera.position=SCNVector3(0,1.6,0);scene.rootNode.addChildNode(camera)
    let sun=SCNNode();sun.name="braive_sun";sun.light=SCNLight();sun.light?.type = .directional;sun.light?.intensity=850;sun.eulerAngles=SCNVector3(-0.7,-0.4,0);scene.rootNode.addChildNode(sun)
    let ambient=SCNNode();ambient.light=SCNLight();ambient.light?.type = .ambient;ambient.light?.intensity=350;scene.rootNode.addChildNode(ambient)
    let environment=JSON(["mode":"outdoor","sky":["kind":"procedural","horizon_color":"#c9d9cf","zenith_color":"#648fb6","ground_color":"#506750","sun_color":"#ffe4b4","sun_size_degrees":2,"haze":0.4,"cloud_coverage":0.25],"fog":["color":"#c9d9cf","start_meters":10,"end_meters":70],"lighting_environment_intensity":0.2])
    try SceneAppearance.applyEnvironment(environment,to:scene,sunDirection:SCNVector3(0.4,-0.6,-0.5),seed:42)
    let renderer=SCNRenderer(device:device,options:nil);renderer.scene=scene;renderer.pointOfView=camera
    var names:[String]=[]
    for profile in ["matte","ground","water","glass","foliage"] {
      let panel=SCNNode(geometry:SCNSphere(radius:1.2));panel.position=SCNVector3(0,1.6,-4)
      let material=SCNMaterial();material.diffuse.contents=UIColor(hex:profile == "water" ? "#3c94a4":"#829c62");material.lightingModel = .physicallyBased;material.roughness.contents=0.6
      SceneAppearance.applySurface(JSON(["profile":profile,"scale":3,"strength":0.1,"speed":0.7]),to:material)
      if profile == "glass" { material.transparency=0.3 }
      panel.geometry?.materials=[material];scene.rootNode.addChildNode(panel)
      var repeated:Data?,first:Data?
      for (label,time) in [("start",0.0),("active",5.0),("paused",5.0)] {
        if material.shaderModifiers?[.surface]?.contains("braiveTime") == true { material.setValue(Float(time),forKey:"braiveTime") }
        renderer.sceneTime=time
        for eye in [-1,1] {
          camera.position.x=Float(eye)*0.032
          guard let data=renderer.snapshot(atTime:time,with:CGSize(width:640,height:480),antialiasingMode:.multisampling4X).pngData() else { throw ScenePreflight.error("Appearance snapshot unavailable") }
          let name="\(profile)-\(label)-\(eye).png";try data.write(to:folder.appendingPathComponent(name));names.append(name)
          if eye == -1 {
            if label == "start" { first=data }
            if label == "active" { repeated=data }
            if label == "active",["water","foliage"].contains(profile),data==first { throw ScenePreflight.error("Animated surface did not change with active time") }
            if label == "paused", data != repeated { throw ScenePreflight.error("Surface changed while active time was frozen") }
          }
        }
      }
      panel.removeFromParentNode()
    }
    try JSONEncoder().encode(JSON(["mode":"synthetic native appearance audit","frames":names,"status":"passed","sky_face_size":SceneAppearance.faceSize])).write(to:folder.appendingPathComponent("result.json"))
  }
}
#endif

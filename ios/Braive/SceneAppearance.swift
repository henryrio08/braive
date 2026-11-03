import SceneKit
import UIKit

@MainActor enum SceneAppearance {
  private static var cachedSky: (key: String, images: [UIImage])?
  static let faceSize=128
  static func applyEnvironment(_ value:JSON,to scene:SCNScene,sunDirection:SCNVector3,seed:Int) throws {
    let environment=try JSONDecoder().decode(VisualEnvironmentState.self,from:JSONEncoder().encode(value))
    guard environment.fog.start_meters < environment.fog.end_meters else { throw ScenePreflight.error("Fog must end beyond its start") }
    if environment.sky.kind == "procedural" {
      let encoder=JSONEncoder();encoder.outputFormatting = .sortedKeys
      let encoded=try encoder.encode(environment.sky)
      let key=String(decoding:encoded,as:UTF8.self)+"\(sunDirection.x),\(sunDirection.y),\(sunDirection.z),\(seed)"
      let images:[UIImage]
      if let cachedSky,cachedSky.key==key { images=cachedSky.images }
      else {
        let sun=SIMD3(-Double(sunDirection.x),-Double(sunDirection.y),-Double(sunDirection.z))
        images=try (0..<6).map { face in
          var pixels=[UInt8](repeating:255,count:faceSize*faceSize*4)
          for y in 0..<faceSize { for x in 0..<faceSize {
            let direction=SkyModel.direction(face:face,u:(Double(x)+0.5)/Double(faceSize)*2-1,v:(Double(y)+0.5)/Double(faceSize)*2-1)
            let color=SkyModel.sample(environment.sky,direction:direction,sun:sun,seed:seed)
            let offset=(y*faceSize+x)*4
            pixels[offset]=UInt8((color.x*255).rounded());pixels[offset+1]=UInt8((color.y*255).rounded());pixels[offset+2]=UInt8((color.z*255).rounded())
          } }
          guard let provider=CGDataProvider(data:Data(pixels) as CFData),let cg=CGImage(width:faceSize,height:faceSize,bitsPerComponent:8,bitsPerPixel:32,bytesPerRow:faceSize*4,space:CGColorSpaceCreateDeviceRGB(),bitmapInfo:CGBitmapInfo(rawValue:CGImageAlphaInfo.premultipliedLast.rawValue),provider:provider,decode:nil,shouldInterpolate:true,intent:.defaultIntent) else { throw ScenePreflight.error("Procedural sky texture unavailable") }
          return UIImage(cgImage:cg)
        }
        cachedSky=(key,images)
      }
      scene.background.contents=images
      scene.lightingEnvironment.contents=images
      scene.lightingEnvironment.intensity=CGFloat(environment.lighting_environment_intensity)
    } else {
      scene.background.contents=UIColor(hex:environment.sky.horizon_color)
      scene.lightingEnvironment.contents=nil
      scene.lightingEnvironment.intensity=0
    }
    scene.fogColor=UIColor(hex:environment.fog.color)
    scene.fogStartDistance=environment.fog.start_meters
    scene.fogEndDistance=environment.fog.end_meters
    scene.fogDensityExponent=1
    scene.rootNode.childNode(withName:"braive_sun",recursively:false)?.light?.color=UIColor(hex:environment.sky.sun_color)
    applyStyle(value["style"],to:scene.rootNode)
  }
  private static let styleShader="""
    #pragma arguments
    float braiveStyleStrength;
    float braiveLightBands;
    #pragma body
    float braiveLuma = dot(max(_output.color.rgb, float3(0.0)), float3(0.2126, 0.7152, 0.0722));
    float braiveBands = max(3.0, braiveLightBands);
    float braiveBanded = floor(braiveLuma * braiveBands + 0.5) / braiveBands;
    float braiveSoft = max(braiveLuma * 0.8, braiveBanded);
    _output.color.rgb *= mix(1.0, braiveSoft / max(0.001, braiveLuma), braiveStyleStrength);
    """
  static func applyStyle(_ value:JSON,to root:SCNNode) {
    func visit(_ node:SCNNode) {
      // Preserve the partner-approved character palette and facial response.
      if AssetLibrary.isCharacter(node) { return }
      for material in node.geometry?.materials ?? [] {
        guard material.program == nil else { continue }
        var modifiers=material.shaderModifiers ?? [:]
        if let existing=modifiers[.fragment],!existing.contains("braiveStyle") { continue }
        modifiers[.fragment]=styleShader;material.shaderModifiers=modifiers
        material.setValue(Float(value["strength"].number ?? 0.18),forKey:"braiveStyleStrength")
        material.setValue(Float(value["light_bands"].number ?? 6),forKey:"braiveLightBands")
      }
      for child in node.childNodes { visit(child) }
    }
    visit(root)
  }
  static func applySurface(_ value:JSON,to material:SCNMaterial) {
    guard let profile=value["profile"].string else { return }
    material.shaderModifiers=[.fragment:styleShader]
    material.setValue(Float(0.18),forKey:"braiveStyleStrength")
    material.setValue(Float(6),forKey:"braiveLightBands")
    guard profile != "matte" else { return }
    let shared="""
      #pragma arguments
      float braiveTime;
      float braiveScale;
      float braiveStrength;
      float braiveSpeed;
      #pragma body
      float3 braiveWorld = (scn_frame.inverseViewTransform * float4(_surface.position, 1.0)).xyz;
      float braivePhase = braiveTime * braiveSpeed;
      """
    switch profile {
    case "ground":
      material.shaderModifiers=[.surface:shared+"""
        float grain = sin(braiveWorld.x * braiveScale + sin(braiveWorld.z * braiveScale * 0.7)) * sin(braiveWorld.z * braiveScale * 1.3);
        _surface.diffuse.rgb *= 1.0 + grain * braiveStrength;
        """]
    case "water":
      material.shaderModifiers=[.surface:shared+"""
        float3 ripple = float3(sin(braiveWorld.x * braiveScale + braivePhase), 0.0, cos(braiveWorld.z * braiveScale * 0.8 + braivePhase * 0.7)) * braiveStrength;
        _surface.normal = normalize(_surface.normal + (scn_frame.viewTransform * float4(ripple, 0.0)).xyz);
        _surface.diffuse.rgb *= 1.0 + sin((braiveWorld.x + braiveWorld.z) * braiveScale + braivePhase) * braiveStrength * 0.4;
        """]
    case "foliage":
      // Light flutter only: collision geometry and silhouettes stay stable.
      material.shaderModifiers=[.surface:shared+"""
        float flutter = sin(braiveWorld.x * braiveScale + braivePhase) * cos(braiveWorld.z * braiveScale * 0.7 + braivePhase * 0.5);
        _surface.diffuse.rgb *= 1.0 + flutter * braiveStrength;
        """]
    case "glass":
      material.roughness.contents=0.12
      material.isDoubleSided=true
    default: return
    }
    var modifiers=material.shaderModifiers ?? [:];modifiers[.fragment]=styleShader;material.shaderModifiers=modifiers
    if material.shaderModifiers?[.surface]?.contains("braiveTime") == true {
      material.setValue(Float(0),forKey:"braiveTime")
      material.setValue(Float(value["scale"].number ?? 1),forKey:"braiveScale")
      material.setValue(Float(value["strength"].number ?? 0.03),forKey:"braiveStrength")
      material.setValue(Float(value["speed"].number ?? 0.3),forKey:"braiveSpeed")
    }
  }
  static func animatedMaterials(_ root:SCNNode) -> [SCNMaterial] {
    var unique=Set<ObjectIdentifier>(),materials:[SCNMaterial]=[]
    root.enumerateChildNodes { n,_ in
      for m in n.geometry?.materials ?? [] where m.shaderModifiers?[.surface]?.contains("braiveTime") == true {
        if unique.insert(ObjectIdentifier(m)).inserted { materials.append(m) }
      }
    }
    return materials
  }
}

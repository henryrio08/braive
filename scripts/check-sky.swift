import Foundation

@main struct SkyCheck {
 static func main() throws {
  let sky=SkyParameters(kind:"procedural",horizon_color:"#c9d9cf",zenith_color:"#648fb6",ground_color:"#506750",sun_color:"#ffe4b4",sun_size_degrees:2,haze:0.4,cloud_coverage:0.25)
  let sun=SkyModel.normalized(SIMD3(0.4,0.6,-0.5))
  for face in 0..<6 { for u in [-1.0,0,1] { for v in [-1.0,0,1] {
   let color=SkyModel.sample(sky,direction:SkyModel.direction(face:face,u:u,v:v),sun:sun,seed:42)
   assert([color.x,color.y,color.z].allSatisfy { $0.isFinite && (0...1).contains($0) })
  } } }
  let edgeA=SkyModel.sample(sky,direction:SkyModel.direction(face:0,u:-1,v:0.3),sun:sun,seed:42)
  let edgeB=SkyModel.sample(sky,direction:SkyModel.direction(face:4,u:1,v:0.3),sun:sun,seed:42)
  assert(edgeA==edgeB,"Shared cubemap edges must have identical colors")
  assert(SkyModel.sample(sky,direction:sun,sun:sun,seed:42)==SkyModel.sample(sky,direction:sun,sun:sun,seed:42))
  if CommandLine.arguments.count>1 {
   let width=960,height=480
   var data=Data("P6\n\(width) \(height)\n255\n".utf8)
   for y in 0..<height { for x in 0..<width {
    let yaw=(Double(x)/Double(width)-0.5)*2*Double.pi
    let pitch=(0.5-Double(y)/Double(height))*Double.pi
    let direction=SIMD3(sin(yaw)*cos(pitch),sin(pitch),-cos(yaw)*cos(pitch))
    let c=SkyModel.sample(sky,direction:direction,sun:sun,seed:42)
    data.append(contentsOf:[UInt8(c.x*255),UInt8(c.y*255),UInt8(c.z*255)])
   } }
   try data.write(to:URL(fileURLWithPath:CommandLine.arguments[1]))
  }
  print("Sky checks passed: finite bounded colors, deterministic seed, shared cube edges; optional CPU panorama.")
 }
}

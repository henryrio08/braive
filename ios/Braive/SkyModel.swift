import Foundation

struct SkyParameters: Codable {
  let kind: String, horizon_color: String, zenith_color: String, ground_color: String, sun_color: String
  let sun_size_degrees: Double, haze: Double, cloud_coverage: Double
}
struct VisualEnvironmentState: Codable {
  struct Fog: Codable { let color: String, start_meters: Double, end_meters: Double }
  struct Style: Codable { let light_bands: Double, strength: Double }
  let mode: String, sky: SkyParameters, fog: Fog, lighting_environment_intensity: Double
  let style: Style?
}

/// A deterministic distant environment, shared by both eyes. No scene nodes,
/// camera motion or wall-clock animation are needed for the sky.
enum SkyModel {
  static func color(_ hex: String) -> SIMD3<Double> {
    let n=UInt64(hex.dropFirst(),radix:16) ?? 0
    return SIMD3(Double((n>>16)&255)/255,Double((n>>8)&255)/255,Double(n&255)/255)
  }
  static func normalized(_ v:SIMD3<Double>) -> SIMD3<Double> {
    v / max(0.000001,sqrt(v.x*v.x+v.y*v.y+v.z*v.z))
  }
  static func direction(face:Int,u:Double,v:Double) -> SIMD3<Double> {
    let directions=[SIMD3(1,-v,-u),SIMD3(-1,-v,u),SIMD3(u,1,v),SIMD3(u,-1,-v),SIMD3(u,-v,1),SIMD3(-u,-v,-1)]
    return normalized(directions[face])
  }
  private static func noise(_ x:Double,_ y:Double,seed:Double) -> Double {
    func hash(_ a:Double,_ b:Double) -> Double { let value=sin(a*127.1+b*311.7+seed)*43758.5453;return value-floor(value) }
    let ix=floor(x),iy=floor(y),fx=x-ix,fy=y-iy
    let u=fx*fx*(3-2*fx),v=fy*fy*(3-2*fy)
    return (hash(ix,iy)*(1-u)+hash(ix+1,iy)*u)*(1-v)+(hash(ix,iy+1)*(1-u)+hash(ix+1,iy+1)*u)*v
  }
  static func sample(_ sky:SkyParameters,direction raw:SIMD3<Double>,sun rawSun:SIMD3<Double>,seed:Int) -> SIMD3<Double> {
    let d=normalized(raw),sun=normalized(rawSun)
    let horizon=color(sky.horizon_color),zenith=color(sky.zenith_color),ground=color(sky.ground_color)
    let up=pow(max(0,d.y),0.6)
    var value=d.y>=0 ? horizon*(1-up)+zenith*up : horizon*(1-min(1,-d.y*3))+ground*min(1,-d.y*3)
    let haze=sky.haze*pow(1-abs(d.y),4)*0.4
    value=value*(1-haze)+horizon*haze
    if d.y>0 {
      let angle=max(0.002,sky.sun_size_degrees*Double.pi/360)
      let dot=max(0,d.x*sun.x+d.y*sun.y+d.z*sun.z)
      let disc=pow(dot,min(200000,2/(angle*angle)))
      let glow=pow(dot,64)*0.12
      value += color(sky.sun_color)*(disc+glow)
      let phase=Double(seed%997)*0.01
      let x=d.x/max(0.08,d.y)*1.8,z=d.z/max(0.08,d.y)*1.8
      let density=noise(x,z,seed:phase)*0.65+noise(x*2.1,z*2.1,seed:phase+5)*0.25+noise(x*4.2,z*4.2,seed:phase+11)*0.1
      let threshold=0.78-sky.cloud_coverage*0.42
      let coverage=max(0,min(1,(density-threshold)*6))
      let horizonFade=min(1,max(0,(d.y-0.08)/0.25))
      let cloud=coverage*coverage*(3-2*coverage)*horizonFade*0.65
      value=value*(1-cloud)+(horizon*0.3+SIMD3<Double>(repeating:0.7))*cloud
    }
    return SIMD3(min(1,max(0,value.x)),min(1,max(0,value.y)),min(1,max(0,value.z)))
  }
}

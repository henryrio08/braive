import Foundation
import simd

struct PracticeClock {
  private let now: () -> Double
  private var accumulated = 0.0
  private var resumedAt: Double?
  private var started = false
  init(now: @escaping () -> Double = { ProcessInfo.processInfo.systemUptime }) { self.now = now }
  var elapsed: Double { accumulated + (resumedAt.map { max(0, now() - $0) } ?? 0) }
  var hasStarted: Bool { started }
  mutating func restore(elapsed: Double) { accumulated = max(0, elapsed); started = true; resumedAt = nil }
  mutating func begin() { accumulated = 0; started = true; resumedAt = now() }
  mutating func pause() { accumulated = elapsed; resumedAt = nil }
  mutating func resume() { if started && resumedAt == nil { resumedAt = now() } }
}

struct ViewerPath: Decodable {
  struct Point: Decodable { let at_seconds: Double; let position: [Float] }
  let id: String, purpose: String, interpolation: String
  let coordinate_space: String?
  let clearance_radius_meters: Float?
  let eye_height_meters: Float?
  let start_position: [Float]?
  let points: [Point]
}
struct ViewerMotion {
  let path: ViewerPath, origin: SIMD3<Float>, startedAt: Double
  let frame: simd_quatf
  init(path: ViewerPath, origin: SIMD3<Float>, startedAt: Double, frame: simd_quatf = simd_quatf(angle: 0, axis: SIMD3(0,1,0))) {
    self.path = path; self.origin = origin; self.startedAt = startedAt; self.frame = frame
  }
  static func start(path: ViewerPath, origin: SIMD3<Float>, at time: Double, frame: simd_quatf, replacing current: ViewerMotion?) -> ViewerMotion {
    if let current, current.path.id == path.id, path.coordinate_space != "relative", !current.sample(at: time).complete { return current }
    return ViewerMotion(path: path, origin: origin, startedAt: time, frame: frame)
  }
  func sample(at time: Double) -> (position: SIMD3<Float>, complete: Bool) {
    let elapsed = max(0, time - startedAt)
    var previous = origin, previousTime = 0.0
    for point in path.points {
      let value = SIMD3(point.position[0], point.position[1], point.position[2])
      let next = path.coordinate_space == "relative" ? origin + frame.act(value) : value
      if elapsed < point.at_seconds {
        var t = Float((elapsed - previousTime) / (point.at_seconds - previousTime))
        t = min(1, max(0, t))
        if path.interpolation == "smooth" { t = t * t * (3 - 2 * t) }
        return (previous + (next - previous) * t, false)
      }
      previous = next; previousTime = point.at_seconds
    }
    return (previous, true)
  }
}

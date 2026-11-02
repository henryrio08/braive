import simd

@main struct HeadPoseChecks {
  static func main() {
    func same(_ a: simd_quatf, _ b: simd_quatf) -> Bool {
      abs(simd_dot(a.vector, b.vector)) > 0.99999
    }
    let identity = simd_quatf(angle: 0, axis: SIMD3<Float>(0, 1, 0))
    let initial = simd_quatf(angle: 1.2, axis: SIMD3<Float>(0, 1, 0))
      * simd_quatf(angle: 0.15, axis: SIMD3<Float>(1, 0, 0))
    let turn = simd_quatf(angle: 0.4, axis: SIMD3<Float>(0, 1, 0))
    var pose = HeadPose()
    assert(same(pose.recenter(), identity)) // Confirmation before the first motion sample.
    assert(same(pose.update(initial), identity))
    assert(same(pose.update(initial * turn), turn))
    assert(same(pose.recenter(), identity)) // A fresh headset confirmation sets forward now.
    assert(same(pose.update(initial * turn), identity))
    assert(same(pose.update(initial * turn * turn), turn)) // Head tracking remains relative.
    assert(same(pose.update(initial * turn), identity)) // Delayed scene loading doesn't recenter.
    assert(same(pose.recenter(), identity)) // Repeat confirmations are safe.
    print("Head pose checks passed: 8. No device or provider calls.")
  }
}

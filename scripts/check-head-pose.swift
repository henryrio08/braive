import simd

@main struct HeadPoseChecks {
  static func main() {
    var checks = 0
    func same(_ a: simd_quatf, _ b: simd_quatf) -> Bool {
      abs(simd_dot(a.vector, b.vector)) > 0.99999
    }
    func check(_ a: simd_quatf, _ b: simd_quatf) {
      precondition(same(a, b))
      checks += 1
    }
    let identity = simd_quatf(angle: 0, axis: SIMD3<Float>(0, 1, 0))
    let initial = simd_quatf(angle: 1.2, axis: SIMD3<Float>(0, 1, 0))
      * simd_quatf(angle: 0.15, axis: SIMD3<Float>(1, 0, 0))
    let turn = simd_quatf(angle: 0.4, axis: SIMD3<Float>(0, 1, 0))
    var pose = HeadPose()
    check(pose.recenter(), identity) // Confirmation before the first motion sample.
    check(pose.update(initial), identity)
    check(pose.update(initial * turn), turn)
    check(pose.recenter(), identity) // A fresh headset confirmation sets forward now.
    check(pose.update(initial * turn), identity)
    check(pose.update(initial * turn * turn), turn) // Head tracking remains relative.
    check(pose.update(initial * turn), identity) // Delayed scene loading doesn't recenter.
    check(pose.recenter(), identity) // Repeat confirmations are safe.

    // A physical 180-degree screen roll changes the device basis. Applying the
    // opposite interface correction must yield the same upright camera frame.
    let screenRoll = simd_quatf(angle: .pi, axis: SIMD3<Float>(0, 0, 1))
    let rightPhone = initial * LandscapeBasis.right.correction.inverse
    let leftPhone = rightPhone * screenRoll
    check(LandscapeBasis.right.cameraOrientation(rightPhone), initial)
    check(LandscapeBasis.left.cameraOrientation(leftPhone), initial)

    let yaw = simd_quatf(angle: 0.35, axis: SIMD3<Float>(0, 1, 0))
    let pitch = simd_quatf(angle: -0.2, axis: SIMD3<Float>(1, 0, 0))
    for delta in [yaw, pitch, yaw * pitch] {
      let rightTurnedPhone = initial * delta * LandscapeBasis.right.correction.inverse
      let leftTurnedPhone = rightTurnedPhone * screenRoll
      var rightPose = HeadPose(), leftPose = HeadPose()
      check(rightPose.update(LandscapeBasis.right.cameraOrientation(rightPhone)), identity)
      check(leftPose.update(LandscapeBasis.left.cameraOrientation(leftPhone)), identity)
      check(rightPose.update(LandscapeBasis.right.cameraOrientation(rightTurnedPhone)), delta)
      check(leftPose.update(LandscapeBasis.left.cameraOrientation(leftTurnedPhone)), delta)
      check(leftPose.recenter(), identity)
      check(leftPose.update(LandscapeBasis.left.cameraOrientation(leftTurnedPhone)), identity)
    }

    // Changing landscape sides does not itself reset the established forward.
    var changingPose = HeadPose()
    check(changingPose.update(LandscapeBasis.right.cameraOrientation(rightPhone)), identity)
    let turnedRightPhone = initial * yaw * LandscapeBasis.right.correction.inverse
    check(changingPose.update(LandscapeBasis.right.cameraOrientation(turnedRightPhone)), yaw)
    check(changingPose.update(LandscapeBasis.left.cameraOrientation(turnedRightPhone * screenRoll)), yaw)
    check(changingPose.recenter(), identity)
    check(changingPose.update(LandscapeBasis.left.cameraOrientation(turnedRightPhone * screenRoll)), identity)

    // Camera-local -Z is forward. Verify visible gaze in each direction after
    // converting synthetic phone samples from both actual landscape sides.
    for basis: LandscapeBasis in [.right, .left] {
      for (axis, angle, expected): (SIMD3<Float>, Float, SIMD3<Float>) in [
        (SIMD3(0,1,0), -0.3, SIMD3(1,0,0)),  // right
        (SIMD3(0,1,0), 0.3, SIMD3(-1,0,0)),  // left
        (SIMD3(1,0,0), 0.3, SIMD3(0,1,0)),   // up
        (SIMD3(1,0,0), -0.3, SIMD3(0,-1,0)), // down
      ] {
        var sample = HeadPose()
        _ = sample.update(basis.cameraOrientation(initial * basis.correction.inverse))
        let turnedPhone = initial * simd_quatf(angle:angle,axis:axis) * basis.correction.inverse
        let gaze = sample.update(basis.cameraOrientation(turnedPhone)).act(SIMD3(0,0,-1))
        precondition(simd_dot(gaze,expected) > 0.2)
        checks += 1
      }
    }
    print("Head pose checks passed: \(checks). No device or provider calls.")
  }
}

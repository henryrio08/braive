import simd

/// Keep the chosen forward direction until the user confirms another headset setup.
struct HeadPose {
  private var reference: simd_quatf?
  private var latest: simd_quatf?
  mutating func update(_ orientation: simd_quatf) -> simd_quatf {
    latest = orientation
    if reference == nil { reference = orientation }
    return simd_normalize(reference!.inverse * orientation)
  }
  mutating func recenter() -> simd_quatf {
    reference = latest
    return simd_quatf(angle: 0, axis: SIMD3<Float>(0, 1, 0))
  }
}

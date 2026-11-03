import Darwin
import Foundation

/// Counts measured by the app are distinguished from SceneKit submission estimates.
@MainActor final class RenderMetrics {
  private(set) var frames = 0
  private var cpuTotal = 0.0, cpuPeak = 0.0, gpuPeak = 0.0
  private var residentPeak: UInt64 = 0, metalPeak = 0
  var estimatedSubmissionsPerEye = 0
  var eyeTextureBytes = 0
  func frame(cpuMS: Double, metalBytes: Int) {
    frames += 1; cpuTotal += cpuMS; cpuPeak=max(cpuPeak,cpuMS);metalPeak=max(metalPeak,metalBytes)
    if frames % 60 == 0 {
      var info=mach_task_basic_info()
      var count=mach_msg_type_number_t(MemoryLayout<mach_task_basic_info>.size / MemoryLayout<integer_t>.size)
      let capacity=Int(count)
      let result=withUnsafeMutablePointer(to:&info) { pointer in
        pointer.withMemoryRebound(to:integer_t.self,capacity:capacity) { task_info(mach_task_self_,task_flavor_t(MACH_TASK_BASIC_INFO),$0,&count) }
      }
      if result == KERN_SUCCESS { residentPeak=max(residentPeak,UInt64(info.resident_size)) }
    }
  }
  func gpu(milliseconds: Double) { if milliseconds.isFinite { gpuPeak=max(gpuPeak,milliseconds) } }
  var report: JSON { JSON(["frames":frames,"mean_cpu_encode_ms":cpuTotal/Double(max(1,frames)),"peak_cpu_encode_ms":cpuPeak,
    "peak_gpu_command_ms":gpuPeak,"peak_resident_bytes":residentPeak,"peak_metal_allocated_bytes":metalPeak,
    "eye_texture_bytes":eyeTextureBytes,"estimated_submissions_per_eye":estimatedSubmissionsPerEye,
    "draw_call_measurement":"estimate only; use Metal GPU capture for actual SceneKit passes"]) }
}

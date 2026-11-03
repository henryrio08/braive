import MetalKit
import SceneKit
import SwiftUI

/// Render each real eye into a texture, then apply the selected viewer's radial lens correction.
struct StereoWorld: UIViewRepresentable {
  @ObservedObject var world: World
  func makeCoordinator() -> Coordinator { Coordinator(world) }
  func makeUIView(context: Context) -> MTKView {
    let v = MTKView(frame: .zero, device: MTLCreateSystemDefaultDevice())
    v.colorPixelFormat = .bgra8Unorm
    v.framebufferOnly = false
    v.preferredFramesPerSecond = 60
    v.delegate = context.coordinator
    context.coordinator.configure(v)
    return v
  }
  func updateUIView(_ view: MTKView, context: Context) {}
  @MainActor final class Coordinator: NSObject, MTKViewDelegate {
    let world: World
    var queue: MTLCommandQueue?
    var pipeline: MTLRenderPipelineState?
    var renderers: [SCNRenderer] = []
    var textures: [MTLTexture] = []
    var depths: [MTLTexture] = []
    var size = CGSize.zero
    init(_ world: World) { self.world = world }
    func configure(_ view: MTKView) {
      guard let device = view.device else { return }
      #if SWIFT_PACKAGE
      // Linux xtool cannot invoke Apple's offline Metal compiler. Compile the
      // same bundled shader on the iPhone; Xcode keeps its precompiled library.
      guard let sourceURL = Bundle.module.url(forResource: "Stereo", withExtension: "metal"),
        let source = try? String(contentsOf: sourceURL, encoding: .utf8),
        let library = try? device.makeLibrary(source: source, options: nil) else { return }
      #else
      guard let library = device.makeDefaultLibrary() else { return }
      #endif
      queue = device.makeCommandQueue()
      let p = MTLRenderPipelineDescriptor()
      p.vertexFunction = library.makeFunction(name: "stereoVertex")
      p.fragmentFunction = library.makeFunction(name: "stereoFragment")
      p.colorAttachments[0].pixelFormat = view.colorPixelFormat
      pipeline = try? device.makeRenderPipelineState(descriptor: p)
      renderers = [world.left, world.right].map { eye in
        let r = SCNRenderer(device: device, options: nil)
        r.scene = world.scene
        r.pointOfView = eye
        r.autoenablesDefaultLighting = false
        return r
      }
    }
    func mtkView(_ view: MTKView, drawableSizeWillChange newSize: CGSize) { size = .zero }
    func draw(in view: MTKView) {
      let encodedAt=ProcessInfo.processInfo.systemUptime
      world.renderMotion()
      let frameTime = world.animationTime
      guard let device = view.device, let drawable = view.currentDrawable, let queue, let pipeline,
        let buffer = queue.makeCommandBuffer()
      else { return }
      if size != view.drawableSize {
        size = view.drawableSize
        world.eyeAspect = Double(size.width / 2 / max(1, size.height))
        textures = []
        depths = []
        for _ in 0..<2 {
          let d = MTLTextureDescriptor.texture2DDescriptor(
            pixelFormat: .bgra8Unorm, width: max(1, Int(size.width / 2)),
            height: max(1, Int(size.height)), mipmapped: false)
          d.usage = [.renderTarget, .shaderRead]
          d.storageMode = .private
          guard let t = device.makeTexture(descriptor: d) else { size = .zero; textures = []; depths = []; return }
          textures.append(t)
          d.pixelFormat = .depth32Float
          d.usage = .renderTarget
          guard let depth = device.makeTexture(descriptor: d) else { size = .zero; textures = []; depths = []; return }
          depths.append(depth)
        }
      }
      guard textures.count == 2, depths.count == 2 else { return }
      for i in 0..<2 {
        renderers[i].sceneTime = frameTime
        let pass = MTLRenderPassDescriptor()
        pass.colorAttachments[0].texture = textures[i]
        pass.colorAttachments[0].loadAction = .clear
        pass.colorAttachments[0].storeAction = .store
        pass.colorAttachments[0].clearColor = MTLClearColorMake(0, 0, 0, 1)
        pass.depthAttachment.texture = depths[i]
        pass.depthAttachment.loadAction = .clear
        pass.depthAttachment.storeAction = .dontCare
        pass.depthAttachment.clearDepth = 1
        renderers[i].render(
          atTime: frameTime,
          viewport: CGRect(x: 0, y: 0, width: textures[i].width, height: textures[i].height),
          commandBuffer: buffer, passDescriptor: pass)
      }
      let pass = MTLRenderPassDescriptor()
      pass.colorAttachments[0].texture = drawable.texture
      pass.colorAttachments[0].loadAction = .clear
      pass.colorAttachments[0].storeAction = .store
      guard let encoder = buffer.makeRenderCommandEncoder(descriptor: pass) else { return }
      encoder.setRenderPipelineState(pipeline)
      encoder.setFragmentTexture(textures[0], index: 0)
      encoder.setFragmentTexture(textures[1], index: 1)
      var lens = SIMD4<Float>(world.lensK1, world.lensK2, 0.5, 0.5)
      encoder.setFragmentBytes(&lens, length: MemoryLayout<SIMD4<Float>>.size, index: 0)
      var shade = world.transitionShade
      encoder.setFragmentBytes(&shade, length: MemoryLayout<Float>.size, index: 1)
      encoder.drawPrimitives(type: .triangle, vertexStart: 0, vertexCount: 3)
      encoder.endEncoding()
      world.metrics.eyeTextureBytes=textures.reduce(0) { $0+$1.width*$1.height*4 }+depths.reduce(0) { $0+$1.width*$1.height*4 }
      world.metrics.frame(cpuMS:(ProcessInfo.processInfo.systemUptime-encodedAt)*1000,metalBytes:device.currentAllocatedSize)
      let metrics=world.metrics
      buffer.addCompletedHandler { command in
        let ms=max(0,command.gpuEndTime-command.gpuStartTime)*1000
        Task { @MainActor in metrics.gpu(milliseconds:ms) }
      }
      buffer.present(drawable)
      buffer.commit()
    }
  }
}

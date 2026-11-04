import SceneKit
import UIKit

/// Flat spatial text panels rendered through both eye cameras and the same
/// lens correction as the world. Text is drawn into a texture on a plane;
/// there is no extruded lettering and no transcript wall. The main panel sits
/// about 2.5 m ahead; a small status panel stays low and stable.
@MainActor final class HeadsetPanels {
  let root = SCNNode()
  private var panelNode: SCNNode?
  private var statusNode: SCNNode?
  private var lastKey = ""

  func attach(to head: SCNNode) { head.addChildNode(root) }

  func update(title: String, detail: String, command: String, status: String, visible: Bool) {
    let key = [title, detail, command, status, visible ? "1" : "0"].joined(separator: "\u{1}")
    guard key != lastKey else { return }
    lastKey = key
    panelNode?.removeFromParentNode(); panelNode = nil
    statusNode?.removeFromParentNode(); statusNode = nil
    guard visible else { return }
    if !title.isEmpty || !detail.isEmpty || !command.isEmpty {
      let image = Self.renderPanel(title: title, detail: detail, command: command)
      let plane = SCNPlane(width: 1.6, height: 0.9)
      let material = SCNMaterial()
      material.diffuse.contents = image
      material.isDoubleSided = false
      material.lightingModel = .constant
      plane.materials = [material]
      let node = SCNNode(geometry: plane)
      node.position = SCNVector3(0, -0.02, -2.5)
      node.name = "braive_headset_panel"
      root.addChildNode(node)
      panelNode = node
    }
    if !status.isEmpty {
      let image = Self.renderStatus(status)
      let plane = SCNPlane(width: 1.0, height: 0.2)
      let material = SCNMaterial()
      material.diffuse.contents = image
      material.lightingModel = .constant
      plane.materials = [material]
      let node = SCNNode(geometry: plane)
      node.position = SCNVector3(0, -0.62, -2.1)
      node.name = "braive_headset_status"
      root.addChildNode(node)
      statusNode = node
    }
  }

  private static func renderPanel(title: String, detail: String, command: String) -> UIImage {
    let size = CGSize(width: 1024, height: 576)
    let renderer = UIGraphicsImageRenderer(size: size)
    return renderer.image { _ in
      let rect = CGRect(origin: .zero, size: size)
      UIColor(white: 0.02, alpha: 0.72).setFill()
      UIBezierPath(roundedRect: rect.insetBy(dx: 6, dy: 6), cornerRadius: 36).fill()
      let accent = UIColor(red: 0.94, green: 0.74, blue: 0.58, alpha: 1)
      var y: CGFloat = 56
      func draw(_ text: String, font: UIFont, color: UIColor, maxLines: Int) {
        guard !text.isEmpty else { return }
        let style = NSMutableParagraphStyle()
        style.alignment = .center
        style.lineBreakMode = .byWordWrapping
        let string = NSAttributedString(string: text, attributes: [.font: font, .foregroundColor: color, .paragraphStyle: style])
        let bounds = string.boundingRect(with: CGSize(width: size.width - 120, height: .greatestFiniteMagnitude), options: [.usesLineFragmentOrigin, .usesFontLeading], context: nil)
        let height = min(bounds.height, CGFloat(maxLines) * font.lineHeight * 1.25)
        string.draw(with: CGRect(x: 60, y: y, width: size.width - 120, height: height), options: [.usesLineFragmentOrigin, .usesFontLeading], context: nil)
        y += height + 28
      }
      draw(title, font: .systemFont(ofSize: 56, weight: .medium), color: .white, maxLines: 2)
      draw(detail, font: .systemFont(ofSize: 38), color: UIColor(white: 1, alpha: 0.85), maxLines: 3)
      draw(command, font: .systemFont(ofSize: 42, weight: .semibold), color: accent, maxLines: 2)
    }
  }

  private static func renderStatus(_ status: String) -> UIImage {
    let size = CGSize(width: 640, height: 128)
    let renderer = UIGraphicsImageRenderer(size: size)
    return renderer.image { _ in
      UIColor(white: 0.02, alpha: 0.6).setFill()
      UIBezierPath(roundedRect: CGRect(origin: .zero, size: size).insetBy(dx: 4, dy: 4), cornerRadius: 28).fill()
      let style = NSMutableParagraphStyle(); style.alignment = .center
      NSAttributedString(string: status, attributes: [
        .font: UIFont.systemFont(ofSize: 40, weight: .semibold),
        .foregroundColor: UIColor(white: 1, alpha: 0.9), .paragraphStyle: style,
      ]).draw(with: CGRect(x: 20, y: 38, width: size.width - 40, height: 60), options: [.usesLineFragmentOrigin], context: nil)
    }
  }
}

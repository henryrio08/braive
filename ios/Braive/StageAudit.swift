import SceneKit

@MainActor enum StageAudit {
  static func check(spec: JSON, root: SCNNode, nodes: [String:SCNNode], initial: SCNVector3,
    ipd: Float, fov: Double, aspect: Double, applyMaterial: (JSON, SCNNode) -> Void) throws {
    let paths=Dictionary(uniqueKeysWithValues:spec["motion_paths"].list.map { ($0["id"].text,$0) })
    let steps=spec["scenario"]["steps"].list
    guard !steps.isEmpty else { return }
    let indices=Dictionary(uniqueKeysWithValues:steps.enumerated().map { ($0.element["id"].text,$0.offset) })
    let attached=spec["viewer_attached_node_ids"].list.compactMap { nodes[$0.text] }
    let initialPositions=nodes.mapValues(\.simdWorldPosition)
    var reviewed=0
    func walk(_ index: Int, position: SCNVector3, incoming: [JSON], depth: Int) throws {
      guard depth <= 12, reviewed < 128 else { throw ScenePreflight.error("Stage review exceeds bounded graph budget") }
      reviewed += 1
      let saved=nodes.mapValues { ($0.transform,$0.isHidden) }
      var materials:[(SCNGeometry,[SCNMaterial])]=[]
      root.enumerateChildNodes { n,_ in if let g=n.geometry { materials.append((g,g.materials.map { $0.copy() as! SCNMaterial })) } }
      defer {
        for (id,value) in saved { nodes[id]?.transform=value.0;nodes[id]?.isHidden=value.1 }
        for (geometry,value) in materials { geometry.materials=value }
      }
      let step=steps[index]
      var viewer=position
      func moveViewer(to end:SCNVector3) {
        let delta=SIMD3(end.x-viewer.x,end.y-viewer.y,end.z-viewer.z)
        for root in attached { root.simdWorldPosition += delta }
        viewer=end
      }
      func apply(_ ops:[JSON]) throws {
        for op in ops {
          switch op["type"].text {
          case "set_visible": nodes[op["node_id"].text]?.isHidden = !(op["visible"].bool ?? true)
          case "set_material":
            if let node=nodes[op["node_id"].text] {
              applyMaterial(op["material"],node)
            }
          case "move_viewer", "move_node":
            guard let path=paths[op["path_id"].text] else { throw ScenePreflight.error("Stage route is unavailable") }
            let actor=op["type"].text == "move_node" ? nodes[op["node_id"].text] : nil
            let origin=actor?.worldPosition ?? viewer
            let points=path["points"].list.map { point -> SCNVector3 in
              let p=point["position"].list.map { Float($0.value) }
              return path["coordinate_space"].text == "relative" ? SCNVector3(origin.x+p[0],origin.y+p[1],origin.z+p[2]) : SCNVector3(p[0],p[1],p[2])
            }
            let ground=["walk","run"].contains(path["purpose"].text)
            let lift:Float=actor == nil ? 0 : Float(path["eye_height_meters"].number ?? 1.6)
            let bodyPoints=([origin]+points).map { SCNVector3($0.x,$0.y+lift,$0.z) }
            try RouteAudit.check(root:root,points:bodyPoints,walking:ground,ignored:attached+(actor.map { [$0] } ?? []),radius:Float(path["clearance_radius_meters"].number ?? 0.25),eyeHeight:Float(path["eye_height_meters"].number ?? 1.6))
            if let end=points.last { if let actor { actor.worldPosition=end } else { moveViewer(to:end) } }
          case "viewpoint_transition":
            if let view=spec["viewpoints"].list.first(where: { $0["id"].text == op["destination_id"].text }) {
              let p=view["position"].list.map { Float($0.value) };moveViewer(to:SCNVector3(p[0],p[1],p[2]))
            }
          default: break
          }
        }
      }
      try apply(incoming + step["start_operations"].list)
      for entry in spec["nodes"].list {
        if let id=entry["support_node_id"].string,let node=nodes[entry["id"].text],!node.isHidden,let support=nodes[id],let original=initialPositions[entry["id"].text],simd_length(node.simdWorldPosition-original)<0.01 { try RouteAudit.support(root:root,node:node,support:support,contact:entry["support_contact"].array.map { a in SCNVector3(Float(a[0].value),Float(a[1].value),Float(a[2].value)) }) }
      }
      if let viewID=step["review_viewpoint_id"].string {
        guard let view=spec["viewpoints"].list.first(where: { $0["id"].text == viewID }) else { throw ScenePreflight.error("Stage review viewpoint is missing") }
        let p=view["position"].list.map { Float($0.value) }
        let focus=step["focus_node_ids"].list.compactMap { nodes[$0.text] }
        guard !focus.isEmpty else { throw ScenePreflight.error("Stage review requires an explicit focal object") }
        try ScenePreflight.check(root:root,focus:focus,position:SCNVector3(p[0],p[1],p[2]),ipd:ipd,fov:fov,aspect:aspect,far:spec["view_distance_meters"].number ?? 150)
      }
      for action in step["actions"].list {
        if let id=action["next_step_id"].string, let next=indices[id] {
          try walk(next,position:viewer,incoming:action["operations"].list,depth:depth+1)
        } else {
          let transforms=nodes.mapValues { ($0.transform,$0.isHidden) };let before=viewer
          try apply(action["operations"].list)
          for (id,t) in transforms { nodes[id]?.transform=t.0;nodes[id]?.isHidden=t.1 };viewer=before
        }
      }
      if let id=step["completion"]["next_step_id"].string, let next=indices[id] { try walk(next,position:viewer,incoming:[],depth:depth+1) }
    }
    try walk(0,position:initial,incoming:[],depth:0)
  }
}

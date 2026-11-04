import SceneKit

/// Geometric segment probes against the loaded meshes, never their whole asset
/// bounding boxes (a room's bounds are not a solid box).
@MainActor enum RouteAudit {
  private static let collisionRoles = NSMapTable<SCNNode, NSString>(keyOptions: .weakMemory, valueOptions: .strongMemory)
  static func setCollisionRole(_ role: String, for node: SCNNode) {
    collisionRoles.setObject(role as NSString, forKey: node)
  }
  /// Nearest named ancestor identifies the authored node a repair should move.
  static func blockerName(_ node: SCNNode) -> String {
    var cursor: SCNNode? = node
    while let n = cursor {
      if let name = n.name, !name.isEmpty { return name }
      cursor = n.parent
    }
    return "unnamed"
  }
  static func check(root: SCNNode, points: [SCNVector3], walking: Bool,
    ignored: [SCNNode] = [], radius: Float = 0.25, eyeHeight: Float = 1.6) throws {
    guard points.count > 1 else { return }
    // Segment queries use SceneKit's committed geometry/transforms. Preflight
    // creates and moves nodes synchronously, before the normal render commit.
    SCNTransaction.flush()
    func ignoredHit(_ node: SCNNode) -> Bool {
      var cursor: SCNNode? = node
      while let n = cursor {
        let role = collisionRoles.object(forKey: n) as String?
        if ignored.contains(where: { $0 === n }) || role == "none" { return true }
        cursor = n.parent
      }
      return false
    }
    func hits(_ a: SCNVector3, _ b: SCNVector3) -> [SCNHitTestResult] {
      let start = SIMD3<Float>(a.x, a.y, a.z)
      let delta = SIMD3<Float>(b.x, b.y, b.z) - start
      let length = simd_length(delta)
      guard length > 0 else { return [] }
      let direction = delta / length
      // SceneKit clipping can miss nodes moved during stage review. Query
      // without it, then keep only hits between the probe endpoints.
      return root.hitTestWithSegment(from:a,to:b,options:[
        SCNHitTestOption.backFaceCulling.rawValue:false,
        SCNHitTestOption.ignoreHiddenNodes.rawValue:true,
        SCNHitTestOption.clipToZRange.rawValue:false,
        SCNHitTestOption.searchMode.rawValue:SCNHitTestSearchMode.all.rawValue
      ]).filter { hit in
        let point = root.convertPosition(hit.worldCoordinates, from:nil)
        let distance = simd_dot(SIMD3<Float>(point.x, point.y, point.z) - start, direction)
        return distance >= -0.0001 && distance <= length + 0.0001 && !ignoredHit(hit.node)
      }
    }
    for i in 1..<points.count {
      let a=points[i-1], b=points[i]
      // Probe the body center and perimeter along the entire segment so thin
      // barriers between sample positions are not missed by point-only checks.
      for y in [Float(0.15)-eyeHeight, -eyeHeight/2, Float(0)] {
        for (x,z): (Float,Float) in [(0,0),(radius,0),(-radius,0),(0,radius),(0,-radius)] {
          let blockers = hits(SCNVector3(a.x+x,a.y+y,a.z+z),SCNVector3(b.x+x,b.y+y,b.z+z))
          if !blockers.isEmpty {
            throw ScenePreflight.error("Route clearance failed on segment \(i-1): body intersects solid geometry (node \(blockerName(blockers[0].node)))")
          }
        }
      }
      if walking {
        let distance=simd_length(SIMD3(b.x-a.x,b.y-a.y,b.z-a.z))
        let count=max(1,Int(ceil(distance/0.25)))
        guard count <= 4096 else { throw ScenePreflight.error("Walking route exceeds bounded support-check distance") }
        for sample in 0...count {
          let t=Float(sample)/Float(count)
          let p=SCNVector3(a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t,a.z+(b.z-a.z)*t)
          let foot=p.y-eyeHeight
          let support=hits(SCNVector3(p.x,foot+0.3,p.z),SCNVector3(p.x,foot-0.35,p.z))
          guard support.contains(where: { $0.worldNormal.y > 0.5 }) else {
            throw ScenePreflight.error("Route support missing on segment \(i-1) near sample \(sample) (\(support.count) hits, Y normals \(support.map { $0.worldNormal.y }))")
          }
        }
      }
    }
  }
  static func support(root: SCNNode, node: SCNNode, support: SCNNode, contact: SCNVector3? = nil) throws {
    SCNTransaction.flush()
    let bounds=node.boundingBox
    let foot=node.convertPosition(contact ?? SCNVector3((bounds.min.x+bounds.max.x)/2,bounds.min.y,(bounds.min.z+bounds.max.z)/2),to:root)
    let hits=root.hitTestWithSegment(from:SCNVector3(foot.x,foot.y+0.2,foot.z),to:SCNVector3(foot.x,foot.y-0.25,foot.z),options:[SCNHitTestOption.backFaceCulling.rawValue:false,SCNHitTestOption.clipToZRange.rawValue:false,SCNHitTestOption.searchMode.rawValue:SCNHitTestSearchMode.all.rawValue]).filter { hit in
      var cursor:SCNNode?=hit.node
      while let n=cursor { if n === support { return true };cursor=n.parent }
      return false
    }
    guard !hits.isEmpty else { throw ScenePreflight.error("Declared support does not reach object \(node.name ?? "")") }
  }
  #if DEBUG
  static func verify() throws {
    let scene=SCNScene(), root: SCNNode
    root=scene.rootNode
    let floor=SCNNode(geometry:SCNBox(width:6,height:0.1,length:8,chamferRadius:0));floor.position=SCNVector3(0,-0.05,-3);root.addChildNode(floor)
    let points=[SCNVector3(0,1.6,0),SCNVector3(0,1.6,-5)]
    try check(root:root,points:points,walking:true)
    let wall=SCNNode(geometry:SCNBox(width:4,height:3,length:0.02,chamferRadius:0))
    wall.name="route_audit_wall"
    wall.position=SCNVector3(0,1.5,-7)
    root.addChildNode(wall)
    try check(root:root,points:points,walking:true)

    wall.position=SCNVector3(0,1.5,-2)
    var rejected=false
    do { try check(root:root,points:points,walking:true) }
    catch { rejected=error.localizedDescription.contains("node route_audit_wall") }
    guard rejected else { throw ScenePreflight.error("Route audit accepted a thin blocking wall") }
    wall.removeFromParentNode()
    // A floor outside the downward support probe cannot support the route.
    floor.position.y = -1
    rejected=false
    do { try check(root:root,points:points,walking:true) }
    catch { rejected=error.localizedDescription.contains("Route support missing") }
    guard rejected else { throw ScenePreflight.error("Route audit accepted a floor beyond its support probe") }
    floor.removeFromParentNode();rejected=false
    do { try check(root:root,points:points,walking:true) } catch { rejected=true }
    guard rejected else { throw ScenePreflight.error("Route audit accepted unsupported walking") }
    try check(root:root,points:points,walking:false)
  }
  #endif
}

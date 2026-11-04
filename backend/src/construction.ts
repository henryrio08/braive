import {createHash} from 'node:crypto';
import {assetManifest,assetIDs,allTextureIDs} from './assets.js';
import {AppError,document,sceneIssues} from './contracts.js';
import type {SceneSpec,SceneNode,SessionPlan,ValidationIssue,ConstructionPlan,AudioPlan} from '../../docs/handoff/contracts.js';
import {identity,multiply,inverse,point,transform,transformedBounds,contains,distance,type Vec3,type Bounds} from './spatial-math.js';
import {classifyVisual,evaluateAcceptance,zoneSeverity,visualStrictness,type ClassifiedIssue} from './acceptance.js';
import {normalizePathSamples} from './scene-references.js';
import {finishedRoom} from './finished-room.js';

export type ConstructionRequirement={id:string;kind:'task'|'cast'|'prop'|'stage'|'motion'|'boundary'|'outcome';target:string;description:string};
export function constructionRequirements(plan:SessionPlan):ConstructionRequirement[]{
 const hash=(text:string)=>createHash('sha256').update(text).digest('hex').slice(0,10);
 const requirements:ConstructionRequirement[]=[{id:'task',kind:'task',target:plan.experience?.objective??plan.topic,description:plan.task_instruction},
  ...plan.characters.map(c=>({id:'cast:'+c.id,kind:'cast' as const,target:c.scene_node_id,description:c.appearance_brief})),
  ...(plan.props??[]).map(p=>({id:'prop:'+hash(p),kind:'prop' as const,target:p,description:p})),
  ...(plan.experience?.stages??[]).map(s=>({id:'stage:'+s.id,kind:'stage' as const,target:s.id,description:s.goal})),
  ...(plan.experience?.requires_motion?[{id:'motion',kind:'motion' as const,target:'viewer',description:plan.experience.objective}]:[]),
  ...(plan.construction_brief?.must_preserve??[]).map(b=>({id:'boundary:'+hash(b),kind:'boundary' as const,target:b,description:b})),
  ...(plan.construction_brief?.expected_outcomes??[]).map(b=>({id:'outcome:'+hash(b),kind:'outcome' as const,target:b,description:b}))];
 return [...new Map(requirements.map(r=>[r.id,r])).values()];
}

/** Traceable authored-vs-compiled geometry for repair feedback on assets. */
export function describeAuthored(node:SceneNode):string {
 if(node.geometry.kind!=='asset')return '';
 try {
  const rest=geometryBounds(node);
  return ` (asset ${node.geometry.asset_id} rest bounds ${JSON.stringify(rest)}, authored rotation ${JSON.stringify(node.rotation_radians)}, scale ${JSON.stringify(node.scale)}; a 90-degree yaw swaps its horizontal extents)`;
 } catch { return ''; }
}

export function geometryBounds(node:SceneNode):Bounds {
 const g=node.geometry;
 if(g.kind==='asset'){
  const measured=assetManifest.find(a=>a.id===g.asset_id)?.bounds_meters;
  if(!measured)throw new AppError('INVALID_MODEL_OUTPUT','Measured asset bounds unavailable',[{path:'/nodes/'+node.id,rule:'bounds',message:'Use an inventoried asset with measured rest geometry'}]);
  return {min:measured.min,max:measured.max};
 }
 const half:Vec3=g.kind==='box'?g.size.map(v=>v/2) as Vec3:g.kind==='plane'?[g.width/2,g.height/2,0]:g.kind==='sphere'?[g.radius,g.radius,g.radius]:[g.radius,g.height/2,g.radius];
 return {min:half.map(v=>-v) as Vec3,max:half};
}

/** Size independent, zone-spanning slabs from the inset they declare. */
function fitZoneSlabs(scene:SceneSpec,cp:ConstructionPlan,nodes:Map<string,SceneNode>,controlled:Set<string>) {
 const zones=new Map(cp.zones.map(zone=>[zone.id,zone]));
 const anchored=new Set(cp.anchors.map(anchor=>anchor.node_id));
 const linked=new Set(scene.nodes.flatMap(node=>[node.parent_id,node.support_node_id]));
 for(const relation of cp.relations){
  const {kind,subject_id,target_id,clearance,tolerance,required}=relation;
  if(kind!=='within'||!required||clearance<=tolerance)continue;
  const node=nodes.get(subject_id),zone=zones.get(target_id);
  if(!zone||node?.role!=='environment'||node.geometry.kind!=='box'||node.animation!=='none')continue;
  if(node.parent_id!==null||node.support_node_id||node.rotation_radians.some(angle=>angle!==0)||
    anchored.has(node.id)||linked.has(node.id)||controlled.has(node.id))continue;
  if(cp.relations.some(other=>other!==relation&&(other.subject_id===node.id||other.target_id===node.id)))continue;

  const [width,height,depth]=node.geometry.size.map((size,axis)=>size*node.scale[axis]);
  const [insetWidth,insetDepth]=[zone.size[0]-2*clearance,zone.size[2]-2*clearance];
  if(!(height>0&&height<Math.min(insetWidth,insetDepth)))continue;
  // Only adjust boxes that match the original horizontal footprint. Leave
  // arbitrary placements to the normal validator and keep thickness intact.
  if(Math.abs(width-zone.size[0])>1e-6||Math.abs(depth-zone.size[2])>1e-6||
    Math.abs(node.position[0]-zone.center[0])>1e-6||Math.abs(node.position[2]-zone.center[2])>1e-6)continue;
  node.scale=[insetWidth/node.geometry.size[0],node.scale[1],insetDepth/node.geometry.size[2]];
 }
}

function constructionSource(plan:SessionPlan,source:SceneSpec):SceneSpec {
 if(!source.construction_plan)return source;
 const scene=structuredClone(source),cp=scene.construction_plan!,nodes=new Map(scene.nodes.map(n=>[n.id,n]));
 const operations=[...scene.events.map(e=>e.operation),...scene.interactions.flatMap(i=>i.choices.flatMap(c=>c.operations)),...(scene.scenario?.steps.flatMap(s=>[...s.start_operations,...s.actions.flatMap(a=>a.operations)])??[])];
 // A show-only operation on an initially visible node does not control the
 // rest of a static grouping. Any actual hide or other operation still does.
 const controlled=new Set([...(scene.viewer_attached_node_ids??[]),
  ...operations.flatMap(op=>'node_id' in op&&!(op.type==='set_visible'&&op.visible)?[op.node_id]:[])]);
 fitZoneSlabs(scene,cp,nodes,controlled);
 // The task realization is the author-owned source of focal-object identity.
 if(!scene.nodes.some(n=>n.role==='task_focus')){
  const focus=new Set(cp.requirements.find(r=>r.requirement_id==='task')?.node_ids??[]);
  for(const node of scene.nodes)if(focus.has(node.id)&&node.role!=='character')node.role='task_focus';
 }
 // An explicitly named prop and its declared component binding can supply
 // missing names on the components without creating a new approved prop.
 const realizations=new Map(cp.requirements.map(requirement=>[requirement.requirement_id,requirement.node_ids]));
 const componentProps=new Map<string,Set<string>>();
 for(const requirement of constructionRequirements(plan)){
  if(requirement.kind!=='prop')continue;
  const members=realizations.get(requirement.id)??[];
  if(!members.some(id=>nodes.get(id)?.prop_name===requirement.target))continue;
  for(const id of members){
   const props=componentProps.get(id)??new Set<string>();
   props.add(requirement.target);
   componentProps.set(id,props);
  }
 }
 for(const node of scene.nodes){
  const props=componentProps.get(node.id);
  if(node.role==='prop'&&!node.prop_name&&props?.size===1)node.prop_name=[...props][0];
 }
 // Partition static collections along their actual hierarchy. This changes only
 // assembly bookkeeping: never reparent or move geometry to satisfy metadata.
 const inheritsControl=(root:string)=>{
  const seen=new Set<string>();let id:string|null=root;
  while(id&&!seen.has(id)){if(controlled.has(id))return true;seen.add(id);id=nodes.get(id)?.parent_id??null;}
  return false;
 };
 const assemblyIDs=new Set(cp.assemblies.map(a=>a.id));
 const assemblyLimit=document.components.schemas.ConstructionPlan.properties.assemblies.maxItems;
 let assemblyCount=cp.assemblies.length;
 cp.assemblies=cp.assemblies.flatMap(assembly=>{
  if(!nodes.has(assembly.root_node_id)||inheritsControl(assembly.root_node_id)||assembly.member_node_ids.some(id=>!nodes.has(id)))return [assembly];
  const members=new Set([assembly.root_node_id,...assembly.member_node_ids]),groups=new Map<string,string[]>();
  for(const id of assembly.member_node_ids){
   let root=id;const seen=new Set<string>();
   while(nodes.get(root)?.parent_id&&members.has(nodes.get(root)!.parent_id!)){
    if(seen.has(root))return [assembly];seen.add(root);root=nodes.get(root)!.parent_id!;
   }
   if(root!==assembly.root_node_id&&nodes.get(root)?.parent_id!==null)return [assembly];
   const group=groups.get(root)??[];group.push(id);groups.set(root,group);
  }
  if(!groups.size||(groups.size===1&&groups.has(assembly.root_node_id))||assemblyCount+groups.size-1>assemblyLimit)return [assembly];
  assemblyCount+=groups.size-1;
  const originalRoot=groups.has(assembly.root_node_id)?assembly.root_node_id:groups.keys().next().value;
  return [...groups].map(([root,member_node_ids])=>{
   let id=assembly.id;
   if(root!==originalRoot){
    let salt=0;do{id='asm_'+createHash('sha256').update(assembly.id+'|'+root+'|'+salt++).digest('hex').slice(0,16);}while(assemblyIDs.has(id));
    assemblyIDs.add(id);
   }
   return {...assembly,id,root_node_id:root,member_node_ids};
  });
 });
 return scene;
}

/** A construction failure must not hide independent scene errors from the one repair. */
/**
 * Bounded deterministic corrections applied to a copy before any model
 * repair. Each correction is unambiguous, idempotent and recorded; nothing
 * here guesses task semantics or invents replacement content.
 */
export function deterministicCorrections(source:SceneSpec):{scene:SceneSpec;corrections:string[]} {
 const scene=structuredClone(source),corrections:string[]=[];
 const requiredNodes=new Set((scene.construction_plan?.requirements??[]).flatMap(requirement=>requirement.node_ids));
 for(const node of scene.nodes){
  if(node.role==='prop'&&!node.prop_name&&node.geometry.kind!=='asset'&&!requiredNodes.has(node.id)){
   node.role='environment';
   corrections.push(`Classified unnamed procedural scenery ${node.id} as environment; geometry and collision are unchanged.`);
  }
  // Unregistered texture references are unusable; registered textures are preserved. When the authored material
  // already carries a color, that color is the defined fallback: retain it
  // and drop the unusable optional reference instead of failing the scene.
  if(node.material.texture_asset_id&&!allTextureIDs().has(node.material.texture_asset_id)&&node.material.color){
   corrections.push(`Removed unsupported texture reference ${node.material.texture_asset_id} from ${node.id}; retained its authored material color ${node.material.color}.`);
   delete node.material.texture_asset_id;
  }
  // Protected characters keep their approved materials; an environmental
  // surface override on a character is never meaningful scene geometry.
  if(node.role==='character'&&node.material.surface!==undefined){
   corrections.push(`Removed environmental surface override from protected character ${node.id}; retained its approved character material.`);
   delete node.material.surface;
  }
 }
 // Operations naming a node that does not exist can never execute; drop
 // them (recorded) rather than rejecting the whole scene, mirroring the
 // dangling route-anchor treatment.
 {
  const existing=new Set(scene.nodes.map(n=>n.id));
  const dropOps=(ops:SceneSpec['events'][number]['operation'][]|undefined,where:string)=>{
   if(!ops)return ops;
   return ops.filter(op=>{
    const target=(op as {node_id?:string}).node_id;
    if(target&&!existing.has(target)){corrections.push(`Dropped unexecutable operation in ${where}: it names missing node ${target}.`);return false;}
    return true;
   });
  };
  scene.events=(scene.events??[]).filter(event=>{
   const target=(event.operation as {node_id?:string}).node_id;
   if(target&&!existing.has(target)){corrections.push(`Dropped unexecutable event: it names missing node ${target}.`);return false;}
   return true;
  });
  for(const step of scene.scenario?.steps??[]){
   step.start_operations=dropOps(step.start_operations,`step ${step.id}`)??[];
   for(const action of step.actions??[])action.operations=dropOps(action.operations,`step ${step.id}`)??[];
  }
 }
 const cp=scene.construction_plan;
 if(cp){
  // An unambiguous time-zero waypoint IS the route origin: it becomes the
  // path start, preserving later waypoints, times, frame and destination.
  for(const path of scene.motion_paths??[]){
   const {origin,duplicateCount}=normalizePathSamples(path);
   if(origin)corrections.push(`Normalized time-zero waypoint of ${path.id} into its route origin; later waypoints and timing unchanged.`);
   if(duplicateCount)corrections.push(`Removed ${duplicateCount} identical waypoint duplicates from ${path.id}; positions and timing unchanged.`);
  }
  const nodeIds=new Set(scene.nodes.map(n=>n.id));
  const anchorIds=new Set((cp.anchors??[]).map(a=>a.id));
  const zoneIds=new Set((cp.zones??[]).map(z=>z.id));
  const viewpointIds=new Set((scene.viewpoints??[]).map(view=>view.id));
  const requiredNodes=new Set((cp.requirements??[]).flatMap(r=>r.node_ids));
  // Facing the participant is the only reading of a faces relation whose
  // target does not resolve to scene geometry.
  for(const relation of cp.relations??[]){
   if(relation.kind==='faces'&&relation.target_id!=='viewer'&&!nodeIds.has(relation.target_id)&&!anchorIds.has(relation.target_id)&&!zoneIds.has(relation.target_id)&&!viewpointIds.has(relation.target_id)){
    corrections.push(`Retargeted ${relation.id} from unresolvable ${relation.target_id} to the viewer (participant).`);
    relation.target_id='viewer';
   }
   // Requirement flags derive from approved bindings, not model bookkeeping:
   // a relation whose subject realizes an approved requirement is required.
   if(!relation.required&&requiredNodes.has(relation.subject_id)){
    relation.required=true;
    corrections.push(`Derived required=true for ${relation.id} from its subject's approved requirement binding.`);
   }
  }
  // A named anchor is authoritative for its relation's target frame: when
  // the relation target names a different existing node than the anchor's
  // owner, the anchor's node is the support the builder actually described.
  for(const relation of cp.relations??[]){
   if(!relation.anchor_id||relation.target_id===relation.anchor_id)continue;
   const anchor=(cp.anchors??[]).find(a=>a.id===relation.anchor_id);
   if(anchor&&anchor.node_id!==relation.target_id&&nodeIds.has(anchor.node_id)&&nodeIds.has(relation.target_id)){
    corrections.push(`Derived target ${anchor.node_id} for ${relation.id} from its named anchor ${anchor.id} (the anchor belongs to that node).`);
    relation.target_id=anchor.node_id;
   }
  }
  const nodeById=new Map(scene.nodes.map(n=>[n.id,n]));
  // Recover a missing anchor's owner only from an explicit node support link.
  // The next passes can then verify or materialize the relation's contact.
  for(const relation of cp.relations??[]){
   const id=relation.target_id;
   if(relation.kind!=='on'||id!==relation.anchor_id||id==='viewer'||nodeIds.has(id)||anchorIds.has(id)||zoneIds.has(id)||viewpointIds.has(id))continue;
   const support=nodeById.get(relation.subject_id)?.support_node_id;
   if(!support||support===relation.subject_id||!nodeIds.has(support))continue;
   relation.target_id=support;
   corrections.push(`Resolved the owner of missing anchor ${id} for ${relation.id} from the subject's declared support ${support}.`);
  }
  // Preserve a seated pose and its declared support when a placement
  // annotation cannot locate a real contact. Standing mesh bounds cannot
  // reconstruct a seat contact. Strict review still reports the bad relation.
  if(visualStrictness()==='permissive'){
   const anchorsById=new Map((cp.anchors??[]).map(anchor=>[anchor.id,anchor]));
   cp.relations=(cp.relations??[]).filter(relation=>{
    if(relation.kind!=='on')return true;
    const subject=nodeById.get(relation.subject_id);
    const targetAnchor=anchorsById.get(relation.anchor_id??relation.target_id);
    const support=anchorsById.get(relation.target_id)?.node_id??relation.target_id;
    if(subject?.id===support&&subject.parent_id===null&&subject.collision_role==='solid'&&
      (!subject.support_node_id||subject.support_node_id===subject.id)){
     if(subject.support_node_id===subject.id)subject.support_node_id=null;
     corrections.push(`Dropped ${relation.id}; solid world root ${subject.id} cannot support itself, and retains its authored geometry.`);
     return false;
    }
    if(subject?.role!=='character'||subject.animation!=='sit'||subject.support_node_id!==support||!nodeById.has(support))return true;
    const contact=relation.subject_anchor_id?anchorsById.get(relation.subject_anchor_id):undefined;
    if(targetAnchor?.node_id===support&&contact?.node_id===subject.id)return true;
    corrections.push(`Kept the authored seated pose of ${subject.id} on ${support}; ignored ${relation.id} because it lacks matching seat contact anchors.`);
    return false;
   });
  }
  // Anchor references that were named but never declared, or declared on
  // the wrong node, are mechanical bookkeeping errors. Containment ignores
  // anchors entirely, so drop them there; a support subject contact falls
  // back to the subject's bottom-center (materialized explicitly), except
  // for seated characters whose contact point is a real authored choice.
  for(const relation of cp.relations??[]){
   const declared=new Map((cp.anchors??[]).map(a=>[a.id,a]));
   if(['within','inside'].includes(relation.kind)){
    if(relation.anchor_id&&(nodeById.has(relation.target_id)||cp.zones.some(z=>z.id===relation.target_id))){
     delete relation.anchor_id;corrections.push(`Removed point-anchor annotation from volume relation ${relation.id}; the actual node/zone volume remains authoritative.`);
    }
    if(relation.anchor_id&&!declared.has(relation.anchor_id)){delete relation.anchor_id;corrections.push(`Dropped undeclared anchor reference from containment relation ${relation.id}; containment targets the zone/node volume.`);}
   }
   if(relation.kind!=='on'){
    if(relation.subject_anchor_id&&declared.get(relation.subject_anchor_id)?.node_id!==relation.subject_id){
     delete relation.subject_anchor_id;
     corrections.push(`Dropped unused subject contact reference from ${relation.id}; only support relations use it.`);
    }
    continue;
   }
   const subject=nodeById.get(relation.subject_id);
   if(relation.subject_anchor_id){
    const existing=declared.get(relation.subject_anchor_id);
    if(existing&&existing.node_id!==relation.subject_id&&subject?.role!=='character'){
     delete relation.subject_anchor_id;
     corrections.push(`Dropped subject anchor ${existing.id} from ${relation.id}; it belongs to ${existing.node_id}, so the subject's bottom-center contact applies.`);
    } else if(!existing&&subject&&subject.role!=='character'){
     const sb=geometryBounds(subject);
     cp.anchors=[...(cp.anchors??[]),{id:relation.subject_anchor_id,node_id:subject.id,kind:'support',position:[0,sb.min[1],0],footprint:[Math.max(0.05,(sb.max[0]-sb.min[0])*Math.abs(subject.scale[0]??1)),Math.max(0.05,(sb.max[2]-sb.min[2])*Math.abs(subject.scale[2]??1))]} as NonNullable<SceneSpec['construction_plan']>['anchors'][number]];
     corrections.push(`Materialized missing subject contact anchor ${relation.subject_anchor_id} on ${subject.id} (bottom-center) for ${relation.id}.`);
    }
   }
  }
  // A support relation naming an anchor that was never declared gets that
  // anchor materialized on its target node: top-center of the target's local
  // bounds, with the subject's footprint clamped to the target. No position
  // is invented for the subject; the relation offset still governs placement.
  for(const relation of cp.relations??[]){
   if(relation.kind!=='on'||!relation.anchor_id)continue;
   if((cp.anchors??[]).some(a=>a.id===relation.anchor_id))continue;
   const target=nodeById.get(relation.target_id),subject=nodeById.get(relation.subject_id);
   if(!target||!subject)continue;
   const tb=geometryBounds(target),sb=geometryBounds(subject);
   cp.anchors=[...(cp.anchors??[]),{id:relation.anchor_id,node_id:target.id,kind:'support',position:[0,tb.max[1],0],footprint:[Math.min(sb.max[0]-sb.min[0],tb.max[0]-tb.min[0]),Math.min(sb.max[2]-sb.min[2],tb.max[2]-tb.min[2])]} as NonNullable<SceneSpec['construction_plan']>['anchors'][number]];
   corrections.push(`Materialized missing support anchor ${relation.anchor_id} on ${target.id} (top-center) for ${relation.id}.`);
  }
  // A zero offset on a support relation whose subject was authored somewhere
  // else means "authored position is the contact": derive the offset from
  // the authored world position instead of relocating the subject.
  const byId=new Map(scene.nodes.map(n=>[n.id,n]));
  const framesOf=(id:string,seen=new Set<string>()):number[]|null=>{
   const n=byId.get(id);if(!n||seen.has(id))return null;
   const local=transform(n.position,n.rotation_radians,n.scale);
   if(!n.parent_id)return local;
   const parent=framesOf(n.parent_id,new Set([...seen,id]));return parent?multiply(parent,local):null;
  };
  for(const relation of cp.relations??[]){
   if(relation.kind!=='on')continue;
   const anchor=(cp.anchors??[]).find(a=>a.id===(relation.anchor_id??relation.target_id));if(!anchor)continue;
   const subjectFrame=framesOf(relation.subject_id),anchorFrame=framesOf(anchor.node_id);
   if(!subjectFrame||!anchorFrame)continue;
   const authored=point(subjectFrame,[0,0,0]),anchorWorld=point(anchorFrame,anchor.position);
   const derived=[authored[0]-anchorWorld[0],relation.offset[1],authored[2]-anchorWorld[2]] as Vec3;
   // Only when the subject was authored AT the support (within its bounds,
   // modestly expanded): a distant placeholder origin still means the
   // relation should move the subject onto the support as authored.
   const anchorNode=byId.get(anchor.node_id);
   const supportBounds=anchorNode?transformedBounds(geometryBounds(anchorNode),anchorFrame):null;
   const atSupport=!supportBounds||(authored[0]>=supportBounds.min[0]-2&&authored[0]<=supportBounds.max[0]+2&&authored[2]>=supportBounds.min[2]-2&&authored[2]<=supportBounds.max[2]+2&&Math.abs(authored[1]-anchorWorld[1])<=3);
   if(atSupport&&distance(derived,relation.offset)>0.05){
    relation.offset=derived;
    corrections.push(`Derived support offset ${JSON.stringify(derived.map(v=>Math.round(v*100)/100))} for ${relation.id} from the subject's authored position (authored placement at the support preserved).`);
   }
  }
 }
 return {scene,corrections};
}

export function compileScene(plan:SessionPlan,source:SceneSpec,audio:AudioPlan):SceneSpec {
 const prepared=constructionSource(plan,source);
 let compiled:SceneSpec;
 try {compiled=compileConstruction(plan,prepared);}
 catch(error){
  if(!(error instanceof AppError)||error.code!=='INVALID_MODEL_OUTPUT')throw error;
  const issues=new Map<string,ValidationIssue>();
  for(const issue of [...error.issues,...sceneIssues(plan,prepared,audio)]){
   const key=issue.path+'|'+issue.rule;if(!issues.has(key))issues.set(key,issue);
  }
  throw new AppError(error.code,error.message,[...issues.values()],error.status);
 }
 const issues=sceneIssues(plan,compiled,audio);
 if(issues.length)throw new AppError('INVALID_MODEL_OUTPUT','Scene requires repair',issues);
 return compiled;
}

/** Lower the authored spatial relationships into the existing native scene.
 * IDs, cast, stages, intensity and duration are never regenerated here. */
function mulberry32(seed:number){let a=seed>>>0;return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}

/** Lower bounded assembly macros into ordinary nodes. Idempotent by
 * preservation: a complete prior expansion (recorded by its
 * `${id}_assembly` membership, with every member still present) is kept
 * exactly as-is, so recompilation after compilation has grounded the root
 * cannot drift the generated local positions. Only macros without a
 * complete prior expansion are (re)generated. */
export function expandAssemblyMacros(scene:SceneSpec):void {
 const cp=scene.construction_plan;if(!cp?.macros?.length)return;
 const preserved=new Set<string>();
 for(const macro of cp.macros){
  const prior=cp.assemblies.find(a=>a.id===`${macro.id}_assembly`);
  if(!prior)continue;
  const nodeIDs=new Set(scene.nodes.map(n=>n.id));
  if(prior.member_node_ids.every(id=>nodeIDs.has(id))){preserved.add(macro.id);continue;}
  const drop=new Set(prior.member_node_ids);scene.nodes=scene.nodes.filter(n=>!drop.has(n.id));cp.assemblies=cp.assemblies.filter(a=>a.id!==prior.id);
 }
 const byID=new Map(scene.nodes.map(n=>[n.id,n]));
 const fail=(message:string)=>{throw new AppError('INVALID_MODEL_OUTPUT','Assembly macro requires repair',[{path:'/construction_plan/macros',rule:'macro',message}]);};
 for(const macro of cp.macros){
  if(preserved.has(macro.id))continue;
  const root=byID.get(macro.root_node_id);if(!root){fail(`Macro ${macro.id} root ${macro.root_node_id} is missing`);throw new Error('unreachable');}
  if(root.rotation_radians.some(v=>Math.abs(v)>1e-6)||root.scale.some(v=>Math.abs(v-1)>1e-6))fail(`Macro ${macro.id} root must be unrotated and unit-scale so generated local positions stay world-aligned`);
  const local=(world:Vec3):Vec3=>world.map((v,i)=>v-root.position[i]) as Vec3;
  const add=(suffix:string,geometry:SceneNode['geometry'],world:Vec3,yaw=0)=>{
   const node:SceneNode={id:`${macro.id}_${suffix}`,parent_id:root.id,role:'environment',geometry,position:local(world),rotation_radians:[0,yaw,0],scale:[1,1,1],material:{color:'#8a7a68',roughness:0.9},animation:'none',description:`${macro.kind} generated by ${macro.id}`,collision_role:'solid',support_node_id:null} as SceneNode;
   if(byID.has(node.id))fail(`Macro ${macro.id} generated duplicate node ${node.id}`);
   scene.nodes.push(node);byID.set(node.id,node);return node.id;
  };
  const members:string[]=[];
  const facing=(assetID:string,yaw:number)=>yaw+(assetManifest.find(a=>a.id===assetID)?.semantic_front_yaw_radians??0);
  if(macro.kind==='room_shell'){
   const parts=finishedRoom(macro);
   root.geometry={kind:'box',size:[macro.size[0],.1,macro.size[2]]};root.position=[macro.center[0],macro.center[1]-.05,macro.center[2]];
   root.material=structuredClone(macro.floor_material);root.collision_role='solid';root.description='Finished room floor';
   if(!cp.assemblies.some(a=>a.member_node_ids.includes(root.id)))members.push(root.id);
   for(const part of parts){const id=add(part.suffix,{kind:'box',size:part.size},part.position);const node=byID.get(id)!;node.material=part.material;node.collision_role=part.collision_role;members.push(id);}
  }else if(macro.kind==='seating_rows'){
   if(!assetIDs.has(macro.chair_asset_id))fail(`Macro ${macro.id} chair asset ${macro.chair_asset_id} is not registered`);
   if(macro.character_node_ids&&macro.character_node_ids.length>macro.rows*macro.seats_per_row)fail('Every bound character needs an actual seat.');
   for(let r=0;r<macro.rows;r++)for(let s=0;s<macro.seats_per_row;s++){
    const x=macro.origin[0]+(s-(macro.seats_per_row-1)/2)*macro.seat_spacing;
    const position:Vec3=[x,macro.origin[1],macro.origin[2]+r*macro.row_spacing];
    const seatID=add(`seat_${r}_${s}`,{kind:'asset',asset_id:macro.chair_asset_id},position,facing(macro.chair_asset_id,macro.facing_yaw));members.push(seatID);
    const actorID=macro.character_node_ids?.[r*macro.seats_per_row+s];
    if(actorID){const actor=byID.get(actorID);if(!actor||actor.role!=='character'||actor.geometry.kind!=='asset')fail('Seating must bind actual approved character nodes.');
     actor!.parent_id=root.id;actor!.position=local(position);actor!.rotation_radians=[0,macro.facing_yaw,0];actor!.animation='sit';actor!.support_node_id=seatID;
     if(!cp.assemblies.some(a=>a.member_node_ids.includes(actorID)))cp.assemblies.push({id:macro.id+'_cast_'+actorID,root_node_id:actorID,member_node_ids:[actorID],zone_id:macro.zone_id,requirement_ids:[]});
    }
   }
  }else if(macro.kind==='enclosure'){
   const [cx,cy,cz]=macro.center,[w,h,d]=[macro.size[0],macro.wall_height,macro.size[2]],wallT=0.15,gap=Math.min(macro.opening_width,w-0.3);
   const seg=(w-gap)/2;
   members.push(add('wall_north',{kind:'box',size:[w,h,wallT]},[cx,cy+h/2,cz-d/2]));
   members.push(add('wall_east',{kind:'box',size:[wallT,h,d]},[cx+w/2,cy+h/2,cz]));
   members.push(add('wall_west',{kind:'box',size:[wallT,h,d]},[cx-w/2,cy+h/2,cz]));
   if(seg>0.05){members.push(add('wall_south_a',{kind:'box',size:[seg,h,wallT]},[cx-(gap/2+seg/2),cy+h/2,cz+d/2]));members.push(add('wall_south_b',{kind:'box',size:[seg,h,wallT]},[cx+(gap/2+seg/2),cy+h/2,cz+d/2]));}
  }else if(macro.kind==='scatter'){
   if(!assetIDs.has(macro.asset_id))fail(`Macro ${macro.id} asset ${macro.asset_id} is not registered`);
   const rand=mulberry32((cp.seed+macro.seed_offset+[...macro.id].reduce((n,c)=>n+c.charCodeAt(0),0))>>>0);
   const placed:Vec3[]=[];let attempts=0;
   while(placed.length<macro.count&&attempts<macro.count*40){attempts++;
    const candidate:Vec3=[macro.area_center[0]+(rand()-0.5)*macro.area_size[0],macro.area_center[1],macro.area_center[2]+(rand()-0.5)*macro.area_size[1]];
    if(placed.some(p=>Math.hypot(p[0]-candidate[0],p[2]-candidate[2])<macro.min_spacing))continue;
    placed.push(candidate);
   }
   placed.forEach((pos,i)=>members.push(add(`item_${i}`,{kind:'asset',asset_id:macro.asset_id},pos,rand()*Math.PI*2)));
  }else if(macro.kind==='platform_steps'){
   if(!Number.isInteger(macro.steps)||macro.steps<1||macro.steps>12||!(macro.step_height>=0.05&&macro.step_height<=0.5)||!(macro.step_depth>=0.2&&macro.step_depth<=1)||!(macro.width>=0.5&&macro.width<=6)||!(macro.platform_depth>=0.5&&macro.platform_depth<=6))fail(`Macro ${macro.id} platform_steps fields are out of bounds (steps 1..12, step_height 0.05..0.5, step_depth 0.2..1, width 0.5..6, platform_depth 0.5..6)`);
   // Convention: origin is the base front-center (front edge of step_0 at origin.z, floor at origin.y). Step i spans y [origin.y+i*step_height, origin.y+(i+1)*step_height] (box height step_height, centered between) and its center is at z=origin.z-(i+0.5)*step_depth, ascending away from the front (-Z). platform_top (0.15 thick) sits behind the last step at center z=origin.z-steps*step_depth-platform_depth/2 with its top exactly at origin.y+steps*step_height, flush with the last step top, so its center y is 0.075 below that.
   for(let i=0;i<macro.steps;i++){
    members.push(add(`step_${i}`,{kind:'box',size:[macro.width,macro.step_height,macro.step_depth]},[macro.origin[0],macro.origin[1]+(i+0.5)*macro.step_height,macro.origin[2]-(i+0.5)*macro.step_depth]));
   }
   members.push(add('platform_top',{kind:'box',size:[macro.width,0.15,macro.platform_depth]},[macro.origin[0],macro.origin[1]+macro.steps*macro.step_height-0.075,macro.origin[2]-macro.steps*macro.step_depth-macro.platform_depth/2]));
  }else if(macro.kind==='functional_group'){
   if(!assetIDs.has(macro.chair_asset_id))fail(`Macro ${macro.id} chair asset ${macro.chair_asset_id} is not registered`);
   if(macro.include_desk&&macro.desk_asset_id&&!assetIDs.has(macro.desk_asset_id))fail(`Macro ${macro.id} desk asset ${macro.desk_asset_id} is not registered`);
   // Facing direction uses the compiler yaw convention (yaw=atan2(-dx,-dz)), so forward is [-sin(yaw),0,-cos(yaw)]. Chairs sit on opposite sides of the desk along that axis and face each other; cast remains authored elsewhere.
   const dir:Vec3=[-Math.sin(macro.facing_yaw),0,-Math.cos(macro.facing_yaw)];
   if(macro.include_desk){
    if(macro.desk_asset_id)members.push(add('desk',{kind:'asset',asset_id:macro.desk_asset_id},[macro.origin[0],macro.origin[1],macro.origin[2]],macro.facing_yaw));
    else members.push(add('desk',{kind:'box',size:[1.4,0.75,0.7]},[macro.origin[0],macro.origin[1]+0.375,macro.origin[2]],macro.facing_yaw));
   }
   members.push(add('chair_0',{kind:'asset',asset_id:macro.chair_asset_id},[macro.origin[0]+dir[0]*0.85,macro.origin[1],macro.origin[2]+dir[2]*0.85],facing(macro.chair_asset_id,macro.facing_yaw+Math.PI)));
   members.push(add('chair_1',{kind:'asset',asset_id:macro.chair_asset_id},[macro.origin[0]-dir[0]*0.85,macro.origin[1],macro.origin[2]-dir[2]*0.85],facing(macro.chair_asset_id,macro.facing_yaw)));
  }
  cp.assemblies.push({id:`${macro.id}_assembly`,root_node_id:macro.root_node_id,member_node_ids:members,zone_id:macro.zone_id,requirement_ids:[]});
 }
}

export function compileConstruction(plan:SessionPlan,source:SceneSpec):SceneSpec {
 if(!source.construction_plan)return source; // Saved scenes predate this compiler.
 const scene=constructionSource(plan,source),cp=scene.construction_plan!,issues:ValidationIssue[]=[],warnings:ValidationIssue[]=[];
 expandAssemblyMacros(scene);
 // These annotations describe construction quality, not executable scene data.
 // The approved plan and actual route audits remain authoritative.
 const advisoryRules=new Set(['priority','coverage','bounds','support','fit','zone_fit','placement','orientation','clearance','anchor_alignment']);
 const fail=(path:string,rule:string,message:string,required=true,meta?:Partial<ClassifiedIssue>)=>{
  const advisory=visualStrictness()==='permissive'&&advisoryRules.has(rule);
  (required&&!advisory?issues:warnings).push({path,rule,message,...meta,...(advisory?{classification:'soft' as const}:{})});
 };
 const map=<T extends {id:string}>(items:T[],path:string)=>{const result=new Map(items.map(i=>[i.id,i]));if(result.size!==items.length)fail(path,'unique','Duplicate construction IDs');return result;};
 const nodes=map(scene.nodes,'/nodes'),zones=map(cp.zones,'/construction_plan/zones'),anchors=map(cp.anchors,'/construction_plan/anchors');
 for(const [index,node] of scene.nodes.entries()){
  if(node.parent_id!==null&&!nodes.has(node.parent_id))fail(`/nodes/${index}/parent_id`,'reference',`${node.id} names missing parent ${JSON.stringify(node.parent_id)}. Use JSON null for a world root, or an existing parent node ID with local child coordinates.`);
  if(node.support_node_id!=null&&!nodes.has(node.support_node_id))fail(`/nodes/${index}/support_node_id`,'reference',`${node.id} names missing support ${JSON.stringify(node.support_node_id)}. Use JSON null when no support applies, or an existing node ID.`);
 }
 const spatialIDs=[...nodes.keys(),...zones.keys(),...anchors.keys()];
 if(new Set(spatialIDs).size!==spatialIDs.length||spatialIDs.includes('viewer'))fail('/construction_plan','unique','Node, zone and anchor IDs must be distinct and cannot use the reserved viewer ID');
 const paths=new Map((scene.motion_paths??[]).map(p=>[p.id,p]));
 const stages=new Set(scene.scenario?.steps.map(s=>s.id)??[]);
 const requirements=constructionRequirements(plan),expected=new Map(requirements.map(r=>[r.id,r]));
 const annotateRequirements=(ids:string[],path:string)=>[...new Set(ids.flatMap(id=>{
  if(expected.has(id))return [id];
  const suffix=id.match(/:[a-f0-9]{10}$/)?.[0];
  const matches=suffix?requirements.filter(requirement=>requirement.id.endsWith(suffix)):[];
  if(matches.length===1)return [matches[0].id];
  fail(path,'reference',`Ignored unknown requirement annotation ${id}; approved requirement bindings are validated separately.`,false);
  return [];
 }))];
 const medium=plan.construction_brief?.medium_behavior,regions=cp.medium_regions??[];
 if(medium&&['water','mixed'].includes(medium.substance)&&!regions.some(r=>r.medium==='water'))fail('/construction_plan/medium_regions','medium','Approved water involvement needs an explicit water region; surface appearance alone does not describe immersion');
 if(scene.environment?.mode==='underwater'&&!regions.some(r=>r.medium==='water'))fail('/construction_plan/medium_regions','medium','An underwater environment needs an explicit water region');
 if(new Set(regions.map(r=>r.id)).size!==regions.length)fail('/construction_plan/medium_regions','unique','Medium region IDs must be unique');
 for(const region of regions){
  const at='/construction_plan/medium_regions/'+region.id,node=region.surface_node_id?nodes.get(region.surface_node_id):undefined;
  if(!zones.has(region.zone_id))fail(at+'/zone_id','reference',`${region.id} names missing zone ${JSON.stringify(region.zone_id)}`);
  if(region.surface_node_id&&!node)fail(at+'/surface_node_id','reference',`${region.id} names missing surface node ${JSON.stringify(region.surface_node_id)}. Omit surface_node_id when no surface applies; do not use a placeholder.`);
  if(region.medium==='water'&&node?.material.surface?.profile!=='water')fail(at,'medium','Water surface node must select the water profile; this is a visual surface, not fluid physics');
  if(region.flow_visual==='ripples'&&(!node||region.medium!=='water'))fail(at,'medium','Ripples require an explicit water surface node');
  if(region.flow_visual==='foliage_flutter'&&region.medium!=='air')fail(at,'medium','Foliage flutter is an air visual cue');
  for(const id of region.viewer_path_ids){
   const path=paths.get(id);
   if(!path||!scene.scenario?.steps.some(s=>s.start_operations.some(o=>o.type==='move_viewer'&&o.path_id===id)))fail(at,'reference','Medium path must be an existing viewer route');
   if(region.medium==='water'&&path?.purpose!=='swim')fail(at,'motion','Water immersion route must use the authored swim purpose');
  }
 }
 if(medium?.participant_motion==='swim'&&!regions.some(r=>r.medium==='water'&&r.viewer_path_ids.length))fail('/construction_plan/medium_regions','motion','A planned swim needs a real viewer swim route through a declared water region');
 if(medium?.motion==='authored_viewer_path'&&(medium.substance!=='air'||medium.participant_motion!=='none')&&
   !regions.some(r=>r.viewer_path_ids.length))fail('/construction_plan/medium_regions','motion','Planned medium travel needs an authored viewer route; no fluid force is simulated');
 const fulfilled=new Map(cp.requirements.map(r=>[r.requirement_id,r]));
 if(fulfilled.size!==cp.requirements.length)fail('/construction_plan/requirements','unique','Requirement references must be unique');
 for(const entry of cp.requirements){
  if(!expected.has(entry.requirement_id))fail('/construction_plan/requirements','reference','Unknown approved requirement '+entry.requirement_id);
  if(entry.node_ids.some(id=>!nodes.has(id))||entry.stage_ids.some(id=>!stages.has(id))||entry.path_ids.some(id=>!paths.has(id)))fail('/construction_plan/requirements','reference','Requirement realization contains an unknown entity');
 }
 for(const requirement of requirements){
  const f=fulfilled.get(requirement.id);
  if(!f){fail('/construction_plan/requirements','coverage','Missing approved requirement '+requirement.id);continue;}
  const realized=requirement.kind==='cast'?f.node_ids.includes(requirement.target):requirement.kind==='prop'?f.node_ids.some(id=>nodes.get(id)?.prop_name===requirement.target):requirement.kind==='stage'?f.stage_ids.includes(requirement.target):requirement.kind==='motion'?f.path_ids.some(id=>scene.scenario?.steps.some(s=>s.start_operations.some(o=>o.type==='move_viewer'&&o.path_id===id))):f.node_ids.length+f.stage_ids.length>0;
  if(!realized)fail('/construction_plan/requirements','coverage','Requirement has no matching executable realization: '+requirement.id);
 }
 const frames=(id:string,seen=new Set<string>()):number[]=>{
  if(id==='viewer')return [...identity().slice(0,12),...(scene.viewpoints.find(v=>v.id===scene.initial_viewpoint_id)?.position??[0,1.6,0]),1];
  const n=nodes.get(id);if(!n||seen.has(id))throw new AppError('INVALID_MODEL_OUTPUT','Invalid construction hierarchy',[{path:'/nodes',rule:'hierarchy',message:'Missing or cyclic spatial frame '+id}]);
  const local=transform(n.position,n.rotation_radians,n.scale);
  return n.parent_id?multiply(frames(n.parent_id,new Set([...seen,id])),local):local;
 };
 const worldBounds=(id:string)=>{const n=nodes.get(id);if(!n)throw new AppError('INVALID_MODEL_OUTPUT','Missing spatial subject '+id);return transformedBounds(geometryBounds(n),frames(id));};
 const move=(id:string,world:Vec3)=>{const n=nodes.get(id)!;n.position=n.parent_id?point(inverse(frames(n.parent_id)),world):world;};
 const anchorPoint=(id:string)=>{const a=anchors.get(id);if(!a)throw new AppError('INVALID_MODEL_OUTPUT','Missing construction anchor '+id);return point(frames(a.node_id),a.position);};
 for(const [index,a] of cp.anchors.entries()){
  const n=nodes.get(a.node_id);
  if(!n){fail(`/construction_plan/anchors/${index}`,'reference','Anchor node is missing');continue;}
  const bounds=geometryBounds(n);
  if(!contains(bounds,{min:a.position,max:a.position},0.03))fail(`/construction_plan/anchors/${index}/position`,'bounds',`${a.id} on ${n.id}: local position ${JSON.stringify(a.position)} is outside unscaled geometry bounds ${JSON.stringify(bounds)}. Node scale ${JSON.stringify(n.scale)} is applied afterward; express the anchor in geometry-local coordinates. Do not guess a seat from standing height.`);
  const spans=bounds.max.map((v,i)=>v-bounds.min[i]);
  let matrix:number[];
  try {matrix=frames(n.id);}catch(error){if(error instanceof AppError){issues.push(...error.issues);continue;}throw error;}
  const length=(column:number)=>Math.hypot(matrix[column],matrix[column+1],matrix[column+2]);
  const second=n.geometry.kind==='plane'?1:2;
  const footprint=[spans[0]*length(0),spans[second]*length(second*4)];
  if(a.footprint[0]>footprint[0]+0.03||a.footprint[1]>footprint[1]+0.03)fail(`/construction_plan/anchors/${index}`,'fit',`${a.id} on ${n.id}: requested footprint ${JSON.stringify(a.footprint)}m exceeds transformed support dimensions ${JSON.stringify(footprint)}m`);
 }
 const assigned=new Set<string>();
 for(const [assemblyIndex,assembly] of cp.assemblies.entries()){
  if(!nodes.has(assembly.root_node_id)||!zones.has(assembly.zone_id))fail('/construction_plan/assemblies','reference','Assembly root or zone is missing');
  assembly.requirement_ids=annotateRequirements(assembly.requirement_ids,`/construction_plan/assemblies/${assemblyIndex}/requirement_ids`);
  for(const [memberIndex,id] of assembly.member_node_ids.entries()){
   if(assigned.has(id))fail('/construction_plan/assemblies','unique','A node belongs to multiple assemblies');assigned.add(id);
   let current:string|null=id;const seen=new Set<string>();
   while(current!==null&&current!==assembly.root_node_id&&!seen.has(current)){seen.add(current);current=nodes.get(current)?.parent_id??null;}
   if(current!==assembly.root_node_id)fail(`/construction_plan/assemblies/${assemblyIndex}/member_node_ids/${memberIndex}`,'hierarchy',`${assembly.id}: member ${id} is not ${assembly.root_node_id} or its descendant. Actual parent is ${JSON.stringify(nodes.get(id)?.parent_id)}. Declare a real parent chain with local child transforms, or a separate assembly for an independent world root.`);
  }
 }
 for(const node of scene.nodes)if(node.role!=='environment'&&!assigned.has(node.id))fail('/construction_plan/assemblies','coverage','Task objects, props and characters need explicit assembly membership: '+node.id);
 const relations=map(cp.relations,'/construction_plan/relations');
 const viewpoints=new Map(scene.viewpoints.map(view=>[view.id,view.position as Vec3]));
 const viewpointTarget=(relation:ConstructionPlan['relations'][number])=>{
  const id=relation.target_id;
  if(!['near','faces','clear_of'].includes(relation.kind)||id==='viewer'||nodes.has(id)||zones.has(id)||anchors.has(id))return undefined;
  return viewpoints.get(id);
 };
 for(const relation of relations.values()){
  const at='/construction_plan/relations/'+relation.id;
  const targetAnchor=anchors.get(relation.target_id),targetNodeID=targetAnchor?.node_id??relation.target_id;
  const pointSubject=relation.kind==='near'&&viewpoints.has(relation.subject_id);
  if(!nodes.has(relation.subject_id)&&!pointSubject||(!nodes.has(targetNodeID)&&!zones.has(relation.target_id)&&relation.target_id!=='viewer'&&!viewpointTarget(relation)))fail(at,'reference','Relation subject or target is missing');
  if(relation.anchor_id&&anchors.get(relation.anchor_id)?.node_id!==targetNodeID)fail(at,'reference','Target anchor must belong to its target node');
  if(targetAnchor&&relation.anchor_id&&targetAnchor.id!==relation.anchor_id)fail(at,'reference','A relation cannot select two different target anchors');
  if(relation.subject_anchor_id&&anchors.get(relation.subject_anchor_id)?.node_id!==relation.subject_id)fail(at,'reference','Contact anchor must belong to its subject');
  if(['inside','within'].includes(relation.kind)&&(targetAnchor||relation.anchor_id||relation.target_id==='viewer'))fail(at,'volume','Containment requires a node or zone volume, not a point anchor');
 }
 const boundaryNodes=new Set(cp.requirements.filter(f=>expected.get(f.requirement_id)?.kind==='boundary').flatMap(f=>f.node_ids));
 for(const relation of relations.values())if(!relation.required&&(nodes.get(relation.subject_id)?.role!=='environment'||boundaryNodes.has(relation.subject_id)))fail('/construction_plan/relations/'+relation.id,'priority','Task objects and explicit boundary constraints cannot be downgraded to optional decoration');
 const done=new Set<string>(),visiting=new Set<string>();
 const placedBy=new Map<string,string>();
 const apply=(relation:ConstructionPlan['relations'][number])=>{
  if(done.has(relation.id))return;
  if(visiting.has(relation.id)){fail('/construction_plan/relations','cycle','Cyclic construction dependencies');return;}
  visiting.add(relation.id);
  const targetAnchor=anchors.get(relation.target_id);
  const targetNodeID=targetAnchor?.node_id??relation.target_id;
  for(const dependency of relations.values())if(dependency.subject_id===targetNodeID&&!['clear_of','faces'].includes(dependency.kind))apply(dependency);
  const n=nodes.get(relation.subject_id),target=nodes.get(targetNodeID),zone=zones.get(relation.target_id),viewpoint=viewpointTarget(relation);
  const at='/construction_plan/relations/'+relation.id;
  const pointSubject=relation.kind==='near'?scene.viewpoints.find(v=>v.id===relation.subject_id):undefined;
  if(!n&&!pointSubject||(!target&&!zone&&!viewpoint&&relation.target_id!=='viewer')){fail(at,'reference','Relation subject or target is missing',relation.required);visiting.delete(relation.id);done.add(relation.id);return;}
  let center:Vec3=targetAnchor?anchorPoint(targetAnchor.id):zone?.center??viewpoint??point(frames(targetNodeID),[0,0,0]);
  if(relation.anchor_id){const anchor=anchors.get(relation.anchor_id);if(!anchor||anchor.node_id!==targetNodeID){fail(at,'reference','Anchor must belong to the relation target',relation.required);visiting.delete(relation.id);done.add(relation.id);return;}center=anchorPoint(anchor.id);}
  const destination=center.map((v,i)=>v+relation.offset[i]) as Vec3;
  if(pointSubject){pointSubject.position=destination;viewpoints.set(pointSubject.id,destination);visiting.delete(relation.id);done.add(relation.id);return;}
  if(!n)throw new AppError('INVALID_MODEL_OUTPUT','The relation has no executable subject');
  if(relation.kind==='faces'){
   const localTarget=n.parent_id?point(inverse(frames(n.parent_id)),destination):destination;
   n.rotation_radians[1]=Math.atan2(-(localTarget[0]-n.position[0]),-(localTarget[2]-n.position[2]));
  }else if(relation.kind==='on'){
   if(!target||(!relation.anchor_id&&!targetAnchor)){fail(at,'support','Support relations need an explicit surface/seat anchor',relation.required);}
   else {
    const subjectAnchor=relation.subject_anchor_id?anchors.get(relation.subject_anchor_id):undefined;
    if(relation.subject_anchor_id&&(!subjectAnchor||subjectAnchor.node_id!==n.id))fail(at,'reference','Contact anchor must belong to its subject',relation.required);
    const seated=n.animation==='sit'||scene.scenario?.steps.some(step=>step.start_operations.some(op=>op.type==='character_action'&&op.behavior==='sit'&&plan.characters.some(c=>c.id===op.character_id&&c.scene_node_id===n.id)));
    if(seated&&!subjectAnchor)fail(at,'support','A seated actor needs an explicit subject seat-contact anchor; standing bounds cannot determine its seated contact',relation.required);
    move(n.id,destination);
    const contact=subjectAnchor?point(frames(n.id),subjectAnchor.position):undefined;
    if(contact){const origin=point(frames(n.id),[0,0,0]);move(n.id,origin.map((v,i)=>v+destination[i]-contact[i]) as Vec3);n.support_contact=subjectAnchor!.position;}
    else {const bottom=worldBounds(n.id).min[1];const origin=point(frames(n.id),[0,0,0]);origin[1]+=destination[1]-bottom;move(n.id,origin);}
    placedBy.set(n.id,relation.id);
    n.support_node_id=target.id;
   }
  }else if(relation.kind==='within'){
   // Containment-only: verify the authored position, never move the subject.
   const box=zone?{min:zone.center.map((v,i)=>v-zone.size[i]/2) as Vec3,max:zone.center.map((v,i)=>v+zone.size[i]/2) as Vec3}:worldBounds(relation.target_id);
   const available={min:box.min.map(v=>v+relation.clearance) as Vec3,max:box.max.map(v=>v-relation.clearance) as Vec3};
   if(!contains(available,worldBounds(n.id),relation.tolerance)){const b=worldBounds(n.id);const subjectSize=b.max.map((v,i)=>v-b.min[i]);fail(at,'fit',`${n.id} bounds ${JSON.stringify(b)} is not within ${relation.target_id} usable bounds ${JSON.stringify(available)} at its authored position (within checks containment only; nothing was moved)${describeAuthored(n)}. Fix the authored position or rotation, or use inside with offset = intended world position minus the target origin/zone center to place it.`,relation.required,{severity:zoneSeverity([0,1,2].map(axis=>Math.max(available.min[axis]-b.min[axis],b.max[axis]-available.max[axis],0)),available.max.map((v,i)=>v-available.min[i])),outdoor:zone?.kind==='outdoor',...((relation.clearance>0||[0,1,2].some(axis=>(subjectSize[axis])>(available.max[axis]-available.min[axis])+relation.tolerance))?{classification:'hard' as const}:{})});}
  }else if(['near','attached_to','inside'].includes(relation.kind)){
   move(n.id,destination);
   placedBy.set(n.id,relation.id);
   if(relation.kind==='attached_to'&&target&&n.parent_id!==target.id)fail(at,'hierarchy','Declare the attachment parent in the authored hierarchy; do not reparent a posed assembly implicitly',relation.required);
   if(relation.kind==='inside'){
    const box=zone?{min:zone.center.map((v,i)=>v-zone.size[i]/2) as Vec3,max:zone.center.map((v,i)=>v+zone.size[i]/2) as Vec3}:worldBounds(relation.target_id);
    const available={min:box.min.map(v=>v+relation.clearance) as Vec3,max:box.max.map(v=>v-relation.clearance) as Vec3};
    if(!contains(available,worldBounds(n.id),relation.tolerance)){const b=worldBounds(n.id);const subjectSize=b.max.map((v,i)=>v-b.min[i]);fail(at,'fit',`${n.id} bounds ${JSON.stringify(b)} cannot fit ${relation.target_id} usable bounds ${JSON.stringify(available)} at tolerance ${relation.tolerance}m${describeAuthored(n)}`,relation.required,{severity:zoneSeverity([0,1,2].map(axis=>Math.max(available.min[axis]-b.min[axis],b.max[axis]-available.max[axis],0)),available.max.map((v,i)=>v-available.min[i])),outdoor:zone?.kind==='outdoor',...((relation.clearance>0||[0,1,2].some(axis=>(subjectSize[axis])>(available.max[axis]-available.min[axis])+relation.tolerance))?{classification:'hard' as const}:{})});}
   }
  }
  visiting.delete(relation.id);done.add(relation.id);
 };
 if(issues.length)throw new AppError('INVALID_MODEL_OUTPUT','Construction references require repair',issues);
 // Resolve positions before facing. A small deterministic fixed-point pass
 // updates attached anchors/support bounds after a target's orientation changes.
 for(let pass=0;pass<3;pass++){
  done.clear();visiting.clear();
  for(const relation of cp.relations.filter(r=>!['clear_of','faces'].includes(r.kind)))apply(relation);
  for(const relation of cp.relations.filter(r=>r.kind==='faces'))apply(relation);
 }
 for(const relation of cp.relations.filter(r=>r.kind==='clear_of')){
  const anchor=anchors.get(relation.anchor_id??relation.target_id);
  const zone=zones.get(relation.target_id);
  const at=anchor?anchorPoint(anchor.id):viewpointTarget(relation)??point(frames('viewer'),[0,0,0]);
  const a=worldBounds(relation.subject_id),targetBounds=anchor?{min:at,max:at}:zone?{min:zone.center.map((v,i)=>v-zone.size[i]/2) as Vec3,max:zone.center.map((v,i)=>v+zone.size[i]/2) as Vec3}:nodes.has(relation.target_id)?worldBounds(relation.target_id):{min:at,max:at};
  const b={min:targetBounds.min.map((v,i)=>v+relation.offset[i]),max:targetBounds.max.map((v,i)=>v+relation.offset[i])};
  const gap=Math.hypot(...[0,1,2].map(i=>Math.max(0,b.min[i]-a.max[i],a.min[i]-b.max[i])));
  if(gap+relation.tolerance<relation.clearance)fail('/construction_plan/relations/'+relation.id,'clearance',`${relation.subject_id} to ${relation.target_id}: measured AABB gap ${gap.toFixed(3)}m, required ${relation.clearance}m, tolerance ${relation.tolerance}m. Floor support is on, not clearance from the floor.`,relation.required,{severity:relation.clearance/Math.max(gap,0.05),measured:String(gap),allowed:String(relation.clearance)});
  done.add(relation.id);
 }
 for(const route of cp.routes){
  const path=paths.get(route.path_id);
  if(!path||route.stage_ids.some(id=>!stages.has(id))){fail('/construction_plan/routes','reference','Route references an unknown path or stage');continue;}
  route.requirement_ids=annotateRequirements(route.requirement_ids,`/construction_plan/routes/${path.id}/requirement_ids`);
  if((route.from_anchor_id||route.to_anchor_id)&&path.coordinate_space==='relative'){fail('/construction_plan/routes','frame','Anchored routes require world coordinates; relative routes are checked against the current heading on the phone');continue;}
  // Anchor links are annotations on the authoritative trajectory (see the
  // alignment check below). A dangling link is dropped with a warning rather
  // than failing an otherwise valid route; endpoints never move.
  for(const side of ['from_anchor_id','to_anchor_id'] as const){
   const id=route[side];
   if(id&&!anchors.has(id)){fail('/construction_plan/routes/'+path.id+'/'+side,'anchor_alignment',`Route ${path.id} ${side} names missing anchor ${id}; the annotation was dropped and the authored trajectory preserved.`,false);delete route[side];}
  }
  const viewer=scene.scenario?.steps.some(s=>s.start_operations.some(o=>o.type==='move_viewer'&&o.path_id===path.id));
  // These optional links describe the route; they must not relocate its actual
  // authored trajectory or break continuity between adjacent motion stages.
  for(const [side,id,position] of [['from',route.from_anchor_id,path.start_position],['to',route.to_anchor_id,path.points.at(-1)?.position]] as [string,string|undefined,Vec3|undefined][]){
   if(!id||!position)continue;
   const expectedPoint=anchorPoint(id);if(viewer)expectedPoint[1]+=route.eye_height_meters;
   if(distance(position,expectedPoint)>Math.max(0.35,route.clearance_radius_meters))fail('/construction_plan/routes/'+path.id+'/'+side+'_anchor_id','anchor_alignment',`Route ${path.id} ${side} anchor ${id} differs from the authored trajectory. The actual route is preserved and checked against native geometry.`,false);
  }
  path.clearance_radius_meters=route.clearance_radius_meters;path.eye_height_meters=route.eye_height_meters;
 }
 if(new Set(cp.routes.map(r=>r.path_id)).size!==cp.routes.length)fail('/construction_plan/routes','unique','Duplicate route bindings');
 for(const path of paths.values())if(!cp.routes.some(r=>r.path_id===path.id))fail('/construction_plan/routes','coverage','Every motion path needs an explicit route and clearance profile');
 // Mirror the native swept-body route audit with transformed bounds so a route
 // blocked by solid geometry fails here, where repair feedback can name the
 // blocking node, instead of only after native mesh loading. Bounds are
 // conservative for concave assets; the native check remains authoritative.
 const operations=[...(scene.scenario?.steps.flatMap(s=>[...s.start_operations,...s.actions.flatMap(a=>a.operations)])??[]),...scene.events.map(e=>e.operation)];
 const viewerPathIDs=new Set(operations.filter(o=>o.type==='move_viewer').map(o=>('path_id' in o?o.path_id:'')));
 const nodeActors=new Map<string,string>();
 for(const op of operations)if(op.type==='move_node'&&'path_id' in op&&'node_id' in op&&!nodeActors.has(op.path_id))nodeActors.set(op.path_id,op.node_id);
 const attachedIDs=new Set(scene.viewer_attached_node_ids??[]);
 const inIgnoredAssembly=(node:SceneNode,isViewer:boolean,actorID:string|undefined)=>{
  const seen=new Set<string>();
  for(let id:string|null=node.id;id&&!seen.has(id);id=nodes.get(id)?.parent_id??null){
   if(id===actorID||(isViewer&&attachedIDs.has(id)))return true;
   seen.add(id);
  }
  return false;
 };
 const initialView=(scene.viewpoints.find(v=>v.id===scene.initial_viewpoint_id)?.position??[0,1.6,0]) as Vec3;
 const orient2=(p:Vec3,q:Vec3,r:Vec3)=>(q[0]-p[0])*(r[2]-p[2])-(q[2]-p[2])*(r[0]-p[0]);
 const pointSegment=(pt:Vec3,u:Vec3,w:Vec3)=>{const dx=w[0]-u[0],dz=w[2]-u[2];const length2=dx*dx+dz*dz;const t=length2<1e-12?0:Math.max(0,Math.min(1,((pt[0]-u[0])*dx+(pt[2]-u[2])*dz)/length2));return Math.hypot(pt[0]-(u[0]+t*dx),pt[2]-(u[2]+t*dz));};
 const segmentRectDistance=(a:Vec3,b:Vec3,bounds:Bounds)=>{
  const inside=(p:Vec3)=>p[0]>=bounds.min[0]&&p[0]<=bounds.max[0]&&p[2]>=bounds.min[2]&&p[2]<=bounds.max[2];
  if(inside(a)||inside(b))return 0;
  const corners:Vec3[]=[[bounds.min[0],0,bounds.min[2]],[bounds.max[0],0,bounds.min[2]],[bounds.max[0],0,bounds.max[2]],[bounds.min[0],0,bounds.max[2]]];
  let best=Infinity;
  for(let e=0;e<4;e++){
   const r=corners[e],s=corners[(e+1)%4];
   const o1=orient2(a,b,r),o2=orient2(a,b,s),o3=orient2(r,s,a),o4=orient2(r,s,b);
   if(((o1>0&&o2<0)||(o1<0&&o2>0))&&((o3>0&&o4<0)||(o3<0&&o4>0)))return 0;
   best=Math.min(best,pointSegment(a,r,s),pointSegment(b,r,s),pointSegment(r,a,b));
  }
  return best;
 };
 const characterNodes=new Set(plan.characters.map(character=>character.scene_node_id));
 for(const route of cp.routes){
  const path=paths.get(route.path_id);if(!path)continue;
  const isViewer=viewerPathIDs.has(path.id),actorID=nodeActors.get(path.id);
  // The swept radius and eye height describe a person, not a moving prop.
  // Props remain solid for participant and character route checks.
  if(!isViewer&&(!actorID||!characterNodes.has(actorID)))continue;
  const eye=route.eye_height_meters,radius=route.clearance_radius_meters;
  const origin:Vec3=isViewer?((path.start_position as Vec3|undefined)??[...initialView] as Vec3):point(frames(actorID!),[0,0,0]);
  const absolute:Vec3[]=path.coordinate_space==='relative'?[origin,...path.points.map(p=>[origin[0]+p.position[0],origin[1]+p.position[1],origin[2]+p.position[2]] as Vec3)]:[origin,...path.points.map(p=>p.position as Vec3)];
  const collisionNodes=scene.nodes.filter(n=>(n.collision_role??'solid')!=='none'&&!inIgnoredAssembly(n,isViewer,actorID));
  const solids=collisionNodes.filter(n=>(n.collision_role??'solid')==='solid');
  let reported=0;
  for(let i=1;i<absolute.length&&reported<4;i++){
   const a=absolute[i-1],b=absolute[i];
   const eyeA=isViewer?a[1]:a[1]+eye,eyeB=isViewer?b[1]:b[1]+eye;
   const deltaY=eyeB-eyeA;
   const at=(t:number):Vec3=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];
   for(const solid of solids){
    const bounds=worldBounds(solid.id);
    const minEye=bounds.min[1],maxEye=bounds.max[1]+eye-0.15;
    if(Math.max(eyeA,eyeB)<minEye||Math.min(eyeA,eyeB)>maxEye)continue;
    // Clearance only applies where the body and the obstacle overlap in
    // height at the same point along the segment.
    let from=a,to=b;
    if(deltaY!==0){
     const enter=(minEye-eyeA)/deltaY,exit=(maxEye-eyeA)/deltaY;
     from=at(Math.max(0,Math.min(enter,exit)));
     to=at(Math.min(1,Math.max(enter,exit)));
    }
    const gap=segmentRectDistance(from,to,bounds);
    if(gap<radius){fail('/motion_paths/'+path.id,'route_clearance',`Route ${path.id} segment ${i-1} from ${JSON.stringify(a)} to ${JSON.stringify(b)} passes ${gap.toFixed(2)}m from solid node "${solid.id}" (body radius ${radius}m, blocking bounds ${JSON.stringify(bounds)}). Move the route or "${solid.id}" so the swept body clears it; keep the authored destination and purpose.`);reported++;break;}
   }
   if(['walk','run'].includes(path.purpose)){
    const length=Math.hypot(b[0]-a[0],b[1]-a[1],b[2]-a[2]),count=Math.max(1,Math.ceil(length/0.25));
    for(let sample=0;sample<=count;sample++){
     const t=sample/count,x=a[0]+(b[0]-a[0])*t,z=a[2]+(b[2]-a[2])*t,footY=a[1]+(b[1]-a[1])*t-(isViewer?eye:0);
     const supported=collisionNodes.some(n=>{const bounds=worldBounds(n.id);return x>=bounds.min[0]-0.02&&x<=bounds.max[0]+0.02&&z>=bounds.min[2]-0.02&&z<=bounds.max[2]+0.02&&bounds.max[1]>=footY-0.35&&bounds.max[1]<=footY+0.3;});
     if(!supported){fail('/motion_paths/'+path.id,'route_support',`Route ${path.id} segment ${i-1} has no supporting surface under the body near [${x.toFixed(2)},${footY.toFixed(2)},${z.toFixed(2)}] (sample ${sample}). Add or extend ground geometry under the authored route; do not lower the participant through the floor.`);reported++;break;}
    }
   }
  }
 }
 // Zone membership is usable world-space volume, not just a semantic label.
 // A small boundary allowance accommodates wall/ceiling thickness at its edge.
 const requiredGeometry=new Set([
  ...scene.nodes.filter(n=>n.role!=='environment').map(n=>n.id),
  ...cp.requirements.flatMap(r=>r.node_ids),...(scene.viewer_attached_node_ids??[]),
  ...cp.relations.filter(r=>r.required).flatMap(r=>[r.subject_id,anchors.get(r.target_id)?.node_id??r.target_id]),
 ]);
 // A required object's actual support matters; unrelated decoration in the
 // same assembly does not acquire a requirement merely by sharing its label.
 for(const id of requiredGeometry){const support=nodes.get(id)?.support_node_id;if(support)requiredGeometry.add(support);}
 const nodeIndices=new Map(scene.nodes.map((node,index)=>[node.id,index]));
 for(const assembly of cp.assemblies){
  const zone=zones.get(assembly.zone_id)!;
  const volume={min:zone.center.map((v,i)=>v-zone.size[i]/2) as Vec3,max:zone.center.map((v,i)=>v+zone.size[i]/2) as Vec3};
  // Open air has no physical ceiling. Preserve real enclosures, explicit
  // containment, water volumes, and every horizontal/lower bound.
  const waterZone=regions.some(r=>r.zone_id===zone.id&&r.medium==='water');
  const containedSubjects=new Set(cp.relations.filter(r=>['inside','within'].includes(r.kind)&&r.target_id===zone.id).map(r=>r.subject_id));
  for(const id of assembly.member_node_ids){
   const bounds=worldBounds(id);
   // Open air has no physical ceiling for ordinary members (a tree canopy
   // above a conceptual outdoor grouping zone is layout metadata, not a
   // boundary violation). Explicitly contained subjects, water volumes and
   // real enclosures keep their ceiling.
   const openTop=zone.kind==='outdoor'&&!containedSubjects.has(id);
   const measured:Bounds={min:volume.min,max:openTop?[volume.max[0],Math.max(volume.max[1],bounds.max[1]),volume.max[2]]:volume.max};
   if(!contains(measured,bounds,0.2)){
    const parent=nodes.get(id)?.parent_id;
    const via=placedBy.get(id)?` Placed by relation ${placedBy.get(id)} at resolved origin ${JSON.stringify(point(frames(id),[0,0,0]))}.`:'';
    const overflowVec=[0,1,2].map(axis=>Math.max(measured.min[axis]-bounds.min[axis],bounds.max[axis]-measured.max[axis],0));
    const severity=zoneSeverity(overflowVec,zone.size);
    const overflow=[0,1,2].map(axis=>{const low=measured.min[axis]-bounds.min[axis],high=bounds.max[axis]-measured.max[axis];return (low>0?` ${'xyz'[axis]} low by ${low.toFixed(2)}m`:'')+(high>0?` ${'xyz'[axis]} high by ${high.toFixed(2)}m`:'');}).join('').trim();
    const overflowText=overflow?` Overflow:${overflow}.`:'';
    const frame=parent?` ${id} is a child of ${parent}, whose scale ${JSON.stringify(nodes.get(parent)?.scale)} also scales its geometry and local offset.`:'';
    fail(`/nodes/${nodeIndices.get(id)}`,'zone_fit',`${id} world bounds ${JSON.stringify(bounds)} exceed zone ${zone.id} ${JSON.stringify(volume)} (0.2m boundary allowance).${frame}${via}${overflowText}${describeAuthored(nodes.get(id)!)} Use independent world roots for static objects, or correct local transforms for genuine children.`,requiredGeometry.has(id),{classification:classifyVisual({path:'',rule:'zone_fit',message:'',severity,outdoor:zone.kind==='outdoor'}).classification,severity,outdoor:zone.kind==='outdoor',measured:JSON.stringify(bounds),allowed:JSON.stringify(volume)});
   }
  }
 }
 // Recheck placement after all dependent placements resolve; a later relation
 // must not silently invalidate an earlier support/containment constraint.
 for(const relation of cp.relations.filter(r=>r.kind!=='clear_of')){
  const n=nodes.get(relation.subject_id);if(!n)continue;
  const zone=zones.get(relation.target_id);
  const center=relation.anchor_id?anchorPoint(relation.anchor_id):anchors.has(relation.target_id)?anchorPoint(relation.target_id):zone?.center??viewpointTarget(relation)??point(frames(relation.target_id),[0,0,0]);
  const requested=center.map((v,i)=>v+relation.offset[i]) as Vec3;
  const origin=point(frames(n.id),[0,0,0]);
  if(['near','attached_to'].includes(relation.kind)&&distance(origin,requested)>relation.tolerance)fail('/construction_plan/relations/'+relation.id,'placement','Later constraints displaced the requested relationship',relation.required,{severity:distance(origin,requested)/Math.max(0.3,relation.tolerance)});
  const contact=relation.subject_anchor_id?anchorPoint(relation.subject_anchor_id):[origin[0],worldBounds(n.id).min[1],origin[2]];
  if(relation.kind==='on'&&distance(contact,requested)>relation.tolerance)fail('/construction_plan/relations/'+relation.id,'support','Later constraints displaced the supported object',relation.required);
  if(relation.kind==='faces'){
   const local=n.parent_id?point(inverse(frames(n.parent_id)),requested):requested;
   const yaw=Math.atan2(-(local[0]-n.position[0]),-(local[2]-n.position[2]));
   const angularError=Math.abs(Math.atan2(Math.sin(yaw-n.rotation_radians[1]),Math.cos(yaw-n.rotation_radians[1])));
   if(angularError>relation.tolerance)fail('/construction_plan/relations/'+relation.id,'orientation','Facing constraints did not converge after placement',relation.required,{severity:angularError/Math.max(0.3,relation.tolerance)});
  }
  if(['inside','within'].includes(relation.kind)){
   const bounds=zone?{min:zone.center.map((v,i)=>v-zone.size[i]/2) as Vec3,max:zone.center.map((v,i)=>v+zone.size[i]/2) as Vec3}:worldBounds(relation.target_id);
   const available={min:bounds.min.map(v=>v+relation.clearance) as Vec3,max:bounds.max.map(v=>v-relation.clearance) as Vec3},subjectBounds=worldBounds(n.id);const subjectSize=subjectBounds.max.map((v,i)=>v-subjectBounds.min[i]);
   if(!contains(available,subjectBounds,relation.tolerance))fail('/construction_plan/relations/'+relation.id,'fit','Later placement violates the required usable space',relation.required,{severity:zoneSeverity([0,1,2].map(axis=>Math.max(available.min[axis]-subjectBounds.min[axis],subjectBounds.max[axis]-available.max[axis],0)),available.max.map((v,i)=>v-available.min[i])),outdoor:zone?.kind==='outdoor',...((relation.clearance>0||[0,1,2].some(axis=>(subjectSize[axis])>(available.max[axis]-available.min[axis])+relation.tolerance))?{classification:'hard' as const}:{})});
  }
 }
 const classified=(issues as ClassifiedIssue[]).map(issue=>classifyVisual(issue));
 const acceptance=evaluateAcceptance(classified);
 if(classified.some(issue=>issue.classification!=='soft')||acceptance.reasons.length)throw new AppError('INVALID_MODEL_OUTPUT','Construction constraints require repair',classified);
 warnings.push(...acceptance.acceptedSoft);
 const acceptedDefects=warnings.filter(issue=>(issue as ClassifiedIssue).classification==='soft');
 scene.construction_report={compiler_version:'1',resolved_relation_ids:[...done].sort(),warnings:[...new Map(warnings.map(w=>[JSON.stringify(w),w])).values()],...(acceptedDefects.length?{accepted_defects:acceptedDefects}:{})} as SceneSpec['construction_report'];
 return scene;
}

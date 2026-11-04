import {createHash} from 'node:crypto';
import {assetManifest} from './assets.js';
import {AppError,document,sceneIssues} from './contracts.js';
import type {SceneSpec,SceneNode,SessionPlan,ValidationIssue,ConstructionPlan,AudioPlan} from '../../docs/handoff/contracts.js';
import {identity,multiply,inverse,point,transform,transformedBounds,contains,distance,type Vec3,type Bounds} from './spatial-math.js';

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

function constructionSource(source:SceneSpec):SceneSpec {
 if(!source.construction_plan)return source;
 const scene=structuredClone(source),cp=scene.construction_plan!,nodes=new Map(scene.nodes.map(n=>[n.id,n]));
 // The task realization is the author-owned source of focal-object identity.
 if(!scene.nodes.some(n=>n.role==='task_focus')){
  const focus=new Set(cp.requirements.find(r=>r.requirement_id==='task')?.node_ids??[]);
  for(const node of scene.nodes)if(focus.has(node.id)&&node.role!=='character')node.role='task_focus';
 }
 // Partition static collections along their actual hierarchy. This changes only
 // assembly bookkeeping: never reparent or move geometry to satisfy metadata.
 const operations=[...scene.events.map(e=>e.operation),...scene.interactions.flatMap(i=>i.choices.flatMap(c=>c.operations)),...(scene.scenario?.steps.flatMap(s=>[...s.start_operations,...s.actions.flatMap(a=>a.operations)])??[])];
 const controlled=new Set([...(scene.viewer_attached_node_ids??[]),...operations.flatMap(o=>'node_id' in o?[o.node_id]:[])]);
 const inheritsControl=(root:string)=>{
  const seen=new Set<string>();let id:string|null=root;
  while(id&&!seen.has(id)){if(controlled.has(id))return true;seen.add(id);id=nodes.get(id)?.parent_id??null;}
  return false;
 };
 const assemblyIDs=new Set(cp.assemblies.map(a=>a.id));
 const assemblyLimit=document.components.schemas.ConstructionPlan.properties.assemblies.maxItems;
 let assemblyCount=cp.assemblies.length;
 cp.assemblies=cp.assemblies.flatMap(assembly=>{
  if(inheritsControl(assembly.root_node_id)||assembly.member_node_ids.some(id=>!nodes.has(id)))return [assembly];
  const members=new Set(assembly.member_node_ids),groups=new Map<string,string[]>();
  for(const id of assembly.member_node_ids){
   let root=id;const seen=new Set<string>();
   while(nodes.get(root)?.parent_id&&members.has(nodes.get(root)!.parent_id!)){
    if(seen.has(root))return [assembly];seen.add(root);root=nodes.get(root)!.parent_id!;
   }
   if(root!==assembly.root_node_id&&nodes.get(root)?.parent_id!==null)return [assembly];
   const group=groups.get(root)??[];group.push(id);groups.set(root,group);
  }
  if(groups.size<2||!groups.has(assembly.root_node_id)||assemblyCount+groups.size-1>assemblyLimit)return [assembly];
  assemblyCount+=groups.size-1;
  return [...groups].map(([root,member_node_ids])=>{
   let id=assembly.id;
   if(root!==assembly.root_node_id){
    let salt=0;do{id='asm_'+createHash('sha256').update(assembly.id+'|'+root+'|'+salt++).digest('hex').slice(0,16);}while(assemblyIDs.has(id));
    assemblyIDs.add(id);
   }
   return {...assembly,id,root_node_id:root,member_node_ids};
  });
 });
 return scene;
}

/** A construction failure must not hide independent scene errors from the one repair. */
export function compileScene(plan:SessionPlan,source:SceneSpec,audio:AudioPlan):SceneSpec {
 const prepared=constructionSource(source);
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
export function compileConstruction(plan:SessionPlan,source:SceneSpec):SceneSpec {
 if(!source.construction_plan)return source; // Saved scenes predate this compiler.
 const scene=constructionSource(source),cp=scene.construction_plan!,issues:ValidationIssue[]=[],warnings:ValidationIssue[]=[];
 const fail=(path:string,rule:string,message:string,required=true)=>(required?issues:warnings).push({path,rule,message});
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
 if(medium?.motion==='authored_viewer_path'&&!regions.some(r=>r.viewer_path_ids.length))fail('/construction_plan/medium_regions','motion','Planned medium travel needs an authored viewer route; no fluid force is simulated');
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
  if(!nodes.has(assembly.root_node_id)||!zones.has(assembly.zone_id)||assembly.requirement_ids.some(id=>!expected.has(id)))fail('/construction_plan/assemblies','reference','Assembly root, zone or requirement is missing');
  for(const [memberIndex,id] of assembly.member_node_ids.entries()){
   if(assigned.has(id))fail('/construction_plan/assemblies','unique','A node belongs to multiple assemblies');assigned.add(id);
   let current:string|null=id;const seen=new Set<string>();
   while(current!==null&&current!==assembly.root_node_id&&!seen.has(current)){seen.add(current);current=nodes.get(current)?.parent_id??null;}
   if(current!==assembly.root_node_id)fail(`/construction_plan/assemblies/${assemblyIndex}/member_node_ids/${memberIndex}`,'hierarchy',`${assembly.id}: member ${id} is not ${assembly.root_node_id} or its descendant. Actual parent is ${JSON.stringify(nodes.get(id)?.parent_id)}. Declare a real parent chain with local child transforms, or a separate assembly for an independent world root.`);
  }
 }
 for(const node of scene.nodes)if(node.role!=='environment'&&!assigned.has(node.id))fail('/construction_plan/assemblies','coverage','Task objects, props and characters need explicit assembly membership: '+node.id);
 const relations=map(cp.relations,'/construction_plan/relations');
 for(const relation of relations.values()){
  const at='/construction_plan/relations/'+relation.id;
  const targetAnchor=anchors.get(relation.target_id),targetNodeID=targetAnchor?.node_id??relation.target_id;
  if(!nodes.has(relation.subject_id)||(!nodes.has(targetNodeID)&&!zones.has(relation.target_id)&&relation.target_id!=='viewer'))fail(at,'reference','Relation subject or target is missing');
  if(relation.anchor_id&&anchors.get(relation.anchor_id)?.node_id!==targetNodeID)fail(at,'reference','Target anchor must belong to its target node');
  if(targetAnchor&&relation.anchor_id&&targetAnchor.id!==relation.anchor_id)fail(at,'reference','A relation cannot select two different target anchors');
  if(relation.subject_anchor_id&&anchors.get(relation.subject_anchor_id)?.node_id!==relation.subject_id)fail(at,'reference','Contact anchor must belong to its subject');
  if(relation.kind==='inside'&&(targetAnchor||relation.anchor_id||relation.target_id==='viewer'))fail(at,'volume','Containment requires a node or zone volume, not a point anchor');
 }
 const boundaryNodes=new Set(cp.requirements.filter(f=>expected.get(f.requirement_id)?.kind==='boundary').flatMap(f=>f.node_ids));
 for(const relation of relations.values())if(!relation.required&&(nodes.get(relation.subject_id)?.role!=='environment'||boundaryNodes.has(relation.subject_id)))fail('/construction_plan/relations/'+relation.id,'priority','Task objects and explicit boundary constraints cannot be downgraded to optional decoration');
 const done=new Set<string>(),visiting=new Set<string>();
 const apply=(relation:ConstructionPlan['relations'][number])=>{
  if(done.has(relation.id))return;
  if(visiting.has(relation.id)){fail('/construction_plan/relations','cycle','Cyclic construction dependencies');return;}
  visiting.add(relation.id);
  const targetAnchor=anchors.get(relation.target_id);
  const targetNodeID=targetAnchor?.node_id??relation.target_id;
  for(const dependency of relations.values())if(dependency.subject_id===targetNodeID&&!['clear_of','faces'].includes(dependency.kind))apply(dependency);
  const n=nodes.get(relation.subject_id),target=nodes.get(targetNodeID),zone=zones.get(relation.target_id);
  const at='/construction_plan/relations/'+relation.id;
  if(!n||(!target&&!zone&&relation.target_id!=='viewer')){fail(at,'reference','Relation subject or target is missing',relation.required);visiting.delete(relation.id);done.add(relation.id);return;}
  let center:Vec3=targetAnchor?anchorPoint(targetAnchor.id):zone?zone.center:point(frames(targetNodeID),[0,0,0]);
  if(relation.anchor_id){const anchor=anchors.get(relation.anchor_id);if(!anchor||anchor.node_id!==targetNodeID){fail(at,'reference','Anchor must belong to the relation target',relation.required);visiting.delete(relation.id);done.add(relation.id);return;}center=anchorPoint(anchor.id);}
  const destination=center.map((v,i)=>v+relation.offset[i]) as Vec3;
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
    n.support_node_id=target.id;
   }
  }else if(['near','attached_to','inside'].includes(relation.kind)){
   move(n.id,destination);
   if(relation.kind==='attached_to'&&target&&n.parent_id!==target.id)fail(at,'hierarchy','Declare the attachment parent in the authored hierarchy; do not reparent a posed assembly implicitly',relation.required);
   if(relation.kind==='inside'){
    const box=zone?{min:zone.center.map((v,i)=>v-zone.size[i]/2) as Vec3,max:zone.center.map((v,i)=>v+zone.size[i]/2) as Vec3}:worldBounds(relation.target_id);
    const available={min:box.min.map(v=>v+relation.clearance) as Vec3,max:box.max.map(v=>v-relation.clearance) as Vec3};
    if(!contains(available,worldBounds(n.id),relation.tolerance))fail(at,'fit',`${n.id} bounds ${JSON.stringify(worldBounds(n.id))} cannot fit ${relation.target_id} usable bounds ${JSON.stringify(available)} at tolerance ${relation.tolerance}m`,relation.required);
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
  if(!nodes.has(relation.subject_id)||(!anchor&&!zone&&!nodes.has(relation.target_id)&&relation.target_id!=='viewer')){fail('/construction_plan/relations/'+relation.id,'reference','Clearance subject or target is missing');continue;}
  const at=anchor?anchorPoint(anchor.id):point(frames('viewer'),[0,0,0]);
  const a=worldBounds(relation.subject_id),targetBounds=anchor?{min:at,max:at}:zone?{min:zone.center.map((v,i)=>v-zone.size[i]/2) as Vec3,max:zone.center.map((v,i)=>v+zone.size[i]/2) as Vec3}:nodes.has(relation.target_id)?worldBounds(relation.target_id):{min:at,max:at};
  const b={min:targetBounds.min.map((v,i)=>v+relation.offset[i]),max:targetBounds.max.map((v,i)=>v+relation.offset[i])};
  const gap=Math.hypot(...[0,1,2].map(i=>Math.max(0,b.min[i]-a.max[i],a.min[i]-b.max[i])));
  if(gap+relation.tolerance<relation.clearance)fail('/construction_plan/relations/'+relation.id,'clearance',`${relation.subject_id} to ${relation.target_id}: measured AABB gap ${gap.toFixed(3)}m, required ${relation.clearance}m, tolerance ${relation.tolerance}m. Floor support is on, not clearance from the floor.`,relation.required);
  done.add(relation.id);
 }
 for(const route of cp.routes){
  const path=paths.get(route.path_id);
  if(!path||route.stage_ids.some(id=>!stages.has(id))||route.requirement_ids.some(id=>!expected.has(id))){fail('/construction_plan/routes','reference','Route references an unknown path, stage or requirement');continue;}
  if((route.from_anchor_id||route.to_anchor_id)&&path.coordinate_space==='relative'){fail('/construction_plan/routes','frame','Anchored routes require world coordinates; relative routes are checked against the current heading on the phone');continue;}
  if(route.from_anchor_id&&!anchors.has(route.from_anchor_id)||route.to_anchor_id&&!anchors.has(route.to_anchor_id)){fail('/construction_plan/routes','reference','Route anchor is missing');continue;}
  if(route.from_anchor_id){const start=anchorPoint(route.from_anchor_id);const viewer=scene.scenario?.steps.some(s=>s.start_operations.some(o=>o.type==='move_viewer'&&o.path_id===path.id));if(viewer)start[1]+=route.eye_height_meters;path.start_position=start;}
  if(route.to_anchor_id){const end=anchorPoint(route.to_anchor_id);const viewer=scene.scenario?.steps.some(s=>s.start_operations.some(o=>o.type==='move_viewer'&&o.path_id===path.id));if(viewer)end[1]+=route.eye_height_meters;path.points[path.points.length-1].position=end;}
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
 for(const route of cp.routes){
  const path=paths.get(route.path_id);if(!path)continue;
  const isViewer=viewerPathIDs.has(path.id),actorID=nodeActors.get(path.id);
  if(!isViewer&&!actorID)continue;
  const eye=route.eye_height_meters,radius=route.clearance_radius_meters;
  const origin:Vec3=isViewer?((path.start_position as Vec3|undefined)??[...initialView] as Vec3):point(frames(actorID!),[0,0,0]);
  const absolute:Vec3[]=path.coordinate_space==='relative'?[origin,...path.points.map(p=>[origin[0]+p.position[0],origin[1]+p.position[1],origin[2]+p.position[2]] as Vec3)]:[origin,...path.points.map(p=>p.position as Vec3)];
  const solids=scene.nodes.filter(n=>(n.collision_role??'solid')==='solid'&&n.id!==actorID&&!(isViewer&&attachedIDs.has(n.id)));
  const supports=scene.nodes.filter(n=>(n.collision_role??'solid')!=='none'&&n.id!==actorID);
  let reported=0;
  for(let i=1;i<absolute.length&&reported<4;i++){
   const a=absolute[i-1],b=absolute[i];
   const eyeA=isViewer?a[1]:a[1]+eye,eyeB=isViewer?b[1]:b[1]+eye;
   const bodyLow=Math.min(eyeA,eyeB)-eye+0.15,bodyHigh=Math.max(eyeA,eyeB);
   for(const solid of solids){
    const bounds=worldBounds(solid.id);
    if(bodyHigh<bounds.min[1]||bodyLow>bounds.max[1])continue;
    const gap=segmentRectDistance(a,b,bounds);
    if(gap<radius){fail('/motion_paths/'+path.id,'route_clearance',`Route ${path.id} segment ${i-1} from ${JSON.stringify(a)} to ${JSON.stringify(b)} passes ${gap.toFixed(2)}m from solid node "${solid.id}" (body radius ${radius}m, blocking bounds ${JSON.stringify(bounds)}). Move the route or "${solid.id}" so the swept body clears it; keep the authored destination and purpose.`);reported++;break;}
   }
   if(['walk','run'].includes(path.purpose)){
    const length=Math.hypot(b[0]-a[0],b[1]-a[1],b[2]-a[2]),count=Math.max(1,Math.ceil(length/0.25));
    for(let sample=0;sample<=count;sample++){
     const t=sample/count,x=a[0]+(b[0]-a[0])*t,z=a[2]+(b[2]-a[2])*t,footY=a[1]+(b[1]-a[1])*t-(isViewer?eye:0);
     const supported=supports.some(n=>{const bounds=worldBounds(n.id);return x>=bounds.min[0]-0.02&&x<=bounds.max[0]+0.02&&z>=bounds.min[2]-0.02&&z<=bounds.max[2]+0.02&&bounds.max[1]>=footY-0.35&&bounds.max[1]<=footY+0.3;});
     if(!supported){fail('/motion_paths/'+path.id,'route_support',`Route ${path.id} segment ${i-1} has no supporting surface under the body near [${x.toFixed(2)},${footY.toFixed(2)},${z.toFixed(2)}] (sample ${sample}). Add or extend ground geometry under the authored route; do not lower the participant through the floor.`);reported++;break;}
    }
   }
  }
 }
 // Zone membership is usable world-space volume, not just a semantic label.
 // A small boundary allowance accommodates wall/ceiling thickness at its edge.
 for(const assembly of cp.assemblies){
  const zone=zones.get(assembly.zone_id)!;
  const volume={min:zone.center.map((v,i)=>v-zone.size[i]/2) as Vec3,max:zone.center.map((v,i)=>v+zone.size[i]/2) as Vec3};
  // Open air has no physical ceiling. Preserve real enclosures, explicit
  // containment, water volumes, and every horizontal/lower bound.
  const openTop=zone.kind==='outdoor'&&!regions.some(r=>r.zone_id===zone.id&&r.medium==='water')&&!cp.relations.some(r=>r.kind==='inside'&&r.target_id===zone.id);
  for(const id of assembly.member_node_ids){
   const bounds=worldBounds(id);
   const measured:Bounds={min:volume.min,max:openTop?[volume.max[0],Math.max(volume.max[1],bounds.max[1]),volume.max[2]]:volume.max};
   if(!contains(measured,bounds,0.2))fail('/construction_plan/assemblies/'+assembly.id,'zone_fit',`${id} world bounds ${JSON.stringify(bounds)} exceed zone ${zone.id} ${JSON.stringify(volume)} (0.2m boundary allowance). Child transforms are local to their parent, not world coordinates.`,assembly.requirement_ids.length>0||nodes.get(id)?.role!=='environment');
  }
 }
 // Recheck placement after all dependent placements resolve; a later relation
 // must not silently invalidate an earlier support/containment constraint.
 for(const relation of cp.relations.filter(r=>r.kind!=='clear_of')){
  const n=nodes.get(relation.subject_id);if(!n)continue;
  const zone=zones.get(relation.target_id);
  const center=relation.anchor_id?anchorPoint(relation.anchor_id):anchors.has(relation.target_id)?anchorPoint(relation.target_id):zone?zone.center:point(frames(relation.target_id),[0,0,0]);
  const requested=center.map((v,i)=>v+relation.offset[i]) as Vec3;
  const origin=point(frames(n.id),[0,0,0]);
  if(['near','attached_to'].includes(relation.kind)&&distance(origin,requested)>relation.tolerance)fail('/construction_plan/relations/'+relation.id,'placement','Later constraints displaced the requested relationship',relation.required);
  const contact=relation.subject_anchor_id?anchorPoint(relation.subject_anchor_id):[origin[0],worldBounds(n.id).min[1],origin[2]];
  if(relation.kind==='on'&&distance(contact,requested)>relation.tolerance)fail('/construction_plan/relations/'+relation.id,'support','Later constraints displaced the supported object',relation.required);
  if(relation.kind==='faces'){
   const local=n.parent_id?point(inverse(frames(n.parent_id)),requested):requested;
   const yaw=Math.atan2(-(local[0]-n.position[0]),-(local[2]-n.position[2]));
   if(Math.abs(Math.atan2(Math.sin(yaw-n.rotation_radians[1]),Math.cos(yaw-n.rotation_radians[1])))>relation.tolerance)fail('/construction_plan/relations/'+relation.id,'orientation','Facing constraints did not converge after placement',relation.required);
  }
  if(relation.kind==='inside'){
   const bounds=zone?{min:zone.center.map((v,i)=>v-zone.size[i]/2) as Vec3,max:zone.center.map((v,i)=>v+zone.size[i]/2) as Vec3}:worldBounds(relation.target_id);
   if(!contains({min:bounds.min.map(v=>v+relation.clearance) as Vec3,max:bounds.max.map(v=>v-relation.clearance) as Vec3},worldBounds(n.id),relation.tolerance))fail('/construction_plan/relations/'+relation.id,'fit','Later placement violates the required usable space',relation.required);
  }
 }
 if(issues.length)throw new AppError('INVALID_MODEL_OUTPUT','Construction constraints require repair',issues);
 scene.construction_report={compiler_version:'1',resolved_relation_ids:[...done].sort(),warnings:[...new Map(warnings.map(w=>[JSON.stringify(w),w])).values()]};
 return scene;
}

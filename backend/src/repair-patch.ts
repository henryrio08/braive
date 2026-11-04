import {createHash} from 'node:crypto';
import type {SceneSpec,ValidationIssue} from '../../docs/handoff/contracts.js';
import {AppError} from './contracts.js';

/**
 * Scoped repair patches. Initial construction returns a complete SceneSpec;
 * repair normally returns this small patch against an identified base
 * candidate. The model never declares its own scope: the backend computes
 * the editable entity set from the violations and their dependencies, and
 * application rejects stale bases, unknown targets, out-of-scope edits and
 * whole-scene replacement through oversized operations.
 */
export type SceneRepairPatch={base_hash:string;operations:PatchOperation[]};
export type PatchOperation=
 |{op:'set_node_transform';node_id:string;position?:[number,number,number];rotation_radians?:[number,number,number];scale?:[number,number,number]}
 |{op:'set_node_material';node_id:string;color?:string;roughness?:number}
 |{op:'set_relation_offset';relation_id:string;offset:[number,number,number]}
 |{op:'set_relation_kind';relation_id:string;kind:'inside'|'within'}
 |{op:'set_path_points';path_id:string;points:{at_seconds:number;position:[number,number,number]}[]}
 |{op:'set_zone';zone_id:string;center?:[number,number,number];size?:[number,number,number]}
 |{op:'remove_node';node_id:string};

export type RepairScope={nodes:Set<string>;relations:Set<string>;paths:Set<string>;zones:Set<string>};

function stable(value:unknown):string {
 if(Array.isArray(value))return '['+value.map(stable).join(',')+']';
 if(value&&typeof value==='object')return '{'+Object.entries(value as Record<string,unknown>).filter(([,v])=>v!==undefined).sort(([a],[b])=>a<b?-1:1).map(([k,v])=>JSON.stringify(k)+':'+stable(v)).join(',')+'}';
 return JSON.stringify(value)??'null';
}

export function sceneHash(scene:SceneSpec):string {
 const {construction_report:_report,...rest}=scene as SceneSpec&{construction_report?:unknown};
 return createHash('sha256').update(stable(rest)).digest('hex').slice(0,24);
}

const ID_IN_PATH=/\/(?:nodes|motion_paths)\/([^/]+)|\/relations\/([^/]+)|\/zones\/([^/]+)/;

export function computeRepairScope(scene:SceneSpec,issues:ValidationIssue[]):RepairScope {
 const scope:RepairScope={nodes:new Set(),relations:new Set(),paths:new Set(),zones:new Set()};
 const cp=scene.construction_plan;
 const addNode=(id:string)=>{
  if(scope.nodes.has(id))return;
  const node=scene.nodes.find(n=>n.id===id);if(!node)return;
  scope.nodes.add(id);
  if(node.parent_id)addNode(node.parent_id);
  for(const child of scene.nodes.filter(n=>n.parent_id===id))addNode(child.id);
  if(node.support_node_id)scope.nodes.add(node.support_node_id);
  for(const other of scene.nodes.filter(n=>n.support_node_id===id))scope.nodes.add(other.id);
 };
 for(const issue of issues){
  const match=issue.path.match(ID_IN_PATH);
  if(issue.path.startsWith('/nodes/')&&match?.[1])addNode(match[1]);
  if(issue.path.startsWith('/motion_paths/')&&match?.[1])scope.paths.add(match[1]);
  if(match?.[2])scope.relations.add(match[2]);
  if(match?.[3])scope.zones.add(match[3]);
  // Zone diagnostics name the affected node in the message's first token.
  if(issue.rule==='zone_fit'||issue.rule==='fit'||issue.rule==='route_clearance'||issue.rule==='route_support'){
   for(const node of scene.nodes)if(issue.message.includes(node.id))addNode(node.id);
   for(const path of scene.motion_paths??[])if(issue.message.includes(path.id))scope.paths.add(path.id);
  }
 }
 if(cp){
  for(const relation of cp.relations){
   if(scope.nodes.has(relation.subject_id)||scope.nodes.has(relation.target_id)||scope.relations.has(relation.id)){
    scope.relations.add(relation.id);
    addNode(relation.subject_id);
    if(scene.nodes.some(n=>n.id===relation.target_id))addNode(relation.target_id);
    if(cp.zones.some(z=>z.id===relation.target_id))scope.zones.add(relation.target_id);
   }
  }
  for(const assembly of cp.assemblies)if(assembly.member_node_ids.some(id=>scope.nodes.has(id)))scope.zones.add(assembly.zone_id);
  for(const route of cp.routes)if(scope.paths.has(route.path_id)){/* routes themselves are not editable; paths are */}
 }
 return scope;
}

/** Omission is allowed only for content nothing necessary depends on. */
export function decorationEligibility(scene:SceneSpec,nodeId:string):{eligible:boolean;reasons:string[]} {
 const reasons:string[]=[];
 const cp=scene.construction_plan;
 const node=scene.nodes.find(n=>n.id===nodeId);
 if(!node)return {eligible:false,reasons:['node does not exist']};
 if(node.role!=='environment')reasons.push(`role ${node.role} is not decoration`);
 if(cp?.requirements.some(r=>r.node_ids.includes(nodeId)))reasons.push('bound to an approved requirement');
 if(scene.nodes.some(n=>n.parent_id===nodeId))reasons.push('has child nodes');
 if(scene.nodes.some(n=>n.support_node_id===nodeId))reasons.push('supports another node');
 if(cp?.relations.some(r=>r.subject_id===nodeId||r.target_id===nodeId))reasons.push('referenced by a construction relation');
 if(cp?.anchors.some(a=>a.node_id===nodeId))reasons.push('carries a construction anchor');
 if((scene.viewer_attached_node_ids??[]).includes(nodeId))reasons.push('attached to the viewer');
 const serialized=JSON.stringify({events:scene.events,interactions:scene.interactions,scenario:scene.scenario,viewpoints:scene.viewpoints});
 if(serialized.includes(`"${nodeId}"`))reasons.push('referenced by events, interactions, scenario or viewpoints');
 return {eligible:reasons.length===0,reasons};
}

const fail=(message:string,issues:ValidationIssue[]=[]):never=>{throw new AppError('INVALID_MODEL_OUTPUT',message,issues);};

export function applyScenePatch(base:SceneSpec,patch:SceneRepairPatch,scope:RepairScope):SceneSpec {
 if(!patch||typeof patch!=='object'||!Array.isArray(patch.operations))fail('Repair patch must contain an operations array');
 if(patch.base_hash!==sceneHash(base))fail(`Stale repair patch: base hash ${JSON.stringify(patch.base_hash)} does not identify the current candidate`);
 if(patch.operations.length===0)fail('Repair patch contains no operations');
 if(patch.operations.length>24)fail('Repair patch exceeds the bounded operation limit (24)');
 const scene=structuredClone(base);
 const nodes=new Map(scene.nodes.map(n=>[n.id,n]));
 const relations=new Map((scene.construction_plan?.relations??[]).map(r=>[r.id,r]));
 const paths=new Map((scene.motion_paths??[]).map(p=>[p.id,p]));
 const zones=new Map((scene.construction_plan?.zones??[]).map(z=>[z.id,z]));
 for(const operation of patch.operations){
  switch(operation.op){
   case 'set_node_transform':{
    const node=nodes.get(operation.node_id);if(!node||!scope.nodes.has(operation.node_id))fail(`Patch target node ${operation.node_id} is outside the computed repair scope`);
    if(operation.position)node!.position=operation.position;
    if(operation.rotation_radians)node!.rotation_radians=operation.rotation_radians;
    if(operation.scale)node!.scale=operation.scale;
    break;}
   case 'set_node_material':{
    const node=nodes.get(operation.node_id);if(!node||!scope.nodes.has(operation.node_id))fail(`Patch target node ${operation.node_id} is outside the computed repair scope`);
    if(operation.color)node!.material.color=operation.color;
    if(operation.roughness!==undefined)node!.material.roughness=operation.roughness;
    break;}
   case 'set_relation_offset':{
    const relation=relations.get(operation.relation_id);if(!relation||!scope.relations.has(operation.relation_id))fail(`Patch target relation ${operation.relation_id} is outside the computed repair scope`);
    relation!.offset=operation.offset;break;}
   case 'set_relation_kind':{
    const relation=relations.get(operation.relation_id);if(!relation||!scope.relations.has(operation.relation_id))fail(`Patch target relation ${operation.relation_id} is outside the computed repair scope`);
    relation!.kind=operation.kind;break;}
   case 'set_path_points':{
    const path=paths.get(operation.path_id);if(!path||!scope.paths.has(operation.path_id))fail(`Patch target path ${operation.path_id} is outside the computed repair scope`);
    path!.points=operation.points;break;}
   case 'set_zone':{
    const zone=zones.get(operation.zone_id);if(!zone||!scope.zones.has(operation.zone_id))fail(`Patch target zone ${operation.zone_id} is outside the computed repair scope`);
    if(operation.center)zone!.center=operation.center;
    if(operation.size)zone!.size=operation.size;break;}
   case 'remove_node':{
    if(!scope.nodes.has(operation.node_id))fail(`Patch target node ${operation.node_id} is outside the computed repair scope`);
    const check=decorationEligibility(scene,operation.node_id);
    if(!check.eligible)fail(`Node ${operation.node_id} cannot be omitted: ${check.reasons.join('; ')}`);
    scene.nodes=scene.nodes.filter(n=>n.id!==operation.node_id);
    break;}
   default:fail(`Unsupported repair operation ${JSON.stringify((operation as {op?:string}).op)}`);
  }
 }
 return scene;
}

/** Patch-eligible defects are localized geometry/placement problems. */
export function patchEligible(issues:ValidationIssue[]):boolean {
 const patchable=new Set(['zone_fit','fit','route_clearance','route_support','anchor_alignment','placement','support','orientation','bounds']);
 return issues.length>0&&issues.length<=12&&issues.every(issue=>patchable.has(issue.rule));
}

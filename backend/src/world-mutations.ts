import {AppError} from './contracts.js';
import {constructionRequirements,geometryBounds} from './construction.js';
import {identity,multiply,point,transform,transformedBounds,contains,type Vec3} from './spatial-math.js';
import type {SessionPlan,SceneSpec} from '../../docs/handoff/contracts.js';

/** Reconcile construction bookkeeping for an explicitly requested revision.
 * Geometry is never moved to satisfy annotations. Existing required dependencies
 * remain hard; new roots receive measured, real-zone memberships and cast bindings.
 */
export function reconcileWorldMutation(plan:SessionPlan,source:SceneSpec):SceneSpec {
 const scene=structuredClone(source),cp=scene.construction_plan;
 if(!cp)return scene;
 const nodes=new Map(scene.nodes.map(n=>[n.id,n])),requirements=constructionRequirements(plan),validRequirements=new Set(requirements.map(r=>r.id));
 const frames=new Map<string,number[]>();
 function frame(id:string,seen=new Set<string>()):number[]{
  const cached=frames.get(id);if(cached)return cached;
  const n=nodes.get(id);if(!n||seen.has(id))throw new AppError('INVALID_INPUT','Revision has a missing or cyclic node hierarchy');
  seen.add(id);const m=multiply(n.parent_id?frame(n.parent_id,seen):identity(),transform(n.position,n.rotation_radians,n.scale));frames.set(id,m);return m;
 }
 const missingAnchors=new Set(cp.anchors.filter(a=>!nodes.has(a.node_id)).map(a=>a.id));
 for(const relation of cp.relations){
  if(nodes.has(relation.subject_id)&&(missingAnchors.has(relation.anchor_id??'')||(!nodes.has(relation.target_id)&&!cp.zones.some(z=>z.id===relation.target_id)&&!scene.viewpoints.some(v=>v.id===relation.target_id)&&!cp.anchors.some(a=>a.id===relation.target_id))))
   throw new AppError('INVALID_INPUT','A removed object still supports or constrains '+relation.subject_id);
 }
 cp.anchors=cp.anchors.filter(a=>nodes.has(a.node_id));
 cp.relations=cp.relations.filter(r=>nodes.has(r.subject_id));
 cp.assemblies=cp.assemblies.flatMap(assembly=>{
  const members=assembly.member_node_ids.filter(id=>nodes.has(id));
  if(!members.length)return [];
  if(!nodes.has(assembly.root_node_id))throw new AppError('INVALID_INPUT','A removed assembly root still owns required components');
  return [{...assembly,member_node_ids:members,requirement_ids:assembly.requirement_ids.filter(id=>validRequirements.has(id))}];
 });
 cp.requirements=cp.requirements.filter(r=>validRequirements.has(r.requirement_id)).map(r=>({...r,node_ids:r.node_ids.filter(id=>nodes.has(id))}));
 const assigned=new Set(cp.assemblies.flatMap(a=>a.member_node_ids));
 for(const node of scene.nodes){
  if(assigned.has(node.id))continue;
  if(node.role!=='character'&&!/^(edit_decor_|aud_edit_)/.test(node.id))continue;
  const bounds=transformedBounds(geometryBounds(node),frame(node.id));
  const zone=cp.zones.find(z=>{
   const outer={min:z.center.map((n,i)=>n-z.size[i]/2) as Vec3,max:z.center.map((n,i)=>n+z.size[i]/2) as Vec3};
   if(z.kind==='outdoor')outer.max[1]=Infinity;
   return contains(outer,bounds,0.2);
  });
  if(!zone)throw new AppError('INVALID_INPUT','There is no usable scene zone for '+node.id);
  const cast=requirements.find(r=>r.kind==='cast'&&r.target===node.id);
  const id='revision_assembly_'+node.id;
  cp.assemblies.push({id,root_node_id:node.id,member_node_ids:[node.id],zone_id:zone.id,requirement_ids:cast?[cast.id]:[]});
 }
 for(const cast of requirements.filter(r=>r.kind==='cast')){
  if(!nodes.has(cast.target))throw new AppError('INVALID_INPUT','Revised cast has no loaded character node');
  const binding=cp.requirements.find(r=>r.requirement_id===cast.id);
  if(binding)binding.node_ids=[cast.target];
  else cp.requirements.push({requirement_id:cast.id,node_ids:[cast.target],stage_ids:[],path_ids:[]});
  const assembly=cp.assemblies.find(a=>a.member_node_ids.includes(cast.target));
  if(assembly&&!assembly.requirement_ids.includes(cast.id))assembly.requirement_ids.push(cast.id);
 }
 return scene;
}

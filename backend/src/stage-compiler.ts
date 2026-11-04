import type {ExperienceDraft,MovementIntent} from './experience.js';
import type {SceneSpec,SessionPlan} from '../../docs/handoff/contracts.js';
import type {ValidationIssue} from '../../docs/handoff/contracts.js';

/**
 * Compiles the executable stage graph from the APPROVED plan. Stage order,
 * duration, conversation binding, viewer travel and the completed state are
 * structural facts the backend already owns; the builder supplies scene
 * content, route geometry, and any environmental/character operations it
 * wants preserved on a step. Authored move_viewer operations, completions,
 * conversation targets and terminal bookkeeping are recomputed here, never
 * trusted from the model. A travel stage binds exactly the routes whose
 * stage_ids name it: one unique path becomes its move_viewer start
 * operation. A stage-specific requirement can restore a missing route entry
 * when it names exactly one compatible path.
 */
type Step=NonNullable<SceneSpec['scenario']>['steps'][number];
type Operation=Step['start_operations'][number];
type Travel=Exclude<MovementIntent,'none'>;

export function materializeStageGraph(experience:ExperienceDraft,plan:SessionPlan,source:SceneSpec) {
 const scene=structuredClone(source);
 const issues:ValidationIssue[]=[];
 const corrections:string[]=[];
 const authored=new Map((scene.scenario?.steps??[]).map(step=>[step.id,step]));
 const routes=scene.construction_plan?.routes??[];
 const requirements=scene.construction_plan?.requirements??[];
 const paths=new Map((scene.motion_paths??[]).map(path=>[path.id,path]));
 const nodeMotionPaths=new Set([
  ...scene.events.map(event=>event.operation),
  ...scene.interactions.flatMap(interaction=>interaction.choices.flatMap(choice=>choice.operations)),
  ...[...authored.values()].flatMap(step=>[...(step.start_operations??[]),...(step.actions??[]).flatMap(action=>action.operations)]),
 ].filter(op=>op.type==='move_node').map(op=>op.path_id));
 const stages=experience.experience.stages;
 const travelByPath=new Map<string,Set<Travel>>();
 const nodes=new Map(scene.nodes.map(node=>[node.id,node]));
 const taskFocus=(requirements.find(requirement=>requirement.requirement_id==='task')?.node_ids??[])
  .filter(id=>nodes.has(id)&&nodes.get(id)?.role!=='character');
 let declaredFocus=scene.nodes.filter(node=>node.role==='task_focus').map(node=>node.id);
 if(!declaredFocus.length&&!taskFocus.length){
  const openingFocus=authored.get('stage_1')?.focus_node_ids?.map(id=>nodes.get(id))
   .find(node=>node&&node.role!=='character');
  if(openingFocus){
   openingFocus.role='task_focus';
   declaredFocus=[openingFocus.id];
   corrections.push(`Used the opening stage's declared focus ${openingFocus.id} as the scene focus`);
  }
 }
 const defaultFocus=declaredFocus.length?declaredFocus:taskFocus;
 const review=(prior:Partial<Step>|undefined)=>{
  const focus=prior?.focus_node_ids?.filter(id=>nodes.has(id))??[];
  return {
   review_viewpoint_id:scene.viewpoints?.some(view=>view.id===prior?.review_viewpoint_id)?prior!.review_viewpoint_id:scene.initial_viewpoint_id,
   focus_node_ids:focus.length?focus:defaultFocus,
   announce_on_entry:prior?.announce_on_entry??false,
  };
 };
 function boundPaths(id:string,movement:Travel):string[] {
  const explicit=[...new Set(routes.filter(route=>route.stage_ids.includes(id)).map(route=>route.path_id))];
  if(explicit.length||!scene.construction_plan)return explicit;
  const binding=requirements.filter(requirement=>requirement.requirement_id===`stage:${id}`);
  const candidates=[...new Set(binding.flatMap(requirement=>requirement.path_ids))];
  if(candidates.length!==1)return candidates.length>1?candidates:[];
  const path=paths.get(candidates[0]);
  if(!path||nodeMotionPaths.has(path.id))return [];
  // Do not steal a path explicitly assigned to another stage.
  const existing=routes.filter(route=>route.path_id===path.id);
  if(existing.length>1||existing.some(route=>route.stage_ids.length>0))return [];
  if(existing.length===1){
   existing[0].stage_ids.push(id);
  }else{
   const purpose=movement==='other'?path.purpose:movement;
   const peers=routes.filter(route=>paths.get(route.path_id)?.purpose===purpose);
   const shared=(key:'clearance_radius_meters'|'eye_height_meters')=>{
    const values=[...new Set(peers.map(route=>route[key]))];
    return values.length===1?values[0]:undefined;
   };
   routes.push({
    path_id:path.id,stage_ids:[id],requirement_ids:binding.map(requirement=>requirement.requirement_id),
    clearance_radius_meters:path.clearance_radius_meters??shared('clearance_radius_meters')??0.25,
    eye_height_meters:path.eye_height_meters??shared('eye_height_meters')??1.6,
   });
  }
  corrections.push(`Bound ${path.id} to ${id} from its stage requirement`);
  return [path.id];
 }
 const steps=stages.map((stage,index)=>{
  const id=`stage_${index+1}`;
  const prior=authored.get(id);
  const preserved:Operation[]=(prior?.start_operations??[]).filter(op=>op.type!=='move_viewer'&&op.type!=='viewpoint_transition');
  const nextId=index+1<stages.length?`stage_${index+2}`:'stage_completed';
  let completion:Step['completion'];
  if(stage.movement!=='none'){
   const bound=boundPaths(id,stage.movement);
   if(bound.length!==1){
    issues.push({path:`/experience/stages/${index}`,rule:'route_binding',message:bound.length===0
     ?`Stage ${id} requires ${stage.movement} travel but no construction route is bound to it. Supply exactly one route for this stage (path geometry plus a routes entry whose stage_ids include ${id}); the rest of the scene is unaffected.`
     :`Stage ${id} has ${bound.length} different routes bound (${bound.join(', ')}); bind exactly one so travel is unambiguous.`});
   } else {
    preserved.push({type:'move_viewer',path_id:bound[0]} as Operation);
    if(stage.movement!=='other'){
     const movements=travelByPath.get(bound[0])??new Set();
     movements.add(stage.movement);
     travelByPath.set(bound[0],movements);
    }
    if(stage.conversation_character_index===null)completion={trigger:'motion_complete',motion_path_id:bound[0],next_step_id:nextId};
   }
  }
  // Conversation always advances on the approved clock, even during travel.
  if(stage.movement==='none'||stage.conversation_character_index!==null){
   completion={trigger:'after_seconds',after_seconds:stage.duration_sec,next_step_id:nextId};
  }
  const characterIndex=stage.conversation_character_index;
  const {completion:_priorCompletion,conversation_target:_priorTarget,...priorRest}=prior??{} as Partial<Step>;
  return {
   ...priorRest,
   ...review(prior),
   id,
   prompt:prior?.prompt??'',
   terminal:false,
   start_operations:preserved,
   actions:prior?.actions??[],
   ...(completion?{completion}:{}),
   ...(characterIndex!==null&&plan.characters[characterIndex]?{conversation_target:plan.characters[characterIndex].id}:{}),
  } as Step;
 });
 // The approved stage owns viewer motion semantics. Keep the trajectory
 // untouched so construction and native audits check it under that intent.
 for(const [id,movements] of travelByPath){
  const path=paths.get(id),[movement]=movements;
  if(!path||nodeMotionPaths.has(id)||movements.size!==1||path.purpose===movement)continue;
  corrections.push(`Set ${id} movement to approved ${movement} (builder labeled it ${path.purpose})`);
  path.purpose=movement;
 }
 const terminalPrior=authored.get('stage_completed');
 const {completion:_authoredCompletion,conversation_target:_authoredTarget,...terminalRest}=terminalPrior??{} as Partial<Step>;
 steps.push({
  ...terminalRest,
  ...review(terminalPrior),
  id:'stage_completed',
  prompt:terminalPrior?.prompt??'',
  terminal:true,
  start_operations:(terminalPrior?.start_operations??[]).filter(op=>op.type!=='move_viewer'&&op.type!=='viewpoint_transition'),
  actions:terminalPrior?.actions??[],
 } as Step);
 const anyConversation=stages.some(stage=>stage.conversation_character_index!==null);
 scene.scenario={
  progression:'guided',
  objective:scene.scenario?.objective||plan.task_instruction,
  dialogue_policy:anyConversation?'natural':'disabled',
  initial_step_id:'stage_1',
  steps,
 };
 return {scene,issues,corrections};
}

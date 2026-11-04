import type {ExperienceDraft} from './experience.js';
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
 * operation; zero or several distinct paths produce a stage-scoped issue
 * instead of an arbitrary choice or a whole-scene rebuild demand.
 */
type Step=NonNullable<SceneSpec['scenario']>['steps'][number];
type Operation=Step['start_operations'][number];

export function materializeStageGraph(experience:ExperienceDraft,plan:SessionPlan,source:SceneSpec):{scene:SceneSpec;issues:ValidationIssue[]} {
 const scene=structuredClone(source);
 const issues:ValidationIssue[]=[];
 const authored=new Map((scene.scenario?.steps??[]).map(step=>[step.id,step]));
 const routes=scene.construction_plan?.routes??[];
 const stages=experience.experience.stages;
 const steps=stages.map((stage,index)=>{
  const id=`stage_${index+1}`;
  const prior=authored.get(id);
  const preserved:Operation[]=(prior?.start_operations??[]).filter(op=>op.type!=='move_viewer'&&op.type!=='viewpoint_transition');
  const nextId=index+1<stages.length?`stage_${index+2}`:'stage_completed';
  let completion:Step['completion'];
  // A conversation stage advances on its approved clock even while travel
  // runs concurrently; it must never wait for speech or motion completion.
  if(stage.conversation_character_index!==null){
   if(stage.movement!=='none'){
    const bound=[...new Set(routes.filter(route=>route.stage_ids.includes(id)).map(route=>route.path_id))];
    if(bound.length!==1)issues.push({path:`/experience/stages/${index}`,rule:'route_binding',message:bound.length===0?`Stage ${id} requires ${stage.movement} travel but no construction route is bound to it. Supply exactly one route for this stage (path geometry plus a routes entry whose stage_ids include ${id}); the rest of the scene is unaffected.`:`Stage ${id} has ${bound.length} different routes bound (${bound.join(', ')}); bind exactly one so travel is unambiguous.`});
    else preserved.push({type:'move_viewer',path_id:bound[0]} as Operation);
   }
   completion={trigger:'after_seconds',after_seconds:stage.duration_sec,next_step_id:nextId};
  }
  else if(stage.movement!=='none'){
   const bound=[...new Set(routes.filter(route=>route.stage_ids.includes(id)).map(route=>route.path_id))];
   if(bound.length!==1){
    issues.push({path:`/experience/stages/${index}`,rule:'route_binding',message:bound.length===0
     ?`Stage ${id} requires ${stage.movement} travel but no construction route is bound to it. Supply exactly one route for this stage (path geometry plus a routes entry whose stage_ids include ${id}); the rest of the scene is unaffected.`
     :`Stage ${id} has ${bound.length} different routes bound (${bound.join(', ')}); bind exactly one so travel is unambiguous.`});
   } else {
    preserved.push({type:'move_viewer',path_id:bound[0]} as Operation);
    completion={trigger:'motion_complete',motion_path_id:bound[0],next_step_id:nextId};
   }
  } else {
   completion={trigger:'after_seconds',after_seconds:stage.duration_sec,next_step_id:nextId};
  }
  const characterIndex=stage.conversation_character_index;
  const {completion:_priorCompletion,conversation_target:_priorTarget,...priorRest}=prior??{} as Partial<Step>;
  return {
   ...priorRest,
   id,
   prompt:prior?.prompt??'',
   terminal:false,
   start_operations:preserved,
   actions:prior?.actions??[],
   ...(completion?{completion}:{}),
   ...(characterIndex!==null&&plan.characters[characterIndex]?{conversation_target:plan.characters[characterIndex].id}:{}),
  } as Step;
 });
 const terminalPrior=authored.get('stage_completed');
 const {completion:_authoredCompletion,conversation_target:_authoredTarget,...terminalRest}=terminalPrior??{} as Partial<Step>;
 steps.push({
  ...terminalRest,
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
  dialogue_policy:scene.scenario?.dialogue_policy??(anyConversation?'natural':'on_request'),
  initial_step_id:'stage_1',
  steps,
 };
 return {scene,issues};
}

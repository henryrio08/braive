import type {AudioPlan, Job, PlanRequest, SceneSpec, SessionPlan, ValidationIssue} from '../../docs/handoff/contracts.js';
import {AppError, validate, validateProviderOutput, sceneIssues} from './contracts.js';
import {assembleExperience, planningCapabilities, validateExperience, validateExperienceShape, type ExperienceDraft} from './experience.js';
import {compileScene, constructionRequirements} from './construction.js';
import {canonicalSceneReferences} from './scene-references.js';
import {dispatchTool} from './tool-dispatch.js';
import {authorInstructions, editorInstructions, builderInstructions} from './generation-prompts.js';
import type {ModelRole} from './meta.js';

export type ApprovedExperience = {plan:SessionPlan; scene:SceneSpec; audio:AudioPlan; experience?:ExperienceDraft};
export interface GenerationDependencies {
 model:(schema:string,input:unknown,instructions:string,signal:AbortSignal,role:ModelRole)=>Promise<any>;
 capabilities:unknown;
 previous?:ApprovedExperience;
 isCurrent:()=>boolean;
 consumeRepair:()=>boolean;
 onRejected?:(candidate:ApprovedExperience, error:unknown)=>void;
}

export function authoredScene(scene:SceneSpec|undefined):Omit<SceneSpec,'construction_report'>|undefined {
 if(!scene)return undefined;
 const {construction_report,...authored}=scene;
 return authored;
}

/** Check the edited timing and speaking/movement intent, not merely the wire shape. */
export function experienceSceneIssues(experience:ExperienceDraft,plan:SessionPlan,scene:SceneSpec):ValidationIssue[] {
 const issues:ValidationIssue[]=[];
 const fail=(path:string,message:string)=>issues.push({path,rule:'edited_experience',message});
 for(const [i,stage] of experience.experience.stages.entries()) {
  const step=scene.scenario?.steps[i];
  if(!step)continue; // The shared validator reports missing/mismatched stages.
  const at=`/scenario/steps/${i}`;
  const target=stage.conversation_character_index===null?undefined:plan.characters[stage.conversation_character_index]?.id;
  if(step.conversation_target!==target)fail(at+'/conversation_target','Preserve the edited stage conversation availability');
  const movement=step.start_operations.filter(o=>o.type==='move_viewer');
  if(stage.movement==='none'&&step.start_operations.some(o=>o.type==='move_viewer'||o.type==='viewpoint_transition'))fail(at+'/start_operations','This edited stage has no participant travel');
  if(stage.movement!=='none'&&!movement.length)fail(at+'/start_operations','Realize the edited participant movement in this stage');
  for(const operation of movement) {
   const path=scene.motion_paths?.find(p=>p.id===operation.path_id);
   if(path&&stage.movement!=='other'&&path.purpose!==stage.movement)fail(at+'/start_operations','Movement must preserve the edited activity');
   if(path&&(path.points.at(-1)?.at_seconds??0)>stage.duration_sec+0.001)fail(at+'/completion','Movement exceeds the edited stage duration');
  }
  const completion=step.completion;
  const seconds=completion?.trigger==='after_seconds'?completion.after_seconds:
   scene.motion_paths?.find(p=>p.id===completion?.motion_path_id)?.points.at(-1)?.at_seconds;
  if(seconds===undefined||Math.abs(seconds-stage.duration_sec)>0.001)fail(at+'/completion','Preserve the edited stage duration');
 }
 if(scene.events.some(e=>e.operation.type==='move_viewer'||e.operation.type==='viewpoint_transition'))fail('/events','Participant travel belongs to its edited stage, not global events');
 const terminal=scene.scenario?.steps[experience.experience.stages.length];
 if(terminal?.start_operations.some(o=>o.type==='move_viewer'||o.type==='viewpoint_transition'))fail('/scenario/steps/'+experience.experience.stages.length,'The completed stage cannot introduce participant travel');
 const operations=[...scene.events.map(e=>e.operation),...(scene.scenario?.steps.flatMap(s=>[...s.start_operations,...s.actions.flatMap(a=>a.operations)])??[])];
 if(operations.some(o=>o.type==='play_sound'))fail('/operations','Audio layers are scheduled by the approved AudioPlan; do not trigger them twice');
 return issues;
}

/** One author call, one fresh editor call, then construction of the editor's complete plan. */
export async function generateExperience(request:PlanRequest,job:Job,deps:GenerationDependencies,signal:AbortSignal):Promise<ApprovedExperience & {experience:ExperienceDraft}> {
 validate('PlanRequest',request);
 if(!request.use_history&&request.relevant_history.length)throw new AppError('INVALID_INPUT','Declined history must be empty');
 if(request.chained_rerun&&!request.parent_session_id)throw new AppError('INVALID_INPUT','Chained session needs parent');
 const check=()=>{signal.throwIfAborted();if(!deps.isCurrent())throw new AppError('CANCELLED','Superseded revision');};
 const source=structuredClone(request);
 const previous=deps.previous&&(deps.previous.plan.session_id===source.session_id||
  source.chained_rerun&&deps.previous.plan.session_id===source.parent_session_id)?deps.previous:undefined;
 const planning={request:source,capabilities:planningCapabilities(),previous_plan:previous?.plan};
 let repairUsed=false;
 const run=async<T>(stage:string,operation:(issues?:ValidationIssue[])=>Promise<T>):Promise<T>=>{
  let issues:ValidationIssue[]|undefined;
  for(;;){
   check();job.stage=issues?'Repairing '+stage.toLowerCase():stage;
   try {const value=await operation(issues);check();return value;}
   catch(error){
    check();
    if(!(error instanceof AppError)||error.code!=='INVALID_MODEL_OUTPUT'||repairUsed||!deps.consumeRepair())throw error;
    repairUsed=true;
    issues=error.issues.length?error.issues:[{path:'/',rule:'validation',message:error.message}];
   }
  }
 };
 const draft=await run('Planning your experience',async issues=>{
  const result=await deps.model('ExperienceDraft',{...structuredClone(planning),issues},authorInstructions,signal,'experience_author');
  validateExperienceShape(result);
  return result;
 });
 if(draft.safety.decision==='refuse')throw new AppError('INVALID_INPUT',draft.safety.reason+' '+draft.safety.practice_preserving_alternative);
 const experience=await run('Reviewing your experience',async issues=>{
  const result=await deps.model('ExperienceDraft',{...structuredClone(planning),proposed_experience:structuredClone(draft),issues},editorInstructions,signal,'experience_editor');
  validateExperience(result);
  if(result.safety.decision==='refuse')throw new AppError('INVALID_INPUT',result.safety.reason+' '+result.safety.practice_preserving_alternative);
  // Assembly validates the exact edited plan, including capability and scheduling invariants.
  assembleExperience(result,source,source.revision===1?'setup':'builder_revision');
  return result;
 });
 check();
 const {plan,audio}=assembleExperience(experience,source,source.revision===1?'setup':'builder_revision');
 let candidate:SceneSpec|undefined;
 const scene=await run('Building your scene',async issues=>{
  const input={request:source,plan,approved_experience:experience,audio,requirements:constructionRequirements(plan),
   capabilities:deps.capabilities,previous_scene:authoredScene(candidate??previous?.scene),issues};
  try {
   const output=await dispatchTool(plan,'compose_scene',source.revision===1?'setup':'builder_revision',
    args=>deps.model('SceneSpec',structuredClone({...input,tool_arguments:args}),builderInstructions,signal,'scene_builder'));
   check();candidate=output;
   validate('SceneSpec',output);validateProviderOutput('SceneSpec',output);
   const compiled=compileScene(plan,canonicalSceneReferences(plan,output,audio),audio);
   const errors=[...sceneIssues(plan,compiled,audio),...experienceSceneIssues(experience,plan,compiled)];
   if(errors.length)throw new AppError('INVALID_MODEL_OUTPUT','Scene requires repair',errors);
   return compiled;
  } catch(error){if(candidate)deps.onRejected?.({plan,scene:candidate,audio,experience},error);throw error;}
 });
 check();
 return {plan,scene,audio,experience};
}

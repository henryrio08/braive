import type {AudioPlan, Job, PlanRequest, SceneSpec, SessionPlan, ValidationIssue} from '../../docs/handoff/contracts.js';
import {AppError, validate, validateProviderOutput, sceneIssues} from './contracts.js';
import {assembleExperience, planningCapabilities, validateExperience, validateExperienceShape, type ExperienceDraft} from './experience.js';
import {compileScene, constructionRequirements, deterministicCorrections} from './construction.js';
import {applyScenePatch, computeRepairScope, patchEligible, sceneHash, type SceneRepairPatch} from './repair-patch.js';
import {canonicalSceneReferences} from './scene-references.js';
import {materializeStageGraph} from './stage-compiler.js';
import {dispatchTool} from './tool-dispatch.js';
import {authorInstructions, editorInstructions, builderInstructions, repairInstructions} from './generation-prompts.js';
import type {ModelRole} from './meta.js';
import {automaticSceneRepairEnabled} from './recovery-policy.js';
import {measurePhase} from './diagnostics.js';

export type ApprovedExperience = {plan:SessionPlan; scene:SceneSpec; audio:AudioPlan; experience?:ExperienceDraft};
export interface GenerationDependencies {
 automaticSceneRepair?:boolean;
 model:(schema:string,input:unknown,instructions:string,signal:AbortSignal,role:ModelRole)=>Promise<any>;
 capabilities:unknown;
 previous?:ApprovedExperience;
 isCurrent:()=>boolean;
 consumeRepair:(kind:'planning'|'construction')=>boolean;
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
 // Planning (author/editor) and construction (builder) each own one repair:
// an editorial correction must not starve scene construction, and vice versa.
 let repairsUsed={planning:false,construction:false};
 const run=async<T>(stage:string,kind:'planning'|'construction',operation:(issues?:ValidationIssue[])=>Promise<T>):Promise<T>=>{
  let issues:ValidationIssue[]|undefined;
  for(;;){
   check();job.stage=issues?'Adjusting your practice…':stage;
   try {const value=await operation(issues);check();return value;}
   catch(error){
    check();
    if(!(error instanceof AppError)||error.code!=='INVALID_MODEL_OUTPUT'||repairsUsed[kind]||!deps.consumeRepair(kind))throw error;
    repairsUsed[kind]=true;
    issues=error.issues.length?error.issues:[{path:'/',rule:'validation',message:error.message}];
   }
  }
 };
 const draft=await run('Shaping your practice…','planning',async issues=>{
  const result=await deps.model('ExperienceDraft',{...structuredClone(planning),issues},authorInstructions,signal,'experience_author');
  validateExperienceShape(result);
  return result;
 });
 if(draft.safety.decision==='refuse')throw new AppError('INVALID_INPUT',draft.safety.reason+' '+draft.safety.practice_preserving_alternative);
 const experience=await run('Checking the details…','planning',async issues=>{
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
 const buildOnce=async(issues?:ValidationIssue[]):Promise<SceneSpec>=>{
  const input={request:source,plan,approved_experience:experience,audio,requirements:constructionRequirements(plan),
   capabilities:deps.capabilities,previous_scene:authoredScene(candidate??previous?.scene),issues};
  try {
   const output=await dispatchTool(plan,'compose_scene',source.revision===1?'setup':'builder_revision',
    args=>deps.model('SceneSpec',structuredClone({...input,tool_arguments:args}),builderInstructions,signal,'scene_builder'));
   check();candidate=output;
   const corrected=measurePhase('local_preparation',()=>deterministicCorrections(canonicalSceneReferences(plan,output,audio)));
   const staged=measurePhase('stage_compilation',()=>{
    const staged=materializeStageGraph(experience,plan,corrected.scene);
    if(staged.issues.length)throw new AppError('INVALID_MODEL_OUTPUT','Stage graph requires route geometry',staged.issues);
    return staged;
   });
   measurePhase('completed_scene_schema',()=>{validate('SceneSpec',staged.scene);validateProviderOutput('SceneSpec',staged.scene);});
   const compiled=measurePhase('construction_validation',()=>compileScene(plan,staged.scene,audio));
   if(compiled.construction_report&&corrected.corrections.length)compiled.construction_report.corrections=corrected.corrections;
   measurePhase('approved_experience_validation',()=>{
    const errors=[...sceneIssues(plan,compiled,audio),...experienceSceneIssues(experience,plan,compiled)];
    if(errors.length)throw new AppError('INVALID_MODEL_OUTPUT','Scene requires repair',errors);
   });
   return compiled;
  } catch(error){
   if(error instanceof AppError&&error.modelOutput?.schema==='SceneSpec'){
    const value=error.modelOutput.value;
    if(value&&typeof value==='object'&&!Array.isArray(value))candidate=value as SceneSpec;
   }
   let failure=error;
   if(candidate&&error instanceof AppError&&error.code==='INVALID_MODEL_OUTPUT'){
    const issues:ValidationIssue[]=[];
    try {
     validate('SceneSpec',candidate);
     const prepared=deterministicCorrections(canonicalSceneReferences(plan,candidate,audio)).scene;const staged=materializeStageGraph(experience,plan,prepared);if(staged.issues.length)issues.push(...staged.issues);
     issues.push(...experienceSceneIssues(experience,plan,staged.scene));
     try {compileScene(plan,staged.scene,audio);}
     catch(constructionError){if(constructionError instanceof AppError)issues.push(...constructionError.issues);else throw constructionError;}
    } catch(shapeError){if(shapeError instanceof AppError)issues.push(...shapeError.issues);else throw shapeError;}
    const combined=new Map<string,ValidationIssue>();
    for(const issue of [...issues,...error.issues]){
     const key=issue.path+'|'+issue.rule;if(!combined.has(key))combined.set(key,issue);
    }
    failure=new AppError(error.code,error.message,[...combined.values()],error.status);
   }
   if(candidate&&failure instanceof AppError&&failure.code==='INVALID_MODEL_OUTPUT')deps.onRejected?.({plan,scene:candidate,audio,experience},failure);
   throw failure;
  }
 };
 job.stage='Creating your surroundings…'; deps.isCurrent();
 let scene:SceneSpec;
 try { scene=await buildOnce(); if(scene.construction_report)scene.construction_report.recovery=scene.construction_report.corrections?.length?'deterministic':'first_pass'; }
 catch(firstError){
  if(!(deps.automaticSceneRepair??automaticSceneRepairEnabled())||!(firstError instanceof AppError)||firstError.code!=='INVALID_MODEL_OUTPUT'||!deps.consumeRepair('construction'))throw firstError;
  const issues=firstError.issues;
  job.stage='Adjusting your practice…'; check();
  if(candidate&&patchEligible(issues)){
   const base=deterministicCorrections(canonicalSceneReferences(plan,candidate,audio)).scene;
   const scope=computeRepairScope(base,issues);
   const patch=await deps.model('SceneRepairPatch',{base_scene:authoredScene(base),base_hash:sceneHash(base),issues,
    scope:{nodes:[...scope.nodes],relations:[...scope.relations],paths:[...scope.paths],zones:[...scope.zones],anchors:[...scope.anchors]},
    requirements:constructionRequirements(plan),capabilities:deps.capabilities},repairInstructions,signal,'scene_repair');
   check();
   validateProviderOutput('SceneRepairPatch',patch);
   const patched=applyScenePatch(base,patch as SceneRepairPatch,scope);
   const staged=materializeStageGraph(experience,plan,patched);
   if(staged.issues.length)throw new AppError('INVALID_MODEL_OUTPUT','Stage graph requires route geometry',staged.issues);
   const compiled=compileScene(plan,staged.scene,audio);
   const errors=[...sceneIssues(plan,compiled,audio),...experienceSceneIssues(experience,plan,compiled)];
   if(errors.length)throw new AppError('INVALID_MODEL_OUTPUT','Scene requires repair',errors);
   scene=compiled; if(scene.construction_report)scene.construction_report.recovery='patched';
  } else {
   scene=await buildOnce(issues); if(scene.construction_report)scene.construction_report.recovery='rebuilt';
  }
 }
 check();
 return {plan,scene,audio,experience};
}

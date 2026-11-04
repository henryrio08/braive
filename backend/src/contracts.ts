import { readFileSync } from 'node:fs';
import Ajv from 'ajv';
import {assetIDs,characterIDs,generationCharacterIDs,assetManifest,allTextureIDs,textureBudgetIssues} from './assets.js';
import {scenarioGraphIssues} from './scenario-graph.js';
import addFormats from 'ajv-formats';
import type { ValidationIssue, SceneSpec, SessionPlan, AudioPlan, WorldOperation } from '../../docs/handoff/contracts.js';
export const document = JSON.parse(readFileSync(new URL('../../docs/handoff/openapi.json', import.meta.url), 'utf8'));
const ajv = new (Ajv as any)({ strict: false, allErrors: true });
(addFormats as any)(ajv);
ajv.addSchema({ $id: 'braive', components: document.components });
export class AppError extends Error {
 declare modelOutput?:{schema:string;value:unknown};
 constructor(public code: string, message: string, public issues: ValidationIssue[] = [], public status = 400) { super(message); }
 withModelOutput(schema:string,value:unknown):this {
  Object.defineProperty(this,'modelOutput',{value:{schema,value},enumerable:false,configurable:true});
  return this;
 }
}
function schemaIssues(errors:any[]):ValidationIssue[]{
 return errors.map(e=>({path:e.instancePath,rule:e.keyword,message:e.message+(e.params&&Object.keys(e.params).length?' '+JSON.stringify(e.params):'')}));
}
export function validate(name: string, value: unknown) {
 const check = ajv.getSchema(`braive#/components/schemas/${name}`) ?? ajv.compile({ $ref: `braive#/components/schemas/${name}` });
 if (!check(value)) throw new AppError('INVALID_MODEL_OUTPUT', `Invalid ${name}`, schemaIssues(check.errors));
}
const providerChecks=new Map<string,any>();
/** Saved records retain additive legacy schemas; new model output must implement
 * the advertised capability contract, not merely be asked to do so in prose. */
export function validateProviderOutput(name:string,value:unknown) {
 let check=providerChecks.get(name);
 if(!check){check=ajv.compile(name==='SceneRepairPatch'?sceneRepairPatchSchema():outputSchema(name));providerChecks.set(name,check);}
 if(!check(value))throw new AppError('INVALID_MODEL_OUTPUT',`New ${name} is missing required capabilities`,schemaIssues(check.errors));
}
export function sceneIssues(plan: SessionPlan, scene: SceneSpec, audio: AudioPlan): ValidationIssue[] {
 const issues: ValidationIssue[] = [];
 const fail = (path: string, rule: string, message: string) => issues.push({path,rule,message});
 for(const message of textureBudgetIssues(scene))fail('/nodes','texture_budget',message);
 for (const [key, output] of Object.entries({scene,audio})) if(output.session_id !== plan.session_id || output.revision !== plan.revision) fail(`/${key}/revision`,'revision','Must match approved plan');
 for(const [i,l] of audio.layers.entries()) {
  if(audio.layers.findIndex(other=>other.id===l.id)!==i)fail(`/audio/layers/${i}/id`,'unique','Audio layer IDs must be unique');
  const end=l.end_active_second??plan.duration_sec;
  if(l.start_active_second>=end||end>plan.duration_sec)fail(`/audio/layers/${i}`,'clock','Audio must start before its end, within the practice duration');
  if(l.ramps.some(r=>r.at_active_second<l.start_active_second||r.at_active_second+r.fade_seconds>end))fail(`/audio/layers/${i}/ramps`,'clock','Audio ramps must fit within their layer');
  if(l.position)fail(`/audio/layers/${i}/position`,'capability','Spatial audio placement is not supported by the current player');
 }
 if(audio.transition_whoosh_asset_id && audio.transition_whoosh_asset_id!=='whoosh')fail('/audio/transition_whoosh_asset_id','asset','Use the registered whoosh transition');
 const nodes = new Map(scene.nodes.map(n => [n.id,n]));
 const supportsSit=(id:string)=>assetManifest.find(a=>a.id===id)?.animation_clips?.some(n=>n.toLowerCase().endsWith('_sitting')||n.toLowerCase()==='sit')===true;
 const attached=new Set(scene.viewer_attached_node_ids??[]);
 const carried=(id:string)=>{const seen=new Set<string>();let current:string|null=id;while(current&&!seen.has(current)){if(attached.has(current))return true;seen.add(current);current=nodes.get(current)?.parent_id??null;}return false;};
 for(const id of attached){
  if(!nodes.has(id))fail('/viewer_attached_node_ids','reference','Attached node must exist');
  const seen=new Set<string>();let parent=nodes.get(id)?.parent_id;
  while(parent&&!seen.has(parent)){seen.add(parent);if(attached.has(parent))fail('/viewer_attached_node_ids','hierarchy','Attach only the highest assembly root, not its descendants too');parent=nodes.get(parent)?.parent_id;}
 }
 if(nodes.size !== scene.nodes.length) fail('/nodes','unique','Duplicate node IDs');
 if(scene.nodes.length > 350) fail('/nodes','budget','Maximum 350 nodes for initial phone profile');
 for(const [i,n] of scene.nodes.entries()) {
  if(n.parent_id && !nodes.has(n.parent_id)) fail(`/nodes/${i}/parent_id`,'reference','Parent missing');
  const seen = new Set([n.id]); let p = n.parent_id;
  while(p && nodes.has(p)) { if(seen.has(p)) { fail(`/nodes/${i}`,'cycle','Cyclic hierarchy'); break; } seen.add(p); p=nodes.get(p)!.parent_id; }
  if(![...n.position,...n.rotation_radians,...n.scale].every(Number.isFinite) || n.scale.some(v=>v<=0)) fail(`/nodes/${i}`,'transform','Positive finite transforms required');
  const g=n.geometry;
  if(n.material.surface&&((g.kind==='asset'&&characterIDs.has(g.asset_id))||n.role==='character'))fail(`/nodes/${i}/material/surface`,'palette','Approved character materials cannot receive environmental surface profiles');
  if(n.material.surface?.profile==='water'&&n.collision_role!=='none')fail(`/nodes/${i}/collision_role`,'medium','Visual water surfaces must not be solid route obstacles; support needs separate real geometry');
  if(n.support_node_id && (!nodes.has(n.support_node_id)||n.support_node_id===n.id))fail(`/nodes/${i}/support_node_id`,'reference','Support must name another loaded node');
  if(n.material.texture_asset_id!==undefined&&!allTextureIDs().has(n.material.texture_asset_id))fail(`/nodes/${i}/material/texture_asset_id`,'asset',`Texture ${n.material.texture_asset_id} is not a registered texture; use an ID from the registered texture list (mesh/GLB asset IDs are not textures); trusted code loads it`);
  if((n.material as any).texture_scale!==undefined&&!((n.material as any).texture_scale>0))fail(`/nodes/${i}/material/texture_scale`,'size','Texture UV scale must be positive');
  const approvedProp=!!n.prop_name&&!!plan.props?.includes(n.prop_name);
  if(n.prop_name&&!approvedProp)fail(`/nodes/${i}/prop_name`,'prop_match','Scene prop name must match an approved plan prop');
  if(g.kind!=='asset' && n.role!=='environment' && !(plan.experience&&(n.role==='task_focus'||n.role==='prop'&&(approvedProp||carried(n.id))))) fail(`/nodes/${i}/geometry`,'architecture_only','Use GLBs or coherent procedural assemblies bound to an approved plan prop; characters require the registered rig');
  if(n.role==='character' && (g.kind!=='asset' || !characterIDs.has(g.asset_id))) fail(`/nodes/${i}/geometry`,'neutral_character','Characters must use a registered rigged character.base asset');
  if(n.animation==='sit'&&(g.kind!=='asset'||!supportsSit(g.asset_id)))fail(`/nodes/${i}/animation`,'supported_pose','A seated actor requires a registered authored sitting pose');
  if(g.kind==='asset' && !g.asset_id?.trim()) fail(`/nodes/${i}/geometry`,'asset','Empty asset_id is invalid; use a registered asset or dimensioned procedural geometry.');
  else if(g.kind==='asset' && !assetIDs.has(g.asset_id)) fail(`/nodes/${i}/geometry`,'asset','Use only registered individual object assets.');
  if(g.kind==='box' && g.size.some(v=>v<=0) || g.kind==='sphere' && g.radius<=0 || g.kind==='cylinder' && (g.radius<=0 || g.height<=0) || g.kind==='plane' && (g.width<=0 || g.height<=0)) fail(`/nodes/${i}/geometry`,'size','Positive geometry dimensions required');
 }
 if(!scene.nodes.some(n=>n.role==='task_focus')) fail('/nodes','task_focus','Visible task_focus required');
 const views=new Set(scene.viewpoints.map(v=>v.id));
 if(views.size!==scene.viewpoints.length || !views.has(scene.initial_viewpoint_id)) fail('/viewpoints','reference','Unique viewpoints including initial viewpoint required');
 const chars=new Set(plan.characters.map(c=>c.id));
 const characterRoots=new Set(plan.characters.map(c=>c.scene_node_id));
 for(const n of scene.nodes)if((n.role==='character'||(n.geometry.kind==='asset'&&characterIDs.has(n.geometry.asset_id)))&&!characterRoots.has(n.id))fail('/nodes','unplanned_character','Every visible character must belong to the approved cast');
 if(chars.size!==plan.characters.length) fail('/characters','unique','Duplicate characters');
 for(const c of plan.characters) {const n=nodes.get(c.scene_node_id);if(!n) fail('/nodes','character','Character root missing: '+c.scene_node_id);else {if(n.geometry.kind!=='asset' || !characterIDs.has(n.geometry.asset_id)) fail('/nodes','neutral_character','Every Character must resolve to a registered rigged character.base');if(c.asset_id&&(n.geometry.kind!=='asset'||n.geometry.asset_id!==c.asset_id))fail('/nodes','character_asset','Scene must preserve the coordinator-selected character asset');if(c.color_hex && n.material.color.toLowerCase()!==c.color_hex.toLowerCase())fail('/nodes','character_color','Wonder must preserve coordinator color_hex in Material.color');}}
 if(['dialogue','mixed'].includes(plan.interaction_mode) && !chars.size) fail('/characters','interaction','Dialogue requires characters');
 if(!scene.scenario && ['navigation','mixed'].includes(plan.interaction_mode) && !scene.interactions.some(i=>i.choices.some(c=>c.operations.some(o=>o.type==='viewpoint_transition')))) fail('/interactions','navigation','Need operational routes');
 if(!scene.scenario && plan.interaction_mode==='solo' && !scene.events.length && !scene.interactions.some(i=>i.choices.length)) fail('/interactions','solo','Need task events or inspection choices');
 const cues=new Set(audio.layers.map(l=>l.id));
 const choices=new Set<string>();
 for(const [i,interaction] of scene.interactions.entries()) for(const c of interaction.choices) { if(choices.has(c.id)) fail(`/interactions/${i}`,'unique','Duplicate choice ID'); choices.add(c.id); }
 const ops:WorldOperation[]=[...scene.events.map(e=>e.operation),...scene.interactions.flatMap(i=>i.choices.flatMap(c=>c.operations)),...(scene.scenario?.steps.flatMap(s=>[...s.start_operations,...s.actions.flatMap(a=>a.operations)])??[])];
 const environments=[scene.environment,...ops.filter(o=>o.type==='set_environment').map(o=>'environment' in o?o.environment:undefined)].filter(e=>!!e);
 for(const e of environments)if(e!.fog.end_meters<=e!.fog.start_meters||e!.fog.end_meters>(scene.view_distance_meters??150))fail('/environment/fog','range','Explicit fog must end after its start and within camera visibility');
 const paths=new Map((scene.motion_paths??[]).map(p=>[p.id,p]));
 if(paths.size!==(scene.motion_paths??[]).length)fail('/motion_paths','unique','Duplicate motion path IDs');
 for(const [i,p] of (scene.motion_paths??[]).entries()){
  let previous=0;
  for(const point of p.points){if(point.at_seconds<=previous||point.at_seconds>plan.duration_sec||point.position.length!==3||!point.position.every(Number.isFinite))fail(`/motion_paths/${i}`,'motion','Motion points require increasing positive times within session duration and finite 3D positions');previous=point.at_seconds;}
 }
 for(const o of ops) {
  if('node_id' in o && !nodes.has(o.node_id)) fail('/operations','reference','Unknown node');
  if(o.type==='set_material'&&o.material.surface){
   const n=nodes.get(o.node_id);
   if(n&&(n.role==='character'||n.geometry.kind==='asset'&&characterIDs.has(n.geometry.asset_id)))fail('/operations/material/surface','palette','Approved character materials cannot receive environmental surface profiles');
  }
  if(o.type==='viewpoint_transition' && !views.has(o.destination_id)) fail('/operations','reference','Unknown destination');
  if(o.type==='character_action' && !chars.has(o.character_id)) fail('/operations','reference','Unknown character');
  if(o.type==='character_action' && o.behavior==='sit'){
   const c=plan.characters.find(c=>c.id===o.character_id), n=c&&nodes.get(c.scene_node_id);
   if(!n||n.geometry.kind!=='asset'||!supportsSit(n.geometry.asset_id))fail('/operations','supported_pose','This actor has no authored sitting pose');
  }
  if(o.type==='play_sound' && !cues.has(o.cue_id)) fail('/operations','reference','Unknown cue');
  if((o.type==='move_viewer'||o.type==='move_node') && !paths.has(o.path_id)) fail('/operations','reference','Unknown motion path');
  if(o.type==='move_node'&&carried(o.node_id))fail('/operations','motion','A viewer-carried assembly cannot also have independent world motion');
 }
 if(scene.events.some(e=>e.at_active_second>plan.duration_sec)) fail('/events','clock','Event exceeds duration');
 if(plan.experience && !scene.scenario)fail('/scenario','experience','The approved experience requires an executable scenario');
 if(plan.experience)for(const prop of plan.props??[])if(!scene.nodes.some(n=>n.prop_name===prop))fail('/nodes','prop_match','Scene must realize approved prop: '+prop);
 if(scene.scenario){
  const scenario=scene.scenario,steps=new Map(scenario.steps.map(s=>[s.id,s]));
  const guided=plan.experience?.progression==='guided';
  if(guided&&scenario.progression!=='guided')fail('/scenario','progression','The approved experience progresses automatically');
  if(guided&&plan.experience?.kind==='conversation'&&(scenario.dialogue_policy!=='natural'||!scenario.steps.some(s=>s.conversation_target)))fail('/scenario','conversation','A conversation experience needs a natural speaking window; no ASK commands');
  if(guided&&scenario.dialogue_policy==='on_request')fail('/scenario','guided','Guided practice does not use ASK/TALK TO commands');
  if(steps.size!==scenario.steps.length||scenario.steps[0]?.id!==scenario.initial_step_id)fail('/scenario','reference','Unique scenario steps starting with the initial step required');
  const planned=plan.experience?.stages;
  if(planned && (scenario.initial_step_id!==planned[0].id || JSON.stringify(scenario.steps.map(s=>s.id))!==JSON.stringify(planned.map(s=>s.id))))fail('/scenario/steps','plan_match','Scenario must realize the approved stages in order');
  for(const [i,step] of scenario.steps.entries()){
   const actionIDs=new Set<string>();
   if(guided){
    if(step.actions.length)fail(`/scenario/steps/${i}/actions`,'guided','Guided experiences do not require local voice actions');
    if(!step.terminal&&!step.completion)fail(`/scenario/steps/${i}`,'guided','Each experience stage must advance automatically');
    if(step.terminal&&(step.completion||step.conversation_target))fail(`/scenario/steps/${i}`,'terminal','The final step marks a completed experience, not an interactive stage');
   }
   if(step.conversation_target&&!chars.has(step.conversation_target))fail(`/scenario/steps/${i}`,'reference','Conversation target must be an approved character');
   if(step.conversation_target&&scenario.dialogue_policy!=='natural')fail(`/scenario/steps/${i}`,'conversation','A natural speaking window requires natural dialogue policy');
   if(guided&&step.conversation_target&&step.completion?.trigger!=='after_seconds')fail(`/scenario/steps/${i}`,'conversation','A natural speaking window advances on time after the conversation yields');
   if(step.review_viewpoint_id&&!views.has(step.review_viewpoint_id))fail(`/scenario/steps/${i}/review_viewpoint_id`,'reference','Review viewpoint is missing');
   if(step.review_viewpoint_id&&!step.focus_node_ids?.length)fail(`/scenario/steps/${i}/focus_node_ids`,'reference','Reviewed stages need explicit focal objects');
   if(step.focus_node_ids?.some(id=>!nodes.has(id)))fail(`/scenario/steps/${i}/focus_node_ids`,'reference','Stage focal object is missing');

   const transitions=[...step.actions.map(a=>a.next_step_id),step.completion?.next_step_id].filter((x):x is string=>!!x);
   if(transitions.some(id=>!steps.has(id)||scenario.steps.findIndex(s=>s.id===id)<=i))fail(`/scenario/steps/${i}`,'sequence','Transitions must advance through the approved graph');
   if(planned && JSON.stringify([...step.actions.map(a=>a.id)].sort())!==JSON.stringify([...planned[i]?.action_ids??[]].sort()))fail(`/scenario/steps/${i}/actions`,'plan_match','Action IDs must match the approved stage');
   for(const action of step.actions){
    if(scenario.dialogue_policy==='on_request'&&action.phrases.some(p=>/^(ask\s|talk\s+to\s)/i.test(p.trim())))fail(`/scenario/steps/${i}/actions`,'reserved_command','ASK name and TALK TO name are reserved for live character conversation; use another phrase for local stage actions');
    if(actionIDs.has(action.id))fail('/scenario','unique','Action IDs must be unique within their stage');actionIDs.add(action.id);
    const effects=[...action.operations,...(steps.get(action.next_step_id??'')?.start_operations??[])];
    if(plan.experience?.kind==='action' && !effects.some(o=>!['narrate','play_sound','character_action'].includes(o.type)))fail(`/scenario/steps/${i}/actions`,'task_action','Action practice must change the world or move the viewer, not just trigger speech');
   }
   if(step.terminal && step.actions.length)fail(`/scenario/steps/${i}/actions`,'terminal','Finish participant actions before entering the terminal stage');
   const completion=step.completion;
   // A future stage cannot cause this stage to finish. Include incoming actions
   // because a path may begin on the transition into the current stage.
   const reachableOps=[...scenario.steps.slice(0,i+1).flatMap(s=>s.start_operations),
    ...scenario.steps.slice(0,i).flatMap(s=>s.actions.flatMap(a=>a.operations)),
    ...step.actions.filter(a=>a.next_step_id===null).flatMap(a=>a.operations),
    ...scene.events.map(e=>e.operation)];
   if(completion?.trigger==='after_seconds' && !(completion.after_seconds!>0&&completion.after_seconds!<=plan.duration_sec))fail('/scenario','clock','Timed stage requires a valid duration');
   if(completion?.trigger==='motion_complete' && (!paths.has(completion.motion_path_id??'') || !reachableOps.some(o=>(o.type==='move_viewer'||o.type==='move_node')&&o.path_id===completion.motion_path_id)))fail('/scenario','motion','Motion completion must reference an executed path');
   if(guided&&completion?.trigger==='motion_complete'&&!step.start_operations.some(o=>(o.type==='move_viewer'||o.type==='move_node')&&o.path_id===completion.motion_path_id))fail('/scenario','guided','An automatic movement stage must start its own completion path');
  }
  if(!issues.some(i=>['reference','sequence','plan_match'].includes(i.rule)))issues.push(...scenarioGraphIssues(scene));
  if(plan.experience?.requires_motion && !ops.some(o=>o.type==='move_viewer'))fail('/scenario','motion','The requested activity requires actual viewer motion');
  if(plan.experience?.requires_motion){
   const origin=scene.viewpoints.find(v=>v.id===scene.initial_viewpoint_id)?.position;
   const moving=origin&&ops.some(o=>o.type==='move_viewer'&&paths.get(o.path_id)?.points.some(p=>Math.hypot(...p.position.map((x,i)=>x-(paths.get(o.path_id)?.coordinate_space==='relative'?0:origin[i])))>0.25));
   if(!moving)fail('/motion_paths','motion','A stationary path cannot satisfy a movement experience');
  }
  if(guided&&plan.experience?.kind==='action' && scenario.dialogue_policy!=='disabled')fail('/scenario/dialogue_policy','task_focus','Action experiences run locally; optional conversation is reserved for conversation experiences');
  if(guided){
   const duration=scenario.steps.reduce((sum,s)=>sum+(s.completion?.trigger==='after_seconds'?s.completion.after_seconds??0:paths.get(s.completion?.motion_path_id??'')?.points.at(-1)?.at_seconds??0),0);
   if(duration>plan.duration_sec-3)fail('/scenario','clock','The full automatic experience must reach its completed goal within the session duration');
  }
  if(scenario.dialogue_policy==='on_request'&&!plan.characters.length)fail('/scenario/dialogue_policy','reference','Optional conversation requires an approved character');
 }
 return issues;
}

export function planIssues(plan: SessionPlan): ValidationIssue[] {
 const issues: ValidationIssue[]=[];
 const fail=(path:string,rule:string,message:string)=>issues.push({path,rule,message});
 if(!plan.narrator_intro_8s.includes(plan.stop_reminder)) fail('/narrator_intro_8s','stop_reminder','Intro must include exact STOP reminder');
 if(plan.narrator_beats.some(b=>b.at_active_second>plan.duration_sec)) fail('/narrator_beats','clock','Narration exceeds session duration');
 const phases:Record<string,string[]>= {compose_scene:['setup','builder_revision'],plan_audio:['setup','builder_revision'],generate_feedback:['after_session'],adapt_session:['after_session'],character_turn:['dialogue_turn'],revise_scene:['builder_revision']};
 for(const [i,t] of plan.tool_calls.entries()) {
  if(!phases[t.tool]?.includes(t.execute_when)) fail(`/tool_calls/${i}/execute_when`,'phase','Tool is scheduled in wrong phase');
  if('intensity_1_10' in t.arguments && t.arguments.intensity_1_10!==plan.intensity_1_10) fail(`/tool_calls/${i}/arguments`,'intensity','Tool must preserve coordinator intensity');
  if(t.tool==='plan_audio' && t.arguments.duration_sec!==plan.duration_sec) fail(`/tool_calls/${i}/arguments/duration_sec`,'duration','Audio duration differs from plan');
 }
 if(plan.characters.some(c=>c.voice_id!=='default')) fail('/characters','voice','Only app-selected default voice is registered');
 if(new Set(plan.characters.map(c=>c.scene_node_id)).size!==plan.characters.length)fail('/characters','unique','Each character needs its own scene root');
 if(plan.characters.some(c=>c.asset_id&&!characterIDs.has(c.asset_id)))fail('/characters','character_asset','Choose a registered rigged character.base asset');
 const castNodes=plan.characters.reduce((n,c)=>n+(assetManifest.find(a=>a.id===c.asset_id)?.resolved_node_count??0),0);
 if(castNodes>750)fail('/characters','budget','The selected cast leaves too little of the 1000 resolved-node budget for its setting. Preserve participants and requested appearance; choose suitable registered assets within the budget.');
 if(plan.experience){
  const stages=plan.experience.stages;
  if(!stages.length||new Set(stages.map(s=>s.id)).size!==stages.length)fail('/experience/stages','unique','Unique executable stages required');
  if(plan.experience.kind==='action'&&plan.interaction_mode==='dialogue')fail('/experience','task_focus','An action experience cannot be replaced by a conversation');
  if(plan.experience.progression==='guided'&&stages.some(s=>s.action_ids.length))fail('/experience/stages','guided','The participant experiences movement and events automatically; no command checklist');
 }
 return issues;
}


/** Provider-ready schema containing only definitions reachable from this output. */
export function outputSchema(name: string): any {
 const defs:Record<string,any>={};
 function rewrite(value:any):any {
  if(Array.isArray(value)) return value.map(rewrite);
  if(value && typeof value==='object') {
   if(typeof value.$ref==='string' && value.$ref.startsWith('#/components/schemas/')) {
    const key=value.$ref.split('/').pop()!;
    if(!(key in defs)){defs[key]={};defs[key]=rewrite(document.components.schemas[key]);}
    return {$ref:`#/$defs/${key}`};
   }
   return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,rewrite(v)]));
  }
  return value;
 }
 const root=rewrite(document.components.schemas[name]);
 // Additive wire fields keep old saved records readable; newly authored outputs must realize them.
 const required=name==='SessionPlan'?['experience','construction_brief']:name==='SceneSpec'?['scenario','motion_paths','view_distance_meters','viewer_attached_node_ids','construction_plan','environment']:[];
 if(required.length)root.required=[...new Set([...root.required,...required])];
 if(name==='SessionPlan'&&defs.Character)defs.Character.required=[...new Set([...defs.Character.required,'asset_id'])];
 if(name==='SessionPlan'&&defs.Character)defs.Character.properties.asset_id.enum=[...generationCharacterIDs];
 if(name==='SessionPlan'&&defs.ExperiencePlan)defs.ExperiencePlan.required=[...new Set([...defs.ExperiencePlan.required,'progression'])];
 if(name==='SessionPlan'&&defs.ConstructionBrief)defs.ConstructionBrief.required=[...new Set([...defs.ConstructionBrief.required,'medium_behavior'])];
 if(name==='SessionPlan'&&defs.ExperiencePlan)defs.ExperiencePlan.properties.stages.items.properties.action_ids={type:'array',maxItems:0,items:{type:'string'}};
 if(name==='SceneSpec')root.required=[...new Set([...root.required,'scenario'])];
 if(name==='SceneSpec'&&defs.ConstructionPlan)defs.ConstructionPlan.required=[...new Set([...defs.ConstructionPlan.required,'medium_regions'])];
 if(name==='SceneSpec'&&defs.ScenarioSpec)defs.ScenarioSpec.required=[...new Set([...defs.ScenarioSpec.required,'progression'])];
 if(name==='SceneSpec'&&defs.ScenarioStep)defs.ScenarioStep.required=[...new Set([...defs.ScenarioStep.required,'review_viewpoint_id','focus_node_ids','announce_on_entry'])];
 if(name==='SceneSpec'&&defs.ScenarioStep)defs.ScenarioStep.properties.actions={type:'array',maxItems:0};
 if(name==='SceneSpec')root.properties.interactions={type:'array',maxItems:0};
 if(name==='SceneSpec'&&defs.SceneNode)defs.SceneNode.required=[...new Set([...defs.SceneNode.required,'collision_role','support_node_id'])];
 if(name==='SceneSpec'&&defs.Geometry){
  const asset=(defs.Geometry.oneOf??defs.Geometry.anyOf)?.find((variant:any)=>variant.properties?.kind?.const==='asset');
  if(asset)asset.properties.asset_id={type:'string',minLength:1,maxLength:100,enum:[...assetIDs]};
 }
 // Newly authored identifiers must name something. Nullable links use real null;
 // omitted optional links must not become punctuation-only placeholder strings.
 if(name==='SceneSpec'){
  const identifier=(schema:any)=>{
   if(!schema?.enum&&!schema?.format&&(schema?.type==='string'||Array.isArray(schema?.type)&&schema.type.includes('string'))){
    schema.minLength=Math.max(1,schema.minLength??0);
    schema.pattern='^[A-Za-z0-9_]';
   }
  };
  const identifiers=(definition:any):void=>{
   if(!definition||typeof definition!=='object')return;
   for(const [key,property] of Object.entries(definition.properties??{}) as [string,any][]){
    if(key==='id'||key.endsWith('_id')||key==='conversation_target')identifier(property);
    if(key.endsWith('_ids'))identifier(property.items);
   }
   for(const child of Object.values(definition))identifiers(child);
  };
  identifiers(root);identifiers(defs);
 }
 if(name==='SceneSpec')delete root.properties.construction_report; // Compiler-owned output only.
 // Drop definitions that became unreachable after restricting newly authored
 // guided output. Legacy action/choice graphs remain in the saved wire schema.
 const reachable=new Set<string>();
 function visit(value:any):void {
  if(!value||typeof value!=='object')return;
  if(value.$ref?.startsWith('#/$defs/')){
   const id=value.$ref.slice('#/$defs/'.length);
   if(!reachable.has(id)){reachable.add(id);visit(defs[id]);}
  }
  for(const [key,child] of Object.entries(value))if(key!=='$ref')visit(child);
 }
 visit(root);
 return {...root,$defs:Object.fromEntries([...reachable].map(id=>[id,defs[id]]))};
}

/** Scoped repair output: a small patch against an identified base candidate. */
export function sceneRepairPatchSchema():any {
 const vec3={type:'array',items:{type:'number'},minItems:3,maxItems:3};
 const operation=(properties:any,required:string[])=>({type:'object',additionalProperties:false,properties:{op:{type:'string'},...properties},required:['op',...required]});
 return {type:'object',additionalProperties:false,properties:{
  base_hash:{type:'string',minLength:8,maxLength:64},
  operations:{type:'array',minItems:1,maxItems:24,items:{anyOf:[
   operation({node_id:{type:'string'},position:vec3,rotation_radians:vec3,scale:vec3},['node_id']),
   operation({node_id:{type:'string'},color:{type:'string'},roughness:{type:'number',minimum:0,maximum:1}},['node_id']),
   operation({relation_id:{type:'string'},offset:vec3},['relation_id','offset']),
   operation({relation_id:{type:'string'},kind:{type:'string',enum:['inside','within']}},['relation_id','kind']),
   operation({path_id:{type:'string'},points:{type:'array',minItems:1,maxItems:64,items:{type:'object',additionalProperties:false,properties:{at_seconds:{type:'number',minimum:0},position:vec3},required:['at_seconds','position']}}},['path_id','points']),
   operation({zone_id:{type:'string'},center:vec3,size:vec3},['zone_id']),
   operation({anchor:{type:'object',additionalProperties:false,properties:{id:{type:'string'},node_id:{type:'string'},kind:{type:'string',enum:['support','seat','attachment','entry','exit']},position:vec3,footprint:{type:'array',items:{type:'number'},minItems:2,maxItems:2}},required:['id','node_id','kind','position','footprint']}},['anchor']),
   operation({relation_id:{type:'string'},anchor_id:{type:'string'}},['relation_id','anchor_id']),
   operation({relation_id:{type:'string'},anchor_id:{type:'string'}},['relation_id','anchor_id']),
   operation({node_id:{type:'string'}},['node_id']),
  ]}},
 },required:['base_hash','operations']};
}

/** Bind references already owned by the approved plan instead of asking the builder to invent them. */
export function sceneOutputSchema(plan:SessionPlan,audio:AudioPlan):any {
 const schema=outputSchema('SceneSpec'),defs=schema.$defs;
 schema.properties.session_id={type:'string',const:plan.session_id};
 schema.properties.revision={type:'integer',const:plan.revision};
 const bind=(properties:any,key:string,values:string[])=>{
  if(values.length)properties[key]={type:'string',enum:[...new Set(values)]};
  else delete properties[key];
 };
 bind(defs.SceneNode.properties,'prop_name',plan.props??[]);
 const characters=plan.characters.map(c=>c.id);
 bind(defs.ScenarioStep.properties,'conversation_target',characters);
 if(plan.experience?.stages.length){
  bind(defs.ScenarioStep.properties,'id',plan.experience.stages.map(s=>s.id));
  defs.ScenarioSpec.properties.initial_step_id={type:'string',const:plan.experience.stages[0].id};
 }
 const operations=defs.WorldOperation.oneOf??defs.WorldOperation.anyOf;
 for(const [kind,key,ids] of [['character_action','character_id',characters],['play_sound','cue_id',audio.layers.map(l=>l.id)]] as [string,string,string[]][]){
  const index=operations.findIndex((variant:any)=>variant.properties?.type?.const===kind);
  if(index<0)continue;
  if(ids.length)bind(operations[index].properties,key,ids);
  else operations.splice(index,1);
 }
 return schema;
}

/** Model-authored scene seeds omit fields the stage compiler owns. The final
 * SceneSpec is still fully validated after preparation, before playback. */
export function sceneBuilderSchema(plan:SessionPlan,audio:AudioPlan):any {
 const schema=sceneOutputSchema(plan,audio),step=schema.$defs.ScenarioStep;
 schema.properties.nodes.minItems=1;
 schema.properties.viewpoints.minItems=1;
 const compiled=new Set(['terminal','completion','conversation_target','review_viewpoint_id','focus_node_ids','announce_on_entry']);
 step.required=(step.required??[]).filter((field:string)=>!compiled.has(field));
 return schema;
}

export function validateSceneBuilderOutput(plan:SessionPlan,audio:AudioPlan,value:unknown):void {
 // Plan-bound schemas are per request; do not retain them in the shared Ajv cache.
 const builderAjv=new (Ajv as any)({strict:false,allErrors:true});
 (addFormats as any)(builderAjv);
 const check=builderAjv.compile(sceneBuilderSchema(plan,audio));
 if(!check(value))throw new AppError('INVALID_MODEL_OUTPUT','Invalid scene builder output',schemaIssues(check.errors));
}

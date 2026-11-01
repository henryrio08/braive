import { readFileSync } from 'node:fs';
import Ajv from 'ajv';
import {assetIDs,characterIDs} from './assets.js';
import addFormats from 'ajv-formats';
import type { ValidationIssue, SceneSpec, SessionPlan, AudioPlan } from '../../docs/handoff/contracts.js';
export const document = JSON.parse(readFileSync(new URL('../../docs/handoff/openapi.json', import.meta.url), 'utf8'));
const ajv = new (Ajv as any)({ strict: false, allErrors: true });
(addFormats as any)(ajv);
ajv.addSchema({ $id: 'braive', components: document.components });
export class AppError extends Error {
 constructor(public code: string, message: string, public issues: ValidationIssue[] = [], public status = 400) { super(message); }
}
export function validate(name: string, value: unknown) {
 const check = ajv.getSchema(`braive#/components/schemas/${name}`) ?? ajv.compile({ $ref: `braive#/components/schemas/${name}` });
 if (!check(value)) throw new AppError('INVALID_MODEL_OUTPUT', `Invalid ${name}`, check.errors.map((e: any) => ({ path: e.instancePath, rule: e.keyword, message: e.message }))); 
}
export function sceneIssues(plan: SessionPlan, scene: SceneSpec, audio: AudioPlan): ValidationIssue[] {
 const issues: ValidationIssue[] = [];
 const fail = (path: string, rule: string, message: string) => issues.push({path,rule,message});
 for (const [key, output] of Object.entries({scene,audio})) if(output.session_id !== plan.session_id || output.revision !== plan.revision) fail(`/${key}/revision`,'revision','Must match approved plan');
 const nodes = new Map(scene.nodes.map(n => [n.id,n]));
 if(nodes.size !== scene.nodes.length) fail('/nodes','unique','Duplicate node IDs');
 if(scene.nodes.length > 350) fail('/nodes','budget','Maximum 350 nodes for initial phone profile');
 for(const [i,n] of scene.nodes.entries()) {
  if(n.parent_id && !nodes.has(n.parent_id)) fail(`/nodes/${i}/parent_id`,'reference','Parent missing');
  const seen = new Set([n.id]); let p = n.parent_id;
  while(p && nodes.has(p)) { if(seen.has(p)) { fail(`/nodes/${i}`,'cycle','Cyclic hierarchy'); break; } seen.add(p); p=nodes.get(p)!.parent_id; }
  if(![...n.position,...n.rotation_radians,...n.scale].every(Number.isFinite) || n.scale.some(v=>v<=0)) fail(`/nodes/${i}`,'transform','Positive finite transforms required');
  const g=n.geometry;
  if(g.kind!=='asset' && n.role!=='environment') fail(`/nodes/${i}/geometry`,'architecture_only','Primitives are architecture fill only; use registered GLBs for props and characters');
  if(n.role==='character' && (g.kind!=='asset' || !characterIDs.has(g.asset_id))) fail(`/nodes/${i}/geometry`,'neutral_character','Characters must use the sole character.base asset');
  if(g.kind==='asset' && !assetIDs.has(g.asset_id)) fail(`/nodes/${i}/geometry`,'asset','Use only registered individual object assets.');
  if(g.kind==='box' && g.size.some(v=>v<=0) || g.kind==='sphere' && g.radius<=0 || g.kind==='cylinder' && (g.radius<=0 || g.height<=0) || g.kind==='plane' && (g.width<=0 || g.height<=0)) fail(`/nodes/${i}/geometry`,'size','Positive geometry dimensions required');
 }
 if(!scene.nodes.some(n=>n.role==='task_focus')) fail('/nodes','task_focus','Visible task_focus required');
 const views=new Set(scene.viewpoints.map(v=>v.id));
 if(views.size!==scene.viewpoints.length || !views.has(scene.initial_viewpoint_id)) fail('/viewpoints','reference','Unique viewpoints including initial viewpoint required');
 const chars=new Set(plan.characters.map(c=>c.id));
 if(chars.size!==plan.characters.length) fail('/characters','unique','Duplicate characters');
 for(const c of plan.characters) {const n=nodes.get(c.scene_node_id);if(!n) fail('/nodes','character','Character root missing: '+c.scene_node_id);else {if(n.geometry.kind!=='asset' || !characterIDs.has(n.geometry.asset_id)) fail('/nodes','neutral_character','Every Character must resolve to character.base');if(c.color_hex && n.material.color.toLowerCase()!==c.color_hex.toLowerCase())fail('/nodes','character_color','Wonder must preserve coordinator color_hex in Material.color');}}
 if(['dialogue','mixed'].includes(plan.interaction_mode) && !chars.size) fail('/characters','interaction','Dialogue requires characters');
 if(['navigation','mixed'].includes(plan.interaction_mode) && !scene.interactions.some(i=>i.choices.some(c=>c.operations.some(o=>o.type==='viewpoint_transition')))) fail('/interactions','navigation','Need operational routes');
 if(plan.interaction_mode==='solo' && !scene.events.length && !scene.interactions.some(i=>i.choices.length)) fail('/interactions','solo','Need task events or inspection choices');
 const cues=new Set(audio.layers.map(l=>l.id));
 const choices=new Set<string>();
 for(const [i,interaction] of scene.interactions.entries()) for(const c of interaction.choices) { if(choices.has(c.id)) fail(`/interactions/${i}`,'unique','Duplicate choice ID'); choices.add(c.id); }
 const ops=[...scene.events.map(e=>e.operation),...scene.interactions.flatMap(i=>i.choices.flatMap(c=>c.operations))];
 for(const o of ops) {
  if('node_id' in o && !nodes.has(o.node_id)) fail('/operations','reference','Unknown node');
  if(o.type==='viewpoint_transition' && !views.has(o.destination_id)) fail('/operations','reference','Unknown destination');
  if(o.type==='character_action' && !chars.has(o.character_id)) fail('/operations','reference','Unknown character');
  if(o.type==='play_sound' && !cues.has(o.cue_id)) fail('/operations','reference','Unknown cue');
 }
 if(scene.events.some(e=>e.at_active_second>plan.duration_sec)) fail('/events','clock','Event exceeds duration');
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
 const root=rewrite(document.components.schemas[name]);return {...root,$defs:defs};
}

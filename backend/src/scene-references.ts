import type {AudioPlan,MotionPath,SceneSpec,SessionPlan} from '../../docs/handoff/contracts.js';

const isPosition=(value:unknown):value is number[]=>Array.isArray(value)&&value.length===3&&value.every(Number.isFinite);

/** A leading time-zero sample states the origin, not a second movement point. */
function normalizePathOrigin(path:Partial<MotionPath>):boolean {
 if(!Array.isArray(path.points)||path.points.length<2||path.points[0]?.at_seconds!==0)return false;
 const origin=path.points[0].position;
 if(!isPosition(origin))return false;
 if(path.coordinate_space===undefined||path.coordinate_space==='world'){
  const start=path.start_position;
  if(start!==undefined&&(!isPosition(start)||Math.hypot(...origin.map((v,i)=>v-start[i]))>=1e-6))return false;
  path.start_position=start??origin;
 }else if(path.coordinate_space!=='relative'||origin.some(v=>v!==0))return false;
 path.points.shift();
 return true;
}

export function normalizePathSamples(path:Partial<MotionPath>) {
 if(!Array.isArray(path.points))return {origin:false,duplicateCount:0};
 const count=path.points.length;
 path.points=path.points.filter((sample,index,points)=>{
  const previous=points[index-1];
  return !previous||!sample||!Number.isFinite(sample.at_seconds)||sample.at_seconds!==previous.at_seconds||
   !isPosition(sample.position)||!isPosition(previous.position)||!sample.position.every((value,axis)=>value===previous.position[axis]);
 });
 const duplicateCount=count-path.points.length;
 return {origin:normalizePathOrigin(path),duplicateCount};
}

export function canonicalSceneMotion(value:unknown):unknown {
 if(!value||typeof value!=='object'||!Array.isArray((value as SceneSpec).motion_paths))return value;
 const scene=structuredClone(value) as SceneSpec;
 for(const path of scene.motion_paths!){
  if(path&&typeof path==='object')normalizePathSamples(path);
 }
 return scene;
}

/** Resolve exact references across app-owned identifier domains; never guess assets or ambiguous names. */
export function canonicalSceneReferences(plan:SessionPlan,source:SceneSpec,audio:AudioPlan):SceneSpec {
 const scene=structuredClone(source);
 const characterIDs=new Set(plan.characters.map(c=>c.id)),cueIDs=new Set(audio.layers.map(l=>l.id));
 const ops=[...scene.events.map(e=>e.operation),...scene.interactions.flatMap(i=>i.choices.flatMap(c=>c.operations)),
  ...(scene.scenario?.steps.flatMap(s=>[...s.start_operations,...s.actions.flatMap(a=>a.operations)])??[])];
 for(const op of ops){
  if(op.type==='character_action'&&!characterIDs.has(op.character_id)){
   const matches=plan.characters.filter(c=>c.scene_node_id===op.character_id);
   if(matches.length===1)op.character_id=matches[0].id;
  }
  if(op.type==='play_sound'&&!cueIDs.has(op.cue_id)){
   const matches=audio.layers.filter(l=>l.asset_id===op.cue_id);
   if(matches.length===1)op.cue_id=matches[0].id;
  }
 }
 for(const step of scene.scenario?.steps??[]){
  if(step.conversation_target&&!characterIDs.has(step.conversation_target)){
   const matches=plan.characters.filter(c=>c.scene_node_id===step.conversation_target);
   if(matches.length===1)step.conversation_target=matches[0].id;
  }
 }
 return scene;
}

import {AppError,validate} from './contracts.js';
import type {DialogueRequest,DialogueResult,SessionPlan,SceneSpec,AudioPlan} from '../../docs/handoff/contracts.js';

// Routing is deterministic application state. The model supplies only spoken content and actions.
export function dialogueContentSchema(){
 return {type:'object',additionalProperties:false,required:['reply','behavior'],properties:{
  reply:{type:'string',minLength:1,maxLength:320},behavior:{type:'string',enum:['idle','listen','speak','gesture']}}};
}
export function completeDialogueResult(request:DialogueRequest,content:Record<string,unknown>):DialogueResult {
 if(Array.isArray(content.operations)&&content.operations.some((op:any)=>!op||op.type!=='character_action'||!['idle','listen','speak','gesture'].includes(op.behavior)))
  throw new AppError('INVALID_MODEL_OUTPUT','Conversation may gesture; scenario actions own world changes and movement');
 const result={...content,context_summary:request.context_summary,operations:content.operations??[],schema_version:'1',session_id:request.session_id,revision:request.revision,
  turn_id:request.turn_id,character_id:request.character_id};
 validate('DialogueResult',result);
 return result as DialogueResult;
}
export function dialogueContext(request:DialogueRequest,saved:{plan:SessionPlan,scene:SceneSpec,audio:AudioPlan}){
 const {plan}=saved, character=plan.characters.find(c=>c.id===request.character_id)!;
 return {schema_version:request.schema_version,session_id:request.session_id,revision:request.revision,turn_id:request.turn_id,character_id:request.character_id,
  user_utterance:request.user_utterance.slice(-1800),recent_turns:request.recent_turns.slice(-6).map(t=>({...t,text:t.text.slice(-500)})),
  character:{name:character.name,role:character.role,goal:character.goal.slice(0,350),behavior_boundaries:character.behavior_boundaries,
   ...(character.dialogue_style?{dialogue_style:character.dialogue_style}:{})},
  objective:(plan.experience?.objective??plan.task_instruction).slice(0,500),setting:plan.setting_brief.slice(0,700),
  context_summary:request.context_summary.slice(0,600),remaining_seconds:request.remaining_seconds};
}
export function assertCurrentDialogue(request:DialogueRequest,plan:SessionPlan|undefined,activeRevision:number|undefined){
 if(!plan || plan.session_id!==request.session_id || plan.revision!==request.revision || activeRevision!==request.revision)
  throw new AppError('CONFLICT','Dialogue revision has no current approved scene',[],409);
 if(!plan.characters.some(c=>c.id===request.character_id))throw new AppError('INVALID_INPUT','Unknown character');
}

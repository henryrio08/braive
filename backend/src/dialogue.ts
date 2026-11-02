import {AppError,outputSchema,validate} from './contracts.js';
import type {DialogueRequest,DialogueResult,SessionPlan} from '../../docs/handoff/contracts.js';

const routingKeys=['schema_version','session_id','revision','turn_id','character_id'] as const;

// Routing is deterministic application state. The model supplies only spoken content and actions.
export function dialogueContentSchema(){
 const schema=outputSchema('DialogueResult');
 for(const key of routingKeys)delete schema.properties[key];
 schema.required=schema.required.filter((key:string)=>!routingKeys.includes(key as any));
 return schema;
}
export function completeDialogueResult(request:DialogueRequest,content:Record<string,unknown>):DialogueResult {
 const result={...content,schema_version:'1',session_id:request.session_id,revision:request.revision,
  turn_id:request.turn_id,character_id:request.character_id};
 validate('DialogueResult',result);
 return result as DialogueResult;
}
export function assertCurrentDialogue(request:DialogueRequest,plan:SessionPlan|undefined,activeRevision:number|undefined){
 if(!plan || plan.session_id!==request.session_id || plan.revision!==request.revision || activeRevision!==request.revision)
  throw new AppError('CONFLICT','Dialogue revision has no current approved scene',[],409);
 if(!plan.characters.some(c=>c.id===request.character_id))throw new AppError('INVALID_INPUT','Unknown character');
}

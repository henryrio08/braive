import {AppError,validate,sceneIssues} from './contracts.js';
import {compileScene} from './construction.js';
import type {SessionPlan,SceneSpec,AudioPlan} from '../../docs/handoff/contracts.js';

export interface WorldCommitInput {
 session_id:string; expected_revision:number; revision:number;
 plan:SessionPlan; scene:SceneSpec; audio:AudioPlan; world_id?:string;
}
export interface ApprovedWorld { plan:SessionPlan; scene:SceneSpec; audio:AudioPlan; experience?:unknown; world_id?:string }

/** Validate and compile a canonical same-world revision candidate.
 * Pure with respect to the supplied approval maps so it can be tested
 * without HTTP. Throws AppError on stale base, schema, or spatial failure;
 * the caller publishes only on success, keeping the prior world intact. */
export function prepareWorldCommit(input:WorldCommitInput,
  approved:Map<string,ApprovedWorld>, revisions:Map<string,number>):ApprovedWorld {
 validate('SessionPlan',input.plan); validate('SceneSpec',input.scene); validate('AudioPlan',input.audio);
 if(input.plan.session_id!==input.session_id||input.scene.session_id!==input.session_id||input.audio.session_id!==input.session_id)
  throw new AppError('INVALID_INPUT','Committed documents must share the attempt session_id');
 if(input.plan.revision!==input.revision||input.scene.revision!==input.revision||input.audio.revision!==input.revision)
  throw new AppError('INVALID_INPUT','Plan, scene and audio revisions must advance together');
 const current=revisions.get(input.session_id);
 if(current===undefined){
  if(input.expected_revision!==0)throw new AppError('CONFLICT','New attempt must declare expected_revision 0',[],409);
 } else if(current!==input.expected_revision){
  throw new AppError('CONFLICT',`Stale base revision: expected ${current}, received ${input.expected_revision}`,[],409);
 }
 if(current!==undefined && input.revision!==current+1)
  throw new AppError('CONFLICT','Revision must advance by exactly one from the approved base',[],409);
 const compiled=compileScene(input.plan,input.scene,input.audio);
 const errors=sceneIssues(input.plan,compiled,input.audio);
 if(errors.length)throw new AppError('INVALID_MODEL_OUTPUT','World commit requires repair',errors);
 const prior=approved.get(input.session_id);
 return {plan:input.plan,scene:compiled,audio:input.audio,experience:prior?.experience,world_id:input.world_id??prior?.world_id??input.session_id};
}

export function publishWorldCommit(input:WorldCommitInput,world:ApprovedWorld,
  approved:Map<string,ApprovedWorld>, revisions:Map<string,number>):void {
 approved.set(input.session_id,world);
 revisions.set(input.session_id,input.revision);
}

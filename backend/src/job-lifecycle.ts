import type {Job,PlanRequest} from '../../docs/handoff/contracts.js';
import {isDeepStrictEqual} from 'node:util';
import {AppError} from './contracts.js';

export type GenerationAttempt={deadline:number;deadlineCap?:number;planningRepairUsed?:boolean;constructionRepairUsed:boolean;deviceRepairUsed:boolean};
export type RepairKind='planning'|'construction'|'device';
const repairSlot=(kind:RepairKind)=>kind==='planning'?'planningRepairUsed':kind==='construction'?'constructionRepairUsed':'deviceRepairUsed';
export function claimRepair(attempt:GenerationAttempt|undefined,kind:RepairKind,now=Date.now()):boolean {
 const slot=repairSlot(kind);
 if(!attempt||now>=attempt.deadline||attempt.planningRepairUsed||attempt.constructionRepairUsed||attempt.deviceRepairUsed)return false;
 attempt[slot]=true;return true;
}

export type RepairBlock='missing'|'deadline'|'used';
/** Explain why a repair cannot start so callers never merge distinct failures. */
export function repairBlock(attempt:GenerationAttempt|undefined,kind:RepairKind,now=Date.now()):RepairBlock|undefined {
 if(!attempt)return 'missing';
 if(now>=attempt.deadline&&(attempt.deadlineCap===undefined||now>=attempt.deadlineCap))return 'deadline';
 const slot=repairSlot(kind);
 return attempt.planningRepairUsed||attempt.constructionRepairUsed||attempt.deviceRepairUsed?'used':undefined;
}
/** A provider or transport failure produced no candidate; it must not consume the repair. */
export function releaseRepair(attempt:GenerationAttempt|undefined,kind:RepairKind):void {
 if(!attempt)return;
 attempt[repairSlot(kind)]=false;
}
/** Give a claimed device repair enough clock to finish, inside a hard cap. */
export function grantRepairWindow(attempt:GenerationAttempt,now:number,windowMs:number):number {
 const cap=attempt.deadlineCap??attempt.deadline;
 attempt.deadline=Math.max(attempt.deadline,Math.min(now+windowMs,cap));
 return attempt.deadline;
}

/** A lost acknowledgement must not turn a network retry into another paid generation. */
export function repeatedGeneration(input:PlanRequest,jobs:Map<string,Job>,requests:Map<string,PlanRequest>):Job|undefined {
 const job=[...jobs.values()].find(j=>j.session_id===input.session_id&&j.revision===input.revision);
 if(!job)return;
 if(!isDeepStrictEqual(requests.get(job.job_id),input))throw new AppError('CONFLICT','This revision already has different practice details',[],409);
 return job;
}

/** Reject before changing any existing session. A replacement reuses its own slots. */
export function supersedeGeneration(sessionID:string,jobs:Map<string,Job>,running:Map<string,AbortController>,limit=3) {
 const previous=[...running.keys()].filter(id=>jobs.get(id)?.session_id===sessionID);
 if(running.size-previous.length>=limit)throw new AppError('RATE_LIMITED','Too many active generation jobs',[],429);
 for(const id of previous)cancelGeneration(id,jobs,running);
}
export function cancelGeneration(id:string,jobs:Map<string,Job>,running:Map<string,AbortController>) {
 const controller=running.get(id);
 if(!controller)return; // Completed jobs stay completed; repeated cancellation is harmless.
 const job=jobs.get(id);if(job)job.status='cancelled';
 controller.abort();running.delete(id);
}
export function releaseGeneration(id:string,controller:AbortController,running:Map<string,AbortController>) {
 if(running.get(id)===controller)running.delete(id);
}

/** Per-session state must outlive any retained revision of that session. */
export function pruneCompletedJobs(jobs:Map<string,Job>,running:ReadonlyMap<string,AbortController>,limit=100) {
 const evicted:string[]=[],expiredSessions=new Set<string>();
 for(const [id,job] of jobs){
  if(jobs.size<=limit)break;
  if(running.has(id))continue;
  jobs.delete(id);evicted.push(id);expiredSessions.add(job.session_id);
 }
 if(expiredSessions.size)for(const job of jobs.values())expiredSessions.delete(job.session_id);
 return {evicted,expiredSessions};
}

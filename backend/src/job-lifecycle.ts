import type {Job} from '../../docs/handoff/contracts.js';
import {AppError} from './contracts.js';

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

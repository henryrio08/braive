import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {Job} from '../../docs/handoff/contracts.js';
import {supersedeGeneration,cancelGeneration,releaseGeneration} from '../src/job-lifecycle.js';
function fixture(){
 const jobs=new Map<string,Job>(),running=new Map<string,AbortController>();
 for(const id of ['a','b','c']){jobs.set(id,{job_id:id,session_id:id,revision:1,status:'running',stage:'test'});running.set(id,new AbortController());}
 return {jobs,running};
}
test('capacity rejection leaves existing jobs and cancellation signals unchanged',()=>{
 const {jobs,running}=fixture();assert.throws(()=>supersedeGeneration('d',jobs,running),/Too many/);
 assert.equal(running.size,3);for(const [id,c] of running){assert.equal(c.signal.aborted,false);assert.equal(jobs.get(id)!.status,'running');}
});
test('a replacement at capacity cancels and releases only its own job',()=>{
 const {jobs,running}=fixture(),old=running.get('a')!;supersedeGeneration('a',jobs,running);
 assert.equal(old.signal.aborted,true);assert.equal(jobs.get('a')!.status,'cancelled');assert.deepEqual([...running.keys()],['b','c']);
});
test('completed jobs remain succeeded; stale cleanup cannot remove a repair controller',()=>{
 const {jobs,running}=fixture(),old=running.get('a')!,repair=new AbortController();running.set('a',repair);
 releaseGeneration('a',old,running);assert.equal(running.get('a'),repair);
 releaseGeneration('a',repair,running);jobs.get('a')!.status='succeeded';cancelGeneration('a',jobs,running);assert.equal(jobs.get('a')!.status,'succeeded');
});

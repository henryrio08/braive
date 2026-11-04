import {test} from 'node:test';
import assert from 'node:assert/strict';
import {claimRepair} from '../src/job-lifecycle.js';
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

test('identical generation retries reuse the job while changed details conflict',async()=>{
 const {repeatedGeneration}=await import('../src/job-lifecycle.js');
 const {jobs}=fixture();
 const input={session_id:'a',revision:1,fear_description:'Original situation'} as import('../../docs/handoff/contracts.js').PlanRequest;
 const requests=new Map([['a',input]]);
 assert.equal(repeatedGeneration({...input},jobs,requests),jobs.get('a'));
 assert.throws(()=>repeatedGeneration({...input,fear_description:'Changed situation'},jobs,requests),/different practice details/);
 assert.equal(repeatedGeneration({...input,revision:2},jobs,requests),undefined);
});

test('repair blocks are distinguished and provider failures release the claim',async()=>{
 const {repairBlock,releaseRepair,grantRepairWindow}=await import('../src/job-lifecycle.js');
 assert.equal(repairBlock(undefined,'device',50),'missing');
 const used={deadline:100,deadlineCap:400,constructionRepairUsed:false,deviceRepairUsed:true};
 assert.equal(repairBlock(used,'device',50),'used');
 const expired={deadline:100,deadlineCap:400,constructionRepairUsed:false,deviceRepairUsed:false};
 assert.equal(repairBlock(expired,'device',450),'deadline');
 assert.equal(repairBlock(expired,'device',150),undefined);
 grantRepairWindow(expired,150,240*1000);
 assert.equal(expired.deadline,400);
 assert.equal(claimRepair(expired,'device',200),true);
 releaseRepair(expired,'device');
 assert.equal(expired.deviceRepairUsed,false);
 assert.equal(claimRepair(expired,'device',201),true);
});

test('construction and native preflight share one repair within the same deadline',()=>{
 const attempt={deadline:100,constructionRepairUsed:false,deviceRepairUsed:false};
 assert.equal(claimRepair(attempt,'construction',90),true);
 assert.equal(claimRepair(attempt,'construction',91),false);
 assert.equal(claimRepair(attempt,'device',92),false);
 assert.equal(claimRepair(attempt,'device',93),false);
 const expired={deadline:100,constructionRepairUsed:false,deviceRepairUsed:false};
 assert.equal(claimRepair(expired,'device',100),false);
 assert.equal(claimRepair(expired,'construction',101),false);
});

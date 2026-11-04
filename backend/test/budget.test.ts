import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,openSync,closeSync,unlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';
import {TestBudget,verificationAllowance} from '../src/budget.js';
function isolated(run:(path:string)=>void){const dir=mkdtempSync(join(tmpdir(),'braive-budget-'));try{run(join(dir,'approval.json'))}finally{rmSync(dir,{recursive:true,force:true})}}
test('budget persists across instances and cannot reset on restart',()=>isolated(path=>{const a=TestBudget.initialize(path,5);a.reserve('text',3,{});const b=TestBudget.initialize(path,5);b.reserve('audio',2,{});assert.throws(()=>new TestBudget(path).reserve('text',0.01,{}),/budget/);assert.throws(()=>TestBudget.initialize(path,10),/refusing to reset/)}));
test('settlement releases only known usage; uncertain calls keep full reservation',()=>isolated(path=>{const b=TestBudget.initialize(path,5);const id=b.reserve('text',4,{});b.reserve('uncertain',1,{});b.settle(id,0.25,{tokens:123});assert.equal(b.snapshot().entries.reduce((n,e)=>n+e.charged_micro,0),1250000);assert.throws(()=>b.reserve('text',4,{}),/budget/)}));
test('shared filesystem lock prevents simultaneous budget mutations',()=>isolated(path=>{const b=TestBudget.initialize(path,5);const fd=openSync(path+'.lock','wx');try{assert.throws(()=>b.reserve('text',1,{}),/locked/)}finally{closeSync(fd);unlinkSync(path+'.lock')}assert.equal(b.snapshot().entries.length,0)}));
test('unexpected over-reservation usage suspends further billable work',()=>isolated(path=>{const b=TestBudget.initialize(path,5),id=b.reserve('text',1,{});b.settle(id,2,{});assert.throws(()=>b.reserve('text',0.01,{}),/budget/)}));
test('explicit cap increase retains charges, uncertain reservations and approval history',()=>isolated(path=>{
 const b=TestBudget.initialize(path,5),id=b.reserve('text',3,{});b.settle(id,2,{});b.reserve('uncertain',1,{});
 const entries=structuredClone(b.snapshot().entries);b.increaseApproval(50,'Explicit user approval for total 50 USD');
 assert.deepEqual(b.snapshot().entries,entries);assert.equal(b.snapshot().limit_micro,50e6);assert.equal(b.snapshot().approval_changes?.length,1);
 assert.doesNotThrow(()=>TestBudget.initialize(path,50));assert.throws(()=>TestBudget.initialize(path,5),/refusing to reset/);
 b.increaseApproval(50,'Same approval');assert.equal(b.snapshot().approval_changes?.length,1);assert.throws(()=>b.increaseApproval(5,'lower'),/cannot lower/);
}));

test('verification sub-budget persists across restarts, includes uncertain calls and never resets prior charges',()=>isolated(path=>{
 const previous=new TestBudget(TestBudget.initialize(path,50).path);previous.reserve('prior',10,{});
 const first=new TestBudget(path,{id:'scene-generation-fixes-2026-11-04',limitUSD:5});
 const known=first.reserve('text',3,{});first.settle(known,1,{});
 first.reserve('uncertain',3,{});
 const restarted=new TestBudget(path,{id:'scene-generation-fixes-2026-11-04',limitUSD:5});
 assert.throws(()=>restarted.reserve('text',1.01,{}),/Verification budget/);
 restarted.reserve('text',1,{});
 assert.throws(()=>restarted.reserve('text',0.01,{}),/Verification budget/);
 assert.throws(()=>new TestBudget(path,{id:'scene-generation-fixes-2026-11-04',limitUSD:6}).reserve('text',0,{}),/refusing to reset/);
 const ledger=first.snapshot();
 assert.equal(ledger.limit_micro,50e6);
 assert.equal(ledger.entries[0].charged_micro,10e6);
 assert.equal(ledger.entries.reduce((sum,entry)=>sum+entry.charged_micro,0),15e6);
 assert.equal(ledger.verification_runs?.['scene-generation-fixes-2026-11-04'].opening_charged_micro,10e6);
}));

test('verification configuration cannot increase the approved five-dollar cap',()=>{
 const oldID=process.env.BRAIVE_VERIFICATION_RUN_ID,oldLimit=process.env.BRAIVE_VERIFICATION_MAX_USD;
 try {
  process.env.BRAIVE_VERIFICATION_RUN_ID='scene-generation-fixes-2026-11-04';
  for(const invalid of ['6','0','NaN','Infinity']){process.env.BRAIVE_VERIFICATION_MAX_USD=invalid;assert.throws(()=>verificationAllowance(),/capped at US\$5/);}
  delete process.env.BRAIVE_VERIFICATION_MAX_USD;assert.equal(verificationAllowance()?.limitUSD,5);
 }finally{
  if(oldID===undefined)delete process.env.BRAIVE_VERIFICATION_RUN_ID;else process.env.BRAIVE_VERIFICATION_RUN_ID=oldID;
  if(oldLimit===undefined)delete process.env.BRAIVE_VERIFICATION_MAX_USD;else process.env.BRAIVE_VERIFICATION_MAX_USD=oldLimit;
 }
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,openSync,closeSync,unlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';
import {TestBudget} from '../src/budget.js';
function isolated(run:(path:string)=>void){const dir=mkdtempSync(join(tmpdir(),'braive-budget-'));try{run(join(dir,'approval.json'))}finally{rmSync(dir,{recursive:true,force:true})}}
test('budget persists across instances and cannot reset on restart',()=>isolated(path=>{const a=TestBudget.initialize(path,5);a.reserve('text',3,{});const b=TestBudget.initialize(path,5);b.reserve('audio',2,{});assert.throws(()=>new TestBudget(path).reserve('text',0.01,{}),/budget/);assert.throws(()=>TestBudget.initialize(path,10),/refusing to reset/)}));
test('settlement releases only known usage; uncertain calls keep full reservation',()=>isolated(path=>{const b=TestBudget.initialize(path,5);const id=b.reserve('text',4,{});b.reserve('uncertain',1,{});b.settle(id,0.25,{tokens:123});assert.equal(b.snapshot().entries.reduce((n,e)=>n+e.charged_micro,0),1250000);assert.throws(()=>b.reserve('text',4,{}),/budget/)}));
test('shared filesystem lock prevents simultaneous budget mutations',()=>isolated(path=>{const b=TestBudget.initialize(path,5);const fd=openSync(path+'.lock','wx');try{assert.throws(()=>b.reserve('text',1,{}),/locked/)}finally{closeSync(fd);unlinkSync(path+'.lock')}assert.equal(b.snapshot().entries.length,0)}));
test('unexpected over-reservation usage suspends further billable work',()=>isolated(path=>{const b=TestBudget.initialize(path,5),id=b.reserve('text',1,{});b.settle(id,2,{});assert.throws(()=>b.reserve('text',0.01,{}),/budget/)}));

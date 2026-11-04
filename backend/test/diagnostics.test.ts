import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generationIdentity,generationReport,measurePhase,withGenerationIdentity} from '../src/diagnostics.js';

const identity={job_id:'11111111-1111-4111-8111-111111111111',session_id:'22222222-2222-4222-8222-222222222222',revision:2};
test('diagnostics keep independent concurrent job identities and never copy job results or error messages',async()=>{
 const privateText='PRIVATE_TRANSCRIPT_TOKEN_AND_KEY';
 const job={...identity,result:{speech:privateText},stage:privateText};
 await Promise.all([withGenerationIdentity(job,async()=>{
  await new Promise(resolve=>setTimeout(resolve,3));
  assert.deepEqual(generationIdentity(),identity);
  measurePhase('construction_validation',()=>true);
  assert.throws(()=>measurePhase('approved_experience_validation',()=>{throw Object.assign(Error(privateText),{issues:[{rule:'route_clearance',message:privateText}]});}));
 }),withGenerationIdentity({...identity,job_id:'33333333-3333-4333-8333-333333333333'},async()=>{
  await Promise.resolve();assert.equal(generationIdentity()?.job_id,'33333333-3333-4333-8333-333333333333');
 })]);
 const report=generationReport(job,'succeeded',120,[{role:'scene_builder',finish_reason:'length',outcome:'failed',validation_outcome:'rejected',input_tokens:123,content:privateText,error:privateText}]);
 assert.equal(report.native_acceptance,'not_reported','Server success never claims native acceptance');
 assert.deepEqual(report.phases.map(phase=>[phase.phase,phase.outcome]),[['construction_validation','succeeded'],['approved_experience_validation','failed']]);
 assert.deepEqual(report.phases[1].issue_rules,['route_clearance']);
 assert.equal(report.model_calls[0].finish_reason,'length');
 assert.ok(!JSON.stringify(report).includes(privateText));
 assert.equal(generationIdentity(),undefined);
});

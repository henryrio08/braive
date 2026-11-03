import {test} from 'node:test';
import assert from 'node:assert/strict';
import {dispatchTool} from '../src/tool-dispatch.js';
import type {SessionPlan} from '../../docs/handoff/contracts.js';
test('tool dispatch executes declared arguments only in the registered phase',async()=>{
 const args={observation_source:'current_session_observations',tone:'coaching_nonclinical',max_did_well:3,max_noticed:3};
 const plan={tool_calls:[{tool:'generate_feedback',execute_when:'after_session',arguments:args}]} as unknown as SessionPlan;
 let invoked=0;
 await assert.rejects(dispatchTool(plan,'generate_feedback','setup',async()=>{invoked++;}));assert.equal(invoked,0);
 assert.deepEqual(await dispatchTool(plan,'generate_feedback','after_session',async input=>{invoked++;return input;}),args);
 assert.equal(invoked,1);
 plan.tool_calls.push(plan.tool_calls[0]);
 await assert.rejects(dispatchTool(plan,'generate_feedback','after_session',async()=>{invoked++;}));assert.equal(invoked,1);
});

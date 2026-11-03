import {test} from 'node:test';
import assert from 'node:assert/strict';
import {scenarioGraphIssues} from '../src/scenario-graph.js';
import type {SceneSpec} from '../../docs/handoff/contracts.js';
const move=(path_id:string)=>({type:'move_viewer' as const,path_id});
function scene(){return {events:[],scenario:{initial_step_id:'choose',dialogue_policy:'disabled',objective:'Choose a route',steps:[
 {id:'choose',terminal:false,prompt:'Choose',start_operations:[],actions:[{id:'left',label:'left',phrases:['left'],operations:[move('left')],next_step_id:'arrive'},{id:'right',label:'right',phrases:['right'],operations:[move('right')],next_step_id:'arrive'}]},
 {id:'arrive',terminal:false,prompt:'Arriving',start_operations:[],actions:[],completion:{trigger:'motion_complete',motion_path_id:'left',next_step_id:'done'}},
 {id:'done',terminal:true,prompt:'Done',start_operations:[],actions:[]}
]}} as unknown as SceneSpec;}
test('a path from one choice cannot satisfy another incoming branch',()=>{
 assert.ok(scenarioGraphIssues(scene()).some(i=>i.rule==='progress'));
 const s=scene();s.scenario!.steps[1].start_operations=[move('arrival')];s.scenario!.steps[1].completion!.motion_path_id='arrival';
 assert.deepEqual(scenarioGraphIssues(s),[]);
});
test('replaced motion cannot satisfy a stranded completion',()=>{
 const s=scene();s.scenario!.steps[0].actions[1].operations=[move('left')];s.scenario!.steps[1].start_operations=[move('replacement')];
 assert.ok(scenarioGraphIssues(s).some(i=>i.rule==='progress'));
});
test('routine events may progress automatically and choices may branch forward',()=>{
 const s=scene();s.scenario!.steps[1].completion={trigger:'after_seconds',after_seconds:2,next_step_id:'done'};
 s.scenario!.steps[0].actions[1].next_step_id='done';
 assert.deepEqual(scenarioGraphIssues(s),[]);
});
test('unreachable stages and competing transform writers fail',()=>{
 const s=scene();s.scenario!.steps[0].actions.forEach(a=>a.next_step_id='done');
 assert.ok(scenarioGraphIssues(s).some(i=>i.message.includes('unreachable')));
 s.scenario!.steps[0].actions[0].operations=[move('left'),move('right')];
 assert.ok(scenarioGraphIssues(s).some(i=>i.message.includes('compete')));
});
test('motion completion identities cannot be shared by independent actors',()=>{
 const s=scene();s.scenario!.steps[0].start_operations=[{type:'move_node',node_id:'companion',path_id:'left',face_motion:true}];
 assert.ok(scenarioGraphIssues(s).some(i=>i.message.includes('one viewer/actor')));
});

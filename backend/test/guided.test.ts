import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {sceneIssues,validate} from '../src/contracts.js';import type {SessionPlan,SceneSpec,AudioPlan} from '../../docs/handoff/contracts.js';
function setup(){
 const scenario=JSON.parse(readFileSync(new URL('../../tests/fixtures/guided-scenario.json',import.meta.url),'utf8'));
 const plan={session_id:'c36a8c25-43c2-46fc-b3bc-c48bb8d43192',revision:1,duration_sec:45,interaction_mode:'mixed',props:[],characters:[{id:'host',scene_node_id:'host_root',asset_id:'character.base.soft_adult_01'}],experience:{progression:'guided',kind:'conversation',objective:scenario.objective,requires_motion:true,stages:scenario.steps.map((s:any)=>({id:s.id,goal:s.id,action_ids:[]}))}} as unknown as SessionPlan;
 const scene={session_id:plan.session_id,revision:1,nodes:[{id:'host_root',parent_id:null,role:'task_focus',geometry:{kind:'asset',asset_id:'character.base.soft_adult_01'},position:[0,0,-7],rotation_radians:[0,0,0],scale:[1,1,1],material:{color:'#ffffff',roughness:0.8},animation:'idle',description:'Friendly host'}],viewpoints:[{id:'start',position:[0,1.6,2],description:'Arrival'}],initial_viewpoint_id:'start',events:[],interactions:[],scenario,motion_paths:[{id:'approach',purpose:'walk',interpolation:'smooth',points:[{at_seconds:6,position:[0,1.6,-4]}]}]} as unknown as SceneSpec;
 return {plan,scene,audio:{session_id:plan.session_id,revision:1,layers:[]} as unknown as AudioPlan};
}
test('a guided experience moves, opens natural conversation and completes without commands',()=>{
 const x=setup();validate('ScenarioSpec',x.scene.scenario);assert.deepEqual(sceneIssues(x.plan,x.scene,x.audio),[]);
});

test('action experiences stay silent; dialogue during movement belongs to conversation',()=>{
 const x=setup();x.plan.experience!.kind='action';
 assert.ok(sceneIssues(x.plan,x.scene,x.audio).some(i=>i.rule==='task_focus'));
 x.scene.scenario!.dialogue_policy='disabled';
 for(const step of x.scene.scenario!.steps){delete step.conversation_target;step.prompt='';step.announce_on_entry=false;}
 assert.deepEqual(sceneIssues(x.plan,x.scene,x.audio),[]);
 x.plan.experience!.kind='conversation';
 assert.ok(sceneIssues(x.plan,x.scene,x.audio).some(i=>i.rule==='conversation'));
});
test('guided generation rejects command checklists and stages that cannot advance by themselves',()=>{
 const x=setup();x.scene.scenario!.steps[0].actions.push({id:'walk',label:'Walk',phrases:['walk forward'],operations:[],next_step_id:null});
 delete x.scene.scenario!.steps[0].completion;
 assert.ok(sceneIssues(x.plan,x.scene,x.audio).some(i=>i.rule==='guided'));
});
test('the final step cannot be the start of an ongoing conversation',()=>{
 const x=setup();x.scene.scenario!.steps.at(-1)!.conversation_target='host';
 assert.ok(sceneIssues(x.plan,x.scene,x.audio).some(i=>i.rule==='terminal'));
});
test('automatic progression starts its completion path and fits inside the selected duration',()=>{
 const x=setup();x.scene.scenario!.steps[0].start_operations=[];x.scene.scenario!.steps[1].completion!.after_seconds=44;
 const issues=sceneIssues(x.plan,x.scene,x.audio);assert.ok(issues.some(i=>i.rule==='guided'));assert.ok(issues.some(i=>i.rule==='clock'));
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sceneIssues,validate,outputSchema} from '../src/contracts.js';
import type {SessionPlan,SceneSpec,AudioPlan} from '../../docs/handoff/contracts.js';
const fixture=JSON.parse(readFileSync(new URL('../../tests/fixtures/motion-scenario.json',import.meta.url),'utf8'));
function setup(){
 const plan={session_id:'ae48f5d5-aa24-4f9a-a3c1-e8b2b04d9af8',revision:1,duration_sec:60,interaction_mode:'navigation',characters:[],experience:structuredClone(fixture.experience)} as unknown as SessionPlan;
 const scene={session_id:plan.session_id,revision:1,nodes:[{id:'exit',parent_id:null,role:'task_focus',geometry:{kind:'box',size:[1,2,0.2]},position:[0,80,-3],rotation_radians:[0,0,0],scale:[1,1,1],material:{color:'#cccccc',roughness:0.7},animation:'none',description:'Cabin exit'}],viewpoints:[{id:'start',position:fixture.initial_position,description:'Cabin doorway'}],initial_viewpoint_id:'start',events:[],interactions:[],scenario:structuredClone(fixture.scenario),motion_paths:structuredClone(fixture.motion_paths)} as unknown as SceneSpec;
 const audio={session_id:plan.session_id,revision:1,layers:[]} as unknown as AudioPlan;
 return {plan,scene,audio};
}
test('action scenario requires real motion and ordered, executable stages',()=>{
 const {plan,scene,audio}=setup();validate('ScenarioSpec',scene.scenario);
 for(const path of scene.motion_paths!)validate('MotionPath',path);
 assert.deepEqual(sceneIssues(plan,scene,audio),[]);
});

test('audio identity and schedule failures are rejected before native playback',()=>{
 const {plan,scene,audio}=setup();
 const layer={id:'wind',asset_id:'wind',role:'ambience' as const,loop:true,gain:0.2,start_active_second:0,end_active_second:60,ramps:[]};
 audio.layers=[layer,{...layer}];
 assert.ok(sceneIssues(plan,scene,audio).some(i=>i.rule==='unique'));
 audio.layers=[layer,{...layer,id:'second_wind'}];
 assert.deepEqual(sceneIssues(plan,scene,audio),[]); // One asset may supply independent layers.
 audio.layers[0]={...layer,start_active_second:30,end_active_second:10};
 assert.ok(sceneIssues(plan,scene,audio).some(i=>i.rule==='clock'));
 audio.layers=[{...layer,ramps:[{at_active_second:59,gain:0.5,fade_seconds:2}]}];
 assert.ok(sceneIssues(plan,scene,audio).some(i=>i.rule==='clock'));
});

test('a stage cannot wait for motion launched only in a future stage',()=>{
 const {plan,scene,audio}=setup();
 scene.scenario!.steps[0].actions=[];plan.experience!.stages[0].action_ids=[];
 scene.scenario!.steps[1].start_operations=[{type:'move_viewer',path_id:'freefall'}];
 scene.scenario!.steps[0].completion={trigger:'motion_complete',motion_path_id:'glide_path',next_step_id:'fall'};
 assert.ok(sceneIssues(plan,scene,audio).some(i=>i.path==='/scenario'&&i.rule==='motion'));
 scene.scenario!.steps[0].start_operations=[{type:'move_viewer',path_id:'glide_path'}];
 assert.deepEqual(sceneIssues(plan,scene,audio),[]);
});

test('unsupported texture output is rejected instead of silently ignored',()=>{
 const {plan,scene,audio}=setup();scene.nodes[0].material.texture_asset_id='invented';
 assert.ok(sceneIssues(plan,scene,audio).some(i=>i.rule==='capability'));
});
test('solo scenarios and coherent viewer-carried equipment use the new action runtime',()=>{
 const {plan,scene,audio}=setup();plan.interaction_mode='solo';
 scene.nodes.push({...scene.nodes[0],id:'canopy',role:'prop',description:'Parachute canopy'},
  {...scene.nodes[0],id:'suspension_lines',parent_id:'canopy',role:'prop',description:'Canopy suspension lines'});
 scene.viewer_attached_node_ids=['canopy'];
 assert.deepEqual(sceneIssues(plan,scene,audio),[]);
 scene.viewer_attached_node_ids=[];
 assert.ok(sceneIssues(plan,scene,audio).some(i=>i.rule==='architecture_only'));
});
test('platform conversation is not an acceptable substitute for a moving activity',()=>{
 const {plan,scene,audio}=setup();scene.motion_paths=[];
 for(const step of scene.scenario!.steps){step.start_operations=[];for(const action of step.actions)action.operations=[{type:'narrate',text:'How does skydiving feel?'}];}
 const issues=sceneIssues(plan,scene,audio);
 assert.ok(issues.some(i=>i.rule==='motion'));assert.ok(issues.some(i=>i.rule==='task_action'));
});
test('unplanned characters and backward stage transitions are rejected',()=>{
 const {plan,scene,audio}=setup();scene.nodes.push({...scene.nodes[0],id:'random_instructor',role:'character',geometry:{kind:'asset',asset_id:'character.base.neutral_humanoid_01'}});
 scene.scenario!.steps[1].actions[0].next_step_id='exit';
 const issues=sceneIssues(plan,scene,audio);
 assert.ok(issues.some(i=>i.rule==='unplanned_character'));assert.ok(issues.some(i=>i.rule==='sequence'));
});
test('motion uses increasing times, existing paths, and matching planned action IDs',()=>{
 const {plan,scene,audio}=setup();scene.motion_paths![0].points[1].at_seconds=1;
 scene.scenario!.steps[0].actions[0].id='talk_instead';scene.scenario!.steps[0].actions[0].operations=[{type:'move_viewer',path_id:'missing'}];
 const issues=sceneIssues(plan,scene,audio);
 assert.ok(issues.some(i=>i.rule==='motion'));assert.ok(issues.some(i=>i.rule==='reference'));assert.ok(issues.some(i=>i.rule==='plan_match'));
});
test('new provider output requires scenario fields while legacy saved schemas remain additive',()=>{
 assert.ok(outputSchema('SessionPlan').required.includes('experience'));
 assert.ok(outputSchema('SceneSpec').required.includes('scenario'));
 assert.ok(outputSchema('SceneSpec').required.includes('motion_paths'));
});
test('motion cannot be a stationary path and attachments must be coherent assemblies',()=>{
 const {plan,scene,audio}=setup();
 for(const path of scene.motion_paths!)for(const p of path.points)p.position=[...fixture.initial_position];
 assert.ok(sceneIssues(plan,scene,audio).some(i=>i.rule==='motion'));
 scene.viewer_attached_node_ids=['missing'];
 assert.ok(sceneIssues(plan,scene,audio).some(i=>i.rule==='reference'));
 scene.nodes.push({...scene.nodes[0],id:'panel',parent_id:'exit',role:'environment'});
 scene.viewer_attached_node_ids=['exit','panel'];
 assert.ok(sceneIssues(plan,scene,audio).some(i=>i.rule==='hierarchy'));
});
test('swim and race motion and AI-authored approved props use general capabilities',()=>{
 const {plan,scene,audio}=setup();plan.props=['Ocean buoy'];
 scene.nodes.push({...scene.nodes[0],id:'buoy',role:'prop',prop_name:'Ocean buoy',geometry:{kind:'sphere',radius:0.4}});
 assert.deepEqual(sceneIssues(plan,scene,audio),[]);
 for(const purpose of ['run','swim','walk','climb','ride','other'])validate('MotionPath',{...fixture.motion_paths[0],purpose});
 scene.motion_paths!.push({...structuredClone(scene.motion_paths![0]),id:'buoy_route'});
 scene.scenario!.steps[0].start_operations=[{type:'move_node',node_id:'buoy',path_id:'buoy_route',face_motion:true}];
 assert.deepEqual(sceneIssues(plan,scene,audio),[]);
 scene.nodes.at(-1)!.prop_name='Unplanned object';
 assert.ok(sceneIssues(plan,scene,audio).some(i=>i.rule==='prop_match'));
});
test('commands may recur across stages while duplicate IDs within a stage are rejected',()=>{
 const {plan,scene,audio}=setup();
 for(const i of [0,1]){scene.scenario!.steps[i].actions[0].id='continue';plan.experience!.stages[i].action_ids=['continue'];}
 assert.deepEqual(sceneIssues(plan,scene,audio),[]);
 scene.scenario!.steps[1].actions.push(structuredClone(scene.scenario!.steps[1].actions[0]));
 plan.experience!.stages[1].action_ids.push('continue');
 assert.ok(sceneIssues(plan,scene,audio).some(i=>i.rule==='unique'));
});
test('live character conversation commands cannot be shadowed by local scripted actions',()=>{
 const {plan,scene,audio}=setup();plan.experience!.kind='conversation';scene.scenario!.dialogue_policy='on_request';
 scene.scenario!.steps[0].actions[0].phrases=['ask Maya'];
 assert.ok(sceneIssues(plan,scene,audio).some(i=>i.rule==='reserved_command'));
});

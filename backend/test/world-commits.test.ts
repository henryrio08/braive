import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {prepareWorldCommit,publishWorldCommit,type ApprovedWorld,type WorldCommitInput} from '../src/world-commits.js';
import {assertCurrentDialogue} from '../src/dialogue.js';
import {AppError} from '../src/contracts.js';
import {parseImageInfo} from '../src/assets.js';
import type {AudioPlan,DialogueRequest,SceneSpec,SessionPlan} from '../../docs/handoff/contracts.js';

const SESSION='c36a8c25-43c2-46fc-b3bc-c48bb8d43192';

function fixture(revision:number){
 const plan={schema_version:'1',session_id:SESSION,revision,topic:'Work table',task_instruction:'Stand at the work table',setting_brief:'A quiet room with a table.',props:[],intensity:{summary:'Gentle',dimensions:[]},intensity_1_10:2,duration_sec:30,narrator_intro_8s:'Welcome. To stop at any time, just say STOP!',intro_target_seconds:8,narrator_beats:[],characters:[{id:'neighbor_1',name:'Maya',role:'neighbor',appearance_brief:'Friendly stylized adult with a warm appearance.',goal:'Help the participant settle in.',behavior_boundaries:['Keep conversation friendly.'],voice_id:'default',scene_node_id:'char_node',asset_id:'character.base.soft_adult_01'}],interaction_mode:'solo',tool_calls:[],topic_short:'Work table',stop_reminder:'To stop at any time, just say STOP!',audio_brief:'Quiet room ambience.',safety:{decision:'ok',reason:'Suitable for practice.',practice_preserving_alternative:''}} as unknown as SessionPlan;
 const node=(id:string,role:string,geometry:unknown,position:number[])=>({id,parent_id:null,role,geometry,position,rotation_radians:[0,0,0],scale:[1,1,1],material:{color:'#aabbcc',roughness:0.8},animation:'none',description:id,collision_role:'solid',support_node_id:null});
 const scene={schema_version:'1',session_id:SESSION,revision,description:'A quiet room.',nodes:[node('floor','environment',{kind:'box',size:[20,0.2,20]},[0,-0.1,0]),node('focus','task_focus',{kind:'asset',asset_id:'furniture.chair.classic_chair_01'},[0,0,-3]),{...node('char_node','character',{kind:'asset',asset_id:'character.base.soft_adult_01'},[2,0,-3]),material:{color:'#ffffff',roughness:0.8}}],viewpoints:[{id:'start',position:[0,1.6,0],description:'Start'}],initial_viewpoint_id:'start',lighting:{ambient_color:'#ffffff',ambient_intensity:0.5,key_direction:[0,-1,-1],key_intensity:0.7},atmosphere:{background_color:'#aabbcc',fog_density:0},interactions:[],events:[{at_active_second:1,operation:{type:'narrate',text:'Welcome'}}],stereo:{presentation:'stereographic',units:'meters',coordinate_system:'right_handed_y_up',eye_calibration:'device_viewer_profile',camera_control:'app_owned'},reveal:{black_intro_seconds:8,fade_seconds:1.5,blur_to_clear_seconds:1.5}} as unknown as SceneSpec;
 const audio={schema_version:'1',session_id:SESSION,revision,layers:[],transition_whoosh_asset_id:'whoosh',duck_gain_during_speech:0.25,rationale:'Quiet room.'} as unknown as AudioPlan;
 return {plan,scene,audio};
}
function input(revision:number,expected_revision:number):WorldCommitInput {
 const {plan,scene,audio}=fixture(revision);
 return {session_id:SESSION,expected_revision,revision,plan,scene,audio};
}
function maps(){return {approved:new Map<string,ApprovedWorld>(),revisions:new Map<string,number>()};}

test('new-session commit publishes and revisions advance',()=>{
 const {approved,revisions}=maps();
 const first=input(1,0); const world=prepareWorldCommit(first,approved,revisions);
 // prepare is pure: nothing published until publishWorldCommit
 assert.equal(approved.has(SESSION),false); assert.equal(revisions.has(SESSION),false);
 publishWorldCommit(first,world,approved,revisions);
 assert.equal(approved.get(SESSION)?.plan.session_id,SESSION);
 assert.equal(revisions.get(SESSION),1);
 const second=input(2,1); const world2=prepareWorldCommit(second,approved,revisions);
 publishWorldCommit(second,world2,approved,revisions);
 assert.equal(revisions.get(SESSION),2);
 assert.equal(approved.get(SESSION)?.scene.revision,2);
});

test('stale expected_revision is a 409 conflict and does not publish',()=>{
 const {approved,revisions}=maps();
 const first=input(1,0); publishWorldCommit(first,prepareWorldCommit(first,approved,revisions),approved,revisions);
 assert.throws(()=>prepareWorldCommit(input(2,0),approved,revisions),(e:any)=>e instanceof AppError&&e.code==='CONFLICT'&&e.status===409);
 assert.equal(revisions.get(SESSION),1);
});

test('revision skipping is a 409 conflict',()=>{
 const {approved,revisions}=maps();
 const first=input(1,0); publishWorldCommit(first,prepareWorldCommit(first,approved,revisions),approved,revisions);
 assert.throws(()=>prepareWorldCommit(input(3,1),approved,revisions),(e:any)=>e instanceof AppError&&e.code==='CONFLICT'&&e.status===409);
 assert.equal(revisions.get(SESSION),1);
 // a brand-new session must also start at expected_revision 0
 const fresh=maps();
 assert.throws(()=>prepareWorldCommit(input(1,5),fresh.approved,fresh.revisions),(e:any)=>e.code==='CONFLICT'&&e.status===409);
});

test('dialogue guard accepts the committed world (edit -> dialogue regression)',()=>{
 const {approved,revisions}=maps();
 const first=input(1,0); publishWorldCommit(first,prepareWorldCommit(first,approved,revisions),approved,revisions);
 const stored=approved.get(SESSION)!;
 const request={schema_version:'1',session_id:SESSION,revision:1,turn_id:'b7583b16-bb51-48f6-8b8b-c81d7d3dbe5f',character_id:'neighbor_1',user_utterance:'Hello',recent_turns:[],context_summary:'Settling in',remaining_seconds:60,available_choices:[]} as DialogueRequest;
 assert.doesNotThrow(()=>assertCurrentDialogue(request,stored.plan,revisions.get(SESSION)));
 assert.throws(()=>assertCurrentDialogue({...request,revision:2},stored.plan,revisions.get(SESSION)),(e:any)=>e.code==='CONFLICT');
});

test('invalid added character is rejected by prepareWorldCommit validation',()=>{
 const {approved,revisions}=maps();
 const bad=input(1,0);
 (bad.plan.characters as any[]).push({id:'extra_1',name:'Extra',role:'helper',goal:'Help',behavior_boundaries:[],voice_id:'default',scene_node_id:'extra_node'});
 assert.throws(()=>prepareWorldCommit(bad,approved,revisions),(e:any)=>e instanceof AppError);
 assert.equal(approved.has(SESSION),false); assert.equal(revisions.has(SESSION),false);
});

test('parseImageInfo reads the real bundled wood PNG and rejects GLB bytes',()=>{
 const wood=readFileSync(new URL('../../ios/Braive/Resources/Textures/wood.png',import.meta.url));
 assert.deepEqual(parseImageInfo(wood),{format:'png',width:256,height:256});
 const glb=readFileSync(new URL('../../assets/lowpoly_cc0/character/base/character.base.soft_adult_01.glb',import.meta.url));
 assert.throws(()=>parseImageInfo(glb),/Unsupported image format/);
});

test('parseImageInfo scans JPEG SOF markers',()=>{
 // SOI, SOF0 (height 256, width 512), EOI
 const jpeg=Buffer.from([0xff,0xd8,0xff,0xc0,0x00,0x11,0x08,0x01,0x00,0x02,0x00,0x03,0x01,0x22,0x00,0x02,0x11,0x01,0x03,0x11,0x01,0xff,0xd9]);
 assert.deepEqual(parseImageInfo(jpeg),{format:'jpeg',width:512,height:256});
 assert.throws(()=>parseImageInfo(Buffer.from('not an image')),/Unsupported image format/);
});

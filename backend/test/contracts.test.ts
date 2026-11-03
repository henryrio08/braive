import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sceneIssues, planIssues, validate, validateProviderOutput, AppError, outputSchema } from '../src/contracts.js';
import {assetManifest} from '../src/assets.js';
import { model } from '../src/meta.js';
import type { SessionPlan, SceneSpec, AudioPlan } from '../../docs/handoff/contracts.js';
const plan = {session_id:'ae48f5d5-aa24-4f9a-a3c1-e8b2b04d9af8', revision:1, duration_sec:60, interaction_mode:'solo', characters:[]} as unknown as SessionPlan;
const node=(id:string,parent_id:string|null=null)=>({id,parent_id,role:'task_focus',geometry:{kind:'asset',asset_id:assetManifest.find(a=>a.category==='furniture' && a.subcategory==='chair')!.id},position:[0,1,-3],rotation_radians:[0,0,0],scale:[1,1,1],material:{color:'#ffffff',roughness:0.5},animation:'none',description:'A recognizable lectern'});
const scene=()=>({...plan,nodes:[node('lectern')],viewpoints:[{id:'start',position:[0,1.6,0],description:'Speaking position'}],initial_viewpoint_id:'start',interactions:[],events:[{at_active_second:1,operation:{type:'narrate',text:'Begin your opening sentence.'}}]}) as unknown as SceneSpec;
const audio={session_id:plan.session_id,revision:1,layers:[]} as unknown as AudioPlan;
test('basic scene graph passes cross-field validation',()=>assert.deepEqual(sceneIssues(plan,scene(),audio),[]));
test('cycles cannot reach renderer',()=>{const s=scene();s.nodes[0].parent_id='lectern';assert.ok(sceneIssues(plan,s,audio).some(i=>i.rule==='cycle'));});
test('stale specialist output cannot commit',()=>{const s=scene();s.revision=2;assert.ok(sceneIssues(plan,s,audio).some(i=>i.rule==='revision'));});
test('invalid route and duplicate IDs fail together',()=>{const s=scene();s.nodes.push(s.nodes[0]);s.events.push({at_active_second:4,operation:{type:'viewpoint_transition',destination_id:'missing',transition:'fade'}});const issues=sceneIssues(plan,s,audio);assert.ok(issues.some(i=>i.rule==='unique'));assert.ok(issues.some(i=>i.rule==='reference'));});
test('positive geometry and timed events enforced',()=>{const s=scene();s.nodes.push({...s.nodes[0],id:'floor',role:'environment',geometry:{kind:'sphere',radius:-1}});s.events[0].at_active_second=61;assert.equal(sceneIssues(plan,s,audio).length,2);});
test('navigation requires operational routes',()=>{assert.ok(sceneIssues({...plan,interaction_mode:'navigation'},scene(),audio).some(i=>i.rule==='navigation'));});
test('OpenAPI input bounds enforced',()=>assert.throws(()=>validate('PlanRequest',{}),AppError));
test('Meta spending is denied before network access',async()=>{const previous=process.env.BRAIVE_ALLOW_META;process.env.BRAIVE_ALLOW_META='false';try{await assert.rejects(model('SessionPlan',{},'',AbortSignal.timeout(20)),/spending is disabled/);}finally{process.env.BRAIVE_ALLOW_META=previous;}});

test('all project schema references resolve',()=>{
 for(const name of ['SessionPlan','SceneSpec','AudioPlan','DialogueRequest','DialogueResult','FeedbackResult','AdaptationResult','SessionRecord']) {
  assert.throws(()=>validate(name,{}),AppError);
 }
});


test('provider prompts include only reachable schema definitions',()=>{
 const audio=outputSchema('AudioPlan');
 assert.ok(audio.$defs.AudioLayer);
 assert.equal(audio.$defs.DialogueRequest,undefined);
 assert.equal(audio.$defs.SceneSpec,undefined);
 assert.ok(JSON.stringify(audio).length<6000);
 assert.ok(!JSON.stringify(audio).includes('#/components/'));
 assert.ok(outputSchema('SessionPlan').$defs.Character.required.includes('asset_id'));
});
test('new output enforces review and collision metadata while saved schemas stay additive',()=>{
 const generated=outputSchema('SceneSpec');
 assert.ok(generated.$defs.ScenarioStep.required.includes('review_viewpoint_id'));
 assert.ok(generated.$defs.SceneNode.required.includes('collision_role'));
 assert.ok(generated.required.includes('construction_plan')&&generated.required.includes('environment'));
 assert.ok(outputSchema('SessionPlan').required.includes('construction_brief'));
 assert.equal(generated.properties.construction_report,undefined);
 assert.throws(()=>validateProviderOutput('SceneSpec',{}),AppError);
});

test('environment changes validate explicit fog in every operation location',()=>{
 const s=scene();s.view_distance_meters=50;
 const environment={mode:'interior',sky:{kind:'solid',horizon_color:'#aabbcc',zenith_color:'#aabbcc',ground_color:'#aabbcc',sun_color:'#ffffff',sun_size_degrees:2,haze:0,cloud_coverage:0},fog:{color:'#aabbcc',start_meters:10,end_meters:60},lighting_environment_intensity:0} as const;
 const op={type:'set_environment',background_color:'#aabbcc',fog_density:0,environment} as const;
 s.events=[{at_active_second:1,operation:op}];
 assert.ok(sceneIssues(plan,s,audio).some(i=>i.path==='/environment/fog'));
 s.events=[];s.interactions=[{id:'change',prompt:'',trigger:'user_request',choices:[{id:'change',label:'Change',intent_examples:[],operations:[op]}]}];
 assert.ok(sceneIssues(plan,s,audio).some(i=>i.path==='/environment/fog'));
 (environment.fog as {end_meters:number}).end_meters=40;
 assert.ok(!sceneIssues(plan,s,audio).some(i=>i.path==='/environment/fog'));
});

test('environmental surface profiles cannot overwrite approved character materials',()=>{
 const s=scene();s.nodes[0].geometry={kind:'asset',asset_id:'character.base.soft_adult_01'};s.nodes[0].role='character';
 const surface={profile:'water',scale:1,strength:0.03,speed:0.3} as const;
 s.events=[{at_active_second:1,operation:{type:'set_material',node_id:'lectern',material:{color:'#ffffff',roughness:0.5,surface}}}];
 assert.ok(sceneIssues(plan,s,audio).some(i=>i.path==='/operations/material/surface'));
 s.nodes[0].material.surface=surface;
 assert.ok(sceneIssues(plan,s,audio).some(i=>i.path.includes('/nodes/')&&i.rule==='palette'));
});


test('unknown mesh IDs are rejected by shared manifest',()=>{const s=scene();s.nodes[0].geometry={kind:'asset',asset_id:'furniture.podium.invented'};assert.ok(sceneIssues(plan,s,audio).some(i=>i.rule==='asset'));});
test('characters require registered skinned bases and preserve coordinator appearance',()=>{
 const s=scene();s.nodes[0].role='character';const p={...plan,characters:[{id:'speaker',scene_node_id:'lectern',color_hex:'#33AABB'}]} as unknown as SessionPlan;
 assert.ok(sceneIssues(p,s,audio).some(i=>i.rule==='neutral_character'));
 s.nodes[0].geometry={kind:'asset',asset_id:'character.base.neutral_humanoid_01'};
 assert.ok(sceneIssues(p,s,audio).some(i=>i.rule==='character_color'));
 s.nodes[0].material.color='#33AABB';s.nodes[0].role='task_focus';assert.deepEqual(sceneIssues(p,s,audio),[]);
 p.characters[0].asset_id='character.base.casual_adult_01';
 assert.ok(sceneIssues(p,s,audio).some(i=>i.rule==='character_asset'));
 s.nodes[0].geometry={kind:'asset',asset_id:p.characters[0].asset_id};assert.deepEqual(sceneIssues(p,s,audio),[]);
 s.nodes[0].animation='sit';assert.ok(sceneIssues(p,s,audio).some(i=>i.rule==='supported_pose'));
 p.characters[0].asset_id='character.base.casual_adult_02';s.nodes[0].geometry={kind:'asset',asset_id:p.characters[0].asset_id};assert.deepEqual(sceneIssues(p,s,audio),[]);
});
test('355 licensed IDs and byte-identical backend/iOS manifests',async()=>{
 const {readFileSync}=await import('node:fs');assert.equal(assetManifest.length,355);assert.ok(assetManifest.every(a=>a.license==='CC0-1.0'));
 assert.equal(readFileSync(new URL('../assets/asset_manifest.json',import.meta.url),'utf8'),readFileSync(new URL('../../ios/Braive/Resources/asset_manifest.json',import.meta.url),'utf8'));
});
test('compact generation catalog preserves every licensed asset and its complexity',async()=>{
 const {meshCatalog}=await import('../src/assets.js');
 const entries=Object.values(meshCatalog).flat();
 assert.equal(entries.length,355);
 assert.equal(new Set(entries.map(([id])=>id)).size,355);
 for(const asset of assetManifest)assert.deepEqual(entries.find(([id])=>id===asset.id),[asset.id,asset.approx_tris]);
});
test('coordinator budgets real skeleton node costs before scene construction',()=>{
 const p={...plan,narrator_intro_8s:'To stop at any time, just say STOP!',stop_reminder:'To stop at any time, just say STOP!',narrator_beats:[],tool_calls:[],
  characters:Array.from({length:12},(_,i)=>({id:'person_'+i,scene_node_id:'person_root_'+i,asset_id:'character.base.casual_adult_01',voice_id:'default'}))} as unknown as SessionPlan;
 assert.ok(planIssues(p).some(i=>i.rule==='budget'));
 p.characters=p.characters.slice(0,8);assert.deepEqual(planIssues(p),[]);
});

test('distinct approved characters cannot share one scene root',()=>{
 const p={...plan,narrator_intro_8s:'STOP',stop_reminder:'STOP',narrator_beats:[],tool_calls:[],characters:
  ['a','b'].map(id=>({id,scene_node_id:'shared',voice_id:'default',asset_id:'character.base.neutral_humanoid_01'}))} as unknown as SessionPlan;
 assert.ok(planIssues(p).some(i=>i.rule==='unique'&&i.path==='/characters'));
});
test('the server and phone agree on the first scenario step',()=>{
 const s=scene();s.scenario={objective:'test',initial_step_id:'last',dialogue_policy:'disabled',steps:[
  {id:'first',prompt:'',terminal:false,actions:[],start_operations:[],completion:{trigger:'after_seconds',after_seconds:1,next_step_id:'last'}},
  {id:'last',prompt:'',terminal:true,actions:[],start_operations:[]}]};
 assert.ok(sceneIssues(plan,s,audio).some(i=>i.rule==='reference'&&i.message.includes('initial step')));
});

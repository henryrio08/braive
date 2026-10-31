import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sceneIssues, validate, AppError, outputSchema } from '../src/contracts.js';
import { model } from '../src/meta.js';
import type { SessionPlan, SceneSpec, AudioPlan } from '../../docs/handoff/contracts.js';
const plan = {session_id:'ae48f5d5-aa24-4f9a-a3c1-e8b2b04d9af8', revision:1, duration_sec:60, interaction_mode:'solo', characters:[]} as unknown as SessionPlan;
const node=(id:string,parent_id:string|null=null)=>({id,parent_id,role:'task_focus',geometry:{kind:'box',size:[1,1,1]},position:[0,1,-3],rotation_radians:[0,0,0],scale:[1,1,1],material:{color:'#ffffff',roughness:0.5},animation:'none',description:'A recognizable lectern'});
const scene=()=>({...plan,nodes:[node('lectern')],viewpoints:[{id:'start',position:[0,1.6,0],description:'Speaking position'}],initial_viewpoint_id:'start',interactions:[],events:[{at_active_second:1,operation:{type:'narrate',text:'Begin your opening sentence.'}}]}) as unknown as SceneSpec;
const audio={session_id:plan.session_id,revision:1,layers:[]} as unknown as AudioPlan;
test('basic scene graph passes cross-field validation',()=>assert.deepEqual(sceneIssues(plan,scene(),audio),[]));
test('cycles cannot reach renderer',()=>{const s=scene();s.nodes[0].parent_id='lectern';assert.ok(sceneIssues(plan,s,audio).some(i=>i.rule==='cycle'));});
test('stale specialist output cannot commit',()=>{const s=scene();s.revision=2;assert.ok(sceneIssues(plan,s,audio).some(i=>i.rule==='revision'));});
test('invalid route and duplicate IDs fail together',()=>{const s=scene();s.nodes.push(s.nodes[0]);s.events.push({at_active_second:4,operation:{type:'viewpoint_transition',destination_id:'missing',transition:'fade'}});const issues=sceneIssues(plan,s,audio);assert.ok(issues.some(i=>i.rule==='unique'));assert.ok(issues.some(i=>i.rule==='reference'));});
test('positive geometry and timed events enforced',()=>{const s=scene();s.nodes[0].geometry={kind:'sphere',radius:-1};s.events[0].at_active_second=61;assert.equal(sceneIssues(plan,s,audio).length,2);});
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
});

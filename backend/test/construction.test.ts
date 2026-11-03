import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compileConstruction,constructionRequirements} from '../src/construction.js';
import {transform,inverse,point,multiply,identity} from '../src/spatial-math.js';
import {sceneIssues} from '../src/contracts.js';
import type {SessionPlan,SceneSpec,SceneNode,AudioPlan} from '../../docs/handoff/contracts.js';
function setup(){
 const plan={session_id:'c36a8c25-43c2-46fc-b3bc-c48bb8d43192',revision:1,duration_sec:30,task_instruction:'Stand at the work table',topic:'Work table',props:['Table'],characters:[],experience:{kind:'action',progression:'guided',objective:'Inspect the table',requires_motion:false,stages:[{id:'look',goal:'Inspect',action_ids:[]},{id:'done',goal:'Finish',action_ids:[]}]}} as unknown as SessionPlan;
 const node=(id:string,position:number[],size:number[]):SceneNode=>({id,parent_id:null,role:'environment',geometry:{kind:'box',size},position,rotation_radians:[0,0,0],scale:[1,1,1],material:{color:'#aabbcc',roughness:0.8},animation:'none',description:id});
 const scene={session_id:plan.session_id,revision:1,nodes:[node('floor',[0,-0.1,0],[20,0.2,20]),{...node('table',[1,4,-3],[2,1,1]),role:'task_focus',prop_name:'Table'}],viewpoints:[{id:'start',position:[0,1.6,0],description:'Start'}],initial_viewpoint_id:'start',motion_paths:[],events:[],interactions:[],scenario:{progression:'guided',objective:'Inspect',dialogue_policy:'disabled',initial_step_id:'look',steps:[{id:'look',prompt:'',terminal:false,start_operations:[],actions:[],completion:{trigger:'after_seconds',after_seconds:20,next_step_id:'done'}},{id:'done',prompt:'',terminal:true,start_operations:[],actions:[]}]},construction_plan:{version:'1',seed:42,requirements:[],zones:[{id:'room',center:[0,2,0],size:[20,4,20],kind:'interior'}],assemblies:[{id:'table_assembly',root_node_id:'table',member_node_ids:['table'],zone_id:'room',requirement_ids:[]}],anchors:[{id:'floor_top',node_id:'floor',kind:'support',position:[0,0.1,0],footprint:[10,10]}],relations:[{id:'ground_table',kind:'on',subject_id:'table',target_id:'floor',anchor_id:'floor_top',offset:[1,0,-3],clearance:0,tolerance:0.01,required:true}],routes:[]}} as unknown as SceneSpec;
 scene.construction_plan!.requirements=constructionRequirements(plan).map(r=>({requirement_id:r.id,node_ids:r.kind==='prop'||r.kind==='task'?['table']:[],stage_ids:r.kind==='stage'?[r.target]:r.kind==='task'?['look']:[],path_ids:[]}));
 return {plan,scene};
}
test('construction grounds an authored assembly without changing approved task or stages',()=>{
 const {plan,scene}=setup(),compiled=compileConstruction(plan,scene);
 assert.equal(compiled.nodes[1].position[1],0.5);assert.equal(compiled.nodes[1].support_node_id,'floor');
 assert.equal(scene.nodes[1].position[1],4);assert.deepEqual(compiled.scenario,scene.scenario);
 assert.deepEqual(sceneIssues(plan,compiled,{session_id:plan.session_id,revision:1,layers:[]} as unknown as AudioPlan),[]);
 assert.deepEqual(compileConstruction(plan,compiled),compiled);
});
test('missing requirement realization and invented anchors fail rather than substitute',()=>{
 const {plan,scene}=setup();scene.construction_plan!.requirements.pop();assert.throws(()=>compileConstruction(plan,scene),/references require repair/);
 const x=setup();x.scene.construction_plan!.anchors[0].position=[0,5,0];assert.throws(()=>compileConstruction(x.plan,x.scene),/references require repair/);
});
test('hard constraints fail on poor fit; decoration can report a soft warning',()=>{
 const {plan,scene}=setup();scene.nodes[1].position=[1,0.5,-3];scene.construction_plan!.relations=[{id:'fit',kind:'inside',subject_id:'table',target_id:'tiny',offset:[0,0,0],clearance:0,tolerance:0.01,required:true}];
 scene.construction_plan!.zones.push({id:'tiny',center:[0,2,0],size:[0.5,4,0.5],kind:'interior'});assert.throws(()=>compileConstruction(plan,scene),/constraints require repair/);
 scene.construction_plan!.relations[0].required=false;assert.throws(()=>compileConstruction(plan,scene),/references require repair/);
 const decoration=structuredClone(scene.nodes[1]);decoration.id='decoration';decoration.role='environment';delete decoration.prop_name;scene.nodes.push(decoration);
 scene.construction_plan!.relations[0].subject_id='decoration';
 assert.ok(compileConstruction(plan,scene).construction_report!.warnings.length>0);
});
test('cycles and conflicting later placement cannot quietly unground a task object',()=>{
 const {plan,scene}=setup();scene.construction_plan!.relations.push({id:'shift',kind:'near',subject_id:'table',target_id:'viewer',offset:[0,4,-3],clearance:0,tolerance:0.01,required:true});assert.throws(()=>compileConstruction(plan,scene),/constraints require repair/);
 const x=setup();x.scene.construction_plan!.relations.push({id:'cycle',kind:'near',subject_id:'floor',target_id:'table',offset:[0,0,0],clearance:0,tolerance:0.01,required:true});assert.throws(()=>compileConstruction(x.plan,x.scene),/constraints require repair/);
});
test('spatial transforms invert rotated scaled parent frames',()=>{
 const m=transform([4,2,-3],[0.2,0.7,-0.1],[2,0.5,1.5]),p=[1,2,3];
 point(inverse(m),point(m,p)).forEach((v,i)=>assert.ok(Math.abs(v-p[i])<1e-8));
 multiply(m,inverse(m)).forEach((v,i)=>assert.ok(Math.abs(v-identity()[i])<1e-8));
});
test('multi-axis rotations use SceneKit roll-yaw-pitch order',()=>{
 const p=point(transform([0,0,0],[Math.PI/2,Math.PI/2,0],[1,1,1]),[0,1,0]);
 assert.ok(Math.abs(p[0])<1e-8&&Math.abs(p[1])<1e-8&&Math.abs(p[2]-1)<1e-8);
});
test('an explicit anchor can be a facing or clearance target without becoming a node',()=>{
 const {plan,scene}=setup();scene.construction_plan!.relations.push({id:'face_anchor',kind:'faces',subject_id:'table',target_id:'floor_top',offset:[0,0,0],clearance:0,tolerance:0.01,required:true});
 assert.ok(compileConstruction(plan,scene).construction_report!.resolved_relation_ids.includes('face_anchor'));
 scene.construction_plan!.relations.push({id:'clear_anchor',kind:'clear_of',subject_id:'table',target_id:'floor_top',offset:[0,0,0],clearance:50,tolerance:0.01,required:true});
 assert.throws(()=>compileConstruction(plan,scene),/constraints require repair/);
});
test('facing uses final placement rather than the author seed position',()=>{
 const {plan,scene}=setup();scene.construction_plan!.relations[0].offset=[3,0,-3];
 scene.construction_plan!.relations.unshift({id:'look_at_viewer',kind:'faces',subject_id:'table',target_id:'viewer',offset:[0,0,0],clearance:0,tolerance:0.01,required:true});
 const result=compileConstruction(plan,scene);
 assert.ok(Math.abs(result.nodes[1].rotation_radians[1]-Math.PI*0.75)<1e-8);
});

test('ambiguous spatial IDs and point-only containment require explicit repair',()=>{
 const {plan,scene}=setup();scene.construction_plan!.zones[0].id='floor';
 assert.throws(()=>compileConstruction(plan,scene),/references require repair/);
 const x=setup();x.scene.construction_plan!.relations[0].kind='inside';x.scene.construction_plan!.relations[0].target_id='floor_top';delete x.scene.construction_plan!.relations[0].anchor_id;
 assert.throws(()=>compileConstruction(x.plan,x.scene),/references require repair/);
});

test('clearance respects an explicit target anchor and world offset',()=>{
 const {plan,scene}=setup();scene.construction_plan!.relations.push({id:'clear',kind:'clear_of',subject_id:'table',target_id:'floor',anchor_id:'floor_top',offset:[100,0,0],clearance:2,tolerance:0.01,required:true});
 assert.ok(compileConstruction(plan,scene).construction_report!.resolved_relation_ids.includes('clear'));
 scene.construction_plan!.relations[1].offset=[1,0,-3];
 assert.throws(()=>compileConstruction(plan,scene),/constraints require repair/);
});

test('zone fit catches world coordinates mistakenly repeated on a local child',()=>{
 const {plan,scene}=setup();
 const child=structuredClone(scene.nodes[1]);child.id='child';child.parent_id='table';child.position=[0,0,-15];child.geometry={kind:'box',size:[0.2,0.2,0.2]};child.role='prop';delete child.prop_name;scene.nodes.push(child);
 scene.construction_plan!.assemblies[0].member_node_ids.push('child');
 assert.throws(()=>compileConstruction(plan,scene),(e:any)=>e.issues.some((i:any)=>i.rule==='zone_fit'&&i.message.includes('child')));
 child.position=[0,0,0];
 assert.ok(compileConstruction(plan,scene).construction_report);
});

test('water behavior needs a declared medium region and an actual visual surface',()=>{
 const {plan,scene}=setup();
 plan.construction_brief={spatial_intent:'Quiet shallow pool',must_preserve:[],expected_outcomes:[],medium_behavior:{substance:'water',motion:'still',visibility:'clear',participant_motion:'none',unsupported_dynamics:['No buoyancy simulation']}};
 assert.throws(()=>compileConstruction(plan,scene),(e:any)=>e.issues.some((i:any)=>i.rule==='medium'));
 scene.construction_plan!.medium_regions=[{id:'pool',zone_id:'room',medium:'water',surface_node_id:'floor',flow_visual:'ripples',viewer_path_ids:[]}];
 assert.throws(()=>compileConstruction(plan,scene),(e:any)=>e.issues.some((i:any)=>i.rule==='medium'));
 scene.nodes[0].material.surface={profile:'water',scale:1,strength:0.03,speed:0.3};
 assert.ok(compileConstruction(plan,scene).construction_report);
 plan.construction_brief.medium_behavior!.participant_motion='swim';
 assert.throws(()=>compileConstruction(plan,scene),(e:any)=>e.issues.some((i:any)=>i.rule==='motion'));
});

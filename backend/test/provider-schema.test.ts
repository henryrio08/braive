import {test} from 'node:test';
import assert from 'node:assert/strict';
import {AppError,outputSchema,sceneOutputSchema,validate} from '../src/contracts.js';
import type {SessionPlan,AudioPlan} from '../../docs/handoff/contracts.js';
import {experienceSchema} from '../src/experience.js';
import {assetIDs} from '../src/assets.js';
import Ajv from 'ajv';

test('provider schemas are acyclic and fit Meta’s ten-level structured-output limit',()=>{
 for(const name of ['ExperienceDraft','SessionPlan','SceneSpec','AudioPlan','FeedbackResult','AdaptationResult']){
  const schema=name==='ExperienceDraft'?experienceSchema():outputSchema(name);
  function depth(value:any,trail:string[]=[]):number {
   if(!value||typeof value!=='object')return 0;
   if(value.$ref){
    const id=value.$ref.split('/').at(-1);
    assert.ok(schema.$defs[id],`Missing definition ${id}`);
    assert.ok(!trail.includes(id),`Recursive definition ${id}`);
    return depth(schema.$defs[id],[...trail,id]);
   }
   if(value.type==='object')return 1+Math.max(0,...Object.values(value.properties??{}).map(child=>depth(child,trail)));
   if(value.type==='array')return 1+depth(value.items,trail);
   return Math.max(0,...['oneOf','anyOf','allOf'].flatMap(key=>(value[key]??[]).map((child:any)=>depth(child,trail))));
  }
  assert.ok(depth(schema)<=10,`${name} is too deeply nested for constrained decoding`);
 }
});

test('builder geometry rejects placeholders and invented IDs while preserving all registered assets and primitives',()=>{
 const schema=outputSchema('SceneSpec');
 const check=new (Ajv as any)({strict:false}).compile({$defs:schema.$defs,$ref:'#/$defs/Geometry'});
 for(const id of ['', '.', 'invented_pool_floor'])assert.equal(check({kind:'asset',asset_id:id}),false);
 for(const id of assetIDs)assert.equal(check({kind:'asset',asset_id:id}),true,id);
 assert.equal(check({kind:'box',size:[8,0.2,12]}),true);
 assert.equal(check({kind:'plane',width:12,height:8}),true);
 assert.equal(check({kind:'sphere',radius:2}),true);
 assert.equal(check({kind:'cylinder',radius:2,height:1}),true);
 assert.equal(check({kind:'box'}),false);
 const ids=[...assetIDs];
 assert.ok(ids.length<=1000);
 if(ids.length>250)assert.ok(ids.reduce((sum,id)=>sum+id.length,0)<=15000,'Asset enum exceeds the provider string limit');
});

test('motion and construction routes accept floating body depth without changing standing height',()=>{
 const schema=outputSchema('SceneSpec'),ajv=new (Ajv as any)({strict:false});
 const examples={
  MotionPath:{id:'swim_path',purpose:'swim',interpolation:'linear',points:[{at_seconds:10,position:[0,0.6,-2]}]},
  ConstructionRoute:{path_id:'swim_path',stage_ids:['stage_1'],requirement_ids:[],clearance_radius_meters:0.25},
 };
 for(const [name,example] of Object.entries(examples)){
  const check=ajv.compile({$defs:schema.$defs,$ref:`#/$defs/${name}`});
  for(const height of [0.5,0.6,1.6,2.2]){
   const value={...example,eye_height_meters:height};
   assert.equal(check(value),true,`${name} must accept ${height}m`);
   assert.doesNotThrow(()=>validate(name,value),`${name} wire validation must agree at ${height}m`);
  }
  for(const height of [0.49,2.21]){
   const value={...example,eye_height_meters:height};
   assert.equal(check(value),false,`${name} must reject ${height}m`);
   assert.throws(()=>validate(name,value),AppError);
  }
 }
});

test('repair feedback identifies the missing and unexpected schema fields',()=>{
 assert.throws(()=>validate('Material',{invented:1}),(e:any)=>
  e.issues.some((i:any)=>i.message.includes('missingProperty')&&i.message.includes('color'))&&
  e.issues.some((i:any)=>i.message.includes('additionalProperty')&&i.message.includes('invented')));
});

test('rejected model output is internal repair context and is not serialized with an error',()=>{
 const candidate={nodes:[{id:'private_scene_node'}]};
 const error=new AppError('INVALID_MODEL_OUTPUT','Repair required').withModelOutput('SceneSpec',candidate);
 assert.equal(error.modelOutput!.value,candidate);
 assert.equal(JSON.stringify(error).includes('private_scene_node'),false);
});

test('generated reference fields reject dot placeholders, including nested construction data',()=>{
 const schema=outputSchema('SceneSpec');
 const ajv=new (Ajv as any)({strict:false});
 const parent=ajv.compile(schema.$defs.SceneNode.properties.parent_id);
 assert.equal(parent(null),true);assert.equal(parent('assembly_root'),true);
 assert.equal(parent('.'),false);assert.equal(parent(''),false);
 const regions=ajv.compile({$defs:schema.$defs,...schema.$defs.ConstructionPlan.properties.medium_regions});
 const air={id:'air',zone_id:'room',medium:'air',flow_visual:'none',viewer_path_ids:[]};
 assert.equal(regions([air]),true);
 assert.equal(regions([{...air,surface_node_id:'.'}]),false);
 assert.equal(regions([{...air,viewer_path_ids:['.']}]),false);
});

test('scene output restricts known prop, character, cue and stage bindings to the approved plan',()=>{
 const plan={session_id:'6c7aca92-2745-4207-bd82-2681981f873b',revision:3,props:['Work table'],characters:[{id:'host'}],experience:{stages:[{id:'approach'},{id:'done'}]}} as unknown as SessionPlan;
 const audio={layers:[{id:'room_bed'}]} as unknown as AudioPlan;
 const schema=sceneOutputSchema(plan,audio),ajv=new (Ajv as any)({strict:false});
 for(const [property,valid] of [[schema.$defs.SceneNode.properties.prop_name,'Work table'],[schema.$defs.ScenarioStep.properties.conversation_target,'host'],[schema.$defs.ScenarioStep.properties.id,'approach']] as [any,string][]){
  const check=ajv.compile(property);assert.equal(check(valid),true);assert.equal(check('.'),false);assert.equal(check('invented'),false);
 }
 const operations=ajv.compile({$defs:schema.$defs,$ref:'#/$defs/WorldOperation'});
 assert.equal(operations({type:'play_sound',cue_id:'room_bed'}),true);
 assert.equal(operations({type:'play_sound',cue_id:'forest'}),false);
 assert.equal(operations({type:'character_action',character_id:'host',behavior:'speak'}),true);
 assert.equal(operations({type:'character_action',character_id:'invented',behavior:'speak'}),false);
 const solo=sceneOutputSchema({...plan,props:[],characters:[]},{...audio,layers:[]});
 assert.equal(solo.$defs.SceneNode.properties.prop_name,undefined);
 assert.equal(solo.$defs.ScenarioStep.properties.conversation_target,undefined);
 assert.ok(solo.$defs.WorldOperation.oneOf.every((v:any)=>!['play_sound','character_action'].includes(v.properties.type.const)));
 assert.ok(outputSchema('SceneSpec').$defs.SceneNode.properties.prop_name); // No mutation of saved or other request schemas.
});

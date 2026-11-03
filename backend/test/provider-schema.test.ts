import {test} from 'node:test';
import assert from 'node:assert/strict';
import {outputSchema,validate} from '../src/contracts.js';
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

test('builder geometry schema rejects empty and invented assets before construction',()=>{
 const schema=outputSchema('SceneSpec');
 const check=new (Ajv as any)({strict:false}).compile({$defs:schema.$defs,$ref:'#/$defs/Geometry'});
 assert.equal(check({kind:'asset',asset_id:''}),false);
 assert.equal(check({kind:'asset',asset_id:'invented_pool_floor'}),false);
 assert.equal(check({kind:'asset',asset_id:[...assetIDs][0]}),true);
 assert.equal(check({kind:'box',size:[8,0.2,12]}),true);
 assert.equal(check({kind:'box'}),false);
 const ids=[...assetIDs];
 assert.ok(ids.length<=1000);
 if(ids.length>250)assert.ok(ids.reduce((sum,id)=>sum+id.length,0)<=15000,'Asset enum exceeds the provider string limit');
});

test('repair feedback identifies the missing and unexpected schema fields',()=>{
 assert.throws(()=>validate('Material',{invented:1}),(e:any)=>
  e.issues.some((i:any)=>i.message.includes('missingProperty')&&i.message.includes('color'))&&
  e.issues.some((i:any)=>i.message.includes('additionalProperty')&&i.message.includes('invented')));
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {outputSchema,validate} from '../src/contracts.js';

test('provider schemas are acyclic and fit Meta’s ten-level structured-output limit',()=>{
 for(const name of ['SessionPlan','SceneSpec','AudioPlan','FeedbackResult','AdaptationResult']){
  const schema=outputSchema(name);
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

test('repair feedback identifies the missing and unexpected schema fields',()=>{
 assert.throws(()=>validate('Material',{invented:1}),(e:any)=>
  e.issues.some((i:any)=>i.message.includes('missingProperty')&&i.message.includes('color'))&&
  e.issues.some((i:any)=>i.message.includes('additionalProperty')&&i.message.includes('invented')));
});

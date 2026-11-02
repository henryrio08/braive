import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assertCurrentDialogue,completeDialogueResult,dialogueContentSchema,dialogueContext} from '../src/dialogue.js';
import type {DialogueRequest,SessionPlan} from '../../docs/handoff/contracts.js';

const request={schema_version:'1',session_id:'0D7F874A-A86C-4C9B-9913-4077E3E24729',revision:3,
 turn_id:'B7583B16-BB51-48F6-8B8B-C81D7D3DBE5F',character_id:'neighbor_1'} as DialogueRequest;
const content={reply:'We could pair volunteers for watering. What schedule works for you?',behavior:'speak',context_summary:'Discussing watering',operations:[]};
test('model content schema excludes application-owned dialogue routing',()=>{
 const schema=dialogueContentSchema();
 for(const key of ['schema_version','session_id','revision','turn_id','character_id']){
  assert.equal(schema.properties[key],undefined);assert.ok(!schema.required.includes(key));
 }
 assert.ok(schema.required.includes('reply'));assert.ok(schema.required.includes('operations'));
});
test('character content gets exact request routing even when metadata is missing or altered',()=>{
 for(const body of [content,{...content,session_id:request.session_id.toLowerCase(),turn_id:'unrelated',revision:99,character_id:'Maya'}]){
  const result=completeDialogueResult(request,body);
  for(const key of ['session_id','revision','turn_id','character_id'] as const)assert.equal(result[key],request[key]);
  assert.equal(result.reply,content.reply);
 }
});
test('server-owned metadata does not bypass reply or operation validation',()=>{
 assert.throws(()=>completeDialogueResult(request,{...content,reply:42}));
 assert.throws(()=>completeDialogueResult(request,{...content,operations:[{type:'execute_code',code:'untrusted'}]}));
 assert.throws(()=>completeDialogueResult(request,{...content,operations:[{type:'move_viewer',path_id:'unexpected'}]}));
});
test('optional conversation gets concise character context, not the entire generated scene',()=>{
 const saved={plan:{characters:[{id:'neighbor_1',name:'Maya'}],task_instruction:'Present the garden proposal',setting_brief:'Library'},scene:{description:'Sunny library',nodes:[{id:'chair',geometry:{large:'mesh description'}}],viewpoints:[{id:'start'}]},audio:{layers:[]}} as any;
 const context=dialogueContext(request,saved);
 assert.equal(context.character!.name,'Maya');assert.deepEqual(context.world_references.node_ids,['chair']);
 assert.equal('scene' in context,false);assert.equal('approved_plan' in context,false);
 assert.equal(dialogueContentSchema().$defs.WorldOperation.oneOf.length,1);
});
test('dialogue cannot complete against a superseded or missing approved scene',()=>{
 const plan={session_id:request.session_id,revision:3,characters:[{id:'neighbor_1'}]} as SessionPlan;
 assert.doesNotThrow(()=>assertCurrentDialogue(request,plan,3));
 assert.throws(()=>assertCurrentDialogue(request,plan,4));
 assert.throws(()=>assertCurrentDialogue(request,{...plan,revision:4},4));
 assert.throws(()=>assertCurrentDialogue(request,undefined,3));
 assert.throws(()=>assertCurrentDialogue({...request,character_id:'invented'},plan,3));
});

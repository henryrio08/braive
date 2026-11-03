import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assertCurrentDialogue,completeDialogueResult,dialogueContentSchema,dialogueContext} from '../src/dialogue.js';
import type {DialogueRequest,SessionPlan} from '../../docs/handoff/contracts.js';

const request={schema_version:'1',session_id:'0D7F874A-A86C-4C9B-9913-4077E3E24729',revision:3,
 turn_id:'B7583B16-BB51-48F6-8B8B-C81D7D3DBE5F',character_id:'neighbor_1',user_utterance:'How should we arrange watering?',recent_turns:[],context_summary:'Discuss the garden proposal',remaining_seconds:60,available_choices:[]} as DialogueRequest;
const content={reply:'We could pair volunteers for watering. What schedule works for you?',behavior:'speak',context_summary:'Discussing watering',operations:[]};
test('model content schema excludes application-owned dialogue routing',()=>{
 const schema=dialogueContentSchema();
 for(const key of ['schema_version','session_id','revision','turn_id','character_id']){
  assert.equal(key in schema.properties,false);assert.ok(!schema.required.includes(key));
 }
 assert.deepEqual(schema.required,['reply','behavior']);assert.ok(JSON.stringify(schema).length<400);
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
 assert.deepEqual(completeDialogueResult(request,{reply:content.reply,behavior:'speak'}).operations,[]);
});
test('optional conversation gets concise character context, not the entire generated scene',()=>{
 const saved={plan:{characters:[{id:'neighbor_1',name:'Maya',role:'neighbor',goal:'Understand the proposal',behavior_boundaries:[]}],task_instruction:'Present the garden proposal',setting_brief:'Library'},scene:{description:'Sunny library',nodes:[{id:'chair',geometry:{large:'mesh description'}}],viewpoints:[{id:'start'}]},audio:{layers:[]}} as any;
 const context=dialogueContext(request,saved);
 assert.equal(context.character!.name,'Maya');assert.equal('world_references' in context,false);
 assert.equal('scene' in context,false);assert.equal('approved_plan' in context,false);
 assert.equal('operations' in dialogueContentSchema().properties,false);
 const long=dialogueContext({...request,user_utterance:'x'.repeat(10000),recent_turns:Array.from({length:20},()=>({speaker_id:'user',text:'x'.repeat(2000)}))},saved);
 assert.equal(long.user_utterance.length,1800);assert.equal(long.recent_turns.length,6);
 assert.ok(long.recent_turns.every(t=>t.text.length===500));
});
test('dialogue cannot complete against a superseded or missing approved scene',()=>{
 const plan={session_id:request.session_id,revision:3,characters:[{id:'neighbor_1'}]} as SessionPlan;
 assert.doesNotThrow(()=>assertCurrentDialogue(request,plan,3));
 assert.throws(()=>assertCurrentDialogue(request,plan,4));
 assert.throws(()=>assertCurrentDialogue(request,{...plan,revision:4},4));
 assert.throws(()=>assertCurrentDialogue(request,undefined,3));
 assert.throws(()=>assertCurrentDialogue({...request,character_id:'invented'},plan,3));
});

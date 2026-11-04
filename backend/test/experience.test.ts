import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assembleExperience,experienceSchema,planningCapabilities,validateExperience,validateExperienceShape,type ExperienceDraft} from '../src/experience.js';
import type {PlanRequest} from '../../docs/handoff/contracts.js';

function draft():ExperienceDraft {
  return {
    topic:'Quiet observation of a strange moon garden',topic_short:'Moon garden',task_instruction:'Watch the garden unfold',
    setting_brief:'A silver garden with open space and three gently glowing plants',props:['Glowing plants'],
    intensity:{summary:'Gentle',dimensions:[]},intensity_1_10:2,duration_sec:30,
    narrator_intro_8s:'The garden is quiet. To stop at any time, just say STOP!',narrator_beats:[],
    interaction_mode:'solo',audio_brief:'Soft wind',
    safety:{decision:'ok',reason:'Suitable situational practice',practice_preserving_alternative:''},
    construction_brief:{spatial_intent:'An open garden visible at several depths',must_preserve:['Open space'],expected_outcomes:['Experience the quiet garden'],
      medium_behavior:{substance:'air',motion:'still',visibility:'clear',participant_motion:'none',unsupported_dynamics:[]}},
    characters:[],experience:{kind:'action',objective:'Experience the garden',requires_motion:false,
      stages:[{goal:'Settle into the garden',duration_sec:27,sensory_brief:'A breeze moves the leaves',movement:'none',conversation_character_index:null}]},
    audio_layers:[{asset_id:'wind',role:'ambience',loop:true,gain:0.2,start_active_second:0,end_active_second:30,ramps:[]}]
  };
}
const request={schema_version:'1',session_id:'c36a8c25-43c2-46fc-b3bc-c48bb8d43192',revision:5,
  fear_description:'Practice a quiet garden',current_ability:'Keep it gentle',preferences:[],relevant_history:[],history_choice:'not_available',builder_additions:[],use_history:false,chained_rerun:false} satisfies PlanRequest;

test('the same compact draft schema serves author and editor and excludes application mechanics',()=>{
  const schema=experienceSchema();
  for(const key of ['session_id','revision','schema_version','tool_calls','stop_reminder'])assert.equal(schema.properties[key],undefined);
  assert.equal(schema.$defs.ToolCall,undefined);
  for(const key of ['id','scene_node_id','voice_id'])assert.equal(schema.$defs.Character.properties[key],undefined);
  const independent=experienceSchema();schema.properties.topic.maxLength=1;
  assert.equal(independent.properties.topic.maxLength,200);
  validateExperience(draft());
  assert.throws(()=>validateExperience({decision:'accept',plan:draft()}),/Invalid experience plan/);
});

test('local assembly preserves freeform content and produces compatible public contracts with deterministic IDs',()=>{
  const source=draft(),before=structuredClone(source);
  const first=assembleExperience(source,request,'builder_revision'),second=assembleExperience(source,request,'builder_revision');
  assert.deepEqual(first,second);assert.deepEqual(source,before);
  assert.equal(first.plan.session_id,request.session_id);assert.equal(first.plan.revision,5);
  assert.equal(first.plan.topic,source.topic);assert.deepEqual(first.plan.props,source.props);
  assert.deepEqual(first.plan.experience!.stages.map(stage=>stage.id),['stage_1','stage_completed']);
  assert.ok(first.plan.experience!.stages.every(stage=>stage.action_ids.length===0));
  assert.deepEqual(first.plan.tool_calls.filter(call=>['compose_scene','plan_audio'].includes(call.tool)).map(call=>call.execute_when),['builder_revision','builder_revision']);
  assert.equal(first.audio.layers[0].id,'audio_1');assert.equal(first.audio.layers.length,1);
  assert.equal(first.audio.transition_whoosh_asset_id,'whoosh');assert.equal(first.audio.duck_gain_during_speech,0.25);
});

test('invalid audio assets, unsupported spatial playback and impossible sound timing fail before a builder call',()=>{
  const unknown=draft();unknown.audio_layers[0].asset_id='invented-water';
  assert.throws(()=>validateExperience(unknown),/Invalid experience plan/);
  const spatial=draft();Object.assign(spatial.audio_layers[0],{position:[0,0,0]});
  assert.throws(()=>validateExperience(spatial),/Invalid experience plan/);
  const timing=draft();timing.audio_layers[0].end_active_second=31;
  assert.throws(()=>validateExperience(timing),/Invalid experience invariants/);
  const ramps=draft();ramps.audio_layers[0].ramps=[{at_active_second:29,gain:0.1,fade_seconds:3}];
  assert.throws(()=>validateExperience(ramps),/Invalid experience invariants/);
});

test('movement, conversation references and total stage duration are checked before assembly',()=>{
  const timing=draft();timing.experience.stages[0].duration_sec=28;
  assert.throws(()=>validateExperience(timing),/Invalid experience invariants/);
  const moving=draft();moving.experience.requires_motion=true;
  assert.throws(()=>validateExperience(moving),/Invalid experience invariants/);
  const talk=draft();talk.experience.kind='conversation';talk.experience.stages[0].conversation_character_index=0;
  assert.throws(()=>validateExperience(talk),/Invalid experience invariants/);
  const stop=draft();stop.narrator_intro_8s='Welcome';
  assert.throws(()=>validateExperience(stop),/Invalid experience invariants/);
});

test('a stage that explicitly travels after settling remains valid',()=>{
  const source=draft();
  source.experience.requires_motion=true;
  source.experience.stages[0]={...source.experience.stages[0],
    goal:'Settle while floating, then swim toward the shore.',
    sensory_brief:'Start with a stable floating viewpoint, then pass the shoreline plants.',
    movement:'swim'};
  validateExperience(source);
});

test('a structurally valid author draft can reach the editor with a fixable timing mistake',()=>{
  const source=draft();source.experience.stages[0].duration_sec=30;
  validateExperienceShape(source);
  assert.throws(()=>validateExperience(source),/Invalid experience invariants/);
  assert.throws(()=>validateExperienceShape({...source,experience:{stages:'not an array'}}),/Invalid experience plan/);
  const edited=structuredClone(source);edited.experience.stages[0].duration_sec=27;
  validateExperience(edited);
  assembleExperience(edited,request,'setup');
});

test('approved character choices bind to distinct application-owned roots and preserve source appearance',()=>{
  const source=draft();
  const asset=planningCapabilities().character_choices[0].asset_id;
  source.characters=[{name:'Host',role:'Friendly host',appearance_brief:'Approved soft person',goal:'Welcome the participant',behavior_boundaries:['Keep questions friendly'],asset_id:asset}];
  source.experience.kind='conversation';source.interaction_mode='dialogue';source.experience.stages[0].conversation_character_index=0;
  const {plan}=assembleExperience(source,request,'setup');
  assert.equal(plan.characters[0].asset_id,asset);assert.equal(plan.characters[0].id,'character_1');
  assert.equal(plan.characters[0].scene_node_id,'character_node_1');assert.equal(plan.characters[0].voice_id,'default');
  const invalid=structuredClone(source);invalid.characters[0].asset_id='character.base.neutral_humanoid_01';
  assert.throws(()=>validateExperience(invalid),/Invalid experience plan/);
});

test('refused experiences cannot be assembled into a buildable plan',()=>{
  const source=draft();source.safety.decision='refuse';source.safety.reason='Unsupported harmful request';
  assert.throws(()=>assembleExperience(source,request,'setup'),/Unsupported harmful request/);
  const summary=planningCapabilities();assert.ok(!('asset_bounds' in summary));assert.ok(!('assets' in summary));
});

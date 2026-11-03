import Ajv from 'ajv';
import {assetManifest, generationCharacterIDs} from './assets.js';
import {AppError, outputSchema, planIssues, validate, validateProviderOutput} from './contracts.js';
import type {AudioLayer, AudioPlan, Character, ConstructionBrief, PlanRequest, SessionPlan} from '../../docs/handoff/contracts.js';

export const audioAssets = ['forest', 'piano', 'wind', 'room', 'crowd', 'whoosh'] as const;
export const stopReminder = 'To stop at any time, just say STOP!' as const;
export type MovementIntent = 'none'|'walk'|'run'|'swim'|'climb'|'fall'|'glide'|'ride'|'other';
export type ExperienceStage = {
  goal: string; duration_sec: number; sensory_brief: string; movement: MovementIntent;
  conversation_character_index: number|null;
};
export type ExperienceDraft = Omit<SessionPlan,
  'schema_version'|'session_id'|'revision'|'intro_target_seconds'|'stop_reminder'|'tool_calls'|'characters'|'experience'|'construction_brief'> & {
  construction_brief: ConstructionBrief;
  characters: Array<Omit<Character, 'id'|'scene_node_id'|'voice_id'|'color_hex'> & {asset_id:string}>;
  experience: {kind:'action'|'conversation'; objective:string; requires_motion:boolean; stages:ExperienceStage[]};
  audio_layers: Array<Omit<AudioLayer, 'id'|'position'>>;
};

function buildSchema(): any {
  const schema = structuredClone(outputSchema('SessionPlan'));
  for(const key of ['schema_version','session_id','revision','intro_target_seconds','stop_reminder','tool_calls']) {
    delete schema.properties[key];
    schema.required = schema.required.filter((item:string)=>item!==key);
  }
  const character = schema.$defs.Character;
  for(const key of ['id','scene_node_id','voice_id','color_hex']) {
    delete character.properties[key];
    character.required = character.required.filter((item:string)=>item!==key);
  }
  const text = (maxLength:number)=>({type:'string',minLength:1,maxLength});
  schema.$defs.ExperiencePlan = {
    type:'object', additionalProperties:false,
    required:['kind','objective','requires_motion','stages'],
    properties:{
      kind:{type:'string',enum:['action','conversation']}, objective:text(1000), requires_motion:{type:'boolean'},
      stages:{type:'array',minItems:1,maxItems:29,items:{type:'object',additionalProperties:false,
        required:['goal','duration_sec','sensory_brief','movement','conversation_character_index'],
        properties:{goal:text(500),duration_sec:{type:'number',exclusiveMinimum:0,maximum:3600},sensory_brief:text(1500),
          movement:{type:'string',enum:['none','walk','run','swim','climb','fall','glide','ride','other']},
          conversation_character_index:{anyOf:[{type:'integer',minimum:0,maximum:29},{type:'null'}]}}}}
    }
  };
  const audio = structuredClone(outputSchema('AudioPlan').$defs.AudioLayer);
  delete audio.properties.id; delete audio.properties.position;
  audio.required = audio.required.filter((item:string)=>item!=='id');
  audio.properties.asset_id = {type:'string',enum:[...audioAssets]};
  schema.properties.audio_layers = {type:'array',maxItems:30,items:audio};
  schema.required.push('audio_layers');
  for(const field of ['topic','task_instruction','setting_brief','narrator_intro_8s'])schema.properties[field].minLength=1;
  // Keep only reachable definitions: removing mechanical fields also removes tool schemas.
  const reachable = new Set<string>();
  function visit(value:any): void {
    if(!value || typeof value!=='object')return;
    if(value.$ref?.startsWith('#/$defs/')) {
      const id=value.$ref.slice('#/$defs/'.length);
      if(!reachable.has(id)){reachable.add(id);visit(schema.$defs[id]);}
    }
    for(const [key,child] of Object.entries(value))if(key!=='$defs'&&key!=='$ref')visit(child);
  }
  visit(schema);
  schema.$defs=Object.fromEntries([...reachable].map(id=>[id,schema.$defs[id]]));
  return schema;
}

const draftSchema = buildSchema();
const check = new (Ajv as any)({strict:false,allErrors:true}).compile(draftSchema);
export function experienceSchema(): any { return structuredClone(draftSchema); }

/** Author drafts must be structurally usable; the editor can correct their semantic mistakes. */
export function validateExperienceShape(value:unknown): asserts value is ExperienceDraft {
  if(!check(value))throw new AppError('INVALID_MODEL_OUTPUT','Invalid experience plan',
    (check.errors??[]).map((e:any)=>({path:e.instancePath,rule:e.keyword,message:(e.message??'Invalid experience field')+' '+JSON.stringify(e.params??{})})));
}

/** Only the editor's final plan must satisfy every cross-field invariant before construction. */
export function validateExperience(value:unknown): asserts value is ExperienceDraft {
  validateExperienceShape(value);
  const draft=value;
  const issues:Array<{path:string;rule:string;message:string}>=[];
  const fail=(path:string,rule:string,message:string)=>issues.push({path,rule,message});
  if(!draft.narrator_intro_8s.includes(stopReminder))fail('/narrator_intro_8s','stop_reminder','Introduction must include the exact STOP reminder');
  const elapsed=draft.experience.stages.reduce((sum,stage)=>sum+stage.duration_sec,0);
  if(elapsed>draft.duration_sec-3)fail('/experience/stages','clock','Stage durations must leave at least three seconds for completion');
  const motion=draft.experience.stages.some(stage=>stage.movement!=='none');
  if(motion!==draft.experience.requires_motion)fail('/experience/requires_motion','motion','Viewer movement intent must agree with requires_motion');
  let hasConversation=false;
  for(const [index,stage] of draft.experience.stages.entries()) {
    const target=stage.conversation_character_index;
    if(target!==null){
      hasConversation=true;
      if(target>=draft.characters.length)fail(`/experience/stages/${index}/conversation_character_index`,'reference','Conversation target must refer to a supplied character');
    }
  }
  if(draft.experience.kind==='action'&&(hasConversation||['dialogue','mixed'].includes(draft.interaction_mode)))fail('/experience','conversation','Action experiences do not require character dialogue');
  if(draft.experience.kind==='conversation'&&(!hasConversation||!draft.characters.length||!['dialogue','mixed'].includes(draft.interaction_mode)))fail('/experience','conversation','Conversation experiences need a relevant character, dialogue mode and natural speaking stage');
  for(const [index,layer] of draft.audio_layers.entries()) {
    const end=layer.end_active_second??draft.duration_sec;
    if(layer.start_active_second>=end||end>draft.duration_sec)fail(`/audio_layers/${index}`,'clock','Sound must start before its end within practice duration');
    if(layer.ramps.some(r=>r.at_active_second<layer.start_active_second||r.at_active_second+r.fade_seconds>end))fail(`/audio_layers/${index}/ramps`,'clock','Sound ramps must fit within their layer');
  }
  if(draft.narrator_beats.some(beat=>beat.at_active_second>draft.duration_sec))fail('/narrator_beats','clock','Narration must fit within the practice duration');
  const castNodes=draft.characters.reduce((sum,c)=>sum+(assetManifest.find(a=>a.id===c.asset_id)?.resolved_node_count??0),0);
  if(castNodes>750)fail('/characters','budget','Cast exceeds its resolved-node allowance; preserve requested participants and report the limit');
  if(issues.length)throw new AppError('INVALID_MODEL_OUTPUT','Invalid experience invariants',issues);
}

/** Assemble the public wire contracts without asking a model for application mechanics. */
export function assembleExperience(draft:ExperienceDraft, request:PlanRequest, phase:'setup'|'builder_revision'):{plan:SessionPlan;audio:AudioPlan} {
  validateExperience(draft);
  if(draft.safety.decision==='refuse')throw new AppError('INVALID_INPUT',`${draft.safety.reason} ${draft.safety.practice_preserving_alternative}`.trim());
  const {audio_layers,characters,experience,...semantic}=structuredClone(draft);
  const plan:SessionPlan={...semantic,schema_version:'1',session_id:request.session_id,revision:request.revision,
    intro_target_seconds:8,stop_reminder:stopReminder,
    characters:characters.map((character,index)=>({...character,id:`character_${index+1}`,scene_node_id:`character_node_${index+1}`,voice_id:'default'})),
    experience:{progression:'guided',kind:experience.kind,objective:experience.objective,requires_motion:experience.requires_motion,
      stages:[...experience.stages.map((stage,index)=>({id:`stage_${index+1}`,goal:stage.goal,action_ids:[]})),
        {id:'stage_completed',goal:'The authored experience has completed',action_ids:[]}]},
    tool_calls:[
      {tool:'compose_scene',execute_when:phase,arguments:{setting_brief:draft.setting_brief,intensity_1_10:draft.intensity_1_10,props:[...draft.props],interaction_mode:draft.interaction_mode}},
      {tool:'plan_audio',execute_when:phase,arguments:{audio_brief:draft.audio_brief,intensity_1_10:draft.intensity_1_10,duration_sec:draft.duration_sec,transition_whoosh_required:true}},
      {tool:'generate_feedback',execute_when:'after_session',arguments:{observation_source:'current_session_observations',tone:'coaching_nonclinical',max_did_well:3,max_noticed:3}},
      {tool:'adapt_session',execute_when:'after_session',arguments:{observation_source:'completed_session_observations',history_source:'authorized_chain_history'}}
    ]};
  const audio:AudioPlan={schema_version:'1',session_id:request.session_id,revision:request.revision,
    layers:audio_layers.map((layer,index)=>({...layer,id:`audio_${index+1}`})),transition_whoosh_asset_id:'whoosh',duck_gain_during_speech:0.25,rationale:draft.audio_brief};
  validate('SessionPlan',plan); validateProviderOutput('SessionPlan',plan);
  const issues=planIssues(plan);
  if(issues.length)throw new AppError('INVALID_MODEL_OUTPUT','Invalid assembled plan',issues);
  validate('AudioPlan',audio);
  return {plan,audio};
}

/** Planning roles receive meaningful capabilities rather than mesh bounds and transforms. */
export function planningCapabilities() {
  return {
    progression:'Automatic authored situations; looking around and relevant speech do not gate or branch world progression.',
    character_choices:assetManifest.filter(asset=>generationCharacterIDs.has(asset.id)).map(asset=>({asset_id:asset.id,tags:asset.tags,resolved_nodes:asset.resolved_node_count})),
    cast_resolved_node_allowance:750,
    audio_assets:[...audioAssets],audio_playback:'Bundled scheduled layers on the pause-aware active clock; no spatial audio or generated recordings.',
    movement:['walk','run','swim','climb','fall','glide','ride','other'],
    visual_effects:['procedural sky','fog','water ripples','foliage flutter'],
    limitations:['No fluid forces, buoyancy, pressure, physically simulated currents or smoke transport.','No full-body tracking or physical walking.','Use supported source character palettes and comfortable personal space.'],
    stop_reminder:stopReminder,completion_reserve_seconds:3
  };
}

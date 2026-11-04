import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateExperience,experienceSceneIssues} from '../src/generation-chain.js';
import {constructionRequirements} from '../src/construction.js';
import {AppError} from '../src/contracts.js';
import type {ExperienceDraft} from '../src/experience.js';
import type {PlanRequest,Job,SessionPlan,SceneSpec,SceneNode} from '../../docs/handoff/contracts.js';

const request=():PlanRequest=>({schema_version:'1',session_id:'c36a8c25-43c2-46fc-b3bc-c48bb8d43192',revision:1,
 fear_description:'I want to experience a quiet open room.',current_ability:'A short quiet experience feels manageable.',
 preferences:['Keep the space open'],relevant_history:[],history_choice:'declined',builder_additions:[],use_history:false,chained_rerun:false});

function draft():ExperienceDraft {
 return {topic:'Quiet open room',topic_short:'Quiet room',task_instruction:'Experience the quiet room.',setting_brief:'An open room with warm daylight.',props:[],
  intensity:{summary:'Gentle',dimensions:[]},intensity_1_10:2,duration_sec:30,
  narrator_intro_8s:'Your practice is ready. To stop at any time, just say STOP!',narrator_beats:[],interaction_mode:'solo',audio_brief:'Quiet room ambience.',
  safety:{decision:'ok',reason:'Suitable for the described ability.',practice_preserving_alternative:''},
  construction_brief:{spatial_intent:'Open quiet space',must_preserve:['Open space'],expected_outcomes:['Observe surroundings'],
   medium_behavior:{substance:'air',motion:'still',visibility:'clear',participant_motion:'none',unsupported_dynamics:[]}},
  characters:[],experience:{kind:'action',objective:'Observe surroundings',requires_motion:false,
   stages:[{goal:'Settle',duration_sec:27,sensory_brief:'Quiet open space',movement:'none',conversation_character_index:null}]},
  audio_layers:[]} as ExperienceDraft;
}

/** Real schema/semantic/construction validation runs on every fake-builder output. */
function sceneFor(plan:SessionPlan):SceneSpec {
 const node=(id:string,position:number[],size:number[]):SceneNode=>({id,parent_id:null,role:'environment',geometry:{kind:'box',size},position,
  rotation_radians:[0,0,0],scale:[1,1,1],material:{color:'#aabbcc',roughness:0.8},animation:'none',description:id,collision_role:'solid',support_node_id:null});
 const scene:SceneSpec={schema_version:'1',session_id:plan.session_id,revision:plan.revision,description:plan.setting_brief,
  nodes:[node('floor',[0,-0.1,0],[20,0.2,20]),{...node('focal_object',[0,0.5,-3],[1,1,1]),role:'task_focus',support_node_id:'floor'}],
  viewpoints:[{id:'start',position:[0,1.6,0],description:'A clear view into the quiet space.'}],initial_viewpoint_id:'start',
  lighting:{ambient_color:'#ffffff',ambient_intensity:0.5,key_direction:[0,-1,-1],key_intensity:0.7},
  atmosphere:{background_color:'#aabbcc',fog_density:0},events:[],interactions:[],
  stereo:{presentation:'stereographic',units:'meters',coordinate_system:'right_handed_y_up',eye_calibration:'device_viewer_profile',camera_control:'app_owned'},
  reveal:{black_intro_seconds:8,fade_seconds:1.5,blur_to_clear_seconds:1.5},
  environment:{mode:'interior',sky:{kind:'solid',horizon_color:'#aabbcc',zenith_color:'#aabbcc',ground_color:'#aabbcc',sun_color:'#ffffff',sun_size_degrees:2,haze:0,cloud_coverage:0},
   fog:{color:'#aabbcc',start_meters:10,end_meters:30},lighting_environment_intensity:0.5},
  motion_paths:[],view_distance_meters:150,viewer_attached_node_ids:[],
  scenario:{progression:'guided',objective:plan.experience!.objective,dialogue_policy:'disabled',initial_step_id:plan.experience!.stages[0].id,
   steps:plan.experience!.stages.map((stage,index)=>({id:stage.id,prompt:'',terminal:index===plan.experience!.stages.length-1,
    announce_on_entry:false,review_viewpoint_id:'start',focus_node_ids:['focal_object'],start_operations:[],actions:[],
    ...(index===plan.experience!.stages.length-1?{}:{completion:{trigger:'after_seconds' as const,after_seconds:27,next_step_id:plan.experience!.stages[index+1].id}})}))},
  construction_plan:{version:'1',seed:42,requirements:[],zones:[{id:'room_zone',center:[0,2,0],size:[20,4,20],kind:'interior'}],
   assemblies:[{id:'focus_assembly',root_node_id:'focal_object',member_node_ids:['focal_object'],zone_id:'room_zone',requirement_ids:[]}],
   anchors:[{id:'floor_top',node_id:'floor',kind:'support',position:[0,0.1,0],footprint:[10,10]}],
   relations:[{id:'ground_focus',kind:'on',subject_id:'focal_object',target_id:'floor',anchor_id:'floor_top',offset:[0,0,-3],clearance:0,tolerance:0.01,required:true}],
   routes:[],medium_regions:[]}};
 scene.construction_plan!.requirements=constructionRequirements(plan).map(r=>({requirement_id:r.id,node_ids:r.kind==='stage'?[]:['focal_object'],
  stage_ids:r.kind==='stage'?[r.target]:[plan.experience!.stages[0].id],path_ids:[]}));
 return scene;
}

type Call={schema:string;input:any;role:string};
function harness(options:{edited?:ExperienceDraft;model?:(call:Call,index:number)=>unknown|Promise<unknown>;repairAvailable?:boolean}={}) {
 const calls:Call[]=[],controller=new AbortController();let current=true,repairs=0;
 const deps:Parameters<typeof generateExperience>[2]={
  capabilities:{assets:{test_inventory:[['not_for_the_planner',1]]},asset_bounds:{not_for_the_planner:{min:[0,0,0],max:[1,1,1]}}},
  model:async(schema,input,_instructions,_signal,role)=>{
   const call={schema,input:structuredClone(input),role};calls.push(call);
   const custom=await options.model?.(call,calls.length);
   if(custom!==undefined)return structuredClone(custom);
   if(role==='experience_author')return draft();
   if(role==='experience_editor')return structuredClone(options.edited??draft());
   assert.equal(role,'scene_builder','The normal chain must not make a separate audio-model call.');
   return sceneFor((input as {plan:SessionPlan}).plan);
  },
  isCurrent:()=>current,
  consumeRepair:()=>options.repairAvailable!==false&&repairs++===0,
 };
 const input=request(),job:Job={job_id:'b1e16a52-8358-4465-a260-17e78f5f0dc2',session_id:input.session_id,revision:input.revision,status:'running',stage:'Starting'};
 return {calls,controller,deps,input,job,setStale:()=>{current=false;},repairs:()=>repairs,
  run:()=>generateExperience(input,job,deps,controller.signal)};
}

test('editor final plan reaches construction, with original context and compact planning capabilities',async()=>{
 const edited=draft();edited.setting_brief='An open room with softer evening light.';edited.experience.stages[0].sensory_brief='Warm evening light and quiet surroundings.';
 const h=harness({edited}),result=await h.run();
 assert.deepEqual(h.calls.map(c=>c.role),['experience_author','experience_editor','scene_builder']);
 assert.deepEqual(h.calls[1].input.request,h.input);
 assert.equal(h.calls[2].input.plan.setting_brief,edited.setting_brief);
 assert.deepEqual(h.calls[2].input.approved_experience,edited);
 assert.equal(result.plan.setting_brief,edited.setting_brief);
 assert.deepEqual(result.experience,edited);
 assert.deepEqual(h.calls[0].input.request.relevant_history,[]);
 assert.deepEqual(h.calls[1].input.request.relevant_history,[]);
 for(const call of h.calls.slice(0,2)){
  assert.ok(!JSON.stringify(call.input).includes('not_for_the_planner'));
  assert.equal(call.schema,'ExperienceDraft');
 }
 assert.equal(h.repairs(),0);
});

test('an unchanged complete editor plan proceeds directly to the builder',async()=>{
 const h=harness(),result=await h.run();
 assert.deepEqual(result.experience,draft());
 assert.deepEqual(h.calls.map(c=>c.role),['experience_author','experience_editor','scene_builder']);
 assert.equal(result.audio.transition_whoosh_asset_id,'whoosh');
});

test('a floating-in-place stage labeled as travel is repaired by the editor before building',async()=>{
 const edited=draft();
 const stage=edited.experience.stages[0];
 stage.goal='Settle while floating calmly and notice the view ahead.';
 stage.sensory_brief='Gentle ripples and a stable floating viewpoint.';
 const rejected=structuredClone(edited);
 rejected.experience.requires_motion=true;
 rejected.experience.stages[0].movement='swim';
 const h=harness({model:call=>{
  if(call.role==='experience_editor')return call.input.issues?edited:rejected;
 }});
 const result=await h.run();
 assert.deepEqual(h.calls.map(c=>c.role),['experience_author','experience_editor','experience_editor','scene_builder']);
 assert.equal(h.calls[2].input.issues[0].path,'/experience/stages/0/movement');
 assert.equal(h.calls[3].input.approved_experience.experience.stages[0].movement,'none');
 assert.equal(result.scene.scenario!.steps[0].completion?.after_seconds,stage.duration_sec);
});

test('schema-rejected builder output survives into the repair with independent construction failures',async()=>{
 let builderCalls=0;
 const h=harness({model:call=>{
  if(call.role==='scene_builder'&&builderCalls++===0){
   const candidate=sceneFor(call.input.plan);
   candidate.nodes[1].parent_id='missing_parent';
   delete candidate.scenario!.steps[0].review_viewpoint_id;
   throw new AppError('INVALID_MODEL_OUTPUT','Missing required scene metadata',[
    {path:'/scenario/steps/0',rule:'required',message:'review_viewpoint_id is required'},
   ]).withModelOutput('SceneSpec',candidate);
  }
 }});
 await h.run();
 const repair=h.calls.filter(c=>c.role==='scene_builder')[1].input;
 assert.equal(repair.previous_scene.nodes[1].parent_id,'missing_parent');
 assert.ok(repair.issues.some((i:any)=>i.path==='/nodes/1/parent_id'&&i.rule==='reference'));
 assert.ok(repair.issues.some((i:any)=>i.rule==='required'&&i.message.includes('review_viewpoint_id')));
 assert.equal(h.repairs(),1);
});

test('the editor fixes a structurally valid author timing mistake without spending the shared repair',async()=>{
 const authored=draft();authored.experience.stages[0].duration_sec=28;
 const h=harness({model:call=>call.role==='experience_author'?authored:undefined});
 const result=await h.run();
 assert.equal(h.calls[1].input.proposed_experience.experience.stages[0].duration_sec,28);
 assert.equal(result.experience.experience.stages[0].duration_sec,27);
 assert.deepEqual(h.calls.map(c=>c.role),['experience_author','experience_editor','scene_builder']);
 assert.equal(h.repairs(),0);
});

test('an accept wrapper is invalid; an editor must return a complete plan before any construction',async()=>{
 const h=harness({model:call=>call.role==='experience_editor'?{decision:'accept'}:undefined});
 await assert.rejects(h.run(),AppError);
 assert.deepEqual(h.calls.map(c=>c.role),['experience_author','experience_editor','experience_editor']);
});

test('refused edited content never reaches the spatial builder',async()=>{
 const edited=draft();edited.safety={decision:'refuse',reason:'This request cannot be supported.',practice_preserving_alternative:'Choose another situation.'};
 const h=harness({edited});
 await assert.rejects(h.run(),/cannot be supported/);
 assert.deepEqual(h.calls.map(c=>c.role),['experience_author','experience_editor']);
});

test('declined history cannot enter the planning calls even through an internal caller',async()=>{
 const h=harness();h.input.relevant_history=[{session_id:'47151454-695b-4c72-a436-294196adbf4b',topic:'Private unrelated topic',intensity:{summary:'Gentle',dimensions:[]},intensity_1_10:2,planned_seconds:30,active_seconds:30,outcome:'completed'}];
 await assert.rejects(h.run(),/history/i);
 assert.equal(h.calls.length,0);
});

test('supersession after authoring prevents editing and construction',async()=>{
 const h=harness({model:call=>{if(call.role==='experience_author')h.setStale();return undefined;}});
 await assert.rejects(h.run());
 assert.deepEqual(h.calls.map(c=>c.role),['experience_author']);
});

test('cancellation after editing prevents the builder call',async()=>{
 const h=harness({model:call=>{if(call.role==='experience_editor')h.controller.abort();return undefined;}});
 await assert.rejects(h.run());
 assert.deepEqual(h.calls.map(c=>c.role),['experience_author','experience_editor']);
});

test('a cancelled attempt cannot start even the author request',async()=>{
 const h=harness();h.controller.abort();
 await assert.rejects(h.run());
 assert.equal(h.calls.length,0);
});

test('a builder result from a superseded revision cannot be returned for commit',async()=>{
 const h=harness({model:call=>{if(call.role==='scene_builder')h.setStale();return undefined;}});
 await assert.rejects(h.run());
 assert.deepEqual(h.calls.map(c=>c.role),['experience_author','experience_editor','scene_builder']);
});

test('builder repair retains the edited contract and local audio without rerunning either planner',async()=>{
 let builds=0;
 const edited=draft();edited.setting_brief='The editor-approved open room.';
 const h=harness({edited,model:call=>{
  if(call.role!=='scene_builder')return undefined;
  const scene=sceneFor(call.input.plan);
  if(builds++===0)scene.nodes[1].geometry={kind:'asset',asset_id:''};
  return scene;
 }});
 const result=await h.run();
 assert.deepEqual(h.calls.map(c=>c.role),['experience_author','experience_editor','scene_builder','scene_builder']);
 const buildsMade=h.calls.filter(c=>c.role==='scene_builder');
 assert.deepEqual(buildsMade[0].input.plan,buildsMade[1].input.plan);
 assert.deepEqual(buildsMade[0].input.audio,buildsMade[1].input.audio);
 assert.ok(buildsMade[1].input.issues.length>0);
 assert.equal(result.plan.setting_brief,edited.setting_brief);
 assert.equal(h.repairs(),1);
});

test('an exhausted shared repair allowance prevents an extra builder request',async()=>{
 const h=harness({repairAvailable:false,model:call=>{
  if(call.role!=='scene_builder')return undefined;
  const scene=sceneFor(call.input.plan);scene.nodes[1].geometry={kind:'asset',asset_id:''};return scene;
 }});
 await assert.rejects(h.run(),AppError);
 assert.deepEqual(h.calls.map(c=>c.role),['experience_author','experience_editor','scene_builder']);
});

test('construction cannot add participant travel in the generated completed stage',async()=>{
 const {experience,plan,scene}=await harness().run();
 scene.motion_paths!.push({id:'unapproved_exit',purpose:'walk',interpolation:'smooth',points:[{at_seconds:2,position:[0,1.6,-8]}]});
 scene.scenario!.steps.at(-1)!.start_operations.push({type:'move_viewer',path_id:'unapproved_exit'});
 assert.ok(experienceSceneIssues(experience,plan,scene).some(issue=>issue.rule==='edited_experience'));
});

test('a viewpoint transition cannot bypass the edited no-movement stage',async()=>{
 const {experience,plan,scene}=await harness().run();
 scene.viewpoints.push({id:'far_corner',position:[0,1.6,-8],description:'An unapproved location'});
 scene.scenario!.steps[0].start_operations.push({type:'viewpoint_transition',destination_id:'far_corner',transition:'fade'});
 assert.ok(experienceSceneIssues(experience,plan,scene).some(issue=>issue.rule==='edited_experience'));
});

test('a global viewpoint transition cannot relocate the participant outside the edited stages',async()=>{
 const {experience,plan,scene}=await harness().run();
 scene.viewpoints.push({id:'far_corner',position:[0,1.6,-8],description:'An unapproved location'});
 scene.events.push({at_active_second:3,operation:{type:'viewpoint_transition',destination_id:'far_corner',transition:'fade'}});
 assert.ok(experienceSceneIssues(experience,plan,scene).some(issue=>issue.rule==='edited_experience'));
});

async function priorExperience() {
 const previous=await harness().run();
 previous.plan.session_id='47151454-695b-4c72-a436-294196adbf4b';
 previous.scene.session_id=previous.plan.session_id;
 previous.scene.description='PRIVATE prior scene';
 return previous;
}

test('unrelated prior experience is omitted from all three model contexts',async()=>{
 const h=harness();h.deps.previous=await priorExperience();
 await h.run();
 for(const call of h.calls){
  assert.ok(!JSON.stringify(call.input).includes('PRIVATE prior scene'));
  assert.equal(call.input.previous_plan,undefined);
  assert.equal(call.input.previous_scene,undefined);
 }
});

test('a parent ID alone cannot authorize prior experience context without a chained repeat',async()=>{
 const h=harness();h.deps.previous=await priorExperience();h.input.parent_session_id=h.deps.previous.plan.session_id;
 await h.run();
 for(const call of h.calls){
  assert.equal(call.input.previous_plan,undefined);
  assert.equal(call.input.previous_scene,undefined);
 }
});

test('an authorized chained parent remains available to planning and construction',async()=>{
 const h=harness();h.deps.previous=await priorExperience();
 h.input.parent_session_id=h.deps.previous.plan.session_id;h.input.chained_rerun=true;h.input.use_history=true;h.input.history_choice='chain_reuse';
 await h.run();
 for(const call of h.calls.slice(0,2))assert.deepEqual(call.input.previous_plan,h.deps.previous.plan);
 assert.equal(h.calls[2].input.previous_scene.description,'PRIVATE prior scene');
});

test('a new revision can retain its own previous experience while older history is declined',async()=>{
 const h=harness();h.deps.previous=await harness().run();h.input.revision=2;h.job.revision=2;
 await h.run();
 for(const call of h.calls.slice(0,2))assert.deepEqual(call.input.previous_plan,h.deps.previous.plan);
 assert.equal(h.calls[2].input.previous_scene.description,h.deps.previous.scene.description);
 assert.equal(h.calls[2].input.plan.tool_calls.find((tool:any)=>tool.tool==='compose_scene').execute_when,'builder_revision');
});

function movingConversation():ExperienceDraft {
 const experience=draft();
 experience.topic='A gentle walk with a friendly host';experience.interaction_mode='mixed';
 experience.characters=[{name:'Host',role:'Friendly companion',appearance_brief:'Approved friendly stylized adult',
  goal:'Answer the participant naturally during a gentle walk.',behavior_boundaries:['Keep questions friendly.'],asset_id:'character.base.soft_adult_01'}];
 experience.experience={kind:'conversation',objective:'Experience a gentle walk with a friendly host',requires_motion:true,
  stages:[{goal:'A gentle walk together',duration_sec:27,sensory_brief:'Warm daylight and a friendly companion.',movement:'walk',conversation_character_index:0}]};
 return experience;
}

function movingConversationScene(plan:SessionPlan):SceneSpec {
 const scene=sceneFor(plan),character=plan.characters[0];
 scene.nodes.push({id:character.scene_node_id,parent_id:null,role:'character',geometry:{kind:'asset',asset_id:character.asset_id!},
  position:[3,0,-4],rotation_radians:[0,0,0],scale:[1,1,1],material:{color:'#ffffff',roughness:0.8},animation:'idle',
  description:'The friendly host',collision_role:'solid',support_node_id:'floor'});
 scene.scenario!.dialogue_policy='natural';
 scene.scenario!.steps[0].conversation_target=character.id;
 scene.scenario!.steps[0].start_operations=[{type:'move_viewer',path_id:'gentle_walk'}];
 scene.motion_paths=[{id:'gentle_walk',purpose:'walk',interpolation:'smooth',coordinate_space:'world',points:[{at_seconds:10,position:[0,1.6,-1]}]}];
 scene.construction_plan!.assemblies.push({id:'host_assembly',root_node_id:character.scene_node_id,member_node_ids:[character.scene_node_id],zone_id:'room_zone',requirement_ids:['cast:'+character.id]});
 scene.construction_plan!.routes=[{path_id:'gentle_walk',stage_ids:[plan.experience!.stages[0].id],requirement_ids:['motion'],clearance_radius_meters:0.25,eye_height_meters:1.6}];
 scene.construction_plan!.requirements=constructionRequirements(plan).map(r=>({requirement_id:r.id,
  node_ids:r.kind==='cast'?[character.scene_node_id]:r.kind==='stage'?[]:['focal_object'],
  stage_ids:r.kind==='stage'?[r.target]:[plan.experience!.stages[0].id],path_ids:r.kind==='motion'?['gentle_walk']:[]}));
 return scene;
}

test('an edited moving conversation binds the approved character index and timed speaking stage',async()=>{
 const edited=movingConversation();
 const h=harness({edited,model:call=>call.role==='scene_builder'?movingConversationScene(call.input.plan):undefined});
 const result=await h.run();
 assert.equal(result.plan.characters[0].id,'character_1');
 assert.equal(result.scene.scenario!.steps[0].conversation_target,result.plan.characters[0].id);
 assert.equal(result.scene.scenario!.steps[0].completion!.trigger,'after_seconds');
 assert.equal(result.scene.scenario!.steps[0].completion!.after_seconds,27);
 assert.equal(result.scene.motion_paths![0].purpose,'walk');
 assert.equal(h.repairs(),0);
 assert.deepEqual(h.calls.map(c=>c.role),['experience_author','experience_editor','scene_builder']);
 const wrongCharacter=structuredClone(result.scene);wrongCharacter.scenario!.steps[0].conversation_target='missing_character';
 assert.ok(experienceSceneIssues(edited,result.plan,wrongCharacter).some(issue=>issue.path.endsWith('/conversation_target')));
 const wrongTime=structuredClone(result.scene);wrongTime.scenario!.steps[0].completion!.after_seconds=26;
 assert.ok(experienceSceneIssues(edited,result.plan,wrongTime).some(issue=>issue.path.endsWith('/completion')));
});

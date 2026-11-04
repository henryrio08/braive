import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compileScene} from '../src/construction.js';
import {constructionRequirements} from '../src/construction.js';
import {sceneIssues} from '../src/contracts.js';
import type {SessionPlan,SceneSpec,SceneNode,AudioPlan} from '../../docs/handoff/contracts.js';

// Offline construction coverage for six situations across three families.
// No provider calls: every plan/scene/audio below is an authored fixture.
// BRAIVE_VISUAL_STRICTNESS is intentionally left unset (default permissive);
// fixtures are built to be clean enough that sceneIssues returns [] anyway.

const SESSION='c36a8c25-43c2-46fc-b3bc-c48bb8d43192';
const CHAR_ASSET='character.base.soft_adult_01';
const CHAIR='furniture.chair.classic_chair_01';

type Vec=[number,number,number];
type ZoneSpec={id:string;center:Vec;size:Vec;kind:'interior'|'outdoor'|'enclosure'};
type CharSpec={id:string;name:string;nodeId:string;position:Vec;asset?:string};

const box=(id:string,role:SceneNode['role'],size:Vec,position:Vec,extra:Partial<SceneNode>={}):SceneNode=>({
 id,parent_id:null,role,geometry:{kind:'box',size},position,rotation_radians:[0,0,0],scale:[1,1,1],
 material:{color:'#aabbcc',roughness:0.8},animation:'none',description:id,collision_role:'solid',support_node_id:null,...extra} as SceneNode);

const charNode=(c:CharSpec):SceneNode=>({
 id:c.nodeId,parent_id:null,role:'character',geometry:{kind:'asset',asset_id:c.asset??CHAR_ASSET},
 position:c.position,rotation_radians:[0,0,0],scale:[1,1,1],material:{color:'#e8c39e',roughness:0.8},
 animation:'none',description:c.name,collision_role:'solid',support_node_id:null} as SceneNode);

interface WorldOpts {
 topic:string; prop:string; focusId:string; focusSize:Vec; focusPos:Vec;
 zone:ZoneSpec; characters?:CharSpec[]; extraNodes?:SceneNode[]; macros?:unknown[];
 extraZones?:ZoneSpec[]; extraAssemblies?:unknown[]; extraRelations?:unknown[];
 viewpoint?:Vec;
}

function makeWorld(o:WorldOpts){
 const chars=o.characters??[];
 const plan={
  schema_version:'1',session_id:SESSION,revision:1,topic:o.topic,topic_short:o.topic,
  task_instruction:`Take part in: ${o.topic}`,setting_brief:`Setting for ${o.topic}.`,props:[o.prop],
  intensity:{summary:'Gentle',dimensions:[]},intensity_1_10:2,duration_sec:60,
  narrator_intro_8s:'Welcome. To stop at any time, just say STOP!',intro_target_seconds:8,narrator_beats:[],
  characters:chars.map(c=>({id:c.id,name:c.name,role:'speaker',
   appearance_brief:`Friendly stylized adult presenting as ${c.name}, warm and approachable.`,
   goal:`Support the participant during ${o.topic}.`,
   behavior_boundaries:['Keep conversation friendly and supportive.','Do not give medical advice.'],
   voice_id:'default',scene_node_id:c.nodeId,asset_id:c.asset??CHAR_ASSET})),
  interaction_mode:'solo',tool_calls:[],stop_reminder:'To stop at any time, just say STOP!',
  audio_brief:'Quiet ambience.',safety:{decision:'ok',reason:'Suitable for practice.',practice_preserving_alternative:''},
  experience:{kind:'action',progression:'guided',objective:`Experience ${o.topic}`,requires_motion:false,
   stages:[{id:'look',goal:'Look around',action_ids:[]},{id:'done',goal:'Finish',action_ids:[]}]},
 } as unknown as SessionPlan;

 const floor=box('floor','environment',[40,0.2,40],[0,-0.1,0]);
 const focus=box(o.focusId,'task_focus',o.focusSize,o.focusPos,{prop_name:o.prop});
 const nodes:SceneNode[]=[floor,focus,...chars.map(charNode),...(o.extraNodes??[])];
 const zones=[o.zone,...(o.extraZones??[])];
 const assemblies=[
  {id:'focus_assembly',root_node_id:o.focusId,member_node_ids:[o.focusId],zone_id:o.zone.id,requirement_ids:[]},
  ...chars.map(c=>({id:`${c.nodeId}_assembly`,root_node_id:c.nodeId,member_node_ids:[c.nodeId],zone_id:o.zone.id,requirement_ids:[]})),
  ...(o.extraAssemblies??[]),
 ];
 const scene={
  schema_version:'1',session_id:SESSION,revision:1,description:o.topic,nodes,
  viewpoints:[{id:'start',position:o.viewpoint??[0,1.6,2],description:'Start'}],initial_viewpoint_id:'start',
  lighting:{ambient_color:'#ffffff',ambient_intensity:0.5,key_direction:[0,-1,-1],key_intensity:0.7},
  atmosphere:{background_color:'#aabbcc',fog_density:0},interactions:[],events:[],motion_paths:[],
  viewer_attached_node_ids:[],view_distance_meters:150,
  environment:{mode:o.zone.kind==='outdoor'?'outdoor':'interior',
   sky:{kind:'solid',horizon_color:'#cfd8e3',zenith_color:'#8fb4d9',ground_color:'#6b7a5e',sun_color:'#fff2d8',sun_size_degrees:8,haze:0.1,cloud_coverage:0.2},
   fog:{color:'#cfd8e3',start_meters:20,end_meters:90},lighting_environment_intensity:1},
  stereo:{presentation:'stereographic',units:'meters',coordinate_system:'right_handed_y_up',eye_calibration:'device_viewer_profile',camera_control:'app_owned'},
  reveal:{black_intro_seconds:8,fade_seconds:1.5,blur_to_clear_seconds:1.5},
  scenario:{progression:'guided',objective:`Experience ${o.topic}`,dialogue_policy:'disabled',initial_step_id:'look',
   steps:[{id:'look',prompt:'',terminal:false,start_operations:[],actions:[],completion:{trigger:'after_seconds',after_seconds:20,next_step_id:'done'}},
          {id:'done',prompt:'',terminal:true,start_operations:[],actions:[]}]},
  construction_plan:{version:'1',seed:42,requirements:[],zones,assemblies,
   anchors:[{id:'floor_top',node_id:'floor',kind:'support',position:[0,0.1,0],footprint:[10,10]}],
   relations:[{id:'ground_focus',kind:'on',subject_id:o.focusId,target_id:'floor',anchor_id:'floor_top',
     offset:[o.focusPos[0],0,o.focusPos[2]],clearance:0,tolerance:0.01,required:true},...(o.extraRelations??[])],
   routes:[],medium_regions:[],macros:o.macros??[]},
 } as unknown as SceneSpec;
 scene.construction_plan!.requirements=constructionRequirements(plan).map(r=>({
  requirement_id:r.id,
  node_ids:r.kind==='cast'?[r.target]:(r.kind==='prop'||r.kind==='task')?[o.focusId]:[],
  stage_ids:r.kind==='stage'?[r.target]:r.kind==='task'?['look']:[],path_ids:[]}));
 const audio={schema_version:'1',session_id:SESSION,revision:1,layers:[],transition_whoosh_asset_id:'whoosh',
  duck_gain_during_speech:0.25,rationale:'Quiet ambience.'} as unknown as AudioPlan;
 return {plan,scene,audio};
}

function check(w:{plan:SessionPlan;scene:SceneSpec;audio:AudioPlan}){
 let compiled:SceneSpec|undefined;
 assert.doesNotThrow(()=>{compiled=compileScene(w.plan,w.scene,w.audio);});
 assert.ok(compiled);
 assert.deepEqual(sceneIssues(w.plan,compiled!,w.audio),[]);
 return compiled!;
}
const count=(s:SceneSpec,prefix:string)=>s.nodes.filter(n=>n.id.startsWith(prefix)).length;

// 1. Library presentation (indoor)
test('library presentation: room enclosure + 8-seat rows + speaker + lectern',()=>{
 const w=makeWorld({topic:'Library presentation',prop:'Lectern',focusId:'lectern',focusSize:[0.6,1.2,0.5],focusPos:[0,0.6,-3],
  zone:{id:'room',center:[0,2,-3],size:[14,4,12],kind:'interior'},
  characters:[{id:'speaker_1',name:'Ada',nodeId:'speaker_node',position:[1.6,0,-3]}],
  macros:[
   {id:'room_walls',kind:'enclosure',root_node_id:'floor',zone_id:'room',center:[0,0,-3],size:[10,3,8],wall_height:2.8,opening_width:1.2},
   {id:'aud',kind:'seating_rows',root_node_id:'floor',zone_id:'room',chair_asset_id:CHAIR,rows:2,seats_per_row:4,origin:[0,0,-6],seat_spacing:0.9,row_spacing:1.1,facing_yaw:0},
  ]});
 const compiled=check(w);
 assert.ok(count(compiled,'room_walls_wall_')>=4);
 assert.ok(count(compiled,'aud_seat_')>=8,`expected >=8 seats, got ${count(compiled,'aud_seat_')}`);
 assert.equal(compiled.nodes.find(n=>n.id==='lectern')!.role,'task_focus');
 assert.equal(compiled.nodes.filter(n=>n.role==='character').length,1);
});

// 2. Studio interview (indoor)
test('studio interview: desk + 2 chairs functional group + two characters + backdrop',()=>{
 const w=makeWorld({topic:'Studio interview',prop:'Camera',focusId:'camera',focusSize:[0.5,0.4,0.5],focusPos:[0,0.2,1.5],
  zone:{id:'studio',center:[0,2,-2],size:[12,4,10],kind:'interior'},
  characters:[
   {id:'host_1',name:'Ruth',nodeId:'host_node',position:[0.9,0,-1.1]},
   {id:'guest_1',name:'Omar',nodeId:'guest_node',position:[-0.9,0,-2.9],asset:'character.base.soft_adult_02'},
  ],
  extraNodes:[box('backdrop','environment',[6,3,0.2],[0,1.5,-5])],
  macros:[{id:'interview',kind:'functional_group',root_node_id:'floor',zone_id:'studio',origin:[0,0,-2],facing_yaw:0,desk_asset_id:'furniture.desk.classic_desk_01',chair_asset_id:CHAIR,include_desk:true}]});
 const compiled=check(w);
 assert.equal(count(compiled,'interview_'),3);
 assert.ok(compiled.nodes.some(n=>n.id==='interview_desk'));
 assert.equal(compiled.nodes.filter(n=>n.role==='character').length,2);
 assert.ok(compiled.nodes.some(n=>n.id==='backdrop'));
});

// 3. Garden toast (open)
test('garden toast: scatter bushes + small seating + host outdoors',()=>{
 const w=makeWorld({topic:'Garden toast',prop:'Table',focusId:'toast_table',focusSize:[1.2,0.8,0.8],focusPos:[2,0.4,-3],
  zone:{id:'garden',center:[0,2,-3],size:[20,4,16],kind:'outdoor'},
  characters:[{id:'host_1',name:'Mina',nodeId:'host_node',position:[0.8,0,-3]}],
  macros:[
   {id:'bushes',kind:'scatter',root_node_id:'floor',zone_id:'garden',asset_id:'nature.bush.nature_plant_bush_01',count:6,area_center:[0,0,-5],area_size:[12,8],min_spacing:1.2,seed_offset:3},
   {id:'garden_seats',kind:'seating_rows',root_node_id:'floor',zone_id:'garden',chair_asset_id:CHAIR,rows:1,seats_per_row:3,origin:[0,0,-0.5],seat_spacing:0.9,row_spacing:1.1,facing_yaw:0},
  ]});
 const compiled=check(w);
 assert.equal(count(compiled,'bushes_item_'),6);
 assert.equal(count(compiled,'garden_seats_seat_'),3);
 assert.equal(compiled.construction_plan!.zones.find(z=>z.id==='garden')!.kind,'outdoor');
});

// 4. Trail at dusk (open, solo — no audience)
test('trail at dusk: scatter trees/rocks + viewing platform, zero audience',()=>{
 const w=makeWorld({topic:'Trail at dusk',prop:'Trail sign',focusId:'trail_sign',focusSize:[0.8,1,0.3],focusPos:[-2,0.5,-2],
  zone:{id:'trail',center:[0,2,-6],size:[24,5,20],kind:'outdoor'},
  characters:[],
  macros:[
   {id:'trees',kind:'scatter',root_node_id:'floor',zone_id:'trail',asset_id:'nature.tree.nature_tree_pine_default_a_01',count:5,area_center:[0,0,-8],area_size:[16,10],min_spacing:2,seed_offset:5},
   {id:'rocks',kind:'scatter',root_node_id:'floor',zone_id:'trail',asset_id:'nature.rock.nature_rock_small_a_01',count:4,area_center:[3,0,-4],area_size:[10,6],min_spacing:1,seed_offset:7},
   {id:'lookout',kind:'platform_steps',root_node_id:'floor',zone_id:'trail',origin:[0,0,0],steps:3,step_height:0.2,step_depth:0.4,width:2,platform_depth:1.2},
  ]});
 const compiled=check(w);
 assert.equal(count(compiled,'trees_item_'),5);
 assert.equal(count(compiled,'rocks_item_'),4);
 assert.equal(count(compiled,'lookout_'),4); // 3 steps + platform top
 assert.equal(compiled.nodes.filter(n=>n.role==='character').length,0);
 assert.equal(w.plan.characters.length,0);
});

// 5. Elevator (confined)
test('elevator: 2.2m enclosure + one close character, zone volume < 30 m^3',()=>{
 const w=makeWorld({topic:'Elevator ride',prop:'Panel',focusId:'panel',focusSize:[0.4,0.6,0.1],focusPos:[0.8,0.3,-2.4],
  zone:{id:'cab',center:[0,1.3,-1.5],size:[2.2,2.6,2.2],kind:'enclosure'},
  characters:[{id:'rider_1',name:'Jo',nodeId:'rider_node',position:[0,0,-1.3]}],
  viewpoint:[0,1.6,-0.7],
  macros:[{id:'cab_walls',kind:'enclosure',root_node_id:'floor',zone_id:'cab',center:[0,0,-1.5],size:[2.2,2.6,2.2],wall_height:2.4,opening_width:0.8}]});
 const compiled=check(w);
 assert.ok(count(compiled,'cab_walls_wall_')>=4);
 const zone=compiled.construction_plan!.zones.find(z=>z.id==='cab')!;
 const volume=zone.size[0]*zone.size[1]*zone.size[2];
 assert.ok(volume<30,`elevator zone volume ${volume} must be < 30`);
 assert.equal(compiled.nodes.filter(n=>n.role==='character').length,1);
});

// 6. Service passage (confined)
test('service passage: long narrow enclosure + loading step + character',()=>{
 const w=makeWorld({topic:'Service passage',prop:'Crate',focusId:'crate',focusSize:[0.8,0.8,0.8],focusPos:[-0.7,0.4,-5],
  zone:{id:'passage',center:[0,1.5,-6],size:[3,3,16],kind:'enclosure'},
  characters:[{id:'worker_1',name:'Sam',nodeId:'worker_node',position:[0.8,0,-4]}],
  macros:[
   {id:'passage_walls',kind:'enclosure',root_node_id:'floor',zone_id:'passage',center:[0,0,-6],size:[3,3,16],wall_height:2.6,opening_width:1},
   {id:'loading',kind:'platform_steps',root_node_id:'floor',zone_id:'passage',origin:[0,0,0],steps:2,step_height:0.2,step_depth:0.4,width:1.5,platform_depth:1},
  ]});
 const compiled=check(w);
 assert.ok(count(compiled,'passage_walls_wall_')>=4);
 assert.equal(count(compiled,'loading_'),3); // 2 steps + platform top
 const zone=compiled.construction_plan!.zones.find(z=>z.id==='passage')!;
 assert.ok(zone.size[2]>zone.size[0]*4,'passage should be long and narrow');
 assert.equal(compiled.nodes.filter(n=>n.role==='character').length,1);
});

// Retained regression: island authored in a cove stays at its authored position.
test('island in cove stays at authored position after compile (within regression)',()=>{
 const island=box('island','environment',[2,1,1],[0,-0.9,-28]);
 const w=makeWorld({topic:'Island overlook',prop:'Marker',focusId:'marker',focusSize:[0.8,1,0.3],focusPos:[0,0.5,-2],
  zone:{id:'room',center:[0,2,0],size:[20,4,20],kind:'interior'},
  extraNodes:[island],
  extraZones:[{id:'cove',center:[0,1,-16],size:[70,12,70],kind:'outdoor'}],
  extraAssemblies:[{id:'island_assembly',root_node_id:'island',member_node_ids:['island'],zone_id:'cove',requirement_ids:[]}],
  extraRelations:[{id:'rel_island_in_cove',kind:'within',subject_id:'island',target_id:'cove',offset:[0,0,0],clearance:0,tolerance:0.5,required:true}]});
 const compiled=check(w);
 assert.deepEqual(compiled.nodes.find(n=>n.id==='island')!.position,[0,-0.9,-28]);
});

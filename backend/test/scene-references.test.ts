import {test} from 'node:test';import assert from 'node:assert/strict';
import {canonicalSceneReferences} from '../src/scene-references.js';
import type {SessionPlan,SceneSpec,AudioPlan} from '../../docs/handoff/contracts.js';
const plan={characters:[{id:'maya',scene_node_id:'maya_root'}]} as SessionPlan;
const audio={layers:[{id:'arrival',asset_id:'whoosh'}]} as AudioPlan;
function scene():SceneSpec{return {events:[{operation:{type:'character_action',character_id:'maya_root',behavior:'sit'}}],interactions:[],scenario:{steps:[{start_operations:[{type:'play_sound',cue_id:'whoosh'}],actions:[{operations:[{type:'character_action',character_id:'maya_root',behavior:'idle'}]}]}]}} as unknown as SceneSpec;}
test('exact character-root and unique audio-asset aliases resolve in every operation location',()=>{
 const source=scene(),fixed=canonicalSceneReferences(plan,source,audio);
 assert.equal((fixed.events[0].operation as any).character_id,'maya');
 assert.equal((fixed.scenario!.steps[0].start_operations[0] as any).cue_id,'arrival');
 assert.equal((fixed.scenario!.steps[0].actions[0].operations[0] as any).character_id,'maya');
 assert.equal((source.events[0].operation as any).character_id,'maya_root');
});
test('ambiguous and unknown aliases remain invalid instead of selecting arbitrary targets',()=>{
 const p={characters:[{id:'a',scene_node_id:'maya_root'},{id:'b',scene_node_id:'maya_root'}]} as SessionPlan;
 const a={layers:[{id:'a',asset_id:'whoosh'},{id:'b',asset_id:'whoosh'}]} as AudioPlan;
 const fixed=canonicalSceneReferences(p,scene(),a);
 assert.equal((fixed.events[0].operation as any).character_id,'maya_root');
 assert.equal((fixed.scenario!.steps[0].start_operations[0] as any).cue_id,'whoosh');
});
test('a valid canonical ID takes priority over another character root with the same spelling',()=>{
 const p={characters:[{id:'maya_root',scene_node_id:'other_root'},{id:'maya',scene_node_id:'maya_root'}]} as SessionPlan;
 assert.equal((canonicalSceneReferences(p,scene(),audio).events[0].operation as any).character_id,'maya_root');
});

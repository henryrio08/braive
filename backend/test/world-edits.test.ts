import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applyWorldEdits,type EditOperation} from '../src/world-edits.js';
import {prepareWorldCommit,type ApprovedWorld} from '../src/world-commits.js';
import {fixture,SESSION} from './helpers/world-fixture.js';
import {assetManifest} from '../src/assets.js';
import {retimeAttempt} from '../src/attempt-timing.js';

function world():ApprovedWorld {
 const docs=fixture(1);docs.plan.characters[0].role='audience';docs.scene.nodes[2].animation='idle';
 return prepareWorldCommit({session_id:SESSION,expected_revision:0,revision:1,...docs},new Map(),new Map());
}
const apply=(base:ApprovedWorld,operations:EditOperation[],scope:'active'|'next_attempt'='active')=>applyWorldEdits(base,{operations,question:''},scope);

test('compound surface, light and role edits preserve source, character palette, role, goal and boundaries',()=>{
 const base=world(),copy=structuredClone(base),actor=base.plan.characters[0];
 const result=apply(base,[{op:'material',node_ids:['floor'],color:'#334455'},{op:'lighting',change:'brighter'},
  {op:'actor_direction',character_ids:[actor.id],instruction:'Be warmer and more encouraging.'}]);
 assert.deepEqual(base,copy);assert.equal(result.world.scene.nodes[0].material.color,'#334455');
 assert.deepEqual(result.world.scene.nodes[2].material,base.scene.nodes[2].material);
 assert.equal(result.world.plan.characters[0].goal,actor.goal);assert.deepEqual(result.world.plan.characters[0].behavior_boundaries,actor.behavior_boundaries);
 assert.equal(result.world.plan.characters[0].dialogue_style,'Be warmer and more encouraging.');
 assert.equal(result.world.scene.lighting.ambient_intensity,.65);
 assert.throws(()=>apply(base,[{op:'material',node_ids:['char_node'],color:'#334455'}]),/Character palettes/);
});

test('standing population placement uses real floor and preserves existing identities and transforms',()=>{
 const base=world();
 const result=apply(base,[{op:'population',character_ids:['neighbor_1'],target_count:4}]).world;
 assert.equal(result.plan.characters.length,4);
 assert.deepEqual(result.scene.nodes.find(n=>n.id==='char_node'),base.scene.nodes.find(n=>n.id==='char_node'));
 const extras=result.scene.nodes.filter(n=>n.id.startsWith('aud_edit_node_'));
 assert.equal(extras.length,3);assert(extras.every(n=>n.position[1]===0&&n.animation==='idle'));
 assert.equal(new Set(extras.map(n=>JSON.stringify(n.position))).size,3);
 const reduced=apply(result,[{op:'population',character_ids:result.plan.characters.map(c=>c.id),target_count:1}]).world;
 assert.equal(reduced.plan.characters.length,1);assert.equal(reduced.plan.characters[0].id,'neighbor_1');
});

test('conversation targets cannot be erased as audience; failed compound requests publish no partial change',()=>{
 const base=world();base.scene.scenario={objective:'Talk briefly',initial_step_id:'speak',dialogue_policy:'natural',progression:'guided',steps:[
  {id:'speak',prompt:'Talk',terminal:false,start_operations:[],actions:[],conversation_target:'neighbor_1',completion:{trigger:'after_seconds',after_seconds:20,next_step_id:'done'}},
  {id:'done',prompt:'Done',terminal:true,start_operations:[],actions:[]}]};
 const before=structuredClone(base);
 assert.throws(()=>apply(base,[{op:'material',node_ids:['floor'],color:'#abcdef'},{op:'population',character_ids:['neighbor_1'],target_count:0}]),/conversation or stage actors/);
 assert.deepEqual(base,before);
});

test('two actual cups are placed on the requested table; removing a support or task prop is rejected',()=>{
 const base=world(),table=base.scene.nodes.find(n=>n.id==='focus')!;
 const tableAsset=assetManifest.find(a=>a.id.includes('table')&&a.subcategory==='table')!;
 const cup=assetManifest.find(a=>a.subcategory==='cup')!;
 table.geometry={kind:'asset',asset_id:tableAsset.id};table.scale=[2,1,2];
 const result=apply(base,[{op:'add_decoration',asset_id:cup.id,count:2,near_node_id:'focus',placement:'on'}]).world;
 const added=result.scene.nodes.filter(n=>n.id.startsWith('edit_decor_'));
 assert.equal(added.length,2);assert(added.every(n=>n.support_node_id==='focus'&&n.geometry.kind==='asset'&&n.geometry.asset_id===cup.id));
 assert.throws(()=>apply(result,[{op:'remove_decoration',node_ids:['focus']}]),/required task object/);
 assert.equal(apply(result,[{op:'remove_decoration',node_ids:[added[0].id]}]).world.scene.nodes.length,result.scene.nodes.length-1);
});

test('retiming maps narration, events and audio together and leaves route velocity unchanged',()=>{
 const base=world();base.plan.duration_sec=60;base.plan.narrator_beats=[{at_active_second:20,text:'Keep going'}];
 base.scene.motion_paths=[{id:'arrival',purpose:'walk',interpolation:'linear',points:[{at_seconds:5,position:[0,1.6,-1]}]}];
 base.scene.scenario={objective:'Practice',initial_step_id:'arrive',dialogue_policy:'disabled',progression:'guided',steps:[
  {id:'arrive',prompt:'Arrive',terminal:false,start_operations:[{type:'move_viewer',path_id:'arrival'}],actions:[],completion:{trigger:'motion_complete',motion_path_id:'arrival',next_step_id:'hold'}},
  {id:'hold',prompt:'Practice here',terminal:false,start_operations:[],actions:[],completion:{trigger:'after_seconds',after_seconds:50,next_step_id:'done'}},
  {id:'done',prompt:'Done',terminal:true,start_operations:[],actions:[]}]};
 base.scene.events=[{at_active_second:20,operation:{type:'narrate',text:'Keep going'}}];
 base.audio.layers=[{id:'room',asset_id:'room',role:'ambience',loop:true,gain:.3,start_active_second:0,end_active_second:60,ramps:[{at_active_second:20,gain:.2,fade_seconds:2}]}];
 const next=retimeAttempt(base,120);
 assert.deepEqual(next.scene.motion_paths,base.scene.motion_paths);
 const cue=next.plan.narrator_beats[0].at_active_second;
 assert(cue>20);assert.equal(cue,next.scene.events[0].at_active_second);assert.equal(cue,next.audio.layers[0].ramps[0].at_active_second);
 assert.equal(next.audio.layers[0].end_active_second,120);assert.equal(base.plan.duration_sec,60);
 assert.throws(()=>apply(base,[{op:'duration',seconds:120}]),/next attempt/);
 base.scene.motion_paths![0].points[0].at_seconds=20;
 assert.throws(()=>retimeAttempt(base,10),/cannot finish/);
});

test('clarification and deferred requests leave every document unchanged',()=>{
 const base=world();const clarified=applyWorldEdits(base,{operations:[],question:'Which table?'},'active');
 assert.equal(clarified.changed,false);assert.equal(clarified.world,base);
 const deferred=apply(base,[{op:'defer',instruction:'Make the route shorter next time.'}]);
 assert.equal(deferred.changed,false);assert.deepEqual(deferred.world,base);assert.deepEqual(deferred.deferred,['Make the route shorter next time.']);
});

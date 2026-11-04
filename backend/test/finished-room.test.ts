import {test} from 'node:test';
import assert from 'node:assert/strict';
import {finishedRoom} from '../src/finished-room.js';
import type {FinishedRoomMacro} from '../../docs/handoff/contracts.js';
import {fixture} from './helpers/world-fixture.js';
import {compileScene,constructionRequirements} from '../src/construction.js';
const room=():FinishedRoomMacro=>({id:'r',kind:'room_shell',root_node_id:'floor',zone_id:'zone',center:[4,0,-3],size:[8,3,6],wall_thickness:.16,ceiling:true,
 wall_material:{color:'#e5dfd3',roughness:.85},floor_material:{color:'#8c725b',roughness:.8},trim_color:'#f2e9db',ceiling_color:'#eeeae0',
 openings:[{id:'entry',wall:'south',offset:0,width:1.2,height:2.2,sill_height:0,kind:'door'},{id:'daylight',wall:'north',offset:1.8,width:1.6,height:1.4,sill_height:.9,kind:'window'}]});
test('finished shell has real apertures, supported trim and ceiling without situation presets',()=>{
 const m=room(),parts=finishedRoom(m);
 const boxContains=(p:typeof parts[number],point:number[])=>point.every((n,i)=>Math.abs(n-p.position[i])<p.size[i]/2-.001);
 assert(!parts.some(p=>boxContains(p,[4,1,0])),'No hidden wall or baseboard crosses the doorway');
 assert(!parts.filter(p=>p.suffix.includes('_wall_')).some(p=>boxContains(p,[5.8,1.5,-6])),'Window is an actual wall aperture');
 assert(parts.some(p=>p.suffix==='daylight_glass'&&p.material.opacity===.19));
 assert(parts.some(p=>p.suffix==='entry_frame_top'));assert(parts.some(p=>p.suffix==='ceiling'));
 assert(parts.every(p=>p.size.every(n=>Number.isFinite(n)&&n>0)));
 const other=room();other.center=[-10,2,7];other.size=[5,2.7,4];other.openings=[{id:'side',wall:'east',offset:0,width:.9,height:2,sill_height:0,kind:'door'}];
 const shifted=finishedRoom(other);assert(shifted.some(p=>p.suffix==='side_frame_top'));assert(!shifted.some(p=>p.suffix.startsWith('entry_')));
});
test('overlapping or out-of-wall openings are rejected instead of silently blocked',()=>{
 const overlap=room();overlap.openings.push({...overlap.openings[0],id:'overlap'});assert.throws(()=>finishedRoom(overlap),/Finished room/);
 const oversized=room();oversized.openings[0].width=12;assert.throws(()=>finishedRoom(oversized),/Finished room/);
 const roofless=room();roofless.ceiling=false;assert(!finishedRoom(roofless).some(p=>p.suffix==='ceiling'));
});
test('room and actor seating compile into stable executable nodes and keep the approved actor identity',()=>{
 const {plan,scene,audio}=fixture(1),shell=room();shell.center=[0,0,0];shell.size=[12,3,10];shell.zone_id='zone';
 scene.construction_plan={version:'1',seed:12,zones:[{id:'zone',kind:'interior',center:[0,2,0],size:[12,4,10]}],anchors:[],relations:[],routes:[],assemblies:[],
  requirements:constructionRequirements(plan).map(r=>({requirement_id:r.id,node_ids:r.kind==='cast'?['char_node']:['focus'],stage_ids:[],path_ids:[]})),
  macros:[shell,{id:'seats',kind:'seating_rows',root_node_id:'floor',zone_id:'zone',chair_asset_id:'furniture.chair.classic_chair_01',rows:1,seats_per_row:1,origin:[2,0,-3],seat_spacing:1,row_spacing:1.2,facing_yaw:Math.PI,character_node_ids:['char_node']}]};
 const compiled=compileScene(plan,scene,audio),actor=compiled.nodes.find(n=>n.id==='char_node')!;
 assert.equal(actor.animation,'sit');assert.equal(actor.support_node_id,'seats_seat_0_0');assert.equal(plan.characters[0].scene_node_id,actor.id);
 assert(compiled.nodes.some(n=>n.id==='r_ceiling'));assert.equal(compiled.nodes.filter(n=>n.role==='character').length,1);
 assert.deepEqual(compileScene(plan,compiled,audio),compiled,'Recompilation must preserve all generated geometry and placements');
});

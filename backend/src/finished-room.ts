import {AppError} from './contracts.js';
import type {FinishedRoomMacro,Material,SceneNode} from '../../docs/handoff/contracts.js';
import type {Vec3} from './spatial-math.js';

export interface RoomPart {suffix:string;size:Vec3;position:Vec3;material:Material;collision_role:'solid'|'none'}
/** Finished parametric architecture, independent of situation, cast or task.
 * Apertures are genuinely empty wall regions, not windows against solid slabs. */
export function finishedRoom(m:FinishedRoomMacro):RoomPart[] {
 const fail=(message:string):never=>{throw new AppError('INVALID_MODEL_OUTPUT','Finished room needs correction',[{path:'/construction_plan/macros/'+m.id,rule:'macro',message}]);};
 if(!m.center||!m.size||m.center.length!==3||m.size.length!==3||![...m.center,...m.size,m.wall_thickness].every(Number.isFinite)||m.size.some(n=>n<1.8||n>40)||m.wall_thickness<.08||m.wall_thickness>.5||!m.wall_material||!m.floor_material||!Array.isArray(m.openings))return fail('Supply real room dimensions, floor-level center, materials and bounded openings.');
 const [cx,cy,cz]=m.center,[width,height,depth]=m.size,t=m.wall_thickness,parts:RoomPart[]=[],trim:Material={color:m.trim_color,roughness:.65};
 const add=(suffix:string,size:Vec3,position:Vec3,material:Material,collision_role:'solid'|'none'='solid')=>{
  if(size.every(n=>n>.001))parts.push({suffix,size,position,material:structuredClone(material),collision_role});
 };
 if(new Set(m.openings.map(o=>o.id)).size!==m.openings.length||m.openings.length>8)return fail('Each of at most eight openings needs its own identity.');
 for(const wall of ['north','south','east','west'] as const){
  const horizontal=wall==='north'||wall==='south',span=horizontal?width:depth;
  const fixed=(wall==='north'?-depth/2:wall==='south'?depth/2:wall==='west'?-width/2:width/2);
  const point=(along:number,up:number,inset=0):Vec3=>horizontal?[cx+along,cy+up,cz+fixed+(wall==='north'?inset:-inset)]:[cx+fixed+(wall==='west'?inset:-inset),cy+up,cz+along];
  const dimensions=(along:number,up:number,thick:number):Vec3=>horizontal?[along,up,thick]:[thick,up,along];
  const openings=m.openings.filter(o=>o.wall===wall).sort((a,b)=>a.offset-b.offset);
  let cursor=-span/2,serial=0;
  const wallPart=(left:number,right:number,bottom:number,top:number)=>add(wall+'_wall_'+serial++,dimensions(right-left,top-bottom,t),point((left+right)/2,(bottom+top)/2),m.wall_material);
  for(const o of openings){
   if(![o.offset,o.width,o.height,o.sill_height].every(Number.isFinite)||o.width<.5||o.height<.5||o.sill_height<0||o.kind==='door'&&o.sill_height!==0)return fail('An opening needs positive physical dimensions; doors start at floor level.');
   const left=o.offset-o.width/2,right=o.offset+o.width/2,top=o.sill_height+o.height;
   if(left<cursor+.08||right>span/2-.08||top>height-.08)return fail('Openings must fit their wall, retain frame clearance, and not overlap.');
   wallPart(cursor,left,0,height);wallPart(left,right,0,o.sill_height);wallPart(left,right,top,height);cursor=right;
   const frame=.065,inset=t/2+.018;
   add(o.id+'_frame_left',dimensions(frame,o.height+frame,t+.04),point(left,o.sill_height+o.height/2,inset),trim);
   add(o.id+'_frame_right',dimensions(frame,o.height+frame,t+.04),point(right,o.sill_height+o.height/2,inset),trim);
   add(o.id+'_frame_top',dimensions(o.width+frame,frame,t+.04),point(o.offset,top,inset),trim);
   if(o.kind==='window'){
    add(o.id+'_sill',dimensions(o.width+.16,.07,t+.16),point(o.offset,o.sill_height,inset),trim);
    add(o.id+'_glass',dimensions(o.width-.04,o.height-.04,.012),point(o.offset,o.sill_height+o.height/2),{color:'#c9dddd',roughness:.12,opacity:.19,double_sided:true});
    add(o.id+'_mullion',dimensions(.035,o.height,t+.04),point(o.offset,o.sill_height+o.height/2,inset),trim);
   }
  }
  wallPart(cursor,span/2,0,height);
  // Baseboards are split around doorways; no hidden bar blocks the exit.
  const doors=openings.filter(o=>o.kind==='door');let start=-span/2;
  for(const door of [...doors,{offset:span/2,width:0}]){
   const end=door.offset-door.width/2;
   add(wall+'_base_'+serial++,dimensions(end-start,.12,.035),point((start+end)/2,.06,t/2+.018),trim,'none');start=door.offset+door.width/2;
  }
  if(m.ceiling)add(wall+'_cornice',dimensions(span,.09,.055),point(0,height-.045,t/2+.03),trim,'none');
 }
 if(m.ceiling)add('ceiling',[width,.08,depth],[cx,cy+height+.04,cz],{color:m.ceiling_color,roughness:.94});
 return parts;
}

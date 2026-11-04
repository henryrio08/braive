import {AppError} from './contracts.js';
import type {ApprovedWorld} from './world-commits.js';

/** Retain authored travel velocity; distribute time across timed holds, then map
 * global cues onto exactly the same revised timeline. Input remains unchanged. */
export function retimeAttempt(world:ApprovedWorld,duration:number):ApprovedWorld {
 const next=structuredClone(world),{plan,scene,audio}=next,oldDuration=plan.duration_sec;
 const fail=(message:string):never=>{throw new AppError('INVALID_INPUT',message);};
 if(!Number.isInteger(duration)||duration<10||duration>3600)return fail('Duration must be ten seconds to one hour.');
 const steps=scene.scenario?.steps??[],paths=scene.motion_paths??[];
 const pathTime=(id:string|undefined)=>paths.find(p=>p.id===id)?.points.at(-1)?.at_seconds??0;
 const timed:number[]=[],minimums:number[]=[],oldTimes:number[]=[];
 steps.forEach((step,i)=>{
  if(step.terminal){oldTimes.push(0);minimums.push(0);return;}
  const travel=Math.max(0,...step.start_operations.flatMap(op=>op.type==='move_viewer'||op.type==='move_node'?[pathTime(op.path_id)]:[]));
  if(step.completion?.trigger==='after_seconds'){
   oldTimes.push(step.completion.after_seconds??0);minimums.push(travel>0?travel+.1:.5);timed.push(i);
  }else{const seconds=pathTime(step.completion?.motion_path_id);oldTimes.push(seconds);minimums.push(seconds);}
 });
 if(!timed.length&&duration!==oldDuration)return fail('This world has no timed stage to extend; revise its next-attempt stages first.');
 const reserve=Math.min(Math.max(3,oldDuration-oldTimes.reduce((a,b)=>a+b,0)),Math.max(3,duration*.1));
 const minimum=minimums.reduce((a,b)=>a+b,0);
 if(minimum+reserve>duration)return fail('That duration cannot finish the existing movement and stages.');
 const weights=timed.map(i=>Math.max(.5,oldTimes[i]-minimums[i])),weightTotal=weights.reduce((a,b)=>a+b,0),newTimes=[...minimums];
 timed.forEach((index,i)=>{newTimes[index]+=(duration-reserve-minimum)*weights[i]/Math.max(.5,weightTotal);steps[index].completion!.after_seconds=newTimes[index];});
 function time(original:number){
  let oldStart=0,newStart=0;
  for(let i=0;i<oldTimes.length;i++){
   if(oldTimes[i]>0&&original<=oldStart+oldTimes[i])return newStart+(original-oldStart)*newTimes[i]/oldTimes[i];
   oldStart+=oldTimes[i];newStart+=newTimes[i];
  }
  return Math.min(duration,Math.max(0,newStart+(original-oldStart)*(duration-newStart)/Math.max(.001,oldDuration-oldStart)));
 }
 plan.duration_sec=duration;
 plan.narrator_beats.forEach(beat=>beat.at_active_second=time(beat.at_active_second));
 for(const call of plan.tool_calls)if(call.tool==='plan_audio'&&typeof call.arguments==='object'&&call.arguments)call.arguments.duration_sec=duration;
 scene.events.forEach(event=>event.at_active_second=time(event.at_active_second));
 for(const layer of audio.layers){
  const end=time(layer.end_active_second??oldDuration);layer.start_active_second=time(layer.start_active_second);
  if(layer.end_active_second!==undefined)layer.end_active_second=end;
  layer.ramps.forEach(ramp=>{const at=time(ramp.at_active_second),finish=time(ramp.at_active_second+ramp.fade_seconds);ramp.at_active_second=at;ramp.fade_seconds=Math.max(0,Math.min(60,end-at,finish-at));});
 }
 return next;
}

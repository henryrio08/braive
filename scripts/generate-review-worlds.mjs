// Explicit synthetic development inputs. Uses the existing cumulative ledger;
// one server, serial jobs, bounded requests/cost, no microphone or user history.
import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),base='http://127.0.0.1:8788';
const scenarios={
 library:['indoor','Practice presenting a community garden proposal to eight friendly neighbors in a sunny library. I stand in a clear speaking area. Include bookshelves, windows, matched chairs and a small table with a microphone. Allow a short friendly follow-up conversation; nobody hostile.','I can speak for about one minute. Give me room to settle, try the proposal, and hear one natural response.'],
 studio:['indoor','Practice a job interview in a calm modern creative studio. One friendly interviewer sits across a desk; there is a laptop, a warm lamp, windows and a plant. I remain in place and answer a natural opening question.','A one-minute interview feels manageable. No trick questions or personal-space invasion.'],
 garden:['open','Practice giving a short toast to six friends in a leafy community garden at golden hour. A wooden table has real cups, with benches, layered greenery and a clear speaking area. Friendly relevant conversation after the toast.','About a minute. Keep it friendly and leave at least two and a half meters around me.'],
 trail:['open','Practice finding my bearings on a peaceful woodland trail at dusk. Automatically walk slowly from a clearing toward a visible trail sign, pause to notice the landmark, and finish in a reassuring open area. Rich trees, rocks, ground detail and layered sky; no people or speaking task.','A short gentle walk is enough. No cliffs, threats or darkness that hides the path.'],
 elevator:['confined','Practice calmly waiting inside a stationary elevator during a short pause. Two quiet friendly strangers stay at a comfortable distance. The car has convincing panels, real door structure, lights and buttons; the doors open to a lit corridor at the end. No vertical travel or alarm.','One minute, no threatening dialogue, no crowding, and a clear reassuring ending.'],
 passage:['confined','Practice walking slowly through a well-lit service passage to an open doorway at the far end. Include coherent close walls, ceiling fixtures, fitted pipes and visible floor support. The passage turns slightly and opens into a small clear utility room. No people or conversation.','A gentle short route with adequate width. No blocked exits, alarms or threat.'],
 cafe:['held_out','Practice politely asking a barista to correct my drink in a quiet cafe. The actual cafe has a counter, cups, warm lighting, a window, seating and one friendly staff member. Conversation stays in the same place.','A brief natural exchange; no conflict escalation.'],
 terrace:['held_out','Practice settling alone on a small roof garden terrace after stepping automatically through an open doorway. A parapet keeps the edge safely enclosed; trees in planters, a bench and a layered city background give the terrace depth. No speaking task.','No height exposure at the edge, no sudden movement, about a minute.'],
};
const names=process.argv.slice(2);if(!names.length)throw Error('Name the synthetic situations explicitly; no unattended batch default.');
for(const name of names)if(!scenarios[name])throw Error('Unknown review situation '+name);
if(!process.env.BRAIVE_TOKEN)throw Error('Run with the existing backend environment; do not paste a key into commands.');
try{await fetch(base+'/health',{signal:AbortSignal.timeout(700)});throw Error('Port 8788 is occupied; stop the existing server deliberately.');}catch(error){if(error.message.includes('occupied'))throw error;}
const server=spawn(process.execPath,[path.join(root,'scripts/start-phone-test.mjs')],{cwd:root,env:{...process.env,META_REQUEST_LIMIT:'36',META_MAX_COST_USD:'8',BRAIVE_VISUAL_STRICTNESS:'standard',BRAIVE_AUTO_SCENE_REPAIR:'true',BRAIVE_ALLOW_AUDIO:'false'},stdio:['ignore','pipe','pipe']});
server.stdout.on('data',()=>{});server.stderr.on('data',()=>{});
const headers={Authorization:'Bearer '+process.env.BRAIVE_TOKEN,'Content-Type':'application/json'};
const folder=path.join(root,'backend/data/visual-check');await mkdir(folder,{recursive:true});
let currentJob;
try{
 let ready=false;for(let i=0;i<80;i++){try{if((await fetch(base+'/health')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}
 if(!ready)throw Error('Review server did not start.');
 for(const name of names){
  const [family,fear_description,current_ability]=scenarios[name],session_id=crypto.randomUUID(),started=Date.now();
  const request={schema_version:'1',session_id,revision:1,fear_description,current_ability,preferences:[],relevant_history:[],history_choice:'not_available',builder_additions:[],use_history:false,chained_rerun:false};
  const response=await fetch(base+'/v1/session-plans',{method:'POST',headers,body:JSON.stringify(request)});const initial=await response.json();if(!response.ok)throw Error(initial.message);currentJob=initial.job_id;
  console.log(name+': preparation started');let previous='';
  for(;;){
   if(Date.now()-started>605000)throw Error('Ten-minute readiness ceiling reached.');
   const job=await(await fetch(base+'/v1/jobs/'+currentJob,{headers})).json();
   if(job.stage!==previous){previous=job.stage;console.log(name+': '+job.stage);}
   if(['succeeded','failed','cancelled'].includes(job.status)){
    const health=await(await fetch(base+'/health')).json();
    await writeFile(path.join(folder,name+'.json'),JSON.stringify({origin:'synthetic live provider generation',family,request,job,elapsed_seconds:(Date.now()-started)/1000},null,2));
    await writeFile(path.join(folder,'usage.json'),JSON.stringify(health,null,2));
    console.log(name+': '+job.status+'; '+Math.round((Date.now()-started)/1000)+' sec; '+health.meta_requests+' model calls so far');
    if(job.error)console.log('Reason: '+job.error.message+'; '+JSON.stringify(job.error.issues??[]));
    if(job.status!=='succeeded')process.exitCode=1;
    break;
   }
   await new Promise(r=>setTimeout(r,750));
  }
 }
}finally{
 if(currentJob)try{await fetch(base+'/v1/jobs/'+currentJob,{method:'DELETE',headers});}catch{}
 server.kill('SIGTERM');
}

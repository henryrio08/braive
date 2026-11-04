// Synthetic check within the SAME persistent continuation allowance; never resets the ledger.
import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const base='http://127.0.0.1:8788';
let occupied=false;
try { await fetch(base+'/health',{signal:AbortSignal.timeout(1000)}); occupied=true; } catch {}
if(occupied) throw Error('Port 8788 is already in use. Stop the existing test deliberately before starting a synthetic check.');
const child=spawn(process.execPath,[path.join(root,'scripts/start-phone-test.mjs')],{cwd:root,env:{...process.env,META_REQUEST_LIMIT:'5',META_MAX_COST_USD:'3.00',BRAIVE_ALLOW_AUDIO:'false'},stdio:['ignore','pipe','pipe']});
child.stdout.on('data',()=>{});child.stderr.on('data',()=>{});
// Eight minutes: inside the product's ten-minute generation ceiling, long
// enough for author, editor, builder and one bounded repair to complete.
const globalDeadline=setTimeout(()=>{child.kill('SIGTERM');console.error('Bounded test reached its overall shutdown deadline.');process.exitCode=1;},480000);
const headers={Authorization:`Bearer ${process.env.BRAIVE_TOKEN}`,'Content-Type':'application/json'};
let jobID;
try {
 for(let i=0;i<40;i++){try{if((await fetch(base+'/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 const scenarios={
 library:{fear_description:'Practice a one-minute community garden proposal to eight friendly neighbors in a sunny library. Include a clear speaking area, windows, and responsive audience questions.',current_ability:'Synthetic test participant: can speak for one minute, but gets flustered by follow-up questions. Keep it friendly.'},
 swim:{fear_description:'Practice swimming calmly through open water from a quiet cove toward a small island with palms, staying near the surface at an easy pace.',current_ability:'Synthetic test participant: a cautious swimmer who is comfortable floating and swimming slowly in calm, clear water. Keep it gentle and unhurried.'},
};
 const scenarioName=process.env.BRAIVE_LIVE_SCENARIO??'library';
 const chosen=scenarios[scenarioName];if(!chosen)throw Error('Unknown BRAIVE_LIVE_SCENARIO: '+scenarioName);
 console.log('Scenario:',scenarioName);
 const request={schema_version:'1',session_id:crypto.randomUUID(),revision:1,...chosen,preferences:[],relevant_history:[],history_choice:'not_available',builder_additions:[],use_history:false,chained_rerun:false};
 const start=await fetch(base+'/v1/session-plans',{method:'POST',headers,body:JSON.stringify(request)});
 const job=await start.json();if(!start.ok)throw Error(job.message);jobID=job.job_id;
 let previous='';
 for(;;){
  const result=await (await fetch(base+'/v1/jobs/'+jobID,{headers})).json();
  if(result.stage!==previous){console.log(result.stage);previous=result.stage;}
  if(['failed','succeeded','cancelled'].includes(result.status)){
   await mkdir(path.join(root,'backend/data/live-test'),{recursive:true});
   await writeFile(path.join(root,'backend/data/live-test/result.json'),JSON.stringify(result,null,2));
   await writeFile(path.join(root,`backend/data/live-test/result-${scenarioName}-${jobID}.json`),JSON.stringify(result,null,2));
   const health=await(await fetch(base+'/health')).json();
   console.log('Final status:',result.status,'Meta text requests:',health.meta_requests);
   console.log('Reserved upper cost allowance:',health.reserved_cost_usd,'USD; completed-response usage:',JSON.stringify(health.usage));
   await writeFile(path.join(root,'backend/data/live-test/usage.json'),JSON.stringify(health,null,2));
   if(result.error){console.log('Reason:',result.error.message);console.log('Validation issues:',JSON.stringify(result.error.issues??[]));}
   if(result.status==='succeeded')console.log('Generated nodes:',result.result.scene.nodes.length,'characters:',result.result.plan.characters.length);
   if(result.status!=='succeeded')process.exitCode=1;
   break;
  }
  await new Promise(r=>setTimeout(r,500));
 }
} catch(error){console.error(error.message);process.exitCode=1;}
finally{clearTimeout(globalDeadline);child.kill('SIGTERM');}

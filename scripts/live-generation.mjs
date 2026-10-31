// Run only with Henry's explicit approval for ONE bounded synthetic test.
import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const base='http://127.0.0.1:8788';
const child=spawn(process.execPath,['--import','tsx','--env-file=.env','src/server.ts'],{cwd:path.join(root,'backend'),env:{...process.env,BRAIVE_ALLOW_META:'true',META_REQUEST_LIMIT:'5',META_MAX_COST_USD:'1.00',BRAIVE_ALLOW_AUDIO:'false',HOST:'127.0.0.1',PORT:'8788'},stdio:['ignore','pipe','pipe']});
child.stdout.on('data',()=>{});child.stderr.on('data',()=>{});
const globalDeadline=setTimeout(()=>{child.kill('SIGTERM');console.error('Bounded test reached its overall shutdown deadline.');process.exitCode=1;},125000);
const headers={Authorization:`Bearer ${process.env.BRAIVE_TOKEN}`,'Content-Type':'application/json'};
let jobID;
try {
 for(let i=0;i<40;i++){try{if((await fetch(base+'/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 const request={schema_version:'1',session_id:crypto.randomUUID(),revision:1,fear_description:'Practice a one-minute community garden proposal to eight friendly neighbors in a sunny library. Include a clear speaking area, windows, and responsive audience questions.',current_ability:'Synthetic test participant: can speak for one minute, but gets flustered by follow-up questions. Keep it friendly.',preferences:[],relevant_history:[],history_choice:'not_available',builder_additions:[],use_history:false,chained_rerun:false};
 const start=await fetch(base+'/v1/session-plans',{method:'POST',headers,body:JSON.stringify(request)});
 const job=await start.json();if(!start.ok)throw Error(job.message);jobID=job.job_id;
 let previous='';
 for(;;){
  const result=await (await fetch(base+'/v1/jobs/'+jobID,{headers})).json();
  if(result.stage!==previous){console.log(result.stage);previous=result.stage;}
  if(['failed','succeeded','cancelled'].includes(result.status)){
   await mkdir(path.join(root,'backend/data/live-test'),{recursive:true});
   await writeFile(path.join(root,'backend/data/live-test/result.json'),JSON.stringify(result,null,2));
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

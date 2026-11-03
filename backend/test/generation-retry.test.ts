import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {fileURLToPath} from 'node:url';

test('a replayed generation POST returns the same job without another model call',async()=>{
 const token='offline-generation-retry-placeholder';
 const child=spawn(process.execPath,['--import','tsx','src/server.ts'],{
  cwd:fileURLToPath(new URL('..',import.meta.url)),
  env:{...process.env,HOST:'127.0.0.1',PORT:'0',BRAIVE_TOKEN:token,BRAIVE_ALLOW_META:'false',BRAIVE_TEST_MODE:'false',BRAIVE_ALLOW_AUDIO:'false'},
  stdio:['ignore','pipe','pipe']});
 try {
  const port=await new Promise<number>((resolve,reject)=>{
   const timer=setTimeout(()=>reject(Error('Offline server startup timed out')),5000);
   child.stdout.on('data',data=>{const m=String(data).match(/listening on (\d+)/);if(m){clearTimeout(timer);resolve(Number(m[1]));}});
   child.once('exit',code=>{clearTimeout(timer);reject(Error(`Offline server exited ${code}`));});
  });
  const base=`http://127.0.0.1:${port}`;
  const input={schema_version:'1',session_id:crypto.randomUUID(),revision:1,fear_description:'Offline garden proposal',current_ability:'Keep it friendly',preferences:[],relevant_history:[],history_choice:'not_available',builder_additions:[],use_history:false,chained_rerun:false};
  const post=async(body:unknown)=>fetch(base+'/v1/session-plans',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(body)});
  const first=await post(input);assert.equal(first.status,202);const original=await first.json();
  const replay=await post({...input});assert.equal(replay.status,202);assert.equal((await replay.json()).job_id,original.job_id);
  const changed=await post({...input,current_ability:'Changed boundaries'});assert.equal(changed.status,409);
  assert.equal((await(await fetch(base+'/health')).json()).meta_requests,0);
 } finally {
  const exited=new Promise(resolve=>child.once('exit',resolve));child.kill('SIGTERM');await Promise.race([exited,delay(1000)]);
  if(child.exitCode===null)child.kill('SIGKILL');
 }
});

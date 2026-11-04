import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {fileURLToPath} from 'node:url';

test('idle phone server stays reachable; only authenticated practice actions renew access',async()=>{
 const token='offline-phone-server-test-token';
 const child=spawn(process.execPath,['--import','tsx','src/server.ts'],{
  cwd:fileURLToPath(new URL('..',import.meta.url)),
  env:{...process.env,HOST:'127.0.0.1',PORT:'0',BRAIVE_TOKEN:token,
   BRAIVE_TEST_MODE:'true',BRAIVE_ALLOW_META:'true',BRAIVE_ALLOW_AUDIO:'false',
   BRAIVE_TEST_WINDOW_SECONDS:'0.3',MODEL_API_KEY:'offline-placeholder',META_BASE_URL:'http://127.0.0.1:1/no-provider'},
  stdio:['ignore','pipe','pipe'],
 });
 try{
  const port=await new Promise<number>((resolve,reject)=>{
   const timeout=setTimeout(()=>reject(Error('Local test server startup timed out')),5000);
   child.stdout.on('data',data=>{const match=String(data).match(/listening on (\d+)/);if(match){clearTimeout(timeout);resolve(Number(match[1]));}});
   child.once('exit',code=>{clearTimeout(timeout);reject(Error(`Local test server exited: ${code}`));});
  });
  const base=`http://127.0.0.1:${port}`;
  const health=async()=>{const r=await fetch(base+'/health');assert.equal(r.status,200);return r.json();};
  assert.equal((await health()).live_test_active,false);
  assert.equal((await fetch(base+'/v1/connection')).status,401);
  const paired=await fetch(base+'/v1/connection',{headers:{Authorization:`Bearer ${token}`}});
  assert.equal(paired.status,200);
  assert.deepEqual(await paired.json(),{status:'ok'});
  assert.equal((await health()).live_test_active,false,'Read-only pairing must not renew paid activity');
  const post=async(authorized:boolean)=>fetch(base+'/v1/session-plans',{
   method:'POST',headers:{'Content-Type':'application/json',...(authorized?{Authorization:`Bearer ${token}`}:{})},
   body:'{}', // Invalid before any model or budget reservation; never contact a provider.
  });
  assert.equal((await post(false)).status,401);
  assert.equal((await health()).live_test_active,false);
  assert.equal((await post(true)).status,400);
  assert.equal((await health()).live_test_active,true);
  await delay(450);
  const idle=await health();
  assert.equal(idle.live_test_active,false);
  assert.equal(idle.meta_requests,0);
  assert.equal((await post(false)).status,401);
  assert.equal((await health()).live_test_active,false);
  assert.equal((await post(true)).status,400);
  const renewed=await health();
  assert.equal(renewed.live_test_active,true);
  assert.equal(renewed.meta_requests,0);
 }finally{
  const exited=new Promise(resolve=>child.once('exit',resolve));
  child.kill('SIGTERM');
  await Promise.race([exited,delay(1000)]);
  if(child.exitCode===null)child.kill('SIGKILL');
 }
});

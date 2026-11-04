import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn,type ChildProcess} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {randomUUID,createHash} from 'node:crypto';
import sharp from 'sharp';
import {fixture,SESSION} from './helpers/world-fixture.js';

test('HTTP world prepare/edit/commit/restart/cancel and authenticated image lifecycle use zero provider calls',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'braive-http-')),token='braive-offline-world-http-token';
 let child:ChildProcess|undefined,base='';
 async function stop(){
  if(!child||child.exitCode!==null)return;
  const ended=new Promise(resolve=>child!.once('exit',resolve));child.kill('SIGTERM');await Promise.race([ended,delay(1500)]);
  if(child.exitCode===null)child.kill('SIGKILL');child=undefined;
 }
 async function start(){
  child=spawn(process.execPath,['--import','tsx','src/server.ts'],{cwd:fileURLToPath(new URL('..',import.meta.url)),
   env:{...process.env,HOST:'127.0.0.1',PORT:'0',BRAIVE_TOKEN:token,BRAIVE_DATA_DIR:directory,BRAIVE_ALLOW_META:'false',BRAIVE_ALLOW_AUDIO:'false',MODEL_API_KEY:'',BRAIVE_TEST_MODE:'true'},stdio:['ignore','pipe','pipe']});
  const port=await new Promise<number>((resolve,reject)=>{
   let log='';const timeout=setTimeout(()=>reject(Error('Server startup timed out '+log)),8000);
   child!.stderr!.on('data',data=>log+=String(data));
   child!.stdout!.on('data',data=>{const match=String(data).match(/listening on (\d+)/);if(match){clearTimeout(timeout);resolve(Number(match[1]));}});
   child!.once('exit',code=>{clearTimeout(timeout);reject(Error('Server exited '+code+' '+log));});
  });base='http://127.0.0.1:'+port;
 }
 async function request(path:string,method='GET',body?:unknown,status=200){
  const response=await fetch(base+path,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  const value=await response.text();assert.equal(response.status,status,value);return value?JSON.parse(value):undefined;
 }
 try{
  await start();assert.equal((await fetch(base+'/v1/connection')).status,401);
  const image=await sharp({create:{width:1800,height:900,channels:3,background:'#447788'}}).png().toBuffer();
  const asset=await request('/v1/assets','POST',{content_base64:image.toString('base64'),purpose:'surface'},201);
  assert.equal(asset.width,1024);assert.equal(asset.height,512);
  assert.equal((await request('/v1/assets','POST',{content_base64:image.toString('base64')})).id,asset.id);
  assert.equal((await fetch(base+'/v1/assets/'+asset.id)).status,401);
  const bytes=await fetch(base+'/v1/assets/'+asset.id,{headers:{Authorization:'Bearer '+token}});
  assert.equal(createHash('sha256').update(Buffer.from(await bytes.arrayBuffer())).digest('hex'),asset.sha256);
  assert.equal((await request('/v1/assets/'+asset.id+'/metadata')).sha256,asset.sha256);
  const first={session_id:SESSION,expected_revision:0,revision:1,...fixture(1),transaction_id:randomUUID()};
  first.scene.nodes[0].material.texture_asset_id=asset.id;
  await request('/v1/world-preparations','POST',first);await request('/v1/worlds/'+SESSION,'GET',undefined,404);
  await request('/v1/assets/'+asset.id,'DELETE',undefined,409);
  const initial=await request('/v1/world-commits','POST',first);
  assert.equal((await request('/v1/world-commits','POST',first)).hash,initial.hash);
  const edit=await request('/v1/world-edit-operations','POST',{session_id:SESSION,expected_revision:1,scope:'active',edit:{question:'',operations:[{op:'material',node_ids:['floor'],color:'#445566'}]}});
  assert.equal(edit.status,'ready');assert.equal((await request('/v1/worlds/'+SESSION)).scene.nodes[0].material.texture_asset_id,asset.id,'Preparation must not publish');
  const second={session_id:SESSION,expected_revision:1,revision:2,plan:edit.plan,scene:edit.scene,audio:edit.audio,transaction_id:randomUUID()};
  second.plan.revision=second.scene.revision=second.audio.revision=2;
  await request('/v1/world-commits','POST',second);await stop();await start();
  assert.equal((await request('/v1/worlds/'+SESSION)).plan.revision,2);
  await request('/v1/world-edit-operations','POST',{session_id:SESSION,expected_revision:1,scope:'active',edit:{question:'',operations:[]}},409);
  const restored=await request('/v1/world-transactions/'+second.transaction_id+'/cancel','POST',{});
  assert.equal(restored.plan.revision,3);assert.equal(restored.scene.nodes[0].material.texture_asset_id,asset.id);
  await request('/v1/world-commits','POST',second,409);
  assert.equal((await request('/health')).meta_requests,0);
  await request('/v1/worlds/'+SESSION,'DELETE',undefined,204);
  await request('/v1/assets/'+asset.id,'DELETE',undefined,204);
  await stop();await start();await request('/v1/worlds/'+SESSION,'GET',undefined,404);
  await request('/v1/world-commits','POST',first,409);
 } finally {await stop();rmSync(directory,{recursive:true,force:true});}
});

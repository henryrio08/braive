import {activeBudget} from './budget.js';
import {PhoneTestWindow} from './phone-test-window.js';
import {canonicalSceneReferences} from './scene-references.js';
import {assertCurrentDialogue,dialogueContext} from './dialogue.js';
import {meshCatalog,assetManifest,characterIDs} from './assets.js';
import express from 'express';
import { createServer } from 'node:http';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import {writeFileSync} from 'node:fs';
import { WebSocketServer, WebSocket } from 'ws';
import { AppError, validate, sceneIssues, planIssues } from './contracts.js';
import { authoring, model, provenance, requestCount, reservedCostUSD, usageLog } from './meta.js';
import type { Job, PlanRequest, SessionPlan, SceneSpec, AudioPlan } from '../../docs/handoff/contracts.js';
const app=express(); app.use(express.json({limit:'2mb'})); app.disable('x-powered-by');
const secret=process.env.BRAIVE_TOKEN;
if(!secret || secret.length<20) throw new Error('Set BRAIVE_TOKEN to a random string of at least 20 characters');
function authorized(value: string | undefined) { const a=Buffer.from(value??''), b=Buffer.from(`Bearer ${secret}`); return a.length===b.length && timingSafeEqual(a,b); }
const phoneWindow=process.env.BRAIVE_TEST_MODE==='true'
 ? new PhoneTestWindow(process.env.BRAIVE_ALLOW_META==='true',Number(process.env.BRAIVE_TEST_WINDOW_SECONDS??900)) : undefined;
let idleTimer:NodeJS.Timeout|undefined;
if(phoneWindow)process.env.BRAIVE_ALLOW_META='false';
function scheduleIdlePause(){
 clearTimeout(idleTimer);
 idleTimer=setTimeout(()=>{
  if(phoneWindow?.active){scheduleIdlePause();return;}
  process.env.BRAIVE_ALLOW_META='false';
  console.log('[phone test] Idle provider access paused; local server remains available.');
 },Math.max(1,phoneWindow?.remainingMilliseconds??0)).unref();
}
app.get('/health',(_req,res)=>res.json({status:'ok',meta_configured:!!process.env.MODEL_API_KEY,meta_requests:requestCount,reserved_cost_usd:reservedCostUSD,usage:usageLog,
 ...(phoneWindow?{live_test_active:phoneWindow.active,live_test_seconds_remaining:phoneWindow.remainingSeconds}:{})}));
app.use((req,res,next)=> authorized(req.headers.authorization) ? next() : res.status(401).json({code:'UNAUTHORIZED',message:'Pair this phone with the Mac backend.'}));
app.use((req,_res,next)=>{
 if(phoneWindow?.renew(req.method,req.path)){
  process.env.BRAIVE_ALLOW_META='true';
  scheduleIdlePause();
 }
 next();
});
const approved=new Map<string,{plan:SessionPlan,scene:SceneSpec,audio:AudioPlan}>();
const attempts=new Map<string,{deadline:number,repairs:number}>();
const jobs=new Map<string,Job>(); const running=new Map<string,AbortController>(); const revisions=new Map<string,number>();

const capabilities={version:'iphone-initial-1',nodes:350,resolved_nodes:1000,primitives:180000,geometry_bytes:24000000,resource_notes:'Draw-call, texture and resident-memory targets require physical-device profiling; they are not runtime-enforced caps.',units:'meters',eye_height:1.6,initial_forward:'negative Z',geometry:['box','plane','sphere','cylinder','asset'],characters:'Choose a registered rigged character.base asset matching appearance and posture. Prefer the clothed casual adults for everyday people; preserve skin/hair and tint clothing only. casual_adult_01 has idle/walk/run/wave; casual_adult_02 also supports sit. neutral_humanoid_01 remains a single-color mannequin. Never use crowd_proxy as a character.',voices:['default'],asset_catalog_format:'category.subcategory: [[asset_id, triangle_count], ...]. All assets normalized to meters, base y=0, forward -Z. Use each GLB intact; do not author its mesh or skeleton children.',assets:meshCatalog, audio_assets:['forest','piano','wind','room','crowd','whoosh']};
capabilities.version='iphone-scenarios-2';
Object.assign(capabilities,{scenario_engine:'Ordered executable stages, local voice actions, timed/motion-completion transitions, terminal goal. Optional conversation only by explicit ASK name. No automatic chat fallback.',movement:'move_viewer follows an authored motion_paths trajectory in meters; each path starts at the current camera position, points are absolute destinations at increasing positive seconds. Preserve head-tracked orientation. Paths can be interrupted by another path without teleporting; STOP freezes the active clock. walk, run, swim, climb, fall, glide, ride and other trajectories use the same generic system. move_node animates another actor/prop along a path, optionally facing its travel direction.',view_distance_meters:10000});
Object.assign(capabilities,{character_assets:assetManifest.filter(a=>characterIDs.has(a.id)).map(a=>({asset_id:a.id,tags:a.tags,resolved_nodes:a.resolved_node_count,triangles:a.approx_tris,behaviors:a.id.endsWith('casual_adult_02')?['idle','walk','run','sit']:a.id.endsWith('casual_adult_01')?['idle','walk','run','gesture']:['idle','listen','speak','gesture','walk','run','swim']}))});
const assets=capabilities.audio_assets.map(id=>({id,kind:'audio',description:`Bundled synthesized ${id}`,origin:'bundled'}));
async function generate(request:PlanRequest, job:Job, signal:AbortSignal) {
 let plan:SessionPlan|undefined, scene:SceneSpec|undefined, audio:AudioPlan|undefined, issues:unknown;
 const previous=approved.get(request.session_id)??(request.parent_session_id?approved.get(request.parent_session_id):undefined);
 for(let attempt=0;attempt<2;attempt++) {
  try {
   if(!plan) { job.stage='Coordinating your situation'; plan=await model('SessionPlan',{request,capabilities,issues,previous_plan:previous?.plan},`You coordinate Braive situational practice. ${authoring}\nUse current ability and explicit boundaries. Copy session_id/revision. Intro includes exact stop_reminder, at most 18 words total. Choose default voice IDs. Return safety decision before generating any scene. Prefer named registered GLB assets; generate layout and interactions. Choose Character.asset_id from registered character.base IDs and a clothing color_hex for each Character. Use casual_adult_02 for a seated participant; choose a clothed adult matching requested appearance. Do not invent mesh IDs. Procedural primitives are environment/task geometry only; listed empty subcategories remain gaps.`,signal); }
   if(plan!.safety.decision==='refuse') throw new AppError('INVALID_INPUT',plan!.safety.reason+' '+plan!.safety.practice_preserving_alternative);
   if(plan!.session_id!==request.session_id || plan!.revision!==request.revision) throw new AppError('INVALID_MODEL_OUTPUT','Coordinator revision mismatch');
   const pIssues=planIssues(plan!); if(pIssues.length) throw new AppError('INVALID_MODEL_OUTPUT','Invalid coordinator invariants',pIssues);
   if(!plan!.experience)throw new AppError('INVALID_MODEL_OUTPUT','Coordinator must plan executable experience stages');
   if(plan!.characters.some(c=>!c.asset_id))throw new AppError('INVALID_MODEL_OUTPUT','Coordinator must choose the registered asset_id for every character');
   job.stage=attempt?'Repairing scene validation issues':'Authoring spatial scene and sound';
   // Audio first supplies a stable cue manifest to scene authoring.
   audio??=await model('AudioPlan',{plan,available_assets:assets},'Select only supplied audio assets. Required whoosh. Keep narrative speech audible. Match plan revision.',signal);
   scene=await model('SceneSpec',{plan,capabilities,audio,previous_scene:scene??previous?.scene,issues},authoring+" Use registered GLBs for characters and props; primitives for environment/task geometry. Preserve each Character.asset_id exactly and copy Character.color_hex to Material.color. Use node animation sit for seated casual_adult_02 characters; place their feet on the floor and match chair positions to their seated pose. Place normalized asset bases at floor height. No unregistered IDs. Neutral behavior uses app-owned joint motions, not invented GLB animation clips. Return compact JSON with concise descriptions. Prefer 30-60 scene nodes when sufficient for all approved participants, setting, depth and interactions; never remove task semantics to meet that guideline.",signal,true);
   scene=canonicalSceneReferences(plan!,scene!,audio!);
   const errors=sceneIssues(plan!,scene!,audio!);
   for(const l of audio!.layers) if(!capabilities.audio_assets.includes(l.asset_id)) errors.push({path:'/audio/layers',rule:'asset',message:'Unknown audio asset'});
   if(errors.length) throw new AppError('INVALID_MODEL_OUTPUT','Scene requires repair',errors);
   signal.throwIfAborted();
   if(revisions.get(request.session_id)!==request.revision) throw new AppError('CANCELLED','Superseded revision');
   job.result={plan:plan!,scene:scene!,audio:audio!};approved.set(request.session_id,job.result); job.status='succeeded'; job.stage='Ready for device validation'; return;
  } catch(e) {
   if(process.env.BRAIVE_TEST_MODE==='true' && plan && scene && audio){
    try{writeFileSync(new URL('../data/last-rejected-scene.json',import.meta.url),JSON.stringify({plan,scene,audio,issues:e instanceof AppError?e.issues:issues??[]},null,2),{mode:0o600});}catch{}
   }
   if(e instanceof AppError && e.code==='INVALID_MODEL_OUTPUT' && attempt===0) { attempts.get(job.job_id)!.repairs++;issues=e.issues.length?e.issues:[{message:e.message}]; if(e.issues.some(i=>i.path.startsWith('/audio/')))audio=undefined; if(plan && planIssues(plan).length) {plan=undefined;audio=undefined;scene=undefined;} continue; } throw e;
  }
 }
}
app.post(['/v1/session-plans','/v1/scene-revisions'],(req,res,next)=>{
 try {
  validate('PlanRequest',req.body); const input:PlanRequest=req.body;
  if(!input.use_history && input.relevant_history.length) throw new AppError('INVALID_INPUT','Declined history must be empty');
  if(input.chained_rerun && !input.parent_session_id) throw new AppError('INVALID_INPUT','Chained session needs parent');
  if((revisions.get(input.session_id)??0)>=input.revision) throw new AppError('CONFLICT','Revision must increase',[],409);
  for(const [id,j] of jobs) if(j.session_id===input.session_id && running.has(id)) {running.get(id)!.abort(); j.status='cancelled';}
  revisions.set(input.session_id,input.revision);
  const job:Job={job_id:randomUUID(),session_id:input.session_id,revision:input.revision,status:'running',stage:'Starting generation'};
  if(running.size>=3) throw new AppError("RATE_LIMITED","Too many active generation jobs",[],429);
  attempts.set(job.job_id,{deadline:Date.now()+120000,repairs:0});
  jobs.set(job.job_id,job); const controller=new AbortController(); running.set(job.job_id,controller);
  const timer=setTimeout(()=>controller.abort(new Error('120-second generation ceiling reached')),120000);
  void generate(input,job,controller.signal).catch(e=>{
   if(job.status==='cancelled') return;
   job.status='failed';job.error={code:controller.signal.aborted?'TIMEOUT':e.code??'PROVIDER_UNAVAILABLE',message:controller.signal.aborted?'Generation ended at two minutes. Retry, revise, or cancel.':e.message,retryable:true,request_id:job.job_id,issues:e.issues};
  }).finally(()=>{clearTimeout(timer);running.delete(job.job_id);console.log('[generation]',JSON.stringify({job_id:job.job_id,status:job.status,elapsed_seconds:(Date.now()-(attempts.get(job.job_id)!.deadline-120000))/1000,error_code:job.error?.code,nodes:job.result?.scene.nodes.length}));});
  res.status(202).json(job);
 } catch(e){next(e);}
});
// Extension to the project contract: device preflight shares the original repair allowance/deadline.
app.post('/v1/jobs/:id/validation',async(req,res,next)=>{
 const job=jobs.get(req.params.id), attempt=attempts.get(req.params.id);
 try {
  if(!job?.result || !attempt || job.status!=='succeeded') throw new AppError('CONFLICT','No assembled generation to repair',[],409);
  if(attempt.repairs>=1 || Date.now()>=attempt.deadline) throw new AppError('TIMEOUT','Repair allowance or generation deadline exhausted. Retry, revise, or cancel.',[],408);
  if(typeof req.body.message!=='string' || req.body.message.length>2000) throw new AppError('INVALID_INPUT','Provide a bounded validation explanation');
  attempt.repairs++;job.status='running';job.stage='Repairing device visibility checks';
  const controller=new AbortController();running.set(job.job_id,controller);
  const timer=setTimeout(()=>controller.abort(),Math.max(1,attempt.deadline-Date.now()));
  res.status(202).json(job);
  try {
   const {plan,audio,scene}=job.result;
   const repaired=canonicalSceneReferences(plan,await model('SceneSpec',{plan,audio,previous_scene:scene,capabilities,issues:[{path:'/nodes',rule:'native_preflight',message:req.body.message}]},authoring,controller.signal,true),audio);
   const errors=sceneIssues(plan,repaired,audio);if(errors.length) throw new AppError('INVALID_MODEL_OUTPUT','Native repair invalid',errors);
   controller.signal.throwIfAborted();if(revisions.get(job.session_id)!==job.revision)return;
   job.result={plan,audio,scene:repaired};approved.set(job.session_id,job.result);job.status='succeeded';job.stage='Ready for device validation';
  }catch(e:any){job.status='failed';job.error={code:controller.signal.aborted?'TIMEOUT':e.code??'INVALID_MODEL_OUTPUT',message:e.message,retryable:true,request_id:job.job_id,issues:e.issues};}
  finally{clearTimeout(timer);running.delete(job.job_id);}
 }catch(e){next(e);}
});
app.get('/v1/jobs/:id',(req,res)=>{const j=jobs.get(req.params.id); j?res.json(j):res.status(404).json({message:'Job not found'});});
app.delete('/v1/jobs/:id',(req,res)=>{const j=jobs.get(req.params.id); if(j){running.get(j.job_id)?.abort();j.status='cancelled';}res.sendStatus(204);});
const routes=[['dialogue','DialogueRequest','DialogueResult','Respond as the specified character to the actual user answer. At most two short sentences, 35 words total. One speaker. Use character gestures only; scenario actions own movement and world changes. Never invent observations.'],['feedback','FeedbackRequest','FeedbackResult','Only cite supplied observation IDs. Maximum three positive did_well and three noticed. Include a quick improvement if supported. No diagnosis or inferred eye contact.'],['adaptations','AdaptationRequest','AdaptationResult','Use self-report, preferences, and supplied evidence IDs. Maintain if evidence is missing; ease or maintain after early quit/high difficulty. Preserve scenario identity.']] as const;
for(const [path,requestSchema,resultSchema,instructions] of routes) app.post(`/v1/${path}`,async(req,res,next)=>{
 try {validate(requestSchema,req.body);
  let context:any=req.body;
  if(path==='dialogue') {
   const saved=approved.get(req.body.session_id);
   assertCurrentDialogue(req.body,saved?.plan,revisions.get(req.body.session_id));
   if(saved!.scene.scenario?.dialogue_policy==='disabled')throw new AppError('INVALID_INPUT','This experience uses local scenario actions, not character dialogue');
   context=dialogueContext(req.body,saved!);
  }
  const result=await model(resultSchema,context,instructions,AbortSignal.timeout(25000));
  const owner=path==='feedback'?req.body.plan:req.body.previous_plan;
  if(path!=='dialogue' && (result.session_id!==owner.session_id || path==='feedback' && result.revision!==owner.revision))
   throw new AppError('INVALID_MODEL_OUTPUT','Post-session result does not match the requested session');
  const observations=req.body.observations??[];const ids=new Set(observations.map((o:any)=>o.id));
  const evidence=[...(result.evidence_ids??[]),...(result.did_well??[]).flatMap((i:any)=>i.evidence_ids),...(result.noticed??[]).flatMap((i:any)=>i.evidence_ids)];
  if(evidence.some((id:string)=>!ids.has(id))) throw new AppError('INVALID_MODEL_OUTPUT','Unknown evidence ID');
  if(path==='dialogue') {
   const saved=approved.get(req.body.session_id);
   assertCurrentDialogue(req.body,saved?.plan,revisions.get(req.body.session_id));
   const valid=sceneIssues(saved!.plan,{...saved!.scene,events:result.operations.map((operation:any)=>({at_active_second:0,operation}))},saved!.audio);
   if(valid.length) throw new AppError('INVALID_MODEL_OUTPUT','Invalid dialogue operation',valid);
  }
  res.json(result);
 }catch(e){next(e);}
});
app.get('/v1/provenance/:id',(req,res)=>res.json({mode:'live',model_ids:[process.env.SPARK_MODEL??'muse-spark-1.3',process.env.WONDER_MODEL??'muse-wonder-1.0'],request_ids:provenance.get(req.params.id)??[]}));
app.use((e:any,_req:express.Request,res:express.Response,_next:express.NextFunction)=>res.status(e.status??500).json({code:e.code??'INVALID_INPUT',message:e.message,issues:e.issues??[],request_id:randomUUID(),retryable:true}));
const server=createServer(app); const wss=new WebSocketServer({noServer:true,maxPayload:100000});
server.on('upgrade',(req,socket,head)=>{
 const diagnostic=req.url==='/v1/diagnostics/audio' && process.env.BRAIVE_TEST_MODE==='true';
 if((req.url!=='/v1/transcribe' && !diagnostic) || !authorized(req.headers.authorization)) {
  socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');socket.destroy();return;
 }
 wss.handleUpgrade(req,socket,head,client=>{
  if(!diagnostic){wss.emit('connection',client);return;}
  // Local transport measurement only: count bytes, never retain audio or contact a provider.
  let bytes=0;client.send(JSON.stringify({sessionId:'local-transport-check'}));
  const timer=setTimeout(()=>client.close(1000,'Local check ended'),20000);
  client.on('message',(data,binary)=>{if(binary){bytes+=Array.isArray(data)?data.reduce((n,b)=>n+b.byteLength,0):data.byteLength;client.send(JSON.stringify({type:'audioProgress',audioProcessedMs:bytes/48}));}});
  client.on('close',()=>{clearTimeout(timer);console.log('[local audio check]',bytes,'bytes received');});
 });
});
wss.on('connection',(client:WebSocket)=>{
 if(process.env.BRAIVE_ALLOW_AUDIO === 'false'){client.close(1008,'Audio disabled in bounded test');return;}
 if(process.env.BRAIVE_ALLOW_META !== 'true'){client.close(1008,'Meta spending disabled');return;}
 if(!process.env.MODEL_API_KEY){client.close(1011,'Meta key missing');return;}
 const maximumAudioSeconds=Number(process.env.BRAIVE_AUDIO_MAX_SECONDS??0);
 if(!Number.isFinite(maximumAudioSeconds)||maximumAudioSeconds<=0||!activeBudget()){client.close(1008,'A cumulative budget and bounded duration are required for live transcription');return;}
 try{activeBudget()!.reserve('transcription',maximumAudioSeconds*0.18/3600,{maximum_seconds:maximumAudioSeconds,rate_usd_per_hour:0.18})}catch{client.close(1008,'Cumulative Meta budget unavailable');return;}
 const upstream=new WebSocket('wss://api.meta.ai/v1/asr/realtime');let ready=false;let audioBytes=0;const voiceStarted=Date.now();
 const audioTimer=setTimeout(()=>{upstream.close();client.close(1000,'Bounded audio window ended');},maximumAudioSeconds*1000);
 const timeout=setTimeout(()=>{if(!ready){client.close(1011,'Transcribe handshake timed out');upstream.terminate();}},10000);
 upstream.on('open',()=>upstream.send(JSON.stringify({authorization:{accessToken:`Bearer ${process.env.MODEL_API_KEY}`},model:'muse-voice-transcribe-1.0',audioEncoding:'PCM_24KHZ',mode:'ENDPOINTING',partialMode:'CUMULATIVE',emitAudioProgress:true,languageBias:['English'],keywords:['STOP','START','hey builder']})));
 upstream.on('message',(data,binary)=>{if(!binary){try{const e=JSON.parse(data.toString());if(e.sessionId && !e.type){ready=true;clearTimeout(timeout);console.log('[voice] ready');}if(e.type==='error')console.warn('[voice] provider error:',String(e.message).slice(0,400));}catch{}}if(client.readyState===WebSocket.OPEN) client.send(data,{binary});});
 client.on('message',(data,binary)=>{if(binary){audioBytes+=Array.isArray(data)?data.reduce((n,b)=>n+b.byteLength,0):data.byteLength;if(audioBytes>maximumAudioSeconds*48000){upstream.close();client.close(1008,'Audio byte budget reached');return;}}if(ready && upstream.readyState===WebSocket.OPEN) upstream.send(data,{binary});});
 const close=()=>{clearTimeout(audioTimer);clearTimeout(timeout);upstream.close();client.close();};
 client.on('close',close);client.on('error',close);upstream.on('close',(code,reason)=>{clearTimeout(audioTimer);clearTimeout(timeout);console.log('[voice] closed',JSON.stringify({code,reason:reason.toString().slice(0,200),audio_bytes:audioBytes,wall_seconds:(Date.now()-voiceStarted)/1000,audio_seconds:audioBytes/48000}));client.close(1011,('Transcription '+code+': '+reason.toString()).slice(0,110));});upstream.on('error',(error)=>{clearTimeout(audioTimer);clearTimeout(timeout);console.warn('[voice] transport error:',error.message);client.close(1011,'Transcription transport unavailable');});
});
// Bound completed jobs; never store raw audio.
setInterval(()=>{if(jobs.size>100)for(const [id,j] of jobs){if(!running.has(id)){jobs.delete(id);attempts.delete(id);approved.delete(j.session_id);revisions.delete(j.session_id);provenance.delete(j.session_id);}if(jobs.size<=100)break;}},60000).unref();
server.listen(Number(process.env.PORT??8787),process.env.HOST??'127.0.0.1',()=>{
 const address=server.address();
 console.log(`Braive backend listening on ${typeof address==='object'&&address?address.port:process.env.PORT??8787}; Meta key ${process.env.MODEL_API_KEY?'configured':'missing'}`);
});

if(process.env.BRAIVE_TEST_MODE==='true'){
 const shutdown=()=>{clearTimeout(idleTimer);process.env.BRAIVE_ALLOW_META='false';for(const controller of running.values())controller.abort();for(const client of wss.clients)client.close();server.close();setTimeout(()=>process.exit(0),300).unref();};
 process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
 app.get('/v1/test-budget',(_req,res)=>res.json(activeBudget()?.snapshot()));
}

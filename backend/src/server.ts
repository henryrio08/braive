import {activeBudget} from './budget.js';
import {cancelGeneration,releaseGeneration,supersedeGeneration,repeatedGeneration,claimRepair,repairBlock,releaseRepair,grantRepairWindow,type GenerationAttempt} from './job-lifecycle.js';
import {PhoneTestWindow} from './phone-test-window.js';
import {canonicalSceneReferences} from './scene-references.js';
import {assertCurrentDialogue,dialogueContext} from './dialogue.js';
import {meshCatalog,assetManifest,generationCharacterIDs} from './assets.js';
import express from 'express';
import {compileScene,constructionRequirements} from './construction.js';
import {dispatchTool} from './tool-dispatch.js';
import {generateExperience,authoredScene,experienceSceneIssues,type ApprovedExperience} from './generation-chain.js';
import {builderInstructions} from './generation-prompts.js';
import { createServer } from 'node:http';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
import { WebSocketServer, WebSocket } from 'ws';
import { AppError, validate, validateProviderOutput, sceneIssues } from './contracts.js';
import { model, provenance, requestCount, reservedCostUSD, usageLog } from './meta.js';
import type { Job, PlanRequest } from '../../docs/handoff/contracts.js';
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
const approved=new Map<string,ApprovedExperience>();
// Read-only authenticated pairing check; it neither spends nor renews provider access.
app.get('/v1/connection',(_req,res)=>res.json({status:'ok'}));
const attempts=new Map<string,GenerationAttempt>();
const requests=new Map<string,PlanRequest>();
const generationLimitMs=10*60*1000;
const jobs=new Map<string,Job>(); const running=new Map<string,AbortController>(); const revisions=new Map<string,number>();

const capabilities={version:'iphone-initial-1',nodes:350,resolved_nodes:1000,primitives:180000,geometry_bytes:24000000,resource_notes:'Draw-call, texture and resident-memory targets require physical-device profiling; they are not runtime-enforced caps.',units:'meters',eye_height:1.6,initial_forward:'negative Z',geometry:['box','plane','sphere','cylinder','asset'],characters:'Use approved soft_adult character.base assets with their original palette. These are intentionally simple, friendly stylized people. Keep comfortable personal space; default at least 2.5m from the viewer unless the user asks for closer contact. Do not use legacy neutral/casual models for new experiences.',voices:['default'],asset_catalog_format:'category.subcategory: [[asset_id, triangle_count], ...]. All assets normalized to meters, base y=0, forward -Z. Use each GLB intact; do not author its mesh or skeleton children.',assets:meshCatalog, audio_assets:['forest','piano','wind','room','crowd','whoosh']};
capabilities.asset_catalog_format+=' Rest bounds in asset_bounds are authoritative for each asset\'s wide and thin axes (for example, window assets are thin in X and wide in Z at rest, facing sideways); a 90-degree yaw swaps the horizontal extents. Compute the transformed bounds from the rest bounds, your rotation and scale before placing any rotated asset.';
capabilities.version='iphone-construction-visuals-5';
Object.assign(capabilities,{construction_version:'1',asset_bounds:Object.fromEntries(assetManifest.map(a=>[a.id,a.bounds_meters])),surface_profiles:['matte','ground','water','glass','foliage'],sky:'App-owned procedural cubemap or solid background; explicit fog distances. No image-generation call or arbitrary shader source.'});
Object.assign(capabilities,{scenario_engine:'Guided automatic stages: movement and events start on stage entry and advance by time or motion completion. No WALK/SIT/ASK or stage-advance commands. Natural user speech reaches the approved character only in authored conversation_target windows. Quiet scenes need no speaking.',movement:'move_viewer follows an authored motion_paths trajectory in meters; each path starts at the current camera position, points are absolute destinations at increasing positive seconds. Preserve head-tracked orientation. Paths can be interrupted by another path without teleporting; STOP freezes the active clock. walk, run, swim, climb, fall, glide, ride and other trajectories use the same generic system. move_node animates another actor/prop along a path, optionally facing its travel direction.',view_distance_meters:10000});
Object.assign(capabilities,{character_assets:assetManifest.filter(a=>generationCharacterIDs.has(a.id)).map(a=>({asset_id:a.id,tags:a.tags,resolved_nodes:a.resolved_node_count,triangles:a.approx_tris,behaviors:['idle','listen','speak','walk','run','sit']}))});
async function generate(request:PlanRequest, job:Job, signal:AbortSignal) {
 const previous=approved.get(request.session_id)??(request.parent_session_id?approved.get(request.parent_session_id):undefined);
 const result=await generateExperience(request,job,{
  model,capabilities,previous,
  isCurrent:()=>revisions.get(request.session_id)===request.revision,
  consumeRepair:(kind)=>claimRepair(attempts.get(job.job_id),kind),
  onRejected:(candidate,error)=>{
   if(process.env.BRAIVE_TEST_MODE==='true'){
    try{const payload=JSON.stringify({...candidate,issues:error instanceof AppError?error.issues:[]},null,2);writeFileSync(new URL('../data/last-rejected-scene.json',import.meta.url),payload,{mode:0o600});mkdirSync(new URL('../data/rejected',import.meta.url),{recursive:true});writeFileSync(new URL(`../data/rejected/${job.job_id}-${Date.now()}.json`,import.meta.url),payload,{mode:0o600});}catch{}
   }
  }
 },signal);
 signal.throwIfAborted();
 if(revisions.get(request.session_id)!==request.revision)throw new AppError('CANCELLED','Superseded revision');
 const {experience,...wire}=result;
 job.result=wire;approved.set(request.session_id,result);job.status='succeeded';job.stage='Ready for device validation';
}
app.post(['/v1/session-plans','/v1/scene-revisions'],(req,res,next)=>{
 try {
  validate('PlanRequest',req.body); const input:PlanRequest=req.body;
  if(!input.use_history && input.relevant_history.length) throw new AppError('INVALID_INPUT','Declined history must be empty');
  if(input.chained_rerun && !input.parent_session_id) throw new AppError('INVALID_INPUT','Chained session needs parent');
  if((revisions.get(input.session_id)??0)>input.revision) throw new AppError('CONFLICT','Revision must increase',[],409);
  const repeated=repeatedGeneration(input,jobs,requests);
  if(repeated){res.status(202).json(repeated);return;}
  if(revisions.get(input.session_id)===input.revision)throw new AppError('CONFLICT','Revision must increase',[],409);
  supersedeGeneration(input.session_id,jobs,running);
  revisions.set(input.session_id,input.revision);
  const job:Job={job_id:randomUUID(),session_id:input.session_id,revision:input.revision,status:'running',stage:'Starting generation'};
  attempts.set(job.job_id,{deadline:Date.now()+generationLimitMs,deadlineCap:Date.now()+generationLimitMs+5*60*1000,planningRepairUsed:false,constructionRepairUsed:false,deviceRepairUsed:false});
  jobs.set(job.job_id,job); const controller=new AbortController(); running.set(job.job_id,controller);
  requests.set(job.job_id,structuredClone(input));
  const timer=setTimeout(()=>controller.abort(new Error('Ten-minute generation ceiling reached')),generationLimitMs);
  void generate(input,job,controller.signal).catch(e=>{
   if(job.status==='cancelled') return;
   job.status='failed';job.error={code:controller.signal.aborted?'TIMEOUT':e.code??'PROVIDER_UNAVAILABLE',message:controller.signal.aborted?'Generation ended at ten minutes. Retry, revise, or cancel.':e.message,retryable:true,request_id:job.job_id,issues:e.issues};
  }).finally(()=>{clearTimeout(timer);releaseGeneration(job.job_id,controller,running);console.log('[generation]',JSON.stringify({job_id:job.job_id,status:job.status,elapsed_seconds:(Date.now()-(attempts.get(job.job_id)!.deadline-generationLimitMs))/1000,error_code:job.error?.code,nodes:job.result?.scene.nodes.length}));});
  res.status(202).json(job);
 } catch(e){next(e);}
});
// Native geometry can reveal failures no schema or rest-bounds check can see.
// It gets one repair of its own, still inside the original deadline and budget.
app.post('/v1/jobs/:id/validation',async(req,res,next)=>{
 const job=jobs.get(req.params.id), attempt=attempts.get(req.params.id);
 try {
  if(!job?.result || !attempt || job.status!=='succeeded') throw new AppError('CONFLICT','No assembled generation to repair',[],409);
  if(revisions.get(job.session_id)!==job.revision)throw new AppError('CONFLICT','A newer scene revision has replaced this job',[],409);
  if(running.size>=3)throw new AppError('RATE_LIMITED','Too many active generation jobs',[],429);
  if(typeof req.body.message!=='string' || req.body.message.length>2000) throw new AppError('INVALID_INPUT','Provide a bounded validation explanation');
  const block=repairBlock(attempt,'device');
  if(block==='missing')throw new AppError('CONFLICT','This scene is no longer available for automatic repair. Your practice details are unchanged; start again to rebuild the scene.',[],409);
  if(block==='deadline')throw new AppError('TIMEOUT','The time reserved for building this scene has ended, so its automatic fix cannot start. Your practice details are unchanged; start again when you are ready.',[],408);
  if(block==='used')throw new AppError('CONFLICT','This scene already used its one automatic fix and still needs changes. Revise the scene or start again; your practice details are unchanged.',[],409);
  grantRepairWindow(attempt!,Date.now(),240*1000);
  if(!claimRepair(attempt,'device'))throw new AppError('TIMEOUT','The time reserved for building this scene has ended, so its automatic fix cannot start. Your practice details are unchanged; start again when you are ready.',[],408);
  job.status='running';job.stage='Repairing device visibility checks';
  const controller=new AbortController();running.set(job.job_id,controller);
  const timer=setTimeout(()=>controller.abort(),Math.max(1,attempt.deadline-Date.now()));
  res.status(202).json(job);
  try {
   const {plan,audio,scene}=job.result;
   const experience=approved.get(job.session_id)?.experience;
   const output=await model('SceneSpec',{plan,audio,approved_experience:experience,requirements:constructionRequirements(plan),previous_scene:authoredScene(scene),capabilities,issues:[{path:'/nodes',rule:'native_preflight',message:req.body.message}]},builderInstructions,controller.signal,'scene_builder');
   validate('SceneSpec',output);validateProviderOutput('SceneSpec',output);
   const authored=canonicalSceneReferences(plan,output,audio);
   const repaired=compileScene(plan,authored,audio);
   const errors=[...sceneIssues(plan,repaired,audio),...(experience?experienceSceneIssues(experience,plan,repaired):[])];if(errors.length) throw new AppError('INVALID_MODEL_OUTPUT','Native repair invalid',errors);
   controller.signal.throwIfAborted();if(revisions.get(job.session_id)!==job.revision)return;
   job.result={plan,audio,scene:repaired};approved.set(job.session_id,{...job.result,experience});job.status='succeeded';job.stage='Ready for device validation';
  }catch(e:any){if(jobs.get(job.job_id)?.status!=='cancelled'){
   if(!controller.signal.aborted&&(e.code==='PROVIDER_UNAVAILABLE'||e.code==='RATE_LIMITED')){
    // No candidate was produced; keep the scene and its repair for a later retry.
    releaseRepair(attempt,'device');job.status='succeeded';job.stage='Ready for device validation';
   } else {job.status='failed';job.error={code:controller.signal.aborted?'TIMEOUT':e.code??'INVALID_MODEL_OUTPUT',message:e.message,retryable:true,request_id:job.job_id,issues:e.issues};}
  }}
  finally{clearTimeout(timer);releaseGeneration(job.job_id,controller,running);}
 }catch(e){next(e);}
});
app.get('/v1/jobs/:id',(req,res)=>{const j=jobs.get(req.params.id); j?res.json(j):res.status(404).json({message:'Job not found'});});
app.delete('/v1/jobs/:id',(req,res)=>{cancelGeneration(req.params.id,jobs,running);res.sendStatus(204);});
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
  const result=path==='dialogue'
   ? await model(resultSchema,context,instructions,AbortSignal.timeout(25000))
   : await dispatchTool(path==='feedback'?req.body.plan:req.body.previous_plan,path==='feedback'?'generate_feedback':'adapt_session','after_session',
      args=>model(resultSchema,{...context,tool_arguments:args},instructions,AbortSignal.timeout(25000)));
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
setInterval(()=>{if(jobs.size>100)for(const [id,j] of jobs){if(!running.has(id)){jobs.delete(id);requests.delete(id);attempts.delete(id);approved.delete(j.session_id);revisions.delete(j.session_id);provenance.delete(j.session_id);}if(jobs.size<=100)break;}},60000).unref();
server.listen(Number(process.env.PORT??8787),process.env.HOST??'127.0.0.1',()=>{
 const address=server.address();
 console.log(`Braive backend listening on ${typeof address==='object'&&address?address.port:process.env.PORT??8787}; Meta key ${process.env.MODEL_API_KEY?'configured':'missing'}`);
});

if(process.env.BRAIVE_TEST_MODE==='true'){
 const shutdown=()=>{clearTimeout(idleTimer);process.env.BRAIVE_ALLOW_META='false';for(const controller of running.values())controller.abort();for(const client of wss.clients)client.close();server.close();setTimeout(()=>process.exit(0),300).unref();};
 process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
 app.get('/v1/test-budget',(_req,res)=>res.json(activeBudget()?.snapshot()));
}

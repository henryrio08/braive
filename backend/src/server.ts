import express from 'express';
import { createServer } from 'node:http';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { AppError, validate, sceneIssues, planIssues } from './contracts.js';
import { authoring, model, provenance, requestCount, reservedCostUSD, usageLog } from './meta.js';
import type { Job, PlanRequest, SessionPlan, SceneSpec, AudioPlan } from '../../docs/handoff/contracts.js';
const app=express(); app.use(express.json({limit:'2mb'})); app.disable('x-powered-by');
const secret=process.env.BRAIVE_TOKEN;
if(!secret || secret.length<20) throw new Error('Set BRAIVE_TOKEN to a random string of at least 20 characters');
function authorized(value: string | undefined) { const a=Buffer.from(value??''), b=Buffer.from(`Bearer ${secret}`); return a.length===b.length && timingSafeEqual(a,b); }
app.get('/health',(_req,res)=>res.json({status:'ok',meta_configured:!!process.env.MODEL_API_KEY,meta_requests:requestCount,reserved_cost_usd:reservedCostUSD,usage:usageLog}));
app.use((req,res,next)=> authorized(req.headers.authorization) ? next() : res.status(401).json({code:'UNAUTHORIZED',message:'Pair this phone with the Mac backend.'}));
const approved=new Map<string,{plan:SessionPlan,scene:SceneSpec,audio:AudioPlan}>();
const attempts=new Map<string,{deadline:number,repairs:number}>();
const jobs=new Map<string,Job>(); const running=new Map<string,AbortController>(); const revisions=new Map<string,number>();
const meshAssets=['person_standing','person_seated','chair','table','lectern','bookshelf','window_frame'].map(id=>({id,kind:'mesh',origin:'bundled',description:id.replaceAll('_',' ')+'; complete original native assembly; feet/base at y=0; forward=-Z'}));
const capabilities={version:'iphone-initial-1',nodes:350,resolved_nodes:650,draw_calls:700,texture_bytes:16000000,resident_bytes:180000000,units:'meters',eye_height:1.6,initial_forward:'negative Z',geometry:['box','plane','sphere','cylinder'],characters:'Recognizable component assembly: head, hair, torso, arms, hands, legs. Root has character role. Root idle/listen/speak/gesture animates assembly.',voices:['default'],assets:meshAssets, audio_assets:['forest','piano','wind','room','crowd','whoosh']};
const assets=capabilities.audio_assets.map(id=>({id,kind:'audio',description:`Bundled synthesized ${id}`,origin:'bundled'}));
async function generate(request:PlanRequest, job:Job, signal:AbortSignal) {
 let plan:SessionPlan|undefined, scene:SceneSpec|undefined, audio:AudioPlan|undefined, issues:unknown;
 const previous=approved.get(request.session_id)??(request.parent_session_id?approved.get(request.parent_session_id):undefined);
 for(let attempt=0;attempt<2;attempt++) {
  try {
   if(!plan) { job.stage='Coordinating your situation'; plan=await model('SessionPlan',{request,capabilities,issues,previous_plan:previous?.plan},`You coordinate Braive situational practice. ${authoring}\nUse current ability and explicit boundaries. Copy session_id/revision. Intro includes exact stop_reminder, at most 18 words total. Choose default voice IDs. Return safety decision before generating any scene. Prefer registered complete person and prop assets; compose original setting and layout. Do not spend node output on each character component.`,signal); }
   if(plan!.safety.decision==='refuse') throw new AppError('INVALID_INPUT',plan!.safety.reason+' '+plan!.safety.practice_preserving_alternative);
   if(plan!.session_id!==request.session_id || plan!.revision!==request.revision) throw new AppError('INVALID_MODEL_OUTPUT','Coordinator revision mismatch');
   const pIssues=planIssues(plan!); if(pIssues.length) throw new AppError('INVALID_MODEL_OUTPUT','Invalid coordinator invariants',pIssues);
   job.stage=attempt?'Repairing scene validation issues':'Authoring spatial scene and sound';
   // Audio first supplies a stable cue manifest to scene authoring.
   audio=await model('AudioPlan',{plan,available_assets:assets},'Select only supplied audio assets. Required whoosh. Keep narrative speech audible. Match plan revision.',signal);
   scene=await model('SceneSpec',{plan,capabilities,asset_manifest:meshAssets,audio,previous_scene:scene??previous?.scene,issues},authoring+" Use registered complete person/prop assets to keep scene concise while generating original layout. Geometry for assets is {kind:asset,asset_id:registered_id}. Person assets include working idle/listen/speak/gesture; place character root at floor height.",signal,true);
   const errors=sceneIssues(plan!,scene!,audio!);
   for(const l of audio!.layers) if(!capabilities.audio_assets.includes(l.asset_id)) errors.push({path:'/layers',rule:'asset',message:'Unknown audio asset'});
   if(errors.length) throw new AppError('INVALID_MODEL_OUTPUT','Scene requires repair',errors);
   signal.throwIfAborted();
   if(revisions.get(request.session_id)!==request.revision) throw new AppError('CANCELLED','Superseded revision');
   job.result={plan:plan!,scene:scene!,audio:audio!};approved.set(request.session_id,job.result); job.status='succeeded'; job.stage='Ready for device validation'; return;
  } catch(e) { if(e instanceof AppError && e.code==='INVALID_MODEL_OUTPUT' && attempt===0) { attempts.get(job.job_id)!.repairs++;issues=e.issues.length?e.issues:[{message:e.message}]; if(plan && planIssues(plan).length) plan=undefined; continue; } throw e; }
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
  }).finally(()=>{clearTimeout(timer);running.delete(job.job_id);});
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
   const repaired:SceneSpec=await model('SceneSpec',{plan,audio,previous_scene:scene,capabilities,issues:[{path:'/nodes',rule:'native_preflight',message:req.body.message}]},authoring,controller.signal,true);
   const errors=sceneIssues(plan,repaired,audio);if(errors.length) throw new AppError('INVALID_MODEL_OUTPUT','Native repair invalid',errors);
   controller.signal.throwIfAborted();if(revisions.get(job.session_id)!==job.revision)return;
   job.result={plan,audio,scene:repaired};approved.set(job.session_id,job.result);job.status='succeeded';job.stage='Ready for device validation';
  }catch(e:any){job.status='failed';job.error={code:controller.signal.aborted?'TIMEOUT':e.code??'INVALID_MODEL_OUTPUT',message:e.message,retryable:true,request_id:job.job_id,issues:e.issues};}
  finally{clearTimeout(timer);running.delete(job.job_id);}
 }catch(e){next(e);}
});
app.get('/v1/jobs/:id',(req,res)=>{const j=jobs.get(req.params.id); j?res.json(j):res.status(404).json({message:'Job not found'});});
app.delete('/v1/jobs/:id',(req,res)=>{const j=jobs.get(req.params.id); if(j){running.get(j.job_id)?.abort();j.status='cancelled';}res.sendStatus(204);});
const routes=[['dialogue','DialogueRequest','DialogueResult','Respond as the specified character to the actual user answer. Brief natural reply. One speaker. Use only available validated world operations. Never invent observations.'],['feedback','FeedbackRequest','FeedbackResult','Only cite supplied observation IDs. Maximum three positive did_well and three noticed. Include a quick improvement if supported. No diagnosis or inferred eye contact.'],['adaptations','AdaptationRequest','AdaptationResult','Use self-report, preferences, and supplied evidence IDs. Maintain if evidence is missing; ease or maintain after early quit/high difficulty. Preserve scenario identity.']] as const;
for(const [path,requestSchema,resultSchema,instructions] of routes) app.post(`/v1/${path}`,async(req,res,next)=>{
 try {validate(requestSchema,req.body);
  let context:any=req.body;
  if(path==='dialogue') {
   const saved=approved.get(req.body.session_id);
   if(!saved || saved.plan.revision!==req.body.revision) throw new AppError('CONFLICT','Dialogue revision has no approved scene',[],409);
   if(!saved.plan.characters.some(c=>c.id===req.body.character_id)) throw new AppError('INVALID_INPUT','Unknown character');
   context={...req.body,approved_plan:saved.plan,scene:saved.scene};
  }
  const result=await model(resultSchema,context,instructions,AbortSignal.timeout(25000));
  const observations=req.body.observations??[];const ids=new Set(observations.map((o:any)=>o.id));
  const evidence=[...(result.evidence_ids??[]),...(result.did_well??[]).flatMap((i:any)=>i.evidence_ids),...(result.noticed??[]).flatMap((i:any)=>i.evidence_ids)];
  if(evidence.some((id:string)=>!ids.has(id))) throw new AppError('INVALID_MODEL_OUTPUT','Unknown evidence ID');
  if(path==='dialogue' && ['session_id','revision','turn_id','character_id'].some(k=>result[k]!==req.body[k])) throw new AppError('INVALID_MODEL_OUTPUT','Stale dialogue result');
  if(path==='dialogue') {
   const saved=approved.get(req.body.session_id)!;
   const valid=sceneIssues(saved.plan,{...saved.scene,events:result.operations.map((operation:any)=>({at_active_second:0,operation}))},saved.audio);
   if(valid.length) throw new AppError('INVALID_MODEL_OUTPUT','Invalid dialogue operation',valid);
  }
  res.json(result);
 }catch(e){next(e);}
});
app.get('/v1/provenance/:id',(req,res)=>res.json({mode:'live',model_ids:[process.env.SPARK_MODEL??'muse-spark-1.3',process.env.WONDER_MODEL??'muse-wonder-1.0'],request_ids:provenance.get(req.params.id)??[]}));
app.use((e:any,_req:express.Request,res:express.Response,_next:express.NextFunction)=>res.status(e.status??500).json({code:e.code??'INVALID_INPUT',message:e.message,issues:e.issues??[],request_id:randomUUID(),retryable:true}));
const server=createServer(app); const wss=new WebSocketServer({noServer:true,maxPayload:100000});
server.on('upgrade',(req,socket,head)=>{ if(req.url!=='/v1/transcribe' || !authorized(req.headers.authorization)) {socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');socket.destroy();return;} wss.handleUpgrade(req,socket,head,client=>wss.emit('connection',client)); });
wss.on('connection',(client:WebSocket)=>{
 if(process.env.BRAIVE_ALLOW_AUDIO === 'false'){client.close(1008,'Audio disabled in bounded test');return;}
 if(process.env.BRAIVE_ALLOW_META !== 'true'){client.close(1008,'Meta spending disabled');return;}
 if(!process.env.MODEL_API_KEY){client.close(1011,'Meta key missing');return;}
 const upstream=new WebSocket('wss://api.meta.ai/v1/asr/realtime');let ready=false;
 const timeout=setTimeout(()=>{if(!ready){client.close(1011,'Transcribe handshake timed out');upstream.terminate();}},10000);
 upstream.on('open',()=>upstream.send(JSON.stringify({authorization:{accessToken:`Bearer ${process.env.MODEL_API_KEY}`},model:'muse-voice-transcribe-1.0',audioEncoding:'PCM_24KHZ',mode:'ENDPOINTING',partialMode:'CUMULATIVE',emitAudioProgress:false,languageBias:['English'],keywords:['STOP','START','hey builder']})));
 upstream.on('message',(data,binary)=>{if(!binary){try{const e=JSON.parse(data.toString());if(e.sessionId && !e.type){ready=true;clearTimeout(timeout);}}catch{}}if(client.readyState===WebSocket.OPEN) client.send(data,{binary});});
 client.on('message',(data,binary)=>{if(ready && upstream.readyState===WebSocket.OPEN) upstream.send(data,{binary});});
 const close=()=>{clearTimeout(timeout);upstream.close();client.close();};
 client.on('close',close);client.on('error',close);upstream.on('close',()=>{clearTimeout(timeout);client.close(1011,'Transcription disconnected');});upstream.on('error',()=>{clearTimeout(timeout);client.close(1011,'Transcription unavailable');});
});
// Bound completed jobs; never store raw audio.
setInterval(()=>{if(jobs.size>100)for(const [id,j] of jobs){if(!running.has(id)){jobs.delete(id);attempts.delete(id);approved.delete(j.session_id);revisions.delete(j.session_id);provenance.delete(j.session_id);}if(jobs.size<=100)break;}},60000).unref();
server.listen(Number(process.env.PORT??8787),process.env.HOST??'127.0.0.1',()=>console.log(`Braive backend listening on ${process.env.PORT??8787}; Meta key ${process.env.MODEL_API_KEY?'configured':'missing'}`));

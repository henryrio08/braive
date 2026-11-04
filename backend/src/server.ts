import {activeBudget} from './budget.js';
import {automaticSceneRepairEnabled} from './recovery-policy.js';
import {materializeStageGraph} from './stage-compiler.js';
import {cancelGeneration,releaseGeneration,supersedeGeneration,repeatedGeneration,pruneCompletedJobs,claimRepair,repairBlock,releaseRepair,grantRepairWindow,type GenerationAttempt} from './job-lifecycle.js';
import {PhoneTestWindow} from './phone-test-window.js';
import {canonicalSceneReferences} from './scene-references.js';
import {assertCurrentDialogue,dialogueContext} from './dialogue.js';
import {meshCatalog,assetManifest,generationCharacterIDs,textureManifest,textureIDs,generatedTextures,registerGeneratedTexture,removeGeneratedTexture,normalizeGeneratedTexture,referencedTextures,generatedAssetsDir} from './assets.js';
import {WorldStore,WorldTransactions,worldHash,assertSessionID,type ApprovedWorld} from './world-commits.js';
import {applyWorldEdits,editContext,editInstructions,type WorldEditPlan} from './world-edits.js';
import {dataDirectory} from './paths.js';
import {GenerationPause} from './generation-pause.js';
import express from 'express';
import {compileScene,constructionRequirements,deterministicCorrections} from './construction.js';
import {dispatchTool} from './tool-dispatch.js';
import {generateExperience,authoredScene,experienceSceneIssues,type ApprovedExperience} from './generation-chain.js';
import {builderInstructions} from './generation-prompts.js';
import { createServer } from 'node:http';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import {existsSync,mkdirSync,readdirSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {basename,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { AppError, validate, validateProviderOutput, sceneIssues } from './contracts.js';
import { model, provenance, requestCount, reservedCostUSD, usageLog } from './meta.js';
import type { Job, PlanRequest } from '../../docs/handoff/contracts.js';
const app=express(); app.use(express.json({limit:'20mb'})); app.disable('x-powered-by');
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
const worldStore=new WorldStore(join(dataDirectory,'worlds'));
const worldTransactions=new WorldTransactions(join(dataDirectory,'world-transactions'),worldStore);
// Read-only authenticated pairing check; it neither spends nor renews provider access.
app.get('/v1/connection',(_req,res)=>res.json({status:'ok'}));
const attempts=new Map<string,GenerationAttempt>();
const requests=new Map<string,PlanRequest>();
const generationLimitMs=10*60*1000;
const jobs=new Map<string,Job>(); const running=new Map<string,AbortController>(); const revisions=new Map<string,number>();
const jobPauses=new Map<string,GenerationPause>();

const capabilities={version:'iphone-initial-1',nodes:350,resolved_nodes:1000,primitives:180000,geometry_bytes:24000000,resource_notes:'Draw-call, texture and resident-memory targets require physical-device profiling; they are not runtime-enforced caps.',units:'meters',eye_height:1.6,initial_forward:'negative Z',geometry:['box','plane','sphere','cylinder','asset'],characters:'Use the approved civilian character.base choices with their original palette. These are intentionally simple, friendly stylized people. Keep comfortable personal space; default at least 2.5m from the viewer unless the user asks for closer contact. Use only current character_choices for new experiences; historical IDs remain valid for saved scenes.',voices:['default'],asset_catalog_format:'category.subcategory: [[asset_id, triangle_count], ...]. Assets normalized to meters and base y=0. Their semantic fronts can differ: asset_placement.face_negative_z_yaw gives the root yaw to face -Z; add that correction to the intended facing yaw. Use each GLB intact; do not author its mesh or skeleton children.',assets:meshCatalog, audio_assets:['forest','piano','wind','room','crowd','whoosh']};
capabilities.asset_catalog_format+=' Rest bounds in asset_bounds are authoritative for each asset\'s wide and thin axes (for example, window assets are thin in X and wide in Z at rest, facing sideways); a 90-degree yaw swaps the horizontal extents. Compute the transformed bounds from the rest bounds, your rotation and scale before placing any rotated asset.';
capabilities.version='iphone-construction-visuals-5';
Object.assign(capabilities,{construction_version:'1',asset_bounds:Object.fromEntries(assetManifest.map(a=>[a.id,a.bounds_meters])),surface_profiles:['matte','ground','water','glass','foliage'],sky:'App-owned procedural cubemap or solid background; explicit fog distances. No image-generation call or arbitrary shader source.'});
Object.assign(capabilities,{scenario_engine:'Guided automatic stages: movement and events start on stage entry and advance by time or motion completion. No WALK/SIT/ASK or stage-advance commands. Natural user speech reaches the approved character only in authored conversation_target windows. Quiet scenes need no speaking.',movement:'move_viewer follows an authored motion_paths trajectory in meters; each path starts at the current camera position, points are absolute destinations at increasing positive seconds. Preserve head-tracked orientation. Paths can be interrupted by another path without teleporting; STOP freezes the active clock. walk, run, swim, climb, fall, glide, ride and other trajectories use the same generic system. move_node animates another actor/prop along a path, optionally facing its travel direction.',view_distance_meters:10000});
Object.assign(capabilities,{character_assets:assetManifest.filter(a=>generationCharacterIDs.has(a.id)).map(a=>({asset_id:a.id,tags:a.tags,resolved_nodes:a.resolved_node_count,triangles:a.approx_tris,behaviors:['idle','listen','speak','walk','run','sit']})),texture_assets:textureManifest.map(t=>({id:t.id,description:t.description}))});
async function generate(request:PlanRequest, job:Job, signal:AbortSignal) {
 const previous=approved.get(request.session_id)??(request.parent_session_id?approved.get(request.parent_session_id):undefined);
 const result=await generateExperience(request,job,{
  model:async(...args)=>{await jobPauses.get(job.job_id)?.wait(signal);return model(...args);},capabilities,previous,
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
 const world_id=(request.parent_session_id?approved.get(request.parent_session_id) as ApprovedWorld|undefined:undefined)?.world_id??request.parent_session_id??request.session_id;
 const world={...result,world_id};worldStore.save(world);
 job.result=wire;approved.set(request.session_id,world);job.status='succeeded';job.stage='Getting ready to begin…';
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
  const job:Job={job_id:randomUUID(),session_id:input.session_id,revision:input.revision,status:'running',stage:'Getting your practice ready…'};
  const startedAt=Date.now();
  attempts.set(job.job_id,{deadline:startedAt+generationLimitMs,deadlineCap:startedAt+generationLimitMs,planningRepairUsed:false,constructionRepairUsed:false,deviceRepairUsed:false});
  jobPauses.set(job.job_id,new GenerationPause());
  jobs.set(job.job_id,job); const controller=new AbortController(); running.set(job.job_id,controller);
  requests.set(job.job_id,structuredClone(input));
  const timer=setTimeout(()=>controller.abort(new Error('Ten-minute generation ceiling reached')),generationLimitMs);
  void generate(input,job,controller.signal).catch(e=>{
   if(job.status==='cancelled') return;
   job.status='failed';job.error={code:controller.signal.aborted?'TIMEOUT':e.code??'PROVIDER_UNAVAILABLE',message:controller.signal.aborted?'Generation ended at ten minutes. Retry, revise, or cancel.':e.message,retryable:true,request_id:job.job_id,issues:e.issues};
  }).finally(()=>{clearTimeout(timer);releaseGeneration(job.job_id,controller,running);console.log('[generation]',JSON.stringify({job_id:job.job_id,status:job.status,elapsed_seconds:(Date.now()-startedAt)/1000,error_code:job.error?.code,nodes:job.result?.scene.nodes.length}));});
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
  if(!automaticSceneRepairEnabled())throw new AppError('CONFLICT','Automatic scene repair is disabled. Your practice details and generated scene are preserved; revise or retry when ready.',[],409);
  const block=repairBlock(attempt,'device');
  if(block==='missing')throw new AppError('CONFLICT','This scene is no longer available for automatic repair. Your practice details are unchanged; start again to rebuild the scene.',[],409);
  if(block==='deadline')throw new AppError('TIMEOUT','The time reserved for building this scene has ended, so its automatic fix cannot start. Your practice details are unchanged; start again when you are ready.',[],408);
  if(block==='used')throw new AppError('CONFLICT','This scene already used its one automatic fix and still needs changes. Revise the scene or start again; your practice details are unchanged.',[],409);
  grantRepairWindow(attempt!,Date.now(),240*1000);
  if(!claimRepair(attempt,'device'))throw new AppError('TIMEOUT','The time reserved for building this scene has ended, so its automatic fix cannot start. Your practice details are unchanged; start again when you are ready.',[],408);
  job.status='running';job.stage='Adjusting your view…';
  const controller=new AbortController();running.set(job.job_id,controller);
  const timer=setTimeout(()=>controller.abort(),Math.max(1,attempt.deadline-Date.now()));
  res.status(202).json(job);
  try {
   const {plan,audio,scene}=job.result;
   const experience=approved.get(job.session_id)?.experience;
   await jobPauses.get(job.job_id)?.wait(controller.signal);
   const output=await model('SceneSpec',{plan,audio,approved_experience:experience,requirements:constructionRequirements(plan),previous_scene:authoredScene(scene),capabilities,issues:[{path:'/nodes',rule:'native_preflight',message:req.body.message}]},builderInstructions,controller.signal,'scene_builder');
   const authored=deterministicCorrections(canonicalSceneReferences(plan,output,audio)).scene;
   const staged=experience?materializeStageGraph(experience,plan,authored):{scene:authored,issues:[]};
   if(staged.issues.length)throw new AppError('INVALID_MODEL_OUTPUT','Stage graph requires route geometry',staged.issues);
   validate('SceneSpec',staged.scene);validateProviderOutput('SceneSpec',staged.scene);
   const repaired=compileScene(plan,staged.scene,audio);
   const errors=[...sceneIssues(plan,repaired,audio),...(experience?experienceSceneIssues(experience,plan,repaired):[])];if(errors.length) throw new AppError('INVALID_MODEL_OUTPUT','Native repair invalid',errors);
   controller.signal.throwIfAborted();if(revisions.get(job.session_id)!==job.revision)return;
   job.result={plan,audio,scene:repaired};
   const world={...job.result,experience,world_id:(approved.get(job.session_id) as ApprovedWorld|undefined)?.world_id??job.session_id};
   worldStore.save(world);approved.set(job.session_id,world);job.status='succeeded';job.stage='Getting ready to begin…';
  }catch(e:any){if(jobs.get(job.job_id)?.status!=='cancelled'){
   if(!controller.signal.aborted&&(e.code==='PROVIDER_UNAVAILABLE'||e.code==='RATE_LIMITED')){
    // No candidate was produced; keep the scene and its repair for a later retry.
    releaseRepair(attempt,'device');job.status='succeeded';job.stage='Getting ready to begin…';
   } else {job.status='failed';job.error={code:controller.signal.aborted?'TIMEOUT':e.code??'INVALID_MODEL_OUTPUT',message:e.message,retryable:true,request_id:job.job_id,issues:e.issues};}
  }}
  finally{clearTimeout(timer);releaseGeneration(job.job_id,controller,running);}
 }catch(e){next(e);}
});
app.post(['/v1/world-preparations','/v1/world-commits'],(req,res,next)=>{
 try {
  const body=req.body??{};
  const {session_id,expected_revision,revision,plan,scene,audio,world_id,transaction_id}=body;
  if(typeof session_id!=='string'||!session_id||typeof expected_revision!=='number'||typeof revision!=='number'||!plan||!scene||!audio) throw new AppError('INVALID_INPUT','World commit requires session_id, expected_revision, revision, plan, scene and audio');
  const input={session_id,expected_revision,revision,plan,scene,audio,world_id:typeof world_id==='string'?world_id:undefined,transaction_id:typeof transaction_id==='string'?transaction_id:undefined};
  const map=approved as unknown as Map<string,ApprovedWorld>;
  const world=req.path==='/v1/world-commits'?worldTransactions.commit(input,map,revisions):worldTransactions.prepare(input,map,revisions);
  res.status(200).json({session_id,revision,world_id:world.world_id,status:req.path==='/v1/world-commits'?'committed':'prepared',
   hash:worldHash(world),plan:world.plan,scene:world.scene,audio:world.audio});
 } catch(e){next(e);}
});
app.post('/v1/world-edit-plans',async(req,res,next)=>{
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),20_000);
 res.on('close',()=>{if(!res.writableEnded)controller.abort();});
 try{
  validate('WorldEditRequest',req.body);
  const {session_id,expected_revision,text,scope,candidate}=req.body;
  const approvedWorld=approved.get(session_id);
  if(!approvedWorld||revisions.get(session_id)!==expected_revision)throw new AppError('CONFLICT','The world changed before this edit could be interpreted',[],409);
  let base:ApprovedWorld=approvedWorld;
  if(candidate){
   validate('SessionPlan',candidate.plan);validate('SceneSpec',candidate.scene);validate('AudioPlan',candidate.audio);
   if(candidate.plan.session_id!==session_id||candidate.plan.revision!==expected_revision)throw new AppError('CONFLICT','Candidate belongs to another attempt or revision',[],409);
   const scene=compileScene(candidate.plan,candidate.scene,candidate.audio),issues=sceneIssues(candidate.plan,scene,candidate.audio);
   if(issues.length)throw new AppError('INVALID_INPUT','The next-attempt candidate is inconsistent',issues);
   base={...base,...candidate,scene};
  }
  const interpreted:WorldEditPlan=await model('WorldEditPlan',editContext(base,text,scope),editInstructions,controller.signal);
  controller.signal.throwIfAborted();
  if(revisions.get(session_id)!==expected_revision)throw new AppError('CONFLICT','A newer world revision superseded this edit',[],409);
  const result=applyWorldEdits(base,interpreted,scope);
  res.json({status:interpreted.question?'clarify':result.changed?'ready':result.deferred.length?'deferred':'unchanged',question:interpreted.question,
   summary:result.summary,deferred:result.deferred,plan:result.world.plan,scene:result.world.scene,audio:result.world.audio,expected_revision});
 }catch(e){next(e);}finally{clearTimeout(timeout);}
});
app.post('/v1/world-edit-operations',(req,res,next)=>{
 try{
  validate('WorldEditOperationsRequest',req.body);
  const {session_id,expected_revision,edit,scope,candidate}=req.body,stored=approved.get(session_id);
  if(!stored||revisions.get(session_id)!==expected_revision)throw new AppError('CONFLICT','This edit belongs to an older world revision',[],409);
  let base:ApprovedWorld=stored;
  if(candidate){
   validate('SessionPlan',candidate.plan);validate('SceneSpec',candidate.scene);validate('AudioPlan',candidate.audio);
   if(candidate.plan.session_id!==session_id||candidate.plan.revision!==expected_revision)throw new AppError('CONFLICT','The candidate belongs to another world revision',[],409);
   base={...base,...candidate};
  }
  const result=applyWorldEdits(base,edit,scope);
  res.json({status:edit.question?'clarify':result.changed?'ready':result.deferred.length?'deferred':'unchanged',question:edit.question,summary:result.summary,deferred:result.deferred,
   plan:result.world.plan,scene:result.world.scene,audio:result.world.audio,expected_revision});
 }catch(e){next(e);}
});
app.post('/v1/world-transactions/:id/cancel',(req,res,next)=>{
 try{const world=worldTransactions.cancel(req.params.id,approved as unknown as Map<string,ApprovedWorld>,revisions);
  res.json({status:'cancelled',...(world?{plan:world.plan,scene:world.scene,audio:world.audio,world_id:world.world_id}:{})});
 }catch(e){next(e);}
});
app.get('/v1/worlds/:id',(req,res,next)=>{
 try{assertSessionID(req.params.id);const world=approved.get(req.params.id);
  if(!world){res.status(404).json({code:'NOT_FOUND',message:'This saved world has not been registered on this server'});return;}
  res.json({...world,hash:worldHash(world)});
 }catch(e){next(e);}
});
app.get('/v1/review-worlds',(_req,res)=>res.json({worlds:[...approved.values()].slice(-6).map(world=>({plan:world.plan,scene:world.scene,audio:world.audio}))}));
app.delete('/v1/worlds/:id',(req,res,next)=>{
 try{assertSessionID(req.params.id);supersedeGeneration(req.params.id,jobs,running);approved.delete(req.params.id);revisions.delete(req.params.id);
  worldStore.remove(req.params.id);worldTransactions.forgetSession(req.params.id);provenance.delete(req.params.id);
  for(const [id,job] of jobs)if(job.session_id===req.params.id){jobs.delete(id);requests.delete(id);attempts.delete(id);}
  res.sendStatus(204);
 }catch(e){next(e);}
});
app.post('/v1/assets',async(req,res,next)=>{
 try {
  const body=req.body??{};
  if(typeof body.content_base64!=='string'||!body.content_base64) throw new AppError('INVALID_INPUT','content_base64 is required');
  if(body.format!==undefined&&body.format!=='png'&&body.format!=='jpeg') throw new AppError('INVALID_INPUT','format must be png or jpeg');
  if(body.content_base64.length>16*1024*1024||!/^[A-Za-z0-9+/]*={0,2}$/.test(body.content_base64))throw new AppError('INVALID_INPUT','Invalid or oversized base64 image');
  if(body.purpose!==undefined&&!['surface','distant'].includes(body.purpose))throw new AppError('INVALID_INPUT','Image purpose must be surface or distant');
  let normalized:Awaited<ReturnType<typeof normalizeGeneratedTexture>>;
  try{normalized=await normalizeGeneratedTexture(Buffer.from(body.content_base64,'base64'),body.purpose??'surface');}
  catch(e){throw new AppError('INVALID_INPUT',(e as Error).message);}
  const {data,entry}=normalized;
  const existing=generatedTextures().find(e=>e.sha256===entry.sha256);
  if(existing){res.status(200).json(existing);return;}
  mkdirSync(generatedAssetsDir,{recursive:true});
  writeFileSync(join(generatedAssetsDir,entry.file),data,{mode:0o600});
  registerGeneratedTexture(entry);res.status(201).json(entry);
 } catch(e){next(e);}
});
app.get('/v1/assets/:id',(req,res,next)=>{
 try {
  const id=req.params.id;
  const generated=generatedTextures().find(e=>e.id===id);
  if(generated){
   const path=join(generatedAssetsDir,basename(generated.file));
   if(!existsSync(path)) {res.status(404).json({code:'NOT_FOUND',message:'Generated asset file is missing'});return;}
   res.type(generated.format==='png'?'image/png':'image/jpeg');
   res.setHeader('X-Content-SHA256',generated.sha256);res.setHeader('Cache-Control','private, max-age=31536000, immutable');
   res.sendFile(path); return;
  }
  if(textureIDs.has(id)||textureManifest.some(t=>t.id===id)){res.status(404).json({code:'ASSET_BUNDLED',message:'Bundled texture is already on the device'});return;}
  res.status(404).json({code:'NOT_FOUND',message:'Asset not found'});
 } catch(e){next(e);}
});
app.get('/v1/assets/:id/metadata',(req,res)=>{
 const entry=generatedTextures().find(item=>item.id===req.params.id);
 entry?res.json(entry):res.status(404).json({code:'NOT_FOUND',message:'Generated texture not found'});
});
app.delete('/v1/assets/:id',(req,res,next)=>{
 try {
  const id=req.params.id;
  if(textureIDs.has(id)||textureManifest.some(t=>t.id===id)) throw new AppError('INVALID_INPUT','Bundled textures cannot be deleted');
  if([...approved.values(),...worldTransactions.retainedWorlds()].some(world=>referencedTextures(world.scene).has(id)))throw new AppError('CONFLICT','This image is still referenced by a saved world or reversible edit',[],409);
  const removed=removeGeneratedTexture(id);
  if(!removed){res.status(404).json({code:'NOT_FOUND',message:'Asset not found'});return;}
  try{rmSync(join(generatedAssetsDir,basename(removed.file)),{force:true});}catch{}
  res.sendStatus(204);
 } catch(e){next(e);}
});
app.get('/v1/jobs/:id',(req,res)=>{const j=jobs.get(req.params.id); j?res.json(j):res.status(404).json({message:'Job not found'});});
app.post('/v1/jobs/:id/pause',(req,res,next)=>{
 try{
  const gate=jobPauses.get(req.params.id);if(!gate)throw new AppError('NOT_FOUND','This preparation is no longer available',[],404);
  if(typeof req.body.paused!=='boolean')throw new AppError('INVALID_INPUT','paused must be a boolean');
  gate.set(req.body.paused,req.body.sequence);res.sendStatus(204);
 }catch(e){next(e);}
});
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
for(const world of worldStore.loadAll()){
 approved.set(world.plan.session_id,world as unknown as ApprovedExperience);revisions.set(world.plan.session_id,world.plan.revision);
}
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
setInterval(()=>{if(jobs.size>100)for(const [id,j] of jobs){if(!running.has(id)){jobs.delete(id);requests.delete(id);attempts.delete(id);provenance.delete(j.session_id);}if(jobs.size<=100)break;}},60000).unref();
server.listen(Number(process.env.PORT??8787),process.env.HOST??'127.0.0.1',()=>{
 const address=server.address();
 console.log(`Braive backend listening on ${typeof address==='object'&&address?address.port:process.env.PORT??8787}; Meta key ${process.env.MODEL_API_KEY?'configured':'missing'}`);
});

if(process.env.BRAIVE_TEST_MODE==='true'){
 const shutdown=()=>{clearTimeout(idleTimer);process.env.BRAIVE_ALLOW_META='false';for(const controller of running.values())controller.abort();for(const client of wss.clients)client.close();server.close();setTimeout(()=>process.exit(0),300).unref();};
 process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
 app.get('/v1/test-budget',(_req,res)=>res.json(activeBudget()?.snapshot()));
}

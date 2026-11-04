import {AppError,validate,sceneIssues} from './contracts.js';
import {compileScene} from './construction.js';
import {reconcileWorldMutation} from './world-mutations.js';
import {createHash,randomUUID} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync,readdirSync,renameSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import type {SessionPlan,SceneSpec,SceneNode,AudioPlan} from '../../docs/handoff/contracts.js';
import {identity,multiply,transform} from './spatial-math.js';

export interface WorldCommitInput {
 session_id:string; expected_revision:number; revision:number;
 plan:SessionPlan; scene:SceneSpec; audio:AudioPlan; world_id?:string; transaction_id?:string;
}
export interface PopulationTemplate {character:SessionPlan['characters'][number];node:SceneNode;frame:number[];seat?:SceneNode;seat_frame?:number[]}
export interface ApprovedWorld { plan:SessionPlan; scene:SceneSpec; audio:AudioPlan; experience?:unknown; world_id?:string; population_templates?:PopulationTemplate[] }

/** Retain real removed cast as reusable construction templates, never live actors.
 * This makes shrinking an optional group to zero reversible across commits/restart. */
export function rememberPopulationTemplates(prior:ApprovedWorld|undefined,next:ApprovedWorld):ApprovedWorld {
 if(!prior)return next;
 const templates=new Map((prior.population_templates??[]).map(t=>[t.character.id,structuredClone(t)]));
 const nodes=new Map(prior.scene.nodes.map(n=>[n.id,n]));
 const frame=(id:string):number[]=>{const n=nodes.get(id)!;return multiply(n.parent_id?frame(n.parent_id):identity(),transform(n.position,n.rotation_radians,n.scale));};
 for(const character of prior.plan.characters){
  if(next.plan.characters.some(c=>c.id===character.id))continue;
  const node=nodes.get(character.scene_node_id);if(!node)continue;
  const seat=node.animation==='sit'&&node.support_node_id?nodes.get(node.support_node_id):undefined;
  templates.set(character.id,{character:structuredClone(character),node:structuredClone(node),frame:frame(node.id),
   ...(seat?{seat:structuredClone(seat),seat_frame:frame(seat.id)}:{})});
 }
 if(templates.size)next.population_templates=[...templates.values()].slice(-32);
 return next;
}

function canonical(value:unknown):string {
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 if(value&&typeof value==='object')return '{'+Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>JSON.stringify(k)+':'+canonical(v)).join(',')+'}';
 return JSON.stringify(value);
}
export function worldHash(world:Pick<ApprovedWorld,'plan'|'scene'|'audio'>):string {
 return createHash('sha256').update(canonical({plan:world.plan,scene:world.scene,audio:world.audio})).digest('hex');
}
export function assertSessionID(id:string):void {
 if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id))throw new AppError('INVALID_INPUT','Invalid attempt identifier');
}

/** Validate and compile a canonical same-world revision candidate.
 * Pure with respect to the supplied approval maps so it can be tested
 * without HTTP. Throws AppError on stale base, schema, or spatial failure;
 * the caller publishes only on success, keeping the prior world intact. */
export function prepareWorldCommit(input:WorldCommitInput,
  approved:Map<string,ApprovedWorld>, revisions:Map<string,number>):ApprovedWorld {
 assertSessionID(input.session_id);
 if(!Number.isSafeInteger(input.revision)||input.revision<1||!Number.isSafeInteger(input.expected_revision)||input.expected_revision<0)
  throw new AppError('INVALID_INPUT','World revisions must be non-negative integers, with revision at least one');
 validate('SessionPlan',input.plan); validate('SceneSpec',input.scene); validate('AudioPlan',input.audio);
 if(input.plan.session_id!==input.session_id||input.scene.session_id!==input.session_id||input.audio.session_id!==input.session_id)
  throw new AppError('INVALID_INPUT','Committed documents must share the attempt session_id');
 if(input.plan.revision!==input.revision||input.scene.revision!==input.revision||input.audio.revision!==input.revision)
  throw new AppError('INVALID_INPUT','Plan, scene and audio revisions must advance together');
 const current=revisions.get(input.session_id);
 const prior=approved.get(input.session_id);
 // Replaying an acknowledged-or-lost commit is safe. A different candidate at
 // that revision remains a conflict; never replace it on an ambiguous retry.
 if(current===input.revision&&prior){
  const replay={plan:structuredClone(input.plan),scene:compileScene(input.plan,reconcileWorldMutation(input.plan,input.scene),input.audio),audio:input.audio};
  if(worldHash(prior)===worldHash(replay))return structuredClone(prior);
 }
 if(current===undefined){
  if(input.expected_revision!==0)throw new AppError('CONFLICT','New attempt must declare expected_revision 0',[],409);
 } else if(current!==input.expected_revision){
  throw new AppError('CONFLICT',`Stale base revision: expected ${current}, received ${input.expected_revision}`,[],409);
 }
 if(current!==undefined && input.revision!==current+1)
  throw new AppError('CONFLICT','Revision must advance by exactly one from the approved base',[],409);
 const candidate=structuredClone(input);
 const compiled=compileScene(candidate.plan,reconcileWorldMutation(candidate.plan,candidate.scene),candidate.audio);
 const errors=sceneIssues(input.plan,compiled,input.audio);
 if(errors.length)throw new AppError('INVALID_MODEL_OUTPUT','World commit requires repair',errors);
 let world_id=prior?.world_id??input.session_id;
 if(input.world_id){
  assertSessionID(input.world_id);
  const parent=approved.get(input.world_id);
  world_id=parent?.world_id??input.world_id;
  if(prior?.world_id&&prior.world_id!==world_id)throw new AppError('CONFLICT','An existing attempt cannot change world identity',[],409);
 }
 return rememberPopulationTemplates(prior??(input.world_id?approved.get(input.world_id):undefined),{plan:candidate.plan,scene:compiled,audio:candidate.audio,experience:prior?.experience,world_id});
}

export function publishWorldCommit(input:WorldCommitInput,world:ApprovedWorld,
  approved:Map<string,ApprovedWorld>, revisions:Map<string,number>):void {
 approved.set(input.session_id,world);
 revisions.set(input.session_id,input.revision);
}

/** Persist before publishing approval. Atomic replacement preserves the last
 * complete world if writing fails; startup repeats full contract validation. */
export class WorldStore {
 constructor(readonly directory:string){}
 save(world:ApprovedWorld):void {
  const id=world.plan.session_id;assertSessionID(id);
  mkdirSync(this.directory,{recursive:true});
  const destination=join(this.directory,id+'.json'),temporary=destination+'.'+randomUUID()+'.tmp';
  writeFileSync(temporary,JSON.stringify(world),{mode:0o600});renameSync(temporary,destination);
 }
 remove(id:string):void {assertSessionID(id);rmSync(join(this.directory,id+'.json'),{force:true});}
 loadAll():ApprovedWorld[] {
  if(!existsSync(this.directory))return [];
  return readdirSync(this.directory).filter(file=>/^[a-f0-9-]{36}\.json$/i.test(file)).flatMap(file=>{
   try{
    const world=JSON.parse(readFileSync(join(this.directory,file),'utf8')) as ApprovedWorld;
    assertSessionID(world.plan.session_id);
    if(file!==world.plan.session_id+'.json')return [];
    const checked=prepareWorldCommit({session_id:world.plan.session_id,expected_revision:0,revision:world.plan.revision,
     plan:world.plan,scene:world.scene,audio:world.audio,world_id:world.world_id},new Map(),new Map());
    return [{...checked,experience:world.experience,population_templates:world.population_templates}];
   }catch{return [];}
  });
 }
}

interface Transaction {
 id:string;session_id:string;candidate_hash:string;state:'prepared'|'committed'|'cancelled';
 prior?:ApprovedWorld;candidate?:ApprovedWorld;committed_hash?:string;
}
/** A cancelled edit cannot commit later. If the response was lost after commit,
 * cancellation compensates with the exact old world at a new monotonic revision.
 * Transactions and their original world survive server restarts. */
export class WorldTransactions {
 constructor(readonly directory:string,readonly worlds:WorldStore){}
 private read(id:string):Transaction|undefined {
  assertSessionID(id);const path=join(this.directory,id+'.json');
  if(!existsSync(path))return undefined;
  return JSON.parse(readFileSync(path,'utf8')) as Transaction;
 }
 private save(transaction:Transaction):void {
  mkdirSync(this.directory,{recursive:true});
  const path=join(this.directory,transaction.id+'.json'),temporary=path+'.'+randomUUID()+'.tmp';
  writeFileSync(temporary,JSON.stringify(transaction),{mode:0o600});renameSync(temporary,path);
 }
 retainedWorlds():ApprovedWorld[] {
  if(!existsSync(this.directory))return [];
  return readdirSync(this.directory).filter(file=>/^[a-f0-9-]{36}\.json$/i.test(file)).flatMap(file=>{
   const transaction=this.read(file.slice(0,-5));
   return transaction&&transaction.state!=='cancelled'?[transaction.prior,transaction.candidate].filter((w):w is ApprovedWorld=>!!w):[];
  });
 }
 forgetSession(sessionID:string):void {
  assertSessionID(sessionID);if(!existsSync(this.directory))return;
  for(const file of readdirSync(this.directory).filter(file=>/^[a-f0-9-]{36}\.json$/i.test(file))){
   const transaction=this.read(file.slice(0,-5));
   if(transaction?.session_id===sessionID)this.save({id:transaction.id,session_id:'',candidate_hash:'',state:'cancelled'});
  }
 }
 prepare(input:WorldCommitInput,approved:Map<string,ApprovedWorld>,revisions:Map<string,number>):ApprovedWorld {
  if(!input.transaction_id)return prepareWorldCommit(input,approved,revisions);
  const existing=this.read(input.transaction_id);
  if(existing?.state==='cancelled')throw new AppError('CANCELLED','This world revision was cancelled',[],409);
  const world=prepareWorldCommit(input,approved,revisions),candidate_hash=worldHash(world);
  if(existing&&(existing.session_id!==input.session_id||existing.candidate_hash!==candidate_hash))
   throw new AppError('CONFLICT','Transaction ID already belongs to another candidate',[],409);
  if(!existing)this.save({id:input.transaction_id,session_id:input.session_id,candidate_hash,state:'prepared',prior:approved.get(input.session_id),candidate:world});
  return world;
 }
 commit(input:WorldCommitInput,approved:Map<string,ApprovedWorld>,revisions:Map<string,number>):ApprovedWorld {
  const world=this.prepare(input,approved,revisions);
  if(input.transaction_id){const transaction=this.read(input.transaction_id)!;transaction.state='committed';transaction.committed_hash=worldHash(world);this.save(transaction);}
  this.worlds.save(world);publishWorldCommit(input,world,approved,revisions);
  return world;
 }
 cancel(id:string,approved:Map<string,ApprovedWorld>,revisions:Map<string,number>):ApprovedWorld|undefined {
  const transaction=this.read(id);
  if(!transaction){
   // A tombstone wins even if cancellation arrives before preparation.
   this.save({id,session_id:'',candidate_hash:'',state:'cancelled'});return undefined;
  }
  const current=approved.get(transaction.session_id);
  if(transaction.state==='committed'&&current&&worldHash(current)!==worldHash(transaction.prior??{plan:{} as SessionPlan,scene:{} as SceneSpec,audio:{} as AudioPlan})){
   if(worldHash(current)!==transaction.committed_hash)throw new AppError('CONFLICT','A newer revision has replaced this edit; it cannot be rolled back',[],409);
   if(transaction.prior){
    const restored=structuredClone(transaction.prior),revision=current.plan.revision+1;
    restored.plan.revision=revision;restored.scene.revision=revision;restored.audio.revision=revision;
    this.worlds.save(restored);approved.set(transaction.session_id,restored);revisions.set(transaction.session_id,revision);
   }else{
    this.worlds.remove(transaction.session_id);approved.delete(transaction.session_id);revisions.delete(transaction.session_id);
   }
  }
  transaction.state='cancelled';delete transaction.prior;delete transaction.candidate;this.save(transaction);
  return approved.get(transaction.session_id);
 }
}

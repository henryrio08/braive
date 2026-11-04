import {AsyncLocalStorage} from 'node:async_hooks';
import {execFileSync} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

export type GenerationIdentity={job_id:string;session_id:string;revision:number};
type Phase={phase:string;elapsed_ms:number;outcome:'succeeded'|'failed';issue_rules?:string[]};
const context=new AsyncLocalStorage<GenerationIdentity>();
const phases=new Map<string,Phase[]>();
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const revisionPattern=/^[0-9a-f]{7,40}(?:-dirty)?$/;
export function sourceRevision():string {
 const configured=process.env.BRAIVE_SOURCE_REVISION;
 if(configured&&revisionPattern.test(configured))return configured;
 try {
  const cwd=fileURLToPath(new URL('../..',import.meta.url));
  const sha=execFileSync('git',['rev-parse','HEAD'],{cwd,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();
  const dirty=execFileSync('git',['status','--porcelain','--untracked-files=normal'],{cwd,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();
  return revisionPattern.test(sha)?sha+(dirty?'-dirty':''):'unknown';
 } catch {return 'unknown';}
}
export const backendRevision=sourceRevision();
export function generationIdentity():GenerationIdentity|undefined {return context.getStore();}
function safeIdentity(identity:GenerationIdentity):GenerationIdentity {
 return {job_id:uuid.test(identity.job_id)?identity.job_id:'unknown',session_id:uuid.test(identity.session_id)?identity.session_id:'unknown',revision:Number.isSafeInteger(identity.revision)?identity.revision:0};
}
export function withGenerationIdentity<T>(identity:GenerationIdentity,run:()=>T):T {return context.run(safeIdentity(identity),run);}

/** Only codes, counts and identities enter telemetry. Never copy input, output or error messages. */
export function recordPhase(phase:string,elapsed_ms:number,outcome:Phase['outcome'],issueRules:string[]=[]):void {
 const id=generationIdentity();if(!id||!/^[a-z_]{1,64}$/.test(phase))return;
 const record:Phase={phase,elapsed_ms:Math.max(0,Math.round(elapsed_ms)),outcome,
  ...(issueRules.length?{issue_rules:[...new Set(issueRules.filter(rule=>/^[a-z_]{1,64}$/.test(rule)))]}:{})};
 phases.set(id.job_id,[...(phases.get(id.job_id)??[]),record]);
}
export function measurePhase<T>(phase:string,run:()=>T):T {
 const started=performance.now();
 try {const result=run();recordPhase(phase,performance.now()-started,'succeeded');return result;}
 catch(error){recordPhase(phase,performance.now()-started,'failed',(error as {issues?:{rule:string}[]})?.issues?.map(issue=>issue.rule));throw error;}
}
export function generationReport(identity:GenerationIdentity,status:string,elapsed_ms:number,modelCalls:unknown[]) {
 const numeric=['input_tokens','output_tokens','estimated_cost_usd','elapsed_ms','input_bytes','response_bytes','provider_attempt','provider_status','revision'];
 const identifiers=['model','role','schema','backend_revision','logical_call_id','job_id','session_id','finish_reason','validation_outcome','outcome'];
 const calls=modelCalls.map(value=>{
  const input=(value??{}) as Record<string,unknown>,safe:Record<string,string|number>={};
  for(const key of numeric)if(typeof input[key]==='number'&&Number.isFinite(input[key]))safe[key]=input[key] as number;
  for(const key of identifiers)if(typeof input[key]==='string'&&/^[a-zA-Z0-9_.-]{1,80}$/.test(input[key] as string))safe[key]=input[key] as string;
  return safe;
 });
 return {version:1,...safeIdentity(identity),backend_revision:backendRevision,backend_generation:['running','failed','succeeded','cancelled'].includes(status)?status:'unknown',
  native_acceptance:'not_reported',elapsed_ms:Math.max(0,Math.round(elapsed_ms)),phases:phases.get(identity.job_id)??[],model_calls:calls};
}
export function persistGenerationReport(identity:GenerationIdentity,status:string,elapsed_ms:number,modelCalls:unknown[]):void {
 try {
  if(!uuid.test(identity.job_id))return;
  const directory=new URL('../data/diagnostics/',import.meta.url);mkdirSync(directory,{recursive:true});
  writeFileSync(new URL(identity.job_id+'.json',directory),JSON.stringify(generationReport(identity,status,elapsed_ms,modelCalls),null,2),{mode:0o600});
 } catch {console.error('[generation] Diagnostic record could not be written.');}
 finally {phases.delete(identity.job_id);}
}

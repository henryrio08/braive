import {closeSync,existsSync,mkdirSync,openSync,readFileSync,renameSync,unlinkSync,writeFileSync} from 'node:fs';
import {dirname,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
interface Entry {id:string;kind:string;reserved_micro:number;charged_micro:number;status:'reserved'|'settled';created_at:string;details:unknown;usage?:unknown;verification_run_id?:string}
interface Ledger {version:1;limit_micro:number;suspended?:boolean;entries:Entry[];approval_changes?:Array<{previous_limit_micro:number;limit_micro:number;approved_at:string;reason:string}>;verification_runs?:Record<string,{limit_micro:number;opening_charged_micro:number;created_at:string}>}
export interface VerificationAllowance {id:string;limitUSD:number}
export class TestBudget {
 constructor(public path:string,private verification?:VerificationAllowance){
  if(verification&&(!/^[a-z0-9][a-z0-9_-]{0,79}$/.test(verification.id)||!Number.isFinite(verification.limitUSD)||verification.limitUSD<=0))throw Error('Invalid verification allowance');
 }
 static initialize(path:string,limitUSD:number){
  mkdirSync(dirname(path),{recursive:true});
  if(!existsSync(path)) {const fd=openSync(path,'wx',0o600);try{writeFileSync(fd,JSON.stringify({version:1,limit_micro:Math.floor(limitUSD*1e6),entries:[]},null,2))}finally{closeSync(fd)}}
  const budget=new TestBudget(path);if(budget.snapshot().limit_micro!==Math.floor(limitUSD*1e6))throw Error('Existing cumulative approval differs; refusing to reset ledger');return budget;
 }
 snapshot():Ledger {return JSON.parse(readFileSync(this.path,'utf8'))}
 // Invoke only for an explicit new user approval, never from startup or a request handler.
 increaseApproval(limitUSD:number,reason:string):Ledger {
  const micro=Math.floor(limitUSD*1e6);
  if(!Number.isSafeInteger(micro)||micro<=0||!reason.trim())throw Error('Invalid explicit budget approval');
  return this.update(ledger=>{
   if(micro<ledger.limit_micro)throw Error('Approval increase cannot lower or reset the existing cap');
   if(micro===ledger.limit_micro)return ledger;
   (ledger.approval_changes??=[]).push({previous_limit_micro:ledger.limit_micro,limit_micro:micro,approved_at:new Date().toISOString(),reason});
   ledger.limit_micro=micro;return ledger;
  });
 }
 private update<T>(fn:(ledger:Ledger)=>T):T {
  const lock=this.path+'.lock';let fd:number;
  try{fd=openSync(lock,'wx',0o600)}catch{throw Error('Budget ledger is locked; billable work stopped')}
  try{const ledger=this.snapshot();const result=fn(ledger);const temp=this.path+'.'+randomUUID()+'.tmp';writeFileSync(temp,JSON.stringify(ledger,null,2),{mode:0o600});renameSync(temp,this.path);return result}
  finally{closeSync(fd);unlinkSync(lock)}
 }
 reserve(kind:string,usd:number,details:unknown):string {
  const micro=Math.ceil(usd*1e6);if(!Number.isSafeInteger(micro)||micro<0)throw Error('Invalid budget reservation');
  return this.update(ledger=>{const used=ledger.entries.reduce((n,e)=>n+e.charged_micro,0);if(ledger.suspended || used+micro>ledger.limit_micro)throw Error(`Cumulative Meta budget exhausted or insufficient: ${((ledger.limit_micro-used)/1e6).toFixed(4)} USD remaining`);
   const verification=this.verification;
   if(verification){
    const maximum=Math.floor(verification.limitUSD*1e6);
    const group=ledger.verification_runs?.[verification.id];
    if(group&&group.limit_micro!==maximum)throw Error('Existing verification allowance differs; refusing to reset it');
    const spent=ledger.entries.filter(entry=>entry.verification_run_id===verification.id).reduce((sum,entry)=>sum+entry.charged_micro,0);
    if(spent+micro>maximum)throw Error('Verification budget exhausted or insufficient; uncertain reservations remain charged');
    (ledger.verification_runs??={})[verification.id]??={limit_micro:maximum,opening_charged_micro:used,created_at:new Date().toISOString()};
   }
   const id=randomUUID();ledger.entries.push({id,kind,reserved_micro:micro,charged_micro:micro,status:'reserved',created_at:new Date().toISOString(),details,...(verification?{verification_run_id:verification.id}:{})});return id;});
 }
 settle(id:string,usd:number,usage:unknown){
  this.update(ledger=>{const entry=ledger.entries.find(e=>e.id===id);if(!entry)throw Error('Budget reservation missing');const actual=Math.ceil(usd*1e6);if(!Number.isSafeInteger(actual)||actual<0)throw Error('Invalid reported usage');
   if(actual>entry.reserved_micro){ledger.suspended=true;entry.usage={error:'Reported usage exceeded conservative reservation',usage};return;}
   entry.charged_micro=actual;entry.status='settled';entry.usage=usage;});
 }
}
const configuredLedger=process.env.BRAIVE_BUDGET_LEDGER;
if(configuredLedger&&!isAbsolute(configuredLedger))throw Error('BRAIVE_BUDGET_LEDGER must name the existing ledger with an absolute path');
export const APPROVED_LEDGER=configuredLedger??fileURLToPath(new URL('../data/meta-test-approval.json',import.meta.url));
export function verificationAllowance():VerificationAllowance|undefined {
 const id=process.env.BRAIVE_VERIFICATION_RUN_ID;
 if(!id)return undefined;
 const limitUSD=Number(process.env.BRAIVE_VERIFICATION_MAX_USD??5);
 if(!Number.isFinite(limitUSD)||limitUSD<=0||limitUSD>5)throw Error('This verification is capped at US$5 of the existing allowance');
 return {id,limitUSD};
}
export function activeBudget():TestBudget|undefined {return process.env.BRAIVE_TEST_MODE==='true'?new TestBudget(APPROVED_LEDGER,verificationAllowance()):undefined;}

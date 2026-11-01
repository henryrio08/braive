import {closeSync,existsSync,mkdirSync,openSync,readFileSync,renameSync,unlinkSync,writeFileSync} from 'node:fs';
import {dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
interface Entry {id:string;kind:string;reserved_micro:number;charged_micro:number;status:'reserved'|'settled';created_at:string;details:unknown;usage?:unknown}
interface Ledger {version:1;limit_micro:number;suspended?:boolean;entries:Entry[]}
export class TestBudget {
 constructor(public path:string){}
 static initialize(path:string,limitUSD:number){
  mkdirSync(dirname(path),{recursive:true});
  if(!existsSync(path)) {const fd=openSync(path,'wx',0o600);try{writeFileSync(fd,JSON.stringify({version:1,limit_micro:Math.floor(limitUSD*1e6),entries:[]},null,2))}finally{closeSync(fd)}}
  const budget=new TestBudget(path);if(budget.snapshot().limit_micro!==Math.floor(limitUSD*1e6))throw Error('Existing cumulative approval differs; refusing to reset ledger');return budget;
 }
 snapshot():Ledger {return JSON.parse(readFileSync(this.path,'utf8'))}
 private update<T>(fn:(ledger:Ledger)=>T):T {
  const lock=this.path+'.lock';let fd:number;
  try{fd=openSync(lock,'wx',0o600)}catch{throw Error('Budget ledger is locked; billable work stopped')}
  try{const ledger=this.snapshot();const result=fn(ledger);const temp=this.path+'.'+randomUUID()+'.tmp';writeFileSync(temp,JSON.stringify(ledger,null,2),{mode:0o600});renameSync(temp,this.path);return result}
  finally{closeSync(fd);unlinkSync(lock)}
 }
 reserve(kind:string,usd:number,details:unknown):string {
  const micro=Math.ceil(usd*1e6);if(!Number.isSafeInteger(micro)||micro<0)throw Error('Invalid budget reservation');
  return this.update(ledger=>{const used=ledger.entries.reduce((n,e)=>n+e.charged_micro,0);if(ledger.suspended || used+micro>ledger.limit_micro)throw Error(`Cumulative Meta budget exhausted or insufficient: ${((ledger.limit_micro-used)/1e6).toFixed(4)} USD remaining`);
   const id=randomUUID();ledger.entries.push({id,kind,reserved_micro:micro,charged_micro:micro,status:'reserved',created_at:new Date().toISOString(),details});return id;});
 }
 settle(id:string,usd:number,usage:unknown){
  this.update(ledger=>{const entry=ledger.entries.find(e=>e.id===id);if(!entry)throw Error('Budget reservation missing');const actual=Math.ceil(usd*1e6);if(!Number.isSafeInteger(actual)||actual<0)throw Error('Invalid reported usage');
   if(actual>entry.reserved_micro){ledger.suspended=true;entry.usage={error:'Reported usage exceeded conservative reservation',usage};return;}
   entry.charged_micro=actual;entry.status='settled';entry.usage=usage;});
 }
}
export const APPROVED_LEDGER=fileURLToPath(new URL('../data/meta-test-approval.json',import.meta.url));
export function activeBudget():TestBudget|undefined {return process.env.BRAIVE_TEST_MODE==='true'?new TestBudget(APPROVED_LEDGER):undefined;}

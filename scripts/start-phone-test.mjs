// Reuses the existing cumulative approval. Henry expanded the total cap to US$50 on November 2.
// Startup never increases an existing cap or resets usage.
// Keep the local server reachable; paired practice actions renew a 15-minute provider activity window.
import {spawn} from 'node:child_process';import path from 'node:path';import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const init=spawn(process.execPath,['--import','tsx','--input-type=module','-e',"import {existsSync} from 'node:fs';import {TestBudget,APPROVED_LEDGER} from './src/budget.ts';const b=existsSync(APPROVED_LEDGER)?new TestBudget(APPROVED_LEDGER):TestBudget.initialize(APPROVED_LEDGER,50);const l=b.snapshot();console.log('Cumulative approved budget:',l.limit_micro/1e6,'USD; charged/reserved:',l.entries.reduce((n,e)=>n+e.charged_micro,0)/1e6,'USD');"],{cwd:path.join(root,'backend'),stdio:'inherit'});
await new Promise((resolve,reject)=>init.on('exit',code=>code===0?resolve():reject(Error('Budget initialization failed'))));
const child=spawn(process.execPath,['--import','tsx','--env-file=.env','src/server.ts'],{cwd:path.join(root,'backend'),env:{...process.env,META_REQUEST_LIMIT:process.env.META_REQUEST_LIMIT??'20',META_MAX_COST_USD:process.env.META_MAX_COST_USD??'5.00',BRAIVE_ALLOW_META:'true',BRAIVE_TEST_MODE:'true',BRAIVE_ALLOW_AUDIO:'false',BRAIVE_AUDIO_MAX_SECONDS:'600',BRAIVE_TEST_WINDOW_SECONDS:'900',HOST:'0.0.0.0',PORT:'8788'},stdio:'inherit'});
process.on('SIGINT',()=>child.kill('SIGINT'));process.on('SIGTERM',()=>child.kill('SIGTERM'));child.on('exit',code=>process.exitCode=code??0);

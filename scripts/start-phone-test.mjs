// Uses the single US$5 cumulative approval from the current continuation note. Never resets it.
import {spawn} from 'node:child_process';import path from 'node:path';import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const init=spawn(process.execPath,['--import','tsx','--input-type=module','-e',"import {TestBudget,APPROVED_LEDGER} from './src/budget.ts';const b=TestBudget.initialize(APPROVED_LEDGER,5);const l=b.snapshot();console.log('Cumulative approved budget: 5 USD; charged/reserved:',l.entries.reduce((n,e)=>n+e.charged_micro,0)/1e6,'USD');"],{cwd:path.join(root,'backend'),stdio:'inherit'});
await new Promise((resolve,reject)=>init.on('exit',code=>code===0?resolve():reject(Error('Budget initialization failed'))));
const child=spawn(process.execPath,['--import','tsx','--env-file=.env','src/server.ts'],{cwd:path.join(root,'backend'),env:{...process.env,BRAIVE_ALLOW_META:'true',BRAIVE_TEST_MODE:'true',BRAIVE_ALLOW_AUDIO:'false',BRAIVE_AUDIO_MAX_SECONDS:'600',BRAIVE_TEST_WINDOW_SECONDS:'900',HOST:'0.0.0.0',PORT:'8788'},stdio:'inherit'});
process.on('SIGINT',()=>child.kill('SIGINT'));process.on('SIGTERM',()=>child.kill('SIGTERM'));child.on('exit',code=>process.exitCode=code??0);

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {GenerationPause} from '../src/generation-pause.js';

test('STOP holds the next model stage, stale resume cannot release it, and cancellation still exits',async()=>{
 const gate=new GenerationPause(),controller=new AbortController();
 gate.set(true,2);gate.set(false,1);
 let dispatched=false;const next=gate.wait(controller.signal).then(()=>dispatched=true);
 await delay(70);assert.equal(dispatched,false);
 gate.set(false,3);await next;assert.equal(dispatched,true);
 gate.set(true,4);const pending=gate.wait(controller.signal);controller.abort();await assert.rejects(pending);
 assert.throws(()=>gate.set(false,-1));
});

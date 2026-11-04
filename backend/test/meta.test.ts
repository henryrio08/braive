import {test} from 'node:test';
import assert from 'node:assert/strict';
import {model,retryTemporaryProvider,TemporaryProviderError} from '../src/meta.js';

test('cumulative approval rejects unknown pricing and wrong model roles before spending',async()=>{
 const keys=['BRAIVE_ALLOW_META','BRAIVE_TEST_MODE','MODEL_API_KEY','SPARK_MODEL','WONDER_MODEL','META_MAX_COST_USD'];
 const previous=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 Object.assign(process.env,{BRAIVE_ALLOW_META:'true',BRAIVE_TEST_MODE:'true',MODEL_API_KEY:'offline-test-placeholder'});
 delete process.env.META_MAX_COST_USD;
 try {
  for(const spark of ['unpriced-model','muse-wonder-1.0']) {
   process.env.SPARK_MODEL=spark;
   await assert.rejects(model('AudioPlan',{},'',AbortSignal.timeout(100)),/No verified test pricing/);
  }
  process.env.WONDER_MODEL='muse-spark-1.3';
  await assert.rejects(model('SceneSpec',{},'',AbortSignal.timeout(100),'scene_builder'),/No verified test pricing/);
 } finally {
  for(const k of keys) {if(previous[k]===undefined)delete process.env[k];else process.env[k]=previous[k];}
 }
});

test('an already cancelled model call stops before permission, pricing or ledger work',async()=>{
 const controller=new AbortController();controller.abort(new Error('Already cancelled offline test'));
 await assert.rejects(model('AudioPlan',{},'',controller.signal),/Already cancelled offline test/);
});

test('a temporary provider outage retries once and stops on cancellation or nontransient errors',async()=>{
 const signal=AbortSignal.timeout(1000);let calls=0;
 assert.equal(await retryTemporaryProvider(async()=>{if(++calls===1)throw new TemporaryProviderError(503);return 'ok';},signal,0),'ok');
 assert.equal(calls,2);
 calls=0;await assert.rejects(retryTemporaryProvider(async()=>{calls++;throw new TemporaryProviderError(503);},signal,0),/503/);assert.equal(calls,2);
 calls=0;await assert.rejects(retryTemporaryProvider(async()=>{calls++;throw Error('invalid schema');},signal,0),/invalid schema/);assert.equal(calls,1);
 const controller=new AbortController();calls=0;
 await assert.rejects(retryTemporaryProvider(async()=>{calls++;controller.abort();throw new TemporaryProviderError(503);},controller.signal,0),{name:'AbortError'});assert.equal(calls,1);
});

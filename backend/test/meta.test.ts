import {test} from 'node:test';
import assert from 'node:assert/strict';
import {model} from '../src/meta.js';

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
  await assert.rejects(model('SceneSpec',{},'',AbortSignal.timeout(100),true),/No verified test pricing/);
 } finally {
  for(const k of keys) {if(previous[k]===undefined)delete process.env[k];else process.env[k]=previous[k];}
 }
});

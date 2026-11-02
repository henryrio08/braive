import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PhoneTestWindow} from '../src/phone-test-window.js';

test('provider access expires while the phone activity window remains renewable',()=>{
 let now=1000;const window=new PhoneTestWindow(true,900,()=>now);
 assert.equal(window.active,false);
 assert.equal(window.renew('POST','/v1/session-plans'),true);
 assert.equal(window.remainingSeconds,900);
 now+=900000;
 assert.equal(window.active,false);
 assert.equal(window.remainingSeconds,0);
 assert.equal(window.renew('POST','/v1/session-plans'),true);
 assert.equal(window.active,true);
});
test('health checks and job polling cannot renew idle provider access',()=>{
 const window=new PhoneTestWindow(true,900);
 for(const [method,path] of [['GET','/health'],['GET','/v1/jobs/example'],['GET','/v1/test-budget'],['DELETE','/v1/jobs/example'],['POST','/unrecognized']])
  assert.equal(window.renew(method,path),false);
 assert.equal(window.active,false);
});
test('an ordinary disabled launch cannot acquire provider authorization',()=>{
 const window=new PhoneTestWindow(false,900);
 assert.equal(window.renew('POST','/v1/session-plans'),false);
 assert.equal(window.active,false);
});
test('paired dialogue and feedback renew activity without weakening duration validation',()=>{
 let now=0;const window=new PhoneTestWindow(true,900,()=>now);
 assert.equal(window.renew('POST','/v1/dialogue'),true);
 now=899000;
 assert.equal(window.renew('POST','/v1/feedback'),true);
 now=901000;
 assert.equal(window.active,true);
 for(const seconds of [0,-1,NaN,Infinity])assert.throws(()=>new PhoneTestWindow(true,seconds));
});

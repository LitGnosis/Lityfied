import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cjRead} from '../lib/cj-read';
import {cjToken} from '../lib/cj';

test('concurrent cold requests acquire only one supplier token', async () => {
 const original=globalThis.fetch;
 const previous=process.env.CJ_API_KEY;
 process.env.CJ_API_KEY='test-key';
 let calls=0;
 globalThis.fetch=async()=>{calls++;await new Promise(r=>setTimeout(r,20));return Response.json({result:true,data:{accessToken:'test-token'}})};
 try {
  assert.deepEqual(await Promise.all([cjToken(),cjToken(),cjToken()]),['test-token','test-token','test-token']);
  assert.equal(calls,1);
 } finally {globalThis.fetch=original;if(previous===undefined)delete process.env.CJ_API_KEY;else process.env.CJ_API_KEY=previous;}
});

test('supplier QPS errors retry, persistent errors surface, and queue recovers', async () => {
 const original=globalThis.fetch;
 let calls=0;
 globalThis.fetch=async()=>++calls===1?Response.json({result:false,message:'Too Many Requests, QPS limit is 1 time/1second'}):Response.json({result:true,data:['product']});
 try {
  assert.deepEqual((await cjRead('https://example.test')).data,['product']);
  assert.equal(calls,2);
  calls=0;
  globalThis.fetch=async()=>{calls++;return Response.json({result:false,message:'Too Many Requests, QPS limit is 1 time/1second'})};
  await assert.rejects(cjRead('https://example.test'),/QPS limit/);
  assert.equal(calls,3);
  globalThis.fetch=async()=>Response.json({result:true,data:[]});
  assert.deepEqual((await cjRead('https://example.test')).data,[]);
 } finally {globalThis.fetch=original;}
});

import {test,mock} from 'node:test';
import assert from 'node:assert/strict';
const user={id:1,email:'existing-customer@example.test',email_verified:false};
mock.module('../lib/auth.ts',{namedExports:{currentUser:async()=>user}});
mock.module('../lib/db.ts',{namedExports:{ensurePlatinumSchema:async()=>{},ensureSchema:async()=>{},query:async(sql:string)=>{if(/customer_email|lower\(r.email\)|support_tickets/.test(sql))throw new Error('Unverified account accessed email-linked data');return []},transaction:async(fn:()=>Promise<unknown>)=>fn()}});
const {NextRequest}=await import('next/server');
test('unverified account cannot read guest orders, returns or support conversations',async()=>{
 const {GET:orders}=await import('../app/api/account/orders/route');
 const {GET:profile}=await import('../app/api/account/profile/route');
 const {GET:support}=await import('../app/api/support/route');
 const {POST:returns}=await import('../app/api/account/returns/route');
 assert.equal((await orders()).status,403);
 assert.equal((await support()).status,403);
 assert.equal((await returns(new NextRequest('https://example.test/api/account/returns',{method:'POST',body:'{}'}))).status,403);
 const response=await profile();assert.equal(response.status,200);const data=await response.json();
 assert.deepEqual(data.orders,[]);assert.deepEqual(data.returns,[]);
});

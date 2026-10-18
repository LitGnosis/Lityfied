import {test} from 'node:test';
import assert from 'node:assert/strict';
import {NextRequest} from 'next/server';
import {GET} from '../app/api/launch-readiness/route';
test('readiness rejects unauthenticated and non-owner callers before database access',async()=>{
 process.env.ADMIN_OWNER_SECRET='owner-test';process.env.ADMIN_SUPPORT_SECRET='support-test';
 for(const token of ['', 'wrong', 'support-test']){
 const response=await GET(new NextRequest('https://example.test/api/launch-readiness',{headers:{authorization:`Bearer ${token}`}}));
 assert.equal(response.status,401);assert.deepEqual(await response.json(),{error:'Unauthorized'});
 }
});

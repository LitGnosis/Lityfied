import {test,mock,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {normalizeItems,promotionAmount} from '../lib/checkout-rules';
import {checkoutBlocker,supplierEnabled,RELEASE} from '../lib/launch';
const database=new PGlite();
let failDatabase=false;
class TestPool {
 async query(sql:string,params:any[]=[]){if(failDatabase)throw new Error('Simulated database outage');const result=await database.query(sql,params);return {...result,rowCount:result.affectedRows};}
 async connect(){return {query:this.query.bind(this),release(){}};}
}
mock.module('pg',{namedExports:{Pool:TestPool},defaultExport:{Pool:TestPool}});
process.env.DATABASE_URL='postgres://isolated-test';
const {query}=await import('../lib/db');
const {recordPaidOrder}=await import('../lib/orders');
const {applyRefund}=await import('../lib/refunds');
const {fulfillOrder}=await import('../lib/fulfillment');
after(async()=>{await database.close()});
let stripe:any;
function fakeStripe(id='cs_test_purchase'):any{
 const session={id,payment_status:'paid',metadata:{storefront:'lityfied'},livemode:false,customer_details:{email:'buyer@example.test',name:'Buyer',address:{country:'US',state:'TX',city:'Austin',line1:'Test address'}},currency:'usd',amount_total:2500};
 return {checkout:{sessions:{retrieve:async()=>session,listLineItems:async function*(){yield {quantity:1,price:{unit_amount:2500,product:{name:'Test item',images:[],metadata:{product_id:'p1',variant_id:'v1',sku:'sku1'}}}}}}},session};
}
test('rejects invalid/fractional/NaN quantities and merges identical variants',()=>{
 assert.throws(()=>normalizeItems([{id:'p',variantId:'v',qty:1.5}]));
 assert.throws(()=>normalizeItems([{id:'p',variantId:'v',qty:'bad'}]));
 assert.throws(()=>normalizeItems([{id:'p',qty:1}]));
 assert.throws(()=>normalizeItems([{id:'p',variantId:'v',qty:8},{id:'p',variantId:'v',qty:4}]));
 assert.equal(normalizeItems([{id:'p',variantId:'v',qty:2},{id:'p',variantId:'v',qty:3}])[0].qty,5);
 assert.equal(promotionAmount(1000,'percent',10),100);
 assert.equal(promotionAmount(1000,'fixed',5000),999);
});
test('live checkout fails closed; test payments never create supplier orders',()=>{
 const env={DATABASE_URL:'test',STRIPE_WEBHOOK_SECRET:'test',CJ_API_KEY:'test',NEXT_PUBLIC_SITE_URL:'https://example.test',STRIPE_SECRET_KEY:'sk_live_example'};
 assert.ok(checkoutBlocker(env));
 assert.equal(checkoutBlocker({...env,STRIPE_SECRET_KEY:'sk_test_example'}),null);
 assert.equal(checkoutBlocker({...env,LIVE_COMMERCE_ENABLED:'true',LAUNCH_VERIFIED_RELEASE:RELEASE}),null);
 assert.equal(supplierEnabled(false,{LIVE_COMMERCE_ENABLED:'true',LAUNCH_VERIFIED_RELEASE:RELEASE,CJ_FULFILLMENT_ENABLED:'true'}),false);
});
test('migrations apply twice without losing commerce data',async()=>{
 const files=(await readdir(new URL('../migrations/',import.meta.url))).sort();
 for(let pass=0;pass<2;pass++)for(const file of files)await database.exec(await readFile(new URL(`../migrations/${file}`,import.meta.url),'utf8'));
 await query("insert into schema_migrations(version) values('002_launch_safety.sql')");
 await query("insert into users(email,password_hash,name) values('buyer@example.test','test','Buyer')");
 await query("insert into user_rewards(user_id,referral_code,store_credit_cents) values(1,'TESTCODE',1000)");
 const tables=await query("select tablename from pg_tables where schemaname='public'");
 for(const table of ['users','carts','wishlists','orders','order_items','returns','support_tickets','reviews','promotions','analytics_events','webhook_events','fulfillment_attempts','email_outbox'])assert.ok(tables.some((x:any)=>x.tablename===table),table);
});
test('paid checkout is atomic and duplicate deliveries produce one order, reward, purchase and email',async()=>{
 stripe=fakeStripe();
 const first=await recordPaidOrder(stripe,stripe.session.id);
 const second=await recordPaidOrder(stripe,stripe.session.id);
 assert.equal(first.id,second.id);
 for(const table of ['orders','order_items','analytics_events','email_outbox'])assert.equal((await query(`select count(*)::int n from ${table}`))[0].n,1,table);
 assert.equal((await query("select points_balance from user_rewards where user_id=1"))[0].points_balance,25);
 assert.equal((await fulfillOrder(stripe,stripe.session.id)).fulfillment_state,'test_payment_no_supplier_order');
 assert.equal((await query('select count(*)::int n from fulfillment_attempts'))[0].n,0);
});
test('unpaid and malformed paid orders create no order',async()=>{
 const unpaid=fakeStripe('cs_test_unpaid');unpaid.session.payment_status='unpaid';
 assert.equal(await recordPaidOrder(unpaid,unpaid.session.id),null);
 const bad:any=fakeStripe('cs_test_bad_mapping');bad.checkout.sessions.listLineItems=async function*(){yield {price:{product:{name:'Bad',metadata:{}}}}};
 await assert.rejects(recordPaidOrder(bad,bad.session.id));
 assert.equal((await query('select count(*)::int n from orders'))[0].n,1);
});
test('credit and promotion are consumed exactly once',async()=>{
 const credit=fakeStripe('cs_test_credit');Object.assign(credit.session.metadata,{store_credit_cents:'300',promotion_code:'SAVE'});
 await query("insert into promotions(code,kind,value) values('SAVE','percent',10)");
 await query("insert into store_credit_reservations(user_id,amount_cents,stripe_session_id,expires_at) values(1,300,$1,now()+interval '1 hour')",[credit.session.id]);
 await query("insert into promotion_reservations(stripe_session_id,code,expires_at) values($1,'SAVE',now()+interval '1 hour')",[credit.session.id]);
 await recordPaidOrder(credit,credit.session.id);await recordPaidOrder(credit,credit.session.id);
 assert.equal((await query('select store_credit_cents from user_rewards where user_id=1'))[0].store_credit_cents,700);
 assert.equal((await query("select uses from promotions where code='SAVE'"))[0].uses,1);
});
test('missing credit reservation rolls back the entire order',async()=>{
 const missing=fakeStripe('cs_test_missing_credit');Object.assign(missing.session.metadata,{store_credit_cents:'500'});
 await assert.rejects(recordPaidOrder(missing,missing.session.id),/reservation/);
 assert.equal((await query('select count(*)::int n from orders where stripe_session_id=$1',[missing.session.id]))[0].n,0);
});
test('signed webhook rejects forged signatures and returns 500 on database failure',async()=>{
 const {NextRequest}=await import('next/server');
 const {default:Stripe}=await import('stripe');
 const {POST}=await import('../app/api/stripe/webhook/route');
 process.env.STRIPE_SECRET_KEY='sk_test_isolated';process.env.STRIPE_WEBHOOK_SECRET='whsec_isolated';
 const client=new Stripe(process.env.STRIPE_SECRET_KEY);
 const payload=JSON.stringify({id:'evt_isolated',type:'checkout.session.completed',data:{object:{id:'cs_test_pending',payment_status:'unpaid',metadata:{storefront:'lityfied'}}}});
 const header=client.webhooks.generateTestHeaderString({payload,secret:process.env.STRIPE_WEBHOOK_SECRET});
 const request=(signature:string)=>new NextRequest('https://example.test/api/stripe/webhook',{method:'POST',headers:{'stripe-signature':signature},body:payload});
 assert.equal((await POST(request('forged'))).status,400);
 assert.equal((await POST(request(header))).status,200);
 failDatabase=true;
 try{assert.equal((await POST(request(header))).status,500)}finally{failDatabase=false;}
});
test('supplier timeout cannot automatically create a second supplier order',async()=>{
 const saved={...process.env};const original=globalThis.fetch;
 const supplier=fakeStripe('cs_live_timeout');supplier.session.livemode=true;
 await recordPaidOrder(supplier,supplier.session.id);
 Object.assign(process.env,{LIVE_COMMERCE_ENABLED:'true',LAUNCH_VERIFIED_RELEASE:RELEASE,CJ_FULFILLMENT_ENABLED:'true',CJ_API_KEY:'isolated',CJ_DEFAULT_LOGISTICS:'isolated'});
 let submissions=0;
 globalThis.fetch=async(input:any)=>{
  if(String(input).includes('getAccessToken'))return Response.json({result:true,data:{accessToken:'isolated'}});
  submissions++;throw new Error('Simulated timeout after submission');
 };
 try{
  assert.equal((await fulfillOrder(supplier,supplier.session.id)).fulfillment_state,'supplier_reconciliation_required');
  assert.equal((await fulfillOrder(supplier,supplier.session.id)).fulfillment_state,'supplier_reconciliation_required');
  assert.equal(submissions,1);
 }finally{globalThis.fetch=original;for(const key of Object.keys(process.env))if(!(key in saved))delete process.env[key];Object.assign(process.env,saved)}
});
test('explicit supplier rejection is retryable and success is persisted once',async()=>{
 const saved={...process.env};const original=globalThis.fetch;
 const supplier=fakeStripe('cs_live_rejection');supplier.session.livemode=true;
 await recordPaidOrder(supplier,supplier.session.id);
 Object.assign(process.env,{LIVE_COMMERCE_ENABLED:'true',LAUNCH_VERIFIED_RELEASE:RELEASE,CJ_FULFILLMENT_ENABLED:'true',CJ_API_KEY:'isolated',CJ_DEFAULT_LOGISTICS:'isolated'});
 let submissions=0;
 globalThis.fetch=async(input:any)=>{
  if(String(input).includes('getAccessToken'))return Response.json({result:true,data:{accessToken:'isolated'}});
  submissions++;
  return Response.json(submissions===1?{result:false,message:'Out of stock'}:{result:true,data:{orderId:'supplier-isolated-1'}});
 };
 try{
  assert.equal((await fulfillOrder(supplier,supplier.session.id)).fulfillment_state,'supplier_attention_required');
  assert.equal((await fulfillOrder(supplier,supplier.session.id)).cj_order_id,'supplier-isolated-1');
  assert.equal((await fulfillOrder(supplier,supplier.session.id)).cj_order_id,'supplier-isolated-1');
  assert.equal(submissions,2);
 }finally{globalThis.fetch=original;for(const key of Object.keys(process.env))if(!(key in saved))delete process.env[key];Object.assign(process.env,saved)}
});
test('refund updates are repeatable and do not mark pending refunds as paid back',async()=>{
 const order=(await query("select id from orders where stripe_session_id='cs_test_purchase'"))[0];
 const ret=(await query("insert into returns(order_id,email,reason) values($1,'buyer@example.test','Test') returning id",[order.id]))[0];
 await query('insert into refund_requests(return_id,amount_cents) values($1,2500)',[ret.id]);
 const refund:any={id:'re_isolated',amount:2500,status:'pending',metadata:{return_id:String(ret.id)}};
 await applyRefund(refund);
 assert.equal((await query('select status from orders where id=$1',[order.id]))[0].status,'paid');
 refund.status='succeeded';await applyRefund(refund);await applyRefund(refund);
 assert.equal((await query('select status from orders where id=$1',[order.id]))[0].status,'refunded');
 assert.equal((await query('select refund_cents from returns where id=$1',[ret.id]))[0].refund_cents,2500);
});
test('checkout limiter distinguishes database outage from rate exhaustion',async()=>{
 const {rateLimit}=await import('../lib/rate-limit');
 failDatabase=true;
 try{
  await assert.rejects(rateLimit('outage',12,60000,true),/Rate limiter unavailable/);
  assert.equal(await rateLimit('outage',12,60000),false);
 }finally{failDatabase=false;}
 const url=process.env.DATABASE_URL;delete process.env.DATABASE_URL;
 try{await assert.rejects(rateLimit('missing-db',12,60000,true),/Rate limiter unavailable/)}finally{process.env.DATABASE_URL=url;}
});
test('shared database limiter enforces its cap',async()=>{
 const {rateLimit}=await import('../lib/rate-limit');
 assert.equal(await rateLimit('test-client',2,60000),true);
 assert.equal(await rateLimit('test-client',2,60000),true);
 assert.equal(await rateLimit('test-client',2,60000),false);
});
test('failed queued email remains pending and retries without discarding it',async()=>{
 const {GET}=await import('../app/api/cron/email-outbox/route');
 const {NextRequest}=await import('next/server');
 const saved={...process.env},original=globalThis.fetch;
 Object.assign(process.env,{CRON_SECRET:'isolated-cron',RESEND_API_KEY:'isolated-email',EMAIL_FROM:'test@example.test'});
 const request=()=>new NextRequest('https://example.test/api/cron/email-outbox',{headers:{authorization:'Bearer isolated-cron'}});
 try{
  assert.equal((await GET(new NextRequest('https://example.test/api/cron/email-outbox'))).status,401);
  globalThis.fetch=async()=>new Response('',{status:503});
  assert.equal((await GET(request())).status,503);
  assert.ok((await query('select count(*)::int n from email_outbox where sent_at is null and attempts>0'))[0].n>0);
  globalThis.fetch=async(_input:any,init:any)=>{
   assert.ok(init.headers['Idempotency-Key']);return Response.json({id:'email-isolated'});
  };
  assert.equal((await GET(request())).status,200);
  assert.equal((await query('select count(*)::int n from email_outbox where sent_at is null'))[0].n,0);
 }finally{globalThis.fetch=original;for(const key of Object.keys(process.env))if(!(key in saved))delete process.env[key];Object.assign(process.env,saved)}
});
test('expired reservation reconciliation checks Stripe before releasing credit',async()=>{
 const {reconcileExpiredReservations}=await import('../lib/reservations');
 const expired=fakeStripe('cs_test_expired');expired.session.payment_status='unpaid';expired.session.status='expired';
 await query("insert into store_credit_reservations(user_id,amount_cents,stripe_session_id,expires_at) values(1,100,$1,now()-interval '1 hour')",[expired.session.id]);
 assert.equal((await reconcileExpiredReservations(expired)).released,1);
 assert.equal((await query('select status from store_credit_reservations where stripe_session_id=$1',[expired.session.id]))[0].status,'released');
 const pending=fakeStripe('cs_test_processing');pending.session.payment_status='unpaid';pending.session.status='complete';
 await query("insert into store_credit_reservations(user_id,amount_cents,stripe_session_id,expires_at) values(1,100,$1,now()-interval '1 hour')",[pending.session.id]);
 assert.equal((await reconcileExpiredReservations(pending)).released,0);
 assert.equal((await query('select status from store_credit_reservations where stripe_session_id=$1',[pending.session.id]))[0].status,'reserved');
});

test('return request stores one event and escaped durable email; duplicates and foreign orders fail',async()=>{
 const {requestReturn}=await import('../lib/returns');
 const order=(await query("select order_number,id from orders where stripe_session_id='cs_test_credit'"))[0];
 await assert.rejects(requestReturn('other@example.test',order.order_number,'Test',''),/not found/);
 const row=await requestReturn('buyer@example.test',order.order_number,'<img src=x>','Test details');
 await assert.rejects(requestReturn('buyer@example.test',order.order_number,'Test',''),/already exists/);
 assert.equal((await query('select count(*)::int n from returns where order_id=$1',[order.id]))[0].n,1);
 assert.equal((await query("select count(*)::int n from order_events where order_id=$1 and event_type='return_requested'",[order.id]))[0].n,1);
 const email=(await query('select html from email_outbox where dedupe_key=$1',[`return-request-${row.id}`]))[0];
 assert.ok(email.html.includes('&lt;img src=x&gt;'));assert.ok(!email.html.includes('<img'));
});
test('failed return email enqueue rolls back return and audit event',async()=>{
 const {requestReturn}=await import('../lib/returns');
 const order=(await query("select order_number,id from orders where stripe_session_id='cs_live_timeout'"))[0];
 await database.exec("CREATE FUNCTION reject_return_email() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'test queue outage'; END; $$ LANGUAGE plpgsql; CREATE TRIGGER test_return_queue BEFORE INSERT ON email_outbox FOR EACH ROW EXECUTE FUNCTION reject_return_email();");
 try{await assert.rejects(requestReturn('buyer@example.test',order.order_number,'Test',''),/test queue outage/)}
 finally{await database.exec('DROP TRIGGER test_return_queue ON email_outbox; DROP FUNCTION reject_return_email();')}
 assert.equal((await query('select count(*)::int n from returns where order_id=$1',[order.id]))[0].n,0);
 assert.equal((await query("select count(*)::int n from order_events where order_id=$1 and event_type='return_requested'",[order.id]))[0].n,0);
});
test('password reset is single-use, invalidates other reset tokens and revokes sessions atomically',async()=>{
 const {createHash}=await import('node:crypto');const {resetPassword}=await import('../lib/password-reset');
 const token='a'.repeat(64),other='b'.repeat(64);
 for(const t of [token,other])await query("insert into password_resets(user_id,token_hash,expires_at) values(1,$1,now()+interval '1 hour')",[createHash('sha256').update(t).digest('hex')]);
 await query("insert into sessions(user_id,token_hash,expires_at) values(1,'session-to-revoke',now()+interval '1 day')");
 await resetPassword(token,'a-new-secure-password');
 await assert.rejects(resetPassword(token,'another-password'),/Invalid or expired/);
 await assert.rejects(resetPassword(other,'another-password'),/Invalid or expired/);
 assert.equal((await query('select count(*)::int n from sessions where user_id=1'))[0].n,0);
 assert.notEqual((await query('select password_hash from users where id=1'))[0].password_hash,'test');
});
test('admin overview enforces data visibility for marketing, support, operations and owner',async()=>{
 const {GET}=await import('../app/api/admin/overview/route');const {NextRequest}=await import('next/server');
 const saved={...process.env};Object.assign(process.env,{ADMIN_OWNER_SECRET:'test-owner',ADMIN_MARKETING_SECRET:'test-marketing',ADMIN_SUPPORT_SECRET:'test-support',ADMIN_OPERATIONS_SECRET:'test-operations'});
 try{
  assert.equal((await GET(new NextRequest('https://example.test/api/admin/overview'))).status,401);
  for(const role of ['marketing','support','operations','owner']){
   const response=await GET(new NextRequest('https://example.test/api/admin/overview',{headers:{authorization:`Bearer test-${role}`}}));
   assert.equal(response.status,200);const body=await response.json();assert.equal(body.role,role);
   if(role==='marketing'){assert.deepEqual(body.recentOrders,[]);assert.deepEqual(body.openTickets,[]);assert.deepEqual(body.returns,[]);assert.deepEqual(body.attention,[]);assert.equal(body.stats,null)}
   if(role==='support'){assert.equal(body.stats,null);assert.deepEqual(body.promotions,[]);assert.deepEqual(body.analytics,[])}
   if(role==='operations'){assert.deepEqual(body.pendingReviews,[]);assert.deepEqual(body.pendingQuestions,[]);assert.deepEqual(body.promotions,[])}
   if(role!=='owner')assert.equal(body.rewards,undefined);
   if(role==='owner')assert.ok(body.stats.orders>0);
  }
 }finally{for(const key of Object.keys(process.env))if(!(key in saved))delete process.env[key];Object.assign(process.env,saved)}
});

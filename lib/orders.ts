import type Stripe from 'stripe';
import {query,transaction} from './db';
import {awardOrderPoints} from './rewards';
export async function recordPaidOrder(stripe:Stripe,sessionId:string){
 const session=await stripe.checkout.sessions.retrieve(sessionId);
 if(session.payment_status!=='paid')return null;
 if(session.metadata?.storefront!=='lityfied')throw new Error('Checkout does not belong to Lityfied.');
 const lines=[] as Stripe.LineItem[];
 for await(const line of stripe.checkout.sessions.listLineItems(sessionId,{limit:100,expand:['data.price.product']}))lines.push(line);
 if(!lines.length)throw new Error('Paid checkout has no line items.');
 const email=(session.customer_details?.email||session.customer_email||'').trim().toLowerCase();
 if(!email)throw new Error('Paid checkout is missing customer email.');
 return transaction(async()=>{
  await query('select pg_advisory_xact_lock(hashtext($1))',[`order:${sessionId}`]);
  const existing=(await query('select * from orders where stripe_session_id=$1',[sessionId]))[0];
  if(existing)return existing;
  const orderNumber=`LITY-${sessionId.slice(-18)}`;
  const shipping=(session as any).collected_information?.shipping_details||(session as any).shipping_details||session.customer_details;
  await query('insert into customers(email,name) values($1,$2) on conflict(email) do update set name=coalesce(excluded.name,customers.name)',[email,session.customer_details?.name||null]);
  const order=(await query(`insert into orders(order_number,stripe_session_id,customer_email,status,fulfillment_status,currency,total_cents,shipping_json) values($1,$2,$3,'paid','paid_pending_supplier',$4,$5,$6) returning *`,[orderNumber,sessionId,email,session.currency||'usd',session.amount_total||0,JSON.stringify(shipping||{})]))[0];
  for(const line of lines){
   const product=line.price?.product as Stripe.Product;
   if(!product||typeof product==='string'||product.deleted||!product.metadata?.variant_id)throw new Error('Checkout line item is missing supplier mapping.');
   await query('insert into order_items(order_id,product_id,variant_id,sku,name,quantity,unit_amount,image) values($1,$2,$3,$4,$5,$6,$7,$8)',[order.id,product.metadata.product_id,product.metadata.variant_id,product.metadata.sku||'',product.name,line.quantity,line.price?.unit_amount,product.images?.[0]||'']);
  }
  const credit=Number(session.metadata?.store_credit_cents||0);
  if(credit){
   const reservation=(await query("update store_credit_reservations set status='consumed' where stripe_session_id=$1 and status='reserved' returning user_id,amount_cents",[sessionId]))[0];
   if(!reservation||Number(reservation.amount_cents)!==credit)throw new Error('Store credit reservation missing or mismatched.');
   const applied=await query('update user_rewards set store_credit_cents=store_credit_cents-$1,updated_at=now() where user_id=$2 and store_credit_cents>=$1 returning user_id',[credit,reservation.user_id]);
   if(!applied.length)throw new Error('Insufficient reserved store credit.');
   await query("insert into reward_ledger(user_id,order_id,kind,credit_cents_delta,note) values($1,$2,'store_credit_redeemed',$3,'Applied to checkout')",[reservation.user_id,order.id,-credit]);
  }
  const promo=session.metadata?.promotion_code;
  if(promo){
   const reserved=await query("update promotion_reservations set status='consumed' where stripe_session_id=$1 and status='reserved' returning code",[sessionId]);
   if(!reserved.length)throw new Error('Promotion reservation missing.');
   await query('update promotions set uses=uses+1 where upper(code)=upper($1)',[promo]);
  }
  await awardOrderPoints(email,order.id,session.amount_total||0);
  await query("insert into analytics_events(session_key,event_name,metadata) values($1,'purchase',$2)",[sessionId,JSON.stringify({orderId:order.id,totalCents:session.amount_total||0})]);
  await query("insert into order_events(order_id,event_type,detail_json) values($1,'payment_recorded',$2)",[order.id,JSON.stringify({sessionId,livemode:session.livemode})]);
  await query(`insert into email_outbox(dedupe_key,recipient,subject,html) values($1,$2,$3,$4) on conflict do nothing`,[`order-${order.id}`,email,`Lityfied order ${orderNumber} confirmed`,`<h1>Order confirmed</h1><p>Your order <b>${orderNumber}</b> is paid and awaiting fulfillment.</p><p>Total: $${((session.amount_total||0)/100).toFixed(2)}</p>`]);
  return order;
 });
}

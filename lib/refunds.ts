import Stripe from 'stripe';
import {query,transaction} from './db';

async function setRefundAdjustment(userId:number,orderId:number,kind:string,targetPoints:number,targetCredit:number,note:string){
 const reward=(await query<any>('select user_id from user_rewards where user_id=$1 for update',[userId]))[0];
 if(!reward)return;
 const existing=(await query<any>('select id,points_delta,credit_cents_delta from reward_ledger where user_id=$1 and order_id=$2 and kind=$3 for update',[userId,orderId,kind]))[0];
 const oldPoints=Number(existing?.points_delta||0),oldCredit=Number(existing?.credit_cents_delta||0);
 const pointDelta=targetPoints-oldPoints,creditDelta=targetCredit-oldCredit;
 if(pointDelta||creditDelta){
  await query('update user_rewards set points_balance=greatest(0,points_balance+$1),store_credit_cents=greatest(0,store_credit_cents+$2),updated_at=now() where user_id=$3',[pointDelta,creditDelta,userId]);
 }
 if(existing){
  await query('update reward_ledger set points_delta=$1,credit_cents_delta=$2,note=$3 where id=$4',[targetPoints,targetCredit,note,existing.id]);
 }else if(targetPoints||targetCredit){
  await query('insert into reward_ledger(user_id,order_id,kind,points_delta,credit_cents_delta,note) values($1,$2,$3,$4,$5,$6)',[userId,orderId,kind,targetPoints,targetCredit,note]);
 }
}

async function reconcileRefundRewards(orderId:number,cumulativeRefundCents:number){
 const order=(await query<any>('select id,total_cents from orders where id=$1 for update',[orderId]))[0];
 if(!order)return;
 const total=Math.max(0,Number(order.total_cents||0));
 const refunded=Math.max(0,Math.min(total,cumulativeRefundCents));
 if(total<1||refunded<1)return;
 const purchase=(await query<any>("select user_id,points_delta from reward_ledger where order_id=$1 and kind='purchase' order by id limit 1",[orderId]))[0];
 const redeemed=(await query<any>("select user_id,credit_cents_delta from reward_ledger where order_id=$1 and kind='store_credit_redeemed' order by id limit 1",[orderId]))[0];
 const full=refunded>=total;
 if(purchase){
  const earned=Math.max(0,Number(purchase.points_delta||0));
  const reverse=full?earned:Math.floor(earned*refunded/total);
  await setRefundAdjustment(Number(purchase.user_id),orderId,'refund_points_reversal',-reverse,0,`Purchase points reversed for ${refunded} cents refunded`);
 }
 if(redeemed){
  const spent=Math.max(0,-Number(redeemed.credit_cents_delta||0));
  const restore=full?spent:Math.floor(spent*refunded/total);
  await setRefundAdjustment(Number(redeemed.user_id),orderId,'refund_store_credit_restore',0,restore,`Store credit restored for ${refunded} cents refunded`);
 }
 if(full){
  const referralRows=await query<any>("select user_id,kind,points_delta from reward_ledger where order_id=$1 and kind in ('referral_welcome','referral_bonus')",[orderId]);
  for(const row of referralRows){
   const points=Math.max(0,Number(row.points_delta||0));
   const kind=row.kind==='referral_welcome'?'refund_referral_welcome':'refund_referral_bonus';
   await setRefundAdjustment(Number(row.user_id),orderId,kind,-points,0,'Referral reward reversed after full refund');
  }
 }
}

export async function refundReturn(returnId:number,requested:unknown){
 const stripe=new Stripe(process.env.STRIPE_SECRET_KEY!,{timeout:12000,maxNetworkRetries:1});
 const request=await transaction(async()=>{
  const row=(await query<any>(`select r.*,o.stripe_session_id,o.total_cents from returns r join orders o on o.id=r.order_id where r.id=$1 for update of r,o`,[returnId]))[0];
  if(!row)throw new Error('Return not found');
  const existing=(await query<any>('select * from refund_requests where return_id=$1',[returnId]))[0];
  const amount=Number(requested??existing?.amount_cents??row.total_cents);
  if(!Number.isSafeInteger(amount)||amount<1||amount>Number(row.total_cents))throw new Error('Invalid refund amount');
  if(existing&&Number(existing.amount_cents)!==amount)throw new Error('A refund request already exists with a different amount.');
  if(!existing)await query('insert into refund_requests(return_id,amount_cents) values($1,$2)',[returnId,amount]);
  return {sessionId:row.stripe_session_id,orderId:Number(row.order_id),amount,existing};
 });
 if(request.existing?.stripe_refund_id)return {ok:true,refundId:request.existing.stripe_refund_id,state:request.existing.state};
 // Stripe retains idempotency keys for at least 24h. Never automatically recreate an uncertain old request.
 if(request.existing&&Date.now()-new Date(request.existing.created_at).getTime()>23*60*60*1000)throw new Error('Refund requires Stripe reconciliation before retry.');
 const session=await stripe.checkout.sessions.retrieve(request.sessionId);
 const paymentIntent=typeof session.payment_intent==='string'?session.payment_intent:session.payment_intent?.id;
 if(!paymentIntent)throw new Error('Payment intent not found');
 const refund=await stripe.refunds.create({payment_intent:paymentIntent,amount:request.amount,metadata:{return_id:String(returnId),order_id:String(request.orderId)}},{idempotencyKey:`lityfied-return-${returnId}`});
 await applyRefund(refund);
 return {ok:true,refundId:refund.id,state:refund.status};
}

export async function applyRefund(refund:Stripe.Refund){
 const id=Number(refund.metadata?.return_id);if(!Number.isSafeInteger(id)||id<1)return;
 await transaction(async()=>{
  const request=(await query<any>('select * from refund_requests where return_id=$1 for update',[id]))[0];
  if(!request)return;
  if(request.state==='succeeded'&&refund.status!=='succeeded')return;
  if(request.stripe_refund_id&&request.stripe_refund_id!==refund.id)throw new Error('Refund reference mismatch');
  await query('update refund_requests set stripe_refund_id=$1,state=$2 where return_id=$3',[refund.id,refund.status||'pending',id]);
  if(refund.status!=='succeeded')return;
  const row=(await query<any>("update returns set status='refunded',refund_cents=greatest(refund_cents,$1),updated_at=now() where id=$2 returning order_id",[refund.amount,id]))[0];
  if(!row)return;
  const totals=(await query<any>('select coalesce(sum(refund_cents),0)::int refunded_cents from returns where order_id=$1',[row.order_id]))[0];
  const cumulative=Math.max(0,Number(totals?.refunded_cents||0));
  await query(`update orders set status=case when $2>=total_cents then 'refunded' else 'partially_refunded' end,updated_at=now() where id=$1`,[row.order_id,cumulative]);
  await reconcileRefundRewards(Number(row.order_id),cumulative);
  await query(`insert into order_events(order_id,event_type,detail_json)
   select $1,'refund_succeeded',$2::jsonb
   where not exists (select 1 from order_events where order_id=$1 and event_type='refund_succeeded' and detail_json->>'refundId'=$3)`,
   [row.order_id,JSON.stringify({refundId:refund.id,amountCents:refund.amount,cumulativeRefundCents:cumulative}),refund.id]);
 });
}

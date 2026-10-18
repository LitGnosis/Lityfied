import {applyRefund} from '../../../../lib/refunds';
import {NextRequest,NextResponse} from 'next/server';
import Stripe from 'stripe';
import {ensurePlatinumSchema,query,transaction} from '../../../../lib/db';
import {recordPaidOrder} from '../../../../lib/orders';
import {fulfillOrder} from '../../../../lib/fulfillment';
export async function POST(req:NextRequest){
 const key=process.env.STRIPE_SECRET_KEY,secret=process.env.STRIPE_WEBHOOK_SECRET;
 if(!key||!secret)return NextResponse.json({error:'Webhook not configured'},{status:503});
 const signature=req.headers.get('stripe-signature');if(!signature)return NextResponse.json({error:'Missing signature'},{status:400});
 const stripe=new Stripe(key,{timeout:12000,maxNetworkRetries:1});let event:Stripe.Event;
 try{event=stripe.webhooks.constructEvent(await req.text(),signature,secret)}catch{return NextResponse.json({error:'Invalid signature'},{status:400})}
 try{
  await ensurePlatinumSchema();
  if(['refund.created','refund.updated','refund.failed'].includes(event.type)){await applyRefund(event.data.object as Stripe.Refund);return NextResponse.json({received:true});}
  const paid=['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(event.type);
  const release=['checkout.session.expired','checkout.session.async_payment_failed'].includes(event.type);
  if(!paid&&!release)return NextResponse.json({received:true});
  const session=event.data.object as Stripe.Checkout.Session;
  if(session.metadata?.storefront!=='lityfied')return NextResponse.json({received:true,ignored:true});
  if(paid){
   if(session.payment_status!=='paid')return NextResponse.json({received:true,paymentPending:true});
   const order=await recordPaidOrder(stripe,session.id);
   if(order)await fulfillOrder(stripe,session.id);
  }else{
   const current=await stripe.checkout.sessions.retrieve(session.id);
   if(current.payment_status!=='paid')await transaction(async()=>{
    await query("update store_credit_reservations set status='released' where stripe_session_id=$1 and status='reserved'",[session.id]);
    await query("update promotion_reservations set status='released' where stripe_session_id=$1 and status='reserved'",[session.id]);
   });
  }
  await query('insert into webhook_events(id,event_type) values($1,$2) on conflict do nothing',[event.id,event.type]);
  return NextResponse.json({received:true});
 }catch(error){
  console.error('LITYFIED_WEBHOOK_PROCESSING_FAILED',event.id,error instanceof Error?error.message:'Processing failed');
  // A valid event that failed internally must be retried by Stripe.
  return NextResponse.json({error:'Processing failed; retry required.'},{status:500});
 }
}

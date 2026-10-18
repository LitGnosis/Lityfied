import {NextRequest,NextResponse} from 'next/server';
import Stripe from 'stripe';
import {safeEqual} from '../../../../lib/security';
import {ensurePlatinumSchema} from '../../../../lib/db';
import {recordPaidOrder} from '../../../../lib/orders';
import {fulfillOrder} from '../../../../lib/fulfillment';
export async function POST(req:NextRequest){
 const secret=process.env.FULFILLMENT_RECOVERY_SECRET;
 if(!secret||!safeEqual(req.headers.get('x-recovery-secret')||'',secret))return NextResponse.json({error:'Unauthorized'},{status:401});
 try{
  await ensurePlatinumSchema();
  if(!process.env.STRIPE_SECRET_KEY)return NextResponse.json({error:'Stripe not configured'},{status:503});
  const body=await req.json(),id=String(body.sessionId||'');
  if(!/^cs_[A-Za-z0-9_]{8,200}$/.test(id))return NextResponse.json({error:'Invalid session'},{status:400});
  const stripe=new Stripe(process.env.STRIPE_SECRET_KEY,{timeout:12000,maxNetworkRetries:1});
  const order=await recordPaidOrder(stripe,id);
  if(!order)return NextResponse.json({error:'Order is not paid'},{status:409});
  const result=await fulfillOrder(stripe,id);
  const blocked=['supplier_reconciliation_required','launch_gated','test_payment_no_supplier_order','supplier_attention_required','awaiting_supplier_logistics'].includes(result.fulfillment_state);
  return NextResponse.json({ok:!blocked,...result},{status:blocked?409:200});
 }catch(e){console.error('LITYFIED_RECOVERY_FAILED',e);return NextResponse.json({error:'Recovery failed; inspect server logs.'},{status:500})}
}

import {NextRequest,NextResponse} from 'next/server';
import Stripe from 'stripe';
import {persistPayment,dispatchFulfillment} from '@/lib/fulfillment';
export async function POST(request:NextRequest){
  const secret=process.env.STRIPE_WEBHOOK_SECRET,key=process.env.LG_STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY_,signature=request.headers.get('stripe-signature');
  if(!secret||!key)return NextResponse.json({error:'Webhook not configured'},{status:503});
  if(!signature)return NextResponse.json({error:'Missing signature'},{status:400});
  const stripe = new Stripe(key);
  let event:Stripe.Event;
  try{event=stripe.webhooks.constructEvent(await request.text(),signature,secret)}catch{return NextResponse.json({error:'Invalid signature'},{status:400})}
  if(!['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(event.type))return NextResponse.json({received:true});
  try {
    const id = (event.data.object as Stripe.Checkout.Session).id;
    const session = await stripe.checkout.sessions.retrieve(id);
    if(await persistPayment(session)) await dispatchFulfillment(id);
    return NextResponse.json({received:true});
  }catch{
    console.error('Verified payment processing failed',event.id);
    return NextResponse.json({error:'Payment processing failed; retry required'},{status:500});
  }
}

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { recordPaidOrder } from '../../../../lib/orders';
import { stripe } from '../../../../lib/stripe';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const signature = request.headers.get('stripe-signature');
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !signature || !secret) return NextResponse.json({ error: 'Webhook is not configured.' }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(await request.text(), signature, secret);
  } catch {
    return NextResponse.json({ error: 'Invalid webhook signature.' }, { status: 400 });
  }

  try {
    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.payment_status === 'paid') await recordPaidOrder(session);
    }
  } catch (error) {
    console.error('Unable to record Stripe order', { eventId: event.id, error });
    return NextResponse.json({ error: 'Order processing failed.' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

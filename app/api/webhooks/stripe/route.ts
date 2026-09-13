import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const key = process.env.LG_STRIPE_SECRET_KEY;
  const signature = request.headers.get('stripe-signature');
  if (!secret || !key) return NextResponse.json({ error: 'Webhook is not configured' }, { status: 503 });
  if (!signature) return NextResponse.json({ error: 'Missing Stripe signature' }, { status: 400 });
  try {
    const event = new Stripe(key).webhooks.constructEvent(await request.text(), signature, secret);
    // Persist `event.id` before side effects. For checkout.session.completed, create a paid order,
    // reserve/decrement stock transactionally, and enqueue fulfillment exactly once.
    console.info('Verified Stripe event', { id: event.id, type: event.type });
    return NextResponse.json({ received: true });
  } catch {
    return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 400 });
  }
}

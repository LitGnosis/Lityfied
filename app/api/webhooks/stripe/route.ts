import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { track } from '@vercel/analytics/server';
import { db } from '@/lib/database';

export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const key = process.env.LG_STRIPE_SECRET_KEY;
  const signature = request.headers.get('stripe-signature');
  if (!secret || !key) return NextResponse.json({ error: 'Webhook is not configured' }, { status: 503 });
  if (!signature) return NextResponse.json({ error: 'Missing Stripe signature' }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = new Stripe(key).webhooks.constructEvent(await request.text(), signature, secret);
  } catch {
    return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 400 });
  }

  try {
    const sql = db();
    if (event.type !== 'checkout.session.completed') {
      const recorded = await sql`
        insert into webhook_events (provider, event_id)
        values ('stripe', ${event.id})
        on conflict (provider, event_id) do nothing
        returning event_id
      `;
      return NextResponse.json({ received: true, duplicate: recorded.length === 0 });
    }

    const session = event.data.object as Stripe.Checkout.Session;
    const amount = session.amount_total;
    if (!session.id || amount === null) throw new Error('Stripe checkout session is missing required order fields');

    const outcome = await sql`
      with recorded as (
        insert into webhook_events (provider, event_id)
        values ('stripe', ${event.id})
        on conflict (provider, event_id) do nothing
        returning event_id
      ), created_order as (
        insert into orders (id, stripe_session_id, status, subtotal_cents, tax_cents, shipping_cents)
        select gen_random_uuid(), ${session.id}, 'paid', ${amount}, 0, 0
        where exists (select 1 from recorded)
        on conflict (stripe_session_id) do nothing
        returning id
      )
      select exists (select 1 from recorded) as recorded,
             exists (select 1 from created_order) as order_created
    `;

    if (outcome[0]?.order_created) {
      try {
        await track('payment_completed', { currency: session.currency || 'unknown', product: session.metadata?.productSlug || 'unknown' });
      } catch {
        console.error('Payment analytics tracking failed', { eventId: event.id });
      }
    }

    return NextResponse.json({ received: true, duplicate: !outcome[0]?.recorded });
  } catch (error) {
    console.error('Stripe webhook persistence failed', { eventId: event.id, type: event.type });
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}

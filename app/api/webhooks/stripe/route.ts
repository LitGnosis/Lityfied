import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { track } from '@vercel/analytics/server';
import { db } from '@/lib/database';
import { stripeSecretKey } from '@/lib/commerce-config';

export const runtime = 'nodejs';

async function releaseOrderReservation(eventId: string, orderId: string) {
  const sql = db();
  return sql`
    with recorded as (
      insert into webhook_events (provider, event_id)
      values ('stripe', ${eventId})
      on conflict (provider, event_id) do nothing
      returning event_id
    ), cancelled_order as (
      update orders
      set status = 'cancelled'
      where id = ${orderId} and status = 'pending' and exists (select 1 from recorded)
      returning id
    ), released_inventory as (
      update inventory
      set reserved = reserved - order_items.quantity, updated_at = now()
      from order_items
      where order_items.order_id in (select id from cancelled_order)
        and inventory.product_id = order_items.product_id
      returning inventory.product_id
    )
    select exists (select 1 from recorded) as recorded,
           exists (select 1 from cancelled_order) as order_cancelled,
           count(*)::int as inventory_items
    from released_inventory
  `;
}

export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const key = stripeSecretKey();
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
    const session = event.data.object as Stripe.Checkout.Session;
    const orderId = session.metadata?.orderId ?? session.client_reference_id;

    if (event.type === 'checkout.session.expired' || event.type === 'checkout.session.async_payment_failed') {
      if (!orderId) throw new Error('Stripe checkout session is missing its order reference');
      const outcome = await releaseOrderReservation(event.id, orderId);
      return NextResponse.json({ received: true, duplicate: !outcome[0]?.recorded, released: Boolean(outcome[0]?.order_cancelled) });
    }

    const sql = db();
    const isSuccessfulPayment = event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded';
    if (!isSuccessfulPayment) {
      const recorded = await sql`
        insert into webhook_events (provider, event_id)
        values ('stripe', ${event.id})
        on conflict (provider, event_id) do nothing
        returning event_id
      `;
      return NextResponse.json({ received: true, duplicate: recorded.length === 0 });
    }

    if (!session.id || !orderId) throw new Error('Stripe checkout session is missing its order reference');
    if (session.payment_status !== 'paid') return NextResponse.json({ received: true, pending: true });

    const outcome = await sql`
      with recorded as (
        insert into webhook_events (provider, event_id)
        values ('stripe', ${event.id})
        on conflict (provider, event_id) do nothing
        returning event_id
      ), customer_record as (
        insert into customers (email)
        select ${session.customer_details?.email ?? null}
        where ${session.customer_details?.email ?? null} is not null and exists (select 1 from recorded)
        on conflict (email) do update set email = excluded.email
        returning id
      ), paid_order as (
        update orders
        set stripe_session_id = ${session.id},
            customer_id = (select id from customer_record),
            status = 'paid'
        where id = ${orderId} and status = 'pending' and exists (select 1 from recorded)
        returning id
      ), consumed_inventory as (
        update inventory
        set available = available - order_items.quantity,
            reserved = reserved - order_items.quantity,
            updated_at = now()
        from order_items
        where order_items.order_id in (select id from paid_order)
          and inventory.product_id = order_items.product_id
        returning inventory.product_id
      )
      select exists (select 1 from recorded) as recorded,
             exists (select 1 from paid_order) as order_paid,
             count(*)::int as inventory_items
      from consumed_inventory
    `;

    if (outcome[0]?.order_paid) {
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

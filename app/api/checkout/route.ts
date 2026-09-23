import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { z } from 'zod';
import { getProductBySlug } from '@/lib/catalog';
import { commerceReadiness, stripeSecretKey, canonicalOrigin } from '@/lib/commerce-config';
import { db } from '@/lib/database';

const checkoutSchema = z.object({ product: z.string().min(1).max(128) });

type OrderRow = { id: string };

export async function POST(request: NextRequest) {
  const readiness = commerceReadiness();
  if (!readiness.ready) {
    return NextResponse.json(
      { error: 'Checkout is not available', missing: readiness.missing },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const parsed = checkoutSchema.safeParse(Object.fromEntries(await request.formData()));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid checkout request' }, { status: 400 });

  const product = await getProductBySlug(parsed.data.product);
  if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 });

  const sql = db();
  const orders = await sql`
    with reserved_inventory as (
      update inventory
      set reserved = reserved + 1, updated_at = now()
      where product_id = ${product.id} and available > reserved
      returning product_id
    ), created_order as (
      insert into orders (id, status, subtotal_cents, tax_cents, shipping_cents)
      select gen_random_uuid(), 'pending', ${product.price}, 0, 0
      where exists (select 1 from reserved_inventory)
      returning id
    )
    insert into order_items (order_id, product_id, quantity, unit_price_cents)
    select created_order.id, ${product.id}, 1, ${product.price}
    from created_order
    returning order_id as id
  ` as OrderRow[];

  const orderId = orders[0]?.id;
  if (!orderId) return NextResponse.json({ error: 'Out of stock' }, { status: 409 });

  const key = stripeSecretKey();
  if (!key) return NextResponse.json({ error: 'Payments are not configured' }, { status: 503 });

  try {
    const origin = canonicalOrigin(request.url);
    const session = await new Stripe(key).checkout.sessions.create({
      mode: 'payment',
      customer_creation: 'always',
      billing_address_collection: 'required',
      shipping_address_collection: { allowed_countries: ['US', 'CA'] },
      line_items: [{ price_data: { currency: 'usd', product_data: { name: product.name, description: product.description }, unit_amount: product.price }, quantity: 1 }],
      success_url: `${origin}/checkout?status=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/products/${product.slug}?checkout=cancelled`,
      client_reference_id: orderId,
      metadata: { orderId, productSlug: product.slug },
    });
    if (!session.url) throw new Error('Stripe checkout session is missing its URL');

    await sql`update orders set stripe_session_id = ${session.id} where id = ${orderId}`;
    return NextResponse.redirect(session.url, 303);
  } catch (error) {
    await sql`
      with cancelled_order as (
        update orders set status = 'cancelled' where id = ${orderId} and status = 'pending' returning id
      )
      update inventory set reserved = reserved - 1, updated_at = now()
      where product_id = ${product.id} and exists (select 1 from cancelled_order)
    `;
    console.error('Stripe checkout session creation failed', { orderId, error });
    return NextResponse.json({ error: 'Unable to create payment session' }, { status: 502 });
  }
}

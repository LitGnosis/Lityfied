import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { z } from 'zod';
import { products } from '@/lib/catalog';
import { canonicalOrigin } from '@/lib/commerce-config';

const checkoutSchema = z.object({ product: z.string().min(1).max(128) });

export async function POST(request: NextRequest) {
  const parsed = checkoutSchema.safeParse(Object.fromEntries(await request.formData()));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid checkout request' }, { status: 400 });

  const product = products.find((item) => item.slug === parsed.data.product);
  if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 });
  if (product.inventory < 1) return NextResponse.json({ error: 'Out of stock' }, { status: 409 });
  const key = process.env.LG_STRIPE_SECRET_KEY;
  if (!key) return NextResponse.json({ error: 'Payments are not configured' }, { status: 503 });

  const origin = canonicalOrigin(request.url);
  const stripe = new Stripe(key);
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [{ price_data: { currency: 'usd', product_data: { name: product.name, description: product.description }, unit_amount: product.price }, quantity: 1 }],
    success_url: `${origin}/checkout?status=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/products/${product.slug}?checkout=cancelled`,
    metadata: { productSlug: product.slug },
  });
  if (!session.url) return NextResponse.json({ error: 'Unable to create payment session' }, { status: 502 });
  return NextResponse.redirect(session.url, 303);
}

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { products } from '@/lib/catalog';

export async function POST(request: NextRequest) {
  const data = await request.formData();
  const product = products.find((item) => item.slug === data.get('product'));
  if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 });
  if (product.inventory < 1) return NextResponse.json({ error: 'Out of stock' }, { status: 409 });
  if (!process.env.STRIPE_SECRET_KEY) return NextResponse.json({ error: 'Payments are not configured' }, { status: 503 });

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [{ price_data: { currency: 'usd', product_data: { name: product.name, description: product.description }, unit_amount: product.price }, quantity: 1 }],
    success_url: new URL('/checkout?status=success', request.url).toString(),
    cancel_url: new URL(`/products/${product.slug}?checkout=cancelled`, request.url).toString(),
    metadata: { productSlug: product.slug },
  });
  if (!session.url) return NextResponse.json({ error: 'Unable to create payment session' }, { status: 502 });
  return NextResponse.redirect(session.url, 303);
}

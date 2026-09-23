import { NextRequest, NextResponse } from 'next/server';
import { getProduct } from '../../../lib/catalog';
import { stripe } from '../../../lib/stripe';

export const runtime = 'nodejs';

type CartLine = { id: number; quantity: number };

export async function POST(request: NextRequest) {
  if (!stripe) return NextResponse.json({ error: 'Payments are not configured.' }, { status: 503 });

  const body = await request.json().catch(() => null) as { items?: CartLine[] } | null;
  if (!body?.items?.length || body.items.length > 20) {
    return NextResponse.json({ error: 'Your shopping bag is invalid.' }, { status: 400 });
  }

  const lineItems = body.items.map(({ id, quantity }) => {
    const product = getProduct(id);
    if (!product || !Number.isInteger(quantity) || quantity < 1 || quantity > 10) return null;
    return {
      price_data: {
        currency: 'usd',
        product_data: { name: product.name, description: product.description },
        unit_amount: product.price * 100,
      },
      quantity,
    };
  });
  if (lineItems.some((item) => item === null)) {
    return NextResponse.json({ error: 'One or more products are unavailable.' }, { status: 400 });
  }

  const origin = request.nextUrl.origin;
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    customer_creation: 'always',
    billing_address_collection: 'required',
    shipping_address_collection: { allowed_countries: ['US', 'CA'] },
    line_items: lineItems.filter((item): item is NonNullable<typeof item> => item !== null),
    success_url: `${origin}/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/?checkout=cancelled`,
    metadata: { storefront: 'lityfied' },
  });

  if (!session.url) return NextResponse.json({ error: 'Unable to start checkout.' }, { status: 500 });
  return NextResponse.json({ url: session.url });
}

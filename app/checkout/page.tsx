'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { track } from '@vercel/analytics';

function CheckoutForm() {
  const searchParams = useSearchParams();
  const product = searchParams.get('product') || '';

  return <>
    <p className="eyebrow">Checkout</p>
    <h1>Secure payment.</h1>
    <p>{product ? `Preparing checkout for ${product}.` : 'Choose a piece to begin checkout.'}</p>
    <form action="/api/checkout" method="post" onSubmit={() => track('payment_redirect_requested', { product })}>
      <input type="hidden" name="product" value={product} />
      <button className="button" type="submit" disabled={!product}>Continue to payment</button>
    </form>
    <p>Payments are processed by Stripe. No card data touches Lityfied servers.</p>
  </>;
}

export default function Checkout() {
  return <Suspense fallback={<p>Preparing secure checkout…</p>}><CheckoutForm /></Suspense>;
}

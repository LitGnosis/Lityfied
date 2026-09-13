'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { track } from '@vercel/analytics';

type ProductEventProps = { product: string };

export function ProductCheckoutLink({ product }: ProductEventProps) {
  useEffect(() => {
    track('product_viewed', { product });
  }, [product]);

  return (
    <Link
      className="button"
      href={`/checkout?product=${encodeURIComponent(product)}`}
      onClick={() => track('checkout_started', { product })}
    >
      Secure checkout
    </Link>
  );
}

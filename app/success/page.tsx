'use client';

import Link from 'next/link';
import { useEffect } from 'react';

export default function SuccessPage() {
  useEffect(() => window.localStorage.removeItem('lityfied-cart'), []);

  return <main className="success-page"><p className="eyebrow">PAYMENT COMPLETE</p><h1>Thank you for your order.</h1><p>Your payment was processed securely by Stripe. Your receipt is available through Stripe Checkout.</p><Link className="button" href="/">Continue shopping</Link></main>;
}

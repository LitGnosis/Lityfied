import Link from 'next/link';

export default function SuccessPage() {
  return <main className="success-page"><p className="eyebrow">PAYMENT COMPLETE</p><h1>Thank you for your order.</h1><p>Your payment was processed securely by Stripe. We will email your receipt and shipping updates.</p><Link className="button" href="/">Continue shopping</Link></main>;
}

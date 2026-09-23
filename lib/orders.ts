import 'server-only';
import Stripe from 'stripe';
import { sql } from './db';
import { stripe } from './stripe';

export async function recordPaidOrder(session: Stripe.Checkout.Session) {
  if (!sql || !stripe) throw new Error('Order storage is not configured.');

  const lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 100 });
  const items = lineItems.data.map((item) => ({
    description: item.description,
    quantity: item.quantity,
    amountSubtotal: item.amount_subtotal,
    amountTotal: item.amount_total,
    currency: item.currency,
  }));

  await sql`
    INSERT INTO orders (
      stripe_checkout_session_id, stripe_payment_intent_id, stripe_customer_id, email,
      status, currency, amount_subtotal, amount_total, shipping_address, line_items, updated_at
    ) VALUES (
      ${session.id}, ${typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id ?? null},
      ${typeof session.customer === 'string' ? session.customer : session.customer?.id ?? null},
      ${session.customer_details?.email ?? null}, 'paid', ${session.currency ?? 'usd'},
      ${session.amount_subtotal ?? 0}, ${session.amount_total ?? 0},
      ${sql.json(session.collected_information?.shipping_details?.address ? {
        line1: session.collected_information.shipping_details.address.line1,
        line2: session.collected_information.shipping_details.address.line2,
        city: session.collected_information.shipping_details.address.city,
        state: session.collected_information.shipping_details.address.state,
        postal_code: session.collected_information.shipping_details.address.postal_code,
        country: session.collected_information.shipping_details.address.country,
      } : null)}, ${sql.json(items)}, NOW()
    )
    ON CONFLICT (stripe_checkout_session_id) DO UPDATE SET
      status = 'paid',
      stripe_payment_intent_id = EXCLUDED.stripe_payment_intent_id,
      stripe_customer_id = EXCLUDED.stripe_customer_id,
      email = EXCLUDED.email,
      amount_subtotal = EXCLUDED.amount_subtotal,
      amount_total = EXCLUDED.amount_total,
      shipping_address = EXCLUDED.shipping_address,
      line_items = EXCLUDED.line_items,
      updated_at = NOW()
  `;
}

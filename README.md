# Lityfied

Luxury shopping storefront built with Next.js and Stripe Checkout.

## Commerce configuration

The Vercel project needs these environment variables:

- `LG_STRIPE_SECRET_KEY` for server-side Stripe Checkout
- `STRIPE_WEBHOOK_SECRET` for verifying Stripe webhooks
- `LG_DATABASE_URL` for paid-order storage

Register `https://<production-domain>/api/webhooks/stripe` in Stripe for both:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`

## Apply the order migration

Before enabling production checkout, apply `db/migrations/001_create_orders.sql` to the database configured by `LG_DATABASE_URL`. The webhook deliberately returns an error when order recording fails so Stripe retries instead of silently losing a paid order.

## Validate

```bash
npm install
npm run build
```

# Lityfied

A deployable Next.js foundation for a luxury ecommerce operation.

## Before accepting orders

1. Provision a relational database. Vercel Postgres is no longer first-party; use Neon through the Vercel Marketplace and set `DATABASE_URL`.
2. Create Stripe products/prices, set `STRIPE_SECRET_KEY`, and register `https://your-domain/api/webhooks/stripe` with `STRIPE_WEBHOOK_SECRET`.
3. Choose an auth provider and protect `/account` and `/admin`; restrict admin access by role.
4. Choose a shipping/fulfillment and transactional email provider; add their credentials as Vercel environment variables.
5. Use Vercel Blob for product media. It is first-party; use immutable URLs for updated media.
6. Replace sample catalog data with database-backed catalog, stock reservations, order/event persistence, tax calculation, and provider adapters.
7. Have counsel approve the privacy policy, terms, returns, tax, and consumer-disclosure content for every selling region.

## Operational invariants

- Confirm webhook signatures and persist provider event IDs before side effects.
- Treat payment success as the source of truth for order state; never mark an order paid from the client.
- Reserve inventory before payment and release expired reservations.
- Use idempotency keys for payment, fulfillment, and refund requests.
- Keep all credentials server-side in Vercel Environment Variables.

## Local development

Copy `.env.example` to `.env.local`, fill local development credentials, then install dependencies and run `npm run dev`.

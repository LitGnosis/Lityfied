# Lityfied

A deployable Next.js foundation for a luxury ecommerce operation.

## Before accepting orders

1. Provision a relational database. Vercel Postgres is no longer first-party; use Neon through the Vercel Marketplace and set `LG_DATABASE_URL`.
2. Create Stripe products/prices, set `LG_STRIPE_SECRET_KEY`, and register `https://your-domain/api/webhooks/stripe` with `STRIPE_WEBHOOK_SECRET`.
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

## Production launch gate

The `/api/health` endpoint reports `503` until every required commerce integration is configured. This is intentional: do not enable a custom domain or take live orders until the following are complete.

1. Connect a Neon database through the Vercel Marketplace, apply `db/schema.sql` from an environment with database access, and set `LG_DATABASE_URL`. Vercel Postgres is no longer first-party; existing databases were migrated to Neon through the Marketplace in December 2024.
2. Configure Stripe production credentials and a webhook endpoint for `checkout.session.completed`. The webhook must persist `event.id` transactionally before creating an order, reserving/decrementing inventory, sending receipts, or requesting fulfillment.
3. Replace the static `lib/catalog.ts` data with database reads and implement authenticated customer sessions plus a server-side admin role check. `/account` and `/admin` intentionally return 404 until then.
4. Connect tax, shipping/labels, transactional email, supplier onboarding/payouts, and fraud-review providers. Their provider-specific credentials must be stored as encrypted Vercel environment variables.
5. Add an uptime monitor against `/api/health`, configure error/latency alerts, perform Stripe test-mode payment and refund tests, then complete legal review for every jurisdiction where you sell.

## Marketplace phase

A Temu-scale marketplace additionally requires supplier verification, catalog moderation, payout and commission reconciliation, fulfillment SLAs, dispute management, pricing controls, search/recommendations, localized tax/duties, and a staffed support/operations process. These are provider and business-operation integrations, not features that can be safely fabricated from a storefront repository.

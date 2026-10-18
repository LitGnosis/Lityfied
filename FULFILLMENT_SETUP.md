# Verified fulfillment rollout

This branch imports the uploaded storefront because GitHub main did not contain its source.
Do not promote this release until the database migration and payment integration test pass.

1. Back up the database, inspect existing schema/data, and apply `db/schema.sql` using the database console. Existing duplicate order-item rows must be reconciled before adding the unique index. The schema contains no destructive migration.
2. Configure Production `FULFILLMENT_NOTIFY_EMAIL` with the merchant's shipping-alert recipient. `RESEND_API_KEY` and `EMAIL_FROM` must be valid with a verified sender. Never commit their values.
3. Define digital products in `lib/catalog.ts` with `fulfillment: 'digital'`. Configure server-only `DIGITAL_DOWNLOAD_URLS` as a JSON object mapping product slugs to HTTPS delivery URLs; never put delivery URLs in the shared/client catalog. Use a delivery service with appropriate access control; do not use a publicly accessible URL for private assets. Products default to physical; no digital assets were supplied.
4. Configure Stripe webhook events `checkout.session.completed` and `checkout.session.async_payment_succeeded`, pointing to `/api/webhooks/stripe`. Use the same account's API key and signing secret. Test a paid order, delayed payment, invalid signature, replay and simultaneous deliveries before production.
5. Invoke `/api/fulfillment` periodically using `Authorization: Bearer <CRON_SECRET>` through a trusted scheduler. The worker is included but a schedule is not provisioned by this PR. This drains pending jobs after missing configuration/assets are supplied.

## Guarantees and limits

Only paid USD Checkout Sessions created by this storefront (`integration=lityfied-v1`) with matching catalog totals are processed. Generic Bluevine hosted-link payments lack this correlation and remain manual. Previous test-link payments are not retroactively matched. Catalog price changes between checkout and payment require manual reconciliation.

Order persistence, items and queue insertion use one transaction; repeated sessions deduplicate order and per-kind jobs. Concurrent email workers claim jobs atomically. Resend gets a deterministic idempotency key. An ambiguous/interrupted send is held for manual review instead of blindly retrying after the provider's 24-hour deduplication window. Inspect Resend before resolving `needs_review` or stuck `sending` records; never reset them blindly.

Missing shipping email, mail credentials or digital assets leaves jobs pending. Successful email submission marks only the job `sent`, never the order shipped or fulfilled. Physical stock is still the uploaded static catalog; inventory reservation and supplier ordering are not implemented. Digital URLs are emailed only to the verified payment session's customer email. A shipping alert includes paid items and collected shipping details, not an automatic supplier purchase.

No live payment, database migration, outgoing email or supplier shipment was exercised in this sandbox. These require the configured external services.

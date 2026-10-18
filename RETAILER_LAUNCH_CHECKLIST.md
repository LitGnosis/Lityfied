# CJ retailer launch acceptance

## Implemented in this preparation
- Patched Next.js to 16.3.8; npm audit reported zero vulnerabilities after installation.
- Protected launch diagnostics with owner authorization and surfaced them in the operations dashboard.
- Escaped supplier fields in shipment emails; only HTTPS tracking links are accepted.
- Normalized supplier images sent to Stripe checkout.
- Existing tests exercise database migrations, duplicate paid-order processing, rewards, refund reconciliation, and launch gates with isolated/mocked dependencies.

## Required before live launch — not yet verified
1. Back up and restore-test the production DB; run pending migrations and `npm run db:verify` using protected credentials.
2. Configure EMAIL_FROM with a verified sender, NEXT_PUBLIC_SUPPORT_EMAIL, and CJ_DEFAULT_LOGISTICS with a supplier-supported service. Do not guess these values.
3. Confirm Stripe test/live account configuration, webhook endpoint `/api/stripe/webhook`, event subscriptions, signing secret, and account approval.
4. Confirm CJ balance/payment procedure. Automatic supplier payment stays disabled.
5. Checkout currently accepts US addresses, offers free shipping, and estimates 5–15 business days. Validate actual supplier freight, delivery times and margins before making those promises. Stripe automatic tax is optional and must match the business's tax setup.
6. In test mode: select product/variant, cart, promotion, payment, webhook, saved order, account lookup and email; expire checkout and verify reservations release; exercise partial/full refunds.
7. Stripe test payments intentionally NEVER submit real supplier orders. A separate controlled live supplier pilot, explicitly authorized and funded by the owner, is required to verify fulfillment, shipment, tracking, delivery and returns.
8. Verify real email delivery, cron runs, support, password reset, account verification, reviews, monitoring, and mobile accessibility.
9. Record acceptance for this exact code artifact. Only then authorize live commerce settings and production rollout.

Production live-commerce and CJ fulfillment flags were not changed by this preparation. A successful preview build is not live acceptance.

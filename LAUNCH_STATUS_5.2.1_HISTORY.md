# Launch status — 5.2.1

Prepared 2026-10-01 UTC from the attached Lityfied_PLATINUM_MARKETPLACE_5.2.0(1).zip.

**Decision: NOT READY FOR LIVE LAUNCH.** Local compilation and isolated tests are useful evidence, but the requested production critical path is not complete.

## What was verified

- `npm install` succeeded with the supplied dependency versions; a reproducible lockfile was added.
- Real local Next.js 16.3.0 production compilation, TypeScript checking and page generation pass on Node 24.
- `npm run check` includes source-import validation, automated behavioral tests, typechecking and the production build. See `verification/local-check.log` for the final results.
- Isolated database/provider tests cover migration replay, atomic order persistence, duplicate payment processing, credit and promotion consumption, invalid quantities, unpaid checkouts, missing supplier mappings/reservations, valid/invalid webhook signatures, database failure retry responses, supplier timeout/rejection recovery, refund events, database rate limiting, failed email retry and reservation expiry reconciliation.
- Local production HTTP checks passed for the storefront, account and policy routes. Unconfigured health/readiness/checkout fail closed; unauthenticated admin, fulfillment and cron requests are denied. See `verification/http-results.json`.
- No actual charges, supplier orders, production database mutations or customer emails were performed.

## Production blockers observed

| Stage | Status / evidence |
|---|---|
| New Vercel project and domain | Not created. The connector returned `McpServerError: Tool deploy_to_vercel not found`. Team/project reads succeeded. |
| Existing project | The connector lists `lityfied` with `lityfied.vercel.app`. That READY deployment is not evidence that this revised archive has been deployed. |
| Vercel build | Not run. Only the local production compiler was run. |
| Environment transfer | Not performed. Existing secret values were not exposed by available connector tools; no local DATABASE_URL or VERCEL_TOKEN was present. |
| Live migrations and data audit | Not run. Isolated PGlite tests are not the existing production database. |
| Stripe/CJ/email lifecycle | Not run against real services. Provider responses in automated tests were mocks. |
| Browser/mobile/accessibility/performance | Not verified. Browser installation hit certificate issues; the available browser runner also failed to start its daemon. HTTP rendering alone does not establish visual correctness. |
| Monitoring, backup restore, cron execution | Not verified on Vercel. |
| Launch gate | Closed by default in this candidate. No remote environment was changed. |

## Code changes

- Fixed four broken route imports and the PostgreSQL query generic typing that prevented a clean build.
- Added versioned, transactional, advisory-locked additive migrations, an explicit schema check and a read-only database integrity command.
- Replaced fragile checkout/session identity with per-attempt records, request fingerprints, provider idempotency keys, whole-number quantity checks, exact variant matching and live stock checks for the configured origin country.
- Locked promotion/reward rows while reserving benefits; retained reservations until Stripe confirms payment or expiry instead of releasing by wall-clock time alone.
- Persisted paid orders, all paginated line items, credit, rewards, promotions, purchase analytics and confirmation-email queue records in one transaction. Duplicate payment events reuse the order.
- Valid webhook processing failures return 500; invalid signatures return 400. Unpaid payments never fulfill.
- Unified fulfillment and recovery. Persisted submission claims prevent automatic replay after an ambiguous timeout/crash. Such cases require provider reconciliation; this does not claim an impossible cross-provider exactly-once guarantee.
- Stripe test payments cannot create actual CJ orders. Live checkout and supplier submission require explicit release gates.
- Added durable confirmation/shipment/delivery email queuing, retry handling and provider idempotency keys.
- Added refund request identity, amount validation, Stripe refund idempotency and succeeded-event reconciliation. Pending refunds are not reported as completed.
- Replaced process-local request counters with shared database buckets, fixed a multibyte admin-secret comparison exception, made health/readiness reflect actual migration availability and excluded private pages from the PWA cache.

## Remaining functional and operational review

Do not interpret the fixes above as a full commerce/security certification. In particular:

- Test checkout with real CJ products, current inventory, supported shipping lanes, shipping cost/margin and the actual supplier response schemas. Inventory can change between checkout and fulfillment; an explicit customer resolution/refund procedure is still required.
- Prove concurrent multi-worker webhook, credit, promotion and refund behavior against the actual PostgreSQL provider. The isolated test adapter runs sequential tests.
- Review historical data produced by previous releases, including incomplete orders, duplicate case-insensitive identities, old rewards and preexisting credit reservations. Migration failures require reconciliation, not data deletion.
- Refund accounting still needs a complete business policy and implementation for proportional reward reversals, restoring spent store credit, and refunds initiated directly in Stripe rather than this returns workflow. Do not launch store-credit/refund flows until this is resolved and tested.
- Supplier reconciliation after ambiguous outcomes requires an operator to verify the external order before repairing the fulfillment record. There is no automatic proof that a failed network response means CJ rejected an order.
- Recovery and provider-outage handling needs a real monitoring/alert destination and runbook. There is no verified backup/restore configuration in this archive.
- Review role-based data visibility throughout the admin UI, return-creation races, account verification/session revocation and review-upload permissions. Only unauthenticated access denial was smoke-tested here.
- Order/shipment/delivery email paths use the outbox; other existing marketing/support/auth email paths retain their prior implementation and need delivery/retry review.
- Refund webhook subscription, tax setup, support identity, shipping/return policies, consent flows, SEO, accessibility, analytics delivery and performance remain deployment acceptance checks.
- Confirm platform execution limits and the plan's cron frequency. Do not silently reduce operational schedules just to pass deployment validation.

## Required acceptance sequence

1. Restore Vercel deployment access or use an authorized dashboard/CLI path; create a new project and its default domain without replacing the old project.
2. Securely carry forward established settings. Separate test/live credentials, set the new site URL, configure a new endpoint-specific Stripe webhook secret and verify domain/email identities.
3. Back up the database, prove a restore, inspect legacy integrity, run `npm run db:migrate` and `npm run db:verify` against the intended environment.
4. Run Vercel's actual build and inspect build/runtime logs. Keep the release gates closed.
5. Run customer signup/login, cart, wishlist, address, credit/rewards, promotion, checkout and signed Stripe webhook tests with real test-mode Stripe. Assert one order and matching totals/line items. Test duplicates and simultaneous requests.
6. Use a supplier-supported test environment or an explicitly approved controlled supplier-order test. A Stripe test event must never become an accidental real CJ order.
7. Verify tracking sync, shipment/delivery emails, review, support and refund lifecycle. Finish the refund/credit accounting gaps above.
8. Test decline, expiry, delayed/duplicate webhook, inventory shortage, provider rejection, timeout after submission, failed email, refund retry and recovery. Record IDs/results without secrets.
9. Verify mobile/browser behavior, accessibility, SEO, health/readiness, deployed cron execution, analytics, alerts, backup restore and admin role boundaries.
10. After the evidence passes, set `LAUNCH_VERIFIED_RELEASE=5.2.1` and enable `LIVE_COMMERCE_ENABLED` and `CJ_FULFILLMENT_ENABLED` intentionally. Review CJ automatic balance payment independently.

A release environment flag is an operator attestation, not a substitute for test evidence.

## Provider references consulted

- CJ product/stock fields: https://developers.cjdropshipping.com/en/api/api2/api/product.html
- Resend idempotency behavior: https://resend.com/changelog/idempotency-keys

These references informed implementation details; they do not establish that the user's accounts or integrations were tested.

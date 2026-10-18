# Lityfied 5.3.0 — Platinum Royal Marketplace

Lityfied 5.3.0 is the premium-branding and commerce-hardening successor to the verified 5.2.2 repair package. It preserves the full marketplace application while applying the platinum, royal-purple and gold visual system across the storefront, account, returns, support, policy and admin surfaces.

Brand assets and exact approved copy are documented in [BRAND_ASSETS.md](BRAND_ASSETS.md). The release includes the recovered Lityfied monogram plus a matching wordmark lockup and preserves both brand lines:

- **Get Lit. Get Satisfied. Get Lityfied.**
- **Find your vibe. Stay Lityfied.**

This source package contains no production secrets and is **not an assertion that live payment, supplier, email, database or domain acceptance has been completed**. See [LAUNCH_STATUS.md](LAUNCH_STATUS.md).

## Local setup

Use Node 24.

```sh
npm ci
npm run check
```

Copy `.env.example` to a private environment file and populate it through your existing secret manager. Do not put secrets in source control or the ZIP. For local commands, Node can load an environment file explicitly:

```sh
node --env-file=.env.local scripts/migrate.mjs
node --env-file=.env.local scripts/verify-database.mjs
npm run dev
```

Next.js loads `.env.local`; standalone Node migration scripts do not load it unless `--env-file` is passed or the variables are already exported.

## What 5.3.0 adds

- Royal purple, gold and platinum design tokens and full-site styling, including previously light account/admin/forms.
- Recovered Lityfied monogram integrated into the header and footer, plus a reusable wordmark asset under `public/brand/`.
- Royal marketplace header, hero, deal seal, product-card treatment, footer lockup, keyboard focus states, responsive layout and reduced-motion handling.
- Transactional support/admin email queueing through the durable outbox with HTML escaping.
- Refund accounting reconciliation for purchase points, redeemed store credit and full-refund referral awards; duplicate Stripe refund events remain idempotent in the reward ledger and audit event stream.
- Admin refund amount control instead of forcing every return into a full refund.
- Metadata, manifest and application icon aligned to the Platinum Royal Marketplace identity.

## Production preparation

1. Create or select the intended Vercel project while retaining the previous project/deployment for rollback.
2. Transfer the established environment securely. Review preview versus production scopes and use isolated test credentials/data for preview.
3. Set the canonical `NEXT_PUBLIC_SITE_URL` before building. Register the Stripe webhook for that exact destination; its signing secret is endpoint-specific.
4. Keep `LIVE_COMMERCE_ENABLED=false`, `CJ_FULFILLMENT_ENABLED=false`, and `CJ_AUTO_PAY_BALANCE=false` until acceptance is complete.
5. Back up the database and test restoring the backup. Run the additive migrations once through a controlled administrative connection, then run `npm run db:verify`.
6. Build on Vercel with `npm ci` and `npm run build`, then run the real provider and customer lifecycle checks listed in the launch status.
7. Enable live commerce only after review of recorded evidence for this exact release and deliberately set `LAUNCH_VERIFIED_RELEASE=5.3.0`.

Migrations run separately; application requests never run schema DDL. `DATABASE_URL` must provide the database's required TLS configuration. This release does not disable TLS certificate verification globally.

## Operations

- `/api/health`: returns 503 if the required migrated database is unavailable.
- `/api/launch-readiness`: checks configuration, migration presence, unresolved operations and operator release attestation. It cannot prove the lifecycle was tested.
- `/api/stripe/webhook`: raw signed Stripe events; processing failures return 500 for retry.
- `/api/fulfillment/retry`: requires `x-recovery-secret`; records the paid order before supplier submission and refuses ambiguous retries.
- Cron routes require `Authorization: Bearer <CRON_SECRET>`.
- `/api/cron/email-outbox`: sends queued transactional messages with provider idempotency keys. Failed sends remain queued; old uncertain sends need review.
- `/api/cron/lifecycle`: checks Stripe before releasing expired reservations.

The schedules in `vercel.json` require a Vercel plan that supports their frequency. Confirm the actual plan before deployment.

## Verification

The recovered 5.2.2 base passed source preflight, 19 behavioral tests, TypeScript and a real local Next.js production build, with its evidence retained in `verification/`.

For the 5.3.0 changes in this workspace, TypeScript syntax parsing and the source preflight pass. A fresh `npm ci` / production build could not be rerun here because the execution environment could not resolve the npm registry, so the exact 5.3.0 package still needs the normal `npm ci && npm run check` gate in a networked Node 24/Vercel build environment before live acceptance.

`npm test` uses isolated PGlite PostgreSQL with mocked provider responses. It never sends real payments, supplier orders, or emails. Local tests are not production database, provider, or concurrency certification.

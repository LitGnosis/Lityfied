CREATE TABLE IF NOT EXISTS checkout_attempts (
 id text primary key, fingerprint text not null, stripe_session_id text unique,
 response_json jsonb, created_at timestamptz not null default now()
);
CREATE TABLE IF NOT EXISTS webhook_events (
 id text primary key, event_type text not null, processed_at timestamptz not null default now()
);
CREATE TABLE IF NOT EXISTS fulfillment_attempts (
 order_id bigint primary key references orders(id),
 state text not null check(state in ('submitting','succeeded','rejected','unknown')),
 supplier_order_id text, error text, updated_at timestamptz not null default now()
);
CREATE TABLE IF NOT EXISTS promotion_reservations (
 stripe_session_id text primary key, code text not null,
 status text not null default 'reserved' check(status in ('reserved','consumed','released')),
 expires_at timestamptz not null
);
CREATE TABLE IF NOT EXISTS email_outbox (
 id bigserial primary key, dedupe_key text unique not null, recipient text not null,
 subject text not null, html text not null, attempts integer not null default 0,
 sent_at timestamptz, created_at timestamptz not null default now(), last_error text
);
CREATE TABLE IF NOT EXISTS refund_requests (
 return_id bigint primary key references returns(id), amount_cents integer not null check(amount_cents>0),
 stripe_refund_id text unique, state text not null default 'pending', created_at timestamptz not null default now()
);
CREATE INDEX IF NOT EXISTS email_outbox_pending ON email_outbox(created_at) WHERE sent_at IS NULL;
CREATE TABLE IF NOT EXISTS rate_limit_buckets(id text primary key,hits integer not null,expires_at timestamptz not null);
CREATE INDEX IF NOT EXISTS rate_limit_expiry ON rate_limit_buckets(expires_at);

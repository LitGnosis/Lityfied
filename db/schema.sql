create extension if not exists pgcrypto;
create table if not exists products(id uuid primary key default gen_random_uuid(),slug text unique not null,name text not null,description text not null,price_cents integer not null check(price_cents>=0),active boolean not null default true,created_at timestamptz not null default now());
create table if not exists inventory(product_id uuid primary key references products(id),available integer not null check(available>=0),reserved integer not null default 0 check(reserved>=0),updated_at timestamptz not null default now());
create table if not exists customers(id uuid primary key default gen_random_uuid(),email text unique not null,created_at timestamptz not null default now());
create table if not exists orders(id uuid primary key default gen_random_uuid(),customer_id uuid references customers(id),stripe_session_id text unique,status text not null check(status in('pending','paid','fulfilled','cancelled','refunded')),subtotal_cents integer not null,tax_cents integer not null default 0,shipping_cents integer not null default 0,created_at timestamptz not null default now());
create table if not exists order_items(id uuid primary key default gen_random_uuid(),order_id uuid not null references orders(id),product_id uuid references products(id),product_slug text,quantity integer not null check(quantity>0),unit_price_cents integer not null);
create table if not exists webhook_events(provider text not null,event_id text not null,received_at timestamptz not null default now(),primary key(provider,event_id));
create table if not exists returns(id uuid primary key default gen_random_uuid(),order_id uuid not null references orders(id),status text not null check(status in('requested','approved','received','refunded','rejected')),created_at timestamptz not null default now());

-- Apply before enabling the verified-fulfillment webhook release.
create unique index if not exists order_items_order_slug_unique on order_items(order_id,product_slug);
create table if not exists fulfillment_jobs(
 id uuid primary key default gen_random_uuid(),
 session_id text not null,
 kind text not null check(kind in('physical','digital')),
 customer_email text,
 payload jsonb not null,
 status text not null default 'pending' check(status in('pending','sending','sent','needs_review')),
 attempted_at timestamptz,
 created_at timestamptz not null default now(),
 unique(session_id,kind)
);

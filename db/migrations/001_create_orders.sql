CREATE TABLE IF NOT EXISTS orders (
  id BIGSERIAL PRIMARY KEY,
  stripe_checkout_session_id TEXT NOT NULL UNIQUE,
  stripe_payment_intent_id TEXT,
  stripe_customer_id TEXT,
  email TEXT,
  status TEXT NOT NULL CHECK (status IN ('paid', 'failed', 'refunded')),
  currency TEXT NOT NULL,
  amount_subtotal INTEGER NOT NULL,
  amount_total INTEGER NOT NULL,
  shipping_address JSONB,
  line_items JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS orders_created_at_idx ON orders (created_at DESC);

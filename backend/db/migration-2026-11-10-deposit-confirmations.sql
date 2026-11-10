-- StakeKing adapter: DB-backed deposit confirmations (2026-11-10).
-- Replaces the in-memory confirmation Map in api/adapter/rpc.js:
-- serverless instances share no memory, so verify -> confirm broke
-- whenever the two calls landed on different instances.
CREATE TABLE IF NOT EXISTS adapter_deposit_confirmations (
  user_id uuid NOT NULL,
  phone text NOT NULL,
  network text NOT NULL,
  amount_minor bigint NOT NULL,
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (user_id, phone, network, amount_minor)
);

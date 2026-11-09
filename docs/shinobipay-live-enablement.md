# ShinobiPay live enablement checklist

Status: **test mode only. Live money movement is disabled and stays
disabled until every item below is done.** The code in this repo now
verifies a GHS 102 charge for a GHS 100 deposit as 100 (fee semantics
fixed, `merchant_amount` aware) and gates mobile-money intents behind
a verify-first confirm step — but no wallet credit ever happens and
`liveEnabled` is hard-locked to `false`.

## What is already done (in code, test mode)

- Fee semantics: `assertIntentMatches` compares `merchant_amount`
  (requested) when present, falling back to `amount` for legacy
  unpinned charges. The webhook re-GETs the intent, applies the same
  comparison, accepts an event amount matching either the grossed or
  requested amount, and records the **requested** amount only.
- Verify-first: `POST /v1/verify-number` (secret key) requires
  `verified:true` + `can_prompt:true` and the exact total (requested +
  2.5% customer fee). The deposit page shows an in-flow confirm panel
  (number, network, account name, deposit, fee, total) and Confirm
  consumes the confirmation once — it never re-verifies. Card payments
  have no phone number and skip verification.
- Test-mode lock, Retry-After handling, signed webhook (HMAC, 5-min
  tolerance), and test-event recording are unchanged.

## What still blocks real-money deposits

### (a) Owner — live credentials + webhook registration

- In Admin, save the **live** ShinobiPay API key and webhook secret
  (encrypted storage already exists; blank fields preserve secrets)
  and set mode to Live.
- In the ShinobiPay dashboard, register the webhook URL for this
  deployment exactly as:
  `https://<this-site>/api/public/shinobipay-webhook`
  with the same webhook secret saved in Admin. Until the provider
  delivers a genuine signed callback to this URL and it verifies,
  live cannot be proven.
- Who: the owner (cybs). No code change.

### (b) Confirm ShinobiPay's GET `merchant_amount` fix is live on Render

- The fee fix in this repo trusts `merchant_amount` on
  `GET /v1/payment_intents/:id`. That field is returned by ShinobiPay
  only once its Render deployment (akwaPayDocs, commit `80177c4`) is
  green and live. Before enabling live, call
  `GET https://akwapayapi.onrender.com/v1/payment_intents/<a live test intent>`
  and confirm the response carries `merchant_amount` alongside the
  grossed `amount`. If it does not, intents still verify against the
  grossed amount and a GHS 102 charge would fail closed — safe, but
  live deposits would not work.
- Who: the owner (or Spark, on the owner's order). No code change.

### (c) Lovable — exactly-once verified-credit RPC

**Implemented, still live-locked:** `confirm_shinobipay_verified_event` now records signed, retrieved test confirmations without credit, and supports atomic live credit into the separate `shinobipay_cash_wallets` / `shinobipay_cash_credits` accounting tables. It never writes `profiles.balance`. The service-only database gate is absent/closed, and application live request creation and callback handling remain hard-disabled. Isolated PostgreSQL tests exercise requested-amount credits, event replay, distinct events for one deposit, terminal/stale states, grants and transaction rollback. These local fixtures are not provider verification. A genuine successful test plus matching signed provider delivery is still required; the known provider test intent continues to report `requires_action`.

The proposed contract below is retained as historical context; the isolated-cash implementation above supersedes crediting the legacy profile balance.

Lovable owns the schema (`supabase/migrations/`, `drizzle/`), so this
must be added in Lovable, **not** by hand in this repo. No migration
was created here.

Proposed contract (new SECURITY DEFINER function, service-role only,
mirroring the existing `record_shinobipay_test_event` /
`bind_shinobipay_test_intent` pattern):

```sql
-- Proposed, for Lovable to implement:
-- credit_shinobipay_verified_deposit(
--   _reference text, _intent text, _amount integer, _status text,
--   _event text, _sequence integer
-- ) RETURNS text
--
-- Contract:
--  * Service-role only (REVOKE from PUBLIC/anon/authenticated, as with
--    the test-event RPCs).
--  * Locks the shinobipay_deposits row by reference FOR UPDATE.
--  * Rejects unless: mode = 'live', d.amount_minor = _amount
--    (REQUESTED amount only, never the grossed charge),
--    d.intent_id = _intent (or NULL, then bind it),
--    _status = 'succeeded', _sequence >= 0,
--    _intent ~ '^pi_[A-Za-z0-9_-]+$', _event ~ '^evt_[A-Za-z0-9_-]+$'.
--  * Deduplicates on event: if the event id already exists in
--    shinobipay_events for this deposit, return 'duplicate' and
--    credit nothing (exactly-once).
--  * Credits profiles.balance by _amount exactly once, through the
--    existing money-movement path (SECURITY DEFINER SQL only — the
--    client must never update profiles.balance directly), and stamps
--    webhook_verified_at.
--  * Returns 'credited' on first success, 'duplicate' on a repeat.
```

The webhook handler (`src/routes/api/public/shinobipay-webhook.ts`)
and `checkTestPayment` must then call this RPC instead of
`record_shinobipay_test_event` for live intents, and the `liveEnabled`
gate in `src/lib/shinobipay-readiness.ts` /
`src/lib/shinobipay-payments.functions.ts` must be lifted only after
that RPC exists and a live test credit has been verified end-to-end.
- Who: Lovable (schema + RPC), then the owner/Spark to wire the call
  sites. Do not hand-roll the RPC in this repo.

Also for live, the verify-first quote cache
(`src/lib/shinobipay-quote-cache.server.ts`) is in-process memory
(10-minute expiry, single use). That is safe for test mode — a
restart just means re-verifying — but for live it should become a
durable table with an atomic consume, following the PowerPlay
`shinobipay_number_checks` pattern:

```sql
-- Proposed table (Lovable):
-- shinobipay_number_checks (
--   user_id uuid NOT NULL, phone text NOT NULL, network text NOT NULL,
--   account_name text NOT NULL, requested_minor integer NOT NULL,
--   fee_minor integer NOT NULL, total_minor integer NOT NULL,
--   verified_at timestamptz NOT NULL, quote_expires_at timestamptz NOT NULL,
--   retry_after timestamptz,
--   PRIMARY KEY (user_id, phone, network)
-- );
-- Plus an atomic consume (update ... where quote_expires_at > now()
-- returning user_id) so one confirmation can never dispatch two prompts.
```

### (d) Owner decision — separate real-money accounting

Deposit credits now have isolated cash storage. Cash betting, bonus handling, wagering eligibility and withdrawal reservation/approval still need integration before live activation; existing legacy functions cannot spend these isolated funds. No live gate was enabled and no hosted wallet was credited during implementation.

Live deposits must not mix with legacy balances, signup bonuses, or
the withdrawal flow. Before live, the owner must decide and Lovable
must implement:

- Real-money deposits credit a separate real-money balance (or are
  ledger-isolated) from legacy/bonus balances, so a bonus can never
  be withdrawn as cash and a deposit can never be double-counted.
- Withdrawals stay on the existing manual admin-approval flow
  (untouched by this work) until the owner explicitly orders a
  change; the withdrawal eligibility rules must be re-checked
  against the separated balances.
- The demo-deposit RPC stays retired; no simulated credit path may
  be reintroduced.

Until (a)–(d) are all complete and a live test deposit has been
verified end-to-end (intent → prompt → signed webhook → exactly-once
credit of the requested amount only), keep `liveEnabled: false` and
treat any live-mode selection in Admin as blocked.

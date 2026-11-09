# StakeKing x PrimeStake/Oddaroa engine: integration plan

Prince's rule for this build (2026-11-09): the UI in this repo does not
change. The PrimeStake/Oddaroa backend is the engine for the player,
admin and super admin sides, all features, and where the two disagree
the BACKEND bends to fit the UI, never the other way round.

## What lives where

- The app (TanStack Start + React) is the zip Prince supplied, kept
  byte-for-byte: every file under src/routes, src/components, src/assets
  and all styles stay exactly as delivered.
- backend/ is the Oddaroa backend copied in whole (it is the superset
  of PrimeStake: everything PrimeStake has, plus the casino games,
  API-Football feed, Flutterwave Nigeria, support chat and the rest).
  It is a zero-dependency Node service (backend/server.js) mounting the
  same handlers Oddaroa runs on Vercel and Railway.
- Database: a fresh Neon project "stakeking" (dawn-waterfall-85938372)
  carrying the full PrimeStake/Oddaroa schema (users, matches, bets,
  bet_selections, wallet_transactions, commissions, invites,
  operator_settings, support_messages, booking_codes, games...).

## The seam (the only frontend-side files that change)

Pages and components never change. They talk to data through exactly
three doors, and only what sits behind those doors is reimplemented:

1. src/integrations/supabase/client.ts (and its auth helpers): the
   exported client keeps the exact surface the app already uses
   (auth.signUp / signInWithPassword / getUser / onAuthStateChange,
   from(table).select() chains, rpc(name, args)) but is implemented
   over the backend REST API. Sessions become the backend's HMAC
   tokens, stored the same way the app stores its session today.
2. src/lib/*.functions.ts (TanStack server functions): same exported
   names, same input/output shapes; bodies now call the backend
   instead of Supabase / Football-Data / The Odds API.
3. src/routes/api/public/shinobipay-webhook.ts stays as the public
   callback address the provider already knows; it forwards the raw
   body and signature to the backend webhook, which owns verification
   and the settle-exactly-once credit.

Everything else in src/ is untouched. If a shape the UI needs does not
exist in the backend, the backend grows it (adapter endpoints under
backend/api/_handlers/adapter/), in the UI's field names.

## Contract map (UI expectation -> backend source of truth)

Auth and profile
- signUp / signInWithPassword (phone + password) -> POST /api/auth/register, /api/auth/login
- getUser / profile row (profiles.*) -> GET /api/auth/me, reshaped: users row -> profiles shape (id, phone, email, display_name, balance, role flags)
- has_role(user, "admin") -> backend role: admin or super_admin both satisfy "admin"; super-admin-only UI sections gate on role === super_admin
- phone linking / OTP -> backend auth password + phone flows; PhoneVerification component keeps its UX, codes verified by the backend

Matches and markets
- matches table reads (matchesQuery, sports, live, football pages) -> GET /api/matches reshaped to UI rows (starts_at -> start_time, status, scores, league, logos)
- match details + MatchMarkets -> GET /api/match?id= full book; backend odds keys (o1/ox/o2, dc, gg/ng, over/under ladder, cs scorelines, odds_full markets) translated to the UI's market/option keys with home:away score orientation
- football.functions (API-Football direct) and football-data.functions (Football-Data sync/standings) -> reimplemented over /api/matches and /api/match; the sync buttons call the backend admin sync (espn-sync + AF refresh) instead of the old providers
- live scores/clock -> backend live rows (AF live sweep); liveClock keeps deriving from kickoff + status as today

Bets
- place_bet RPC -> POST /api/bets/place (server re-reads odds; bonus ladder: backend betslip bonus rules supersede the UI's flat 3 percent because the backend is the money authority, potential shown to the user comes from the backend response)
- my bets / ticket page -> GET /api/bets/mine reshaped to bets + selections rows
- cashout_offer / cashout_bet RPCs -> POST /api/bets/cashout (quote then confirm, one endpoint, UI keeps its two-step UX by calling quote-only mode first)
- booking codes (create_booking_code, load code, share image) -> POST /api/bets/book and /api/bets/load-code; backend 5-character codes
- delete_ticket RPC (settled only) -> backend adapter endpoint: hides a settled ticket for its owner; balances never move, running bets refuse (same rule as the UI's RPC)
- win celebrations / BetResultNotifications -> driven by /api/bets/mine transitions, same as today

Wallet and payments
- transactions table -> GET /api/wallet reshaped (wallet_transactions -> transactions rows)
- deposit page (ShinobiPay) -> backend wallet deposit-momo + deposit-status + deposit-otp and /api/payments/* (verify-number first, prompt, OTP step, USSD fallback text, exactly-once webhook credit: the proven Oddaroa path replaces the UI's stalled test-intent plumbing and its closed live gate)
- manual deposit -> backend deposit-manual with screenshot proof (MoMo 0530 868 738, SULEMANA ALHASSAN, same as PrimeStake) if Prince wants it on; the UI's roadmap item for MTN manual deposits lands here
- request_withdrawal RPC -> POST /api/wallet/withdraw (6-deposit verification rule applies, same as both live platforms)
- admin_review_withdrawal / queue -> /api/admin/queue + confirm/reject (withdrawals super-admin only, PrimeStake rule)
- ShinobiPay admin settings (mode, enabled, encrypted credentials) -> backend operator_settings + a settings adapter: keys stay server-side env on the backend; the admin page keeps its masked-form UX, reads credential PRESENCE only

Admin and super admin (src/routes/_authenticated/admin.tsx)
- dashboard stats -> /api/admin/stats + my-dashboard + worklog (per-admin daily sheet)
- users, promote/block, balance edit -> /api/admin/users, promote, block, balance-edit (super-only where the backend says so)
- settle bet / settle match -> /api/admin/settle
- create/edit featured matches, lock betting -> /api/admin/create-match, edit-match, lock-match (goals script compulsory, exact-execution rule)
- invites (admin + super admin kinds) -> /api/admin/invite-admin + verify-admin
- referral codes / commissions -> /api/auth/referrals + /api/admin/payout-request + payout (70 percent default, Platform Control editable)
- support contacts in site_content, user_feedback -> small adapter tables in the backend DB (site_content, user_feedback, promotions, sports_categories as adapter data), edited via /api/admin/settings extensions
- platform switches and rates -> /api/admin/settings (gateway_enabled, payouts_frozen, commission pct, cashback pct, deposit minimums, cashout margin, fx rate)

Extras the engine brings with it (available when Prince wants them
surfaced; no UI invention happens without his say-so): casino games
(Aviator, Plinko X, Lucky Dice, Penalty Shootout, Coin Flip, Football
Penalty), support chat, tips, winners board, Flutterwave Nigeria
deposits/withdrawals, multi-currency accounts (GH/NG/UG/KE/TZ).

## Staging

1. Repo + source push (needs Prince: create empty repo, select it in
   the Muse GitHub App installation).
2. Backend boot test against the stakeking Neon DB (env: DATABASE_URL,
   SESSION_SECRET, API_FOOTBALL_KEY, SHINOBIPAY keys - all set by
   Prince in the host dashboards, never through chat).
3. Auth + matches + match details wiring; verify in a browser build.
4. Wallet + ShinobiPay + bets + cashout + booking codes.
5. Admin + super admin wiring.
6. Deploy: frontend (Nitro build) and backend as two services on
   Railway from this one repo; custom domain when Prince names it.

## Hard rules carried over from the live platforms

- Odds are always re-read server-side at bet placement.
- Money moves are atomic and idempotent; webhook credits exactly once
  only on provider-confirmed success with amount and reference match.
- Withdrawal decisions are super-admin only.
- Match creation is exact-execution: fixtures, kickoffs and goal
  scripts come from Prince or the feed, never invented.
- Secrets never enter the repo or chat; env dashboards only.

## Adapter design (v2, 2026-11-09): zero frontend files change

The UI's Supabase client is generated code configured only by env
vars (VITE_SUPABASE_URL / SUPABASE_URL), and every call it makes is
plain HTTPS: GoTrue auth endpoints, PostgREST table queries, and RPC
POSTs. So the backend grows a compatibility adapter that speaks that
exact surface, and the frontend is pointed at it by env var alone.
Not one file under src/ changes, generated or otherwise.

Verified surface (grep over the whole app): auth.* (signUp,
signInWithPassword, getUser, getSession, onAuthStateChange, signOut,
updateUser, verifyOtp), from() chains using only select / eq / neq /
gt / gte / lt / lte / in / is / order / limit / single / maybeSingle
plus insert / update / upsert / delete, rpc() for the money and admin
operations, and NO realtime subscriptions anywhere (the win watcher
polls every 3 seconds). Direct table writes are confined to content
and admin tables (site_content, sports_categories, promotions,
referral_codes, odds_sync_state), user_feedback inserts, one profiles
update, one shinobipay_deposits insert, and admin match management.

Adapter layout (all inside backend/):
- backend/api/adapter/tokens.js: HS256 JWTs signed with
  SESSION_SECRET (sub = backend user id, role "authenticated",
  7-day exp matching the backend token lifetime) + refresh tokens.
  supabase-js only decodes the JWT client-side and validates through
  GET /auth/v1/user, which the adapter answers from the users table.
- backend/api/adapter/gotrue.js: /auth/v1/signup, /auth/v1/token
  (grant_type password and refresh_token), /auth/v1/user,
  /auth/v1/logout, /auth/v1/verify (phone OTP via the backend auth
  flows). Signup/login delegate to the existing auth handlers' logic.
- backend/api/adapter/postgrest.js: /rest/v1/<table> GET/POST/PATCH/
  DELETE with the used filter subset, Prefer headers (return=
  representation, count), single/maybeSingle semantics, and the
  field maps below. Ownership is enforced from the token, never from
  client-supplied ids. payment_credentials is RPC-only, as RLS had it.
- backend/api/adapter/rpc.js: /rest/v1/rpc/<name> dispatching to the
  backend handlers: place_bet, cashout_offer, cashout_bet,
  create_booking_code, delete_ticket, request_withdrawal,
  admin_adjust_balance, admin_review_withdrawal, admin_settle_bet,
  has_role, save_shinobipay_credentials, shinobipay_credential_status,
  bind_shinobipay_test_intent, confirm_shinobipay_verified_event,
  sync_football_fixtures, apply_bookmaker_odds.
- UI-support tables in the StakeKing DB (site_content, user_feedback,
  promotions, sports_categories, referral_codes, odds_sync_state)
  and a user_roles view over users.role.

Field maps (backend -> UI row):
- profiles: users.id/phone/email, display_name -> full_name,
  balance_ghs -> balance, invite_code -> referral_code, country from
  the account country logic, wager_required = the platform's
  completed-deposits-before-withdrawal setting, wager_progress =
  the user's completed deposit count.
- matches: starts_at -> start_time, score_home/away -> home/away_score,
  home/away_logo -> crests, odds o1/ox/o2 -> odds_home/draw/away,
  odds_available = a 1X2 line exists, markets = the translated full
  book (see match-markets contract), external_ref -> external_id +
  source, visible = true.
- bets: bet row + bet_selections -> selections Json in the UI shape,
  potential_ghs -> potential_win, bonus derived from the ladder
  (potential_win - stake x total_odds), cashout payout -> cashed_out.
- transactions: wallet_transactions kind -> type, amount_ghs ->
  amount, method -> note.
- shinobipay_deposits: wallet rows for the gateway deposits with
  amount_minor = amount x 100, external_ref -> intent_id/reference.

## Build status

- 2026-11-09: Neon DB complete (full engine schema + booking_codes +
  commission_payout_requests + adapter_user_meta). Backend copied,
  boot-verified behind its config guard.
- Adapter slice 1 (auth) BUILT: api/adapter/{tokens,invoke,gotrue,
  index}.js, mounted in server.js on /auth/v1/* and /rest/v1/*.
  Signup/login delegate to the engine's own register/login handlers
  via invoke() (synthetic request + captured response), so all rules
  stay single-sourced; the adapter mints GoTrue-shaped JWT sessions.
  Verified: syntax clean, routes mount, guard answers correctly.
  Live end-to-end auth testing waits for DATABASE_URL +
  SESSION_SECRET in the host env (deploy step).
- Adapter slice 2a (markets) BUILT + unit-verified:
  api/adapter/markets.js translates the engine's classic odds jsonb
  and the API-Football odds_full book into the UI's markets object
  and back (per-market, per-option merge, classic wins per option;
  a shallow-assign bug that dropped book Correct Score lines was
  caught by the built-in asserts and fixed). Pass-through markets
  (Handicap Result, HT/FT Double, Odd/Even...) keep their AF names,
  which the UI renders generically and settles via afPickWon.
- Adapter slice 2b (REST tables) BUILT: api/adapter/postgrest.js +
  rows.js. Full read surface (matches with translated markets,
  profiles with wagering progress mapped to the engine's deposit
  rule, user_roles, bets with UI selections, transactions,
  booking_codes, shinobipay_deposits merged from real wallet rows +
  bookkeeping) with the app's exact filter/order/single/count
  semantics; writes for profiles and the adapter-native tables
  (created + seeded in the StakeKing DB: site_content, promotions,
  sports_categories, referral_codes, odds_sync_state, user_feedback,
  adapter_shinobipay_deposits). Money tables are read-only here.
  Verified: syntax clean, routes mount, guard answers correctly.
- Adapter slice 3 (RPC + payments) BUILT: api/adapter/rpc.js
  dispatches place_bet (UI picks translated, seen-price check
  raising ODDS_CHANGED, engine place handler executes), cashout_offer
  (quote computed read-only via _lib.cashoutQuoteFor - the engine
  handler itself executes, so it is only invoked by cashout_bet;
  partial cashout is refused with a clear message because the engine
  is full-cashout only), create_booking_code (engine 5-char codes,
  dedupe per user+slip), delete_ticket (adapter_hidden_bets - the
  ticket leaves My Bets, engine history intact), request_withdrawal,
  admin_adjust_balance / admin_review_withdrawal / admin_settle_bet,
  has_role, the ShinobiPay credential RPCs, and the deposit flow
  (payment_readiness, deposit_verify_number with the UI's own
  verified+can_prompt+amounts acceptance rule and a one-prompt
  confirmation, deposit_create via the engine deposit-momo handler,
  deposit_status, deposit_otp). sync_football_fixtures and
  apply_bookmaker_odds answer 0: engine feeds own fixtures/odds.
  Known divergence, stated plainly: keys pasted into the admin
  ShinobiPay settings page are stored as presence records; the
  engine's env keys are what actually sign provider calls.
- Frontend seam files reimplemented (same exports/shapes):
  src/lib/shinobipay-payments.functions.ts now calls the adapter
  RPCs with the caller's own token; the public webhook route
  forwards the raw body + signature to the backend webhook.
  getMyPaymentAttempts needed no change (adapter table surface).
  Deliberate deferral: football.functions / football-data.functions
  still speak to Football-Data/The Odds API when their keys are
  present; the board, wallet and bets all run on the engine feeds.
- Admin slice BUILT + gap-checked line by line against admin.tsx:
  every call the page makes is covered - has_role, profiles,
  admin_adjust_balance, bets + admin_settle_bet, transactions +
  admin_review_withdrawal, promotions / sports_categories /
  referral_codes CRUD, site_content upserts (incl. the PostgREST
  primary-key upsert default), user_feedback, and matches
  insert/update/delete translated both ways (delete refuses when
  bets exist, mirroring the engine rule). Match rows are stamped
  with the Football category id so the sports tabs group correctly.
  Phone change runs session-gated without an SMS rail (the engine
  has none): updateUser applies it after uniqueness checks and the
  phone_change verify confirms the number now on the account.
- Verification so far: backend syntax clean + boot/guard tests on
  every slice; market translator unit asserts pass; FULL project
  typecheck = 0 errors; the project's own suite = 86/86 tests pass.
  One copy note: the deposit page's frozen UI text still says
  "test payments move no money" from its locked-live era; the flow
  behind it is live now. Editing that text is a UI change, so it
  waits for Prince's word (one line in deposit.tsx).
- Remaining: deployment (two Railway services from this repo -
  backend/ on its own, frontend Nitro build - env: DATABASE_URL,
  SESSION_SECRET, SHINOBIPAY keys, API_FOOTBALL_KEY on the backend;
  SUPABASE_URL + SUPABASE_PUBLISHABLE_KEY pointing at the backend
  and a shared ADAPTER_SERVICE_KEY on the frontend host), then the
  live end-to-end pass. First the repo push, which needs Prince to
  create the empty repo (see Build status, first bullet).

<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

- Money movement (bets, deposits, admin balance changes, settlement) goes only through SECURITY DEFINER SQL functions; clients cannot update `profiles.balance` directly — prevents balance tampering.
- Admin access is checked via `has_role` on `user_roles` (route `beforeLoad` + RLS) — never from client-side state.
- Bet history and ticket details own their page chrome; the authenticated shell omits duplicate headers and floating slip controls on these screens to preserve the reference layout.
- History swipe deletion uses the existing ownership-checked delete_ticket RPC for one settled ticket at a time; the swipe wrapper never changes balances or deletes running bets.
- Bet result celebrations live in the authenticated shell; announce confirmed cashout responses immediately and detect saved win transitions through an owner-scoped watcher, without replaying historical results or changing balances.
- Booking image previews and file sharing use one browser-only canvas renderer with semantic colors and actual booking data; unsupported file sharing downloads the PNG instead.
- Booking Share actions open one authenticated-shell share sheet; image delivery is a separate explicit action to keep previews compact and downloads user-initiated.
- New-ticket bonus terms are captured by a database trigger in potential_win; settlement uses that saved total, and partial cashouts scale the recorded bonus without changing historical ticket terms.
- Wallet pages share a reference-style header and method selector and own their chrome; existing SQL money-movement functions remain authoritative.
- Demo deposit RPC is retired and refuses all credits; the deposit page must not simulate payment or credit balances before an authoritative provider verification flow exists.
- ShinobiPay requests use the Admin-saved API key first and fall back to the connected account only when none is saved; test mode is validated against the provider before any intent, and live keys never simulate test payments.
- Provider Retry-After controls payment retry cooldowns; readiness checks cache only merchant mode briefly, and retries preserve the original operation key to prevent duplicate test intents.
- ShinobiPay Admin credentials use purpose-bound AES-GCM and service-only reads; blank fields preserve secrets. Server account checks gate test intents, signed raw callbacks require five-minute tolerance and authoritative retrieval, and a service-only RPC deduplicates test events without credit. Live collections stay blocked until legacy balances and cash accounting are separated; admin requests never override this gate.
- ShinobiPay contract parsing and safe public payment actions live in a shared browser-safe module; never return provider client secrets or credential-bearing checkout URLs. Method options come from the documented GHS contract until a merchant discovery contract exists, not invented API endpoints. Test intent binding and signed callback recording use locked service-only RPCs so early callbacks cannot be lost or overwritten.
- Verified ShinobiPay callbacks use one raw-signature/retrieval confirmation module and one transactional service-only RPC; cash credits and integer-minor-unit balances are isolated from legacy profiles and deduplicated by deposit/intent/event. The database gate defaults closed and live creation/callbacks stay independently locked until provider verification and isolated cash spending are complete.
- Football fixtures come only from Football-Data.org via the service-only sync_football_fixtures RPC keyed by external_id; manual/fabricated matches stay hidden, and place_bet refuses upcoming fixtures past kickoff.
- Betting odds come only from The Odds API (gateway connector) via service-only apply_bookmaker_odds; a fixture gets prices only from one uniquely matched event (same kickoff, both teams), unmatched fixtures lose odds, and place_bet requires fresh odds plus the client's expected prices.
- Odds allowance uses one shared provider-state row and a throttled free sports-list check before the cutoff; authoritative renewed allowance overrides stale per-sport quota snapshots without relaxing price freshness.
- Correct Score, alternate totals and Double Chance enrich matched events through event-level requests for the selected bookmaker only; normalize scores to home:away, pair totals by exact point, preserve Double Chance keys, reject stale markets, and version refresh state for new coverage.
- Match pages own their compact header; MatchMarkets groups provider totals for display while preserving exact market/option keys for the shared slip. No prediction feed means an unavailable state, never derived tips.
- Live match details use a scoped dark theme and official live API DTOs for score, country and time; unavailable live scores remain unknown rather than database defaults; the scoreboard clock ticks mm:ss from kickoff and the recorded second-half restart via liveClock, showing HT when the feed reports a pause, and market selection guards block unavailable prices.
- Keep the sign-in route component unsplit to avoid a second entry-screen module download; manual retry for failed imports reloads the document because router invalidation can reuse a rejected lazy import.
- Phone login uses Auth phone/password credentials; link numbers on the signed-in account with updateUser and phone_change OTP verification, never profile-email lookup or wallet updates.
- Sports date tabs use the shared Ghana calendar-date filter on existing upcoming fixtures; this keeps day boundaries consistent without fabricating fixtures.
- Account menu items open /account/$section subpages; support contacts live in site_content keys editable from Admin, and ideas/ratings go to owner-insert user_feedback.

const { toUiMarkets, toUiPick } = require('./markets');
const { currencyOfPhone, isCustomMatch, customMatchState, livePriceFor, currentPickOdds } = require('../_lib');

// Row mappers: engine rows -> the exact shapes the StakeKing UI's
// generated types describe (src/integrations/supabase/types.ts).

const FD_CODES = {
  'Premier League': 'PL', 'La Liga': 'PD', 'Serie A': 'SA', 'Bundesliga': 'BL1',
  'Ligue 1': 'FL1', 'Primeira Liga': 'PPL', 'Eredivisie': 'DED',
  'UEFA Champions League': 'CL', 'UEFA Europa League': 'EL', 'MLS': 'MLS',
  'Ghana Premier League': 'GPL',
};
const COUNTRY_BY_CURRENCY = { GHS: 'Ghana', NGN: 'Nigeria', KES: 'Kenya', UGX: 'Uganda', TZS: 'Tanzania' };

function iso(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
function extId(ref) {
  const m = /^af:(\d+)$/.exec(String(ref || ''));
  return m ? Number(m[1]) : null;
}
function sourceOf(ref) {
  const r = String(ref || '');
  if (r.startsWith('af:')) return 'api-football';
  if (r.startsWith('espn:')) return 'espn';
  return 'custom';
}

// The UI shows prices only while odds_updated_at is under 30
// minutes old (its hasOdds rule). A provider-priced row carries its
// own stamp (odds_attempt_at). A feed-derived row (ESPN model book)
// is re-confirmed every time its feed sweeps, so its freshness is
// the feed's last sweep time, passed in as feedFresh — never older
// than the row's own creation.
function freshStamp(m, feedFresh) {
  // Operator-created matches carry the operator's own book: it does
  // not go stale on a provider clock, so it is always current while
  // the match is on the board (feed rows keep their sweep stamps).
  if (isCustomMatch(m)) return new Date().toISOString();
  if (m.odds_attempt_at) return iso(m.odds_attempt_at);
  const src = sourceOf(m.external_ref);
  const gate = feedFresh ? (src === 'espn' ? feedFresh.espn : src === 'api-football' ? feedFresh.af : null) : null;
  const created = m.created_at ? new Date(m.created_at).getTime() : 0;
  const t = Math.max(gate || 0, created || 0);
  return t ? new Date(t).toISOString() : null;
}

function matchRow(m, footballCategoryId, feedFresh) {
  const odds = m.odds || {};
  const fresh = freshStamp(m, feedFresh);
  // Custom (operator-created) matches run on their goal script: the
  // board shows the clock-derived status, minute and score, exactly
  // like the engine's own match feed does.
  const st = isCustomMatch(m) ? customMatchState(m) : null;
  return {
    id: m.id,
    league: m.league,
    home_team: m.home_team,
    away_team: m.away_team,
    home_team_full: m.home_team,
    away_team_full: m.away_team,
    home_team_id: null,
    away_team_id: null,
    home_crest: m.home_logo || null,
    away_crest: m.away_logo || null,
    start_time: iso(m.starts_at),
    status: st ? st.status : m.status,
    minute: st ? (st.minute == null ? null : Number(st.minute)) : (m.minute == null ? null : Number(m.minute)),
    home_score: st ? Number(st.score_home || 0) : Number(m.score_home || 0),
    away_score: st ? Number(st.score_away || 0) : Number(m.score_away || 0),
    odds_home: Number(odds.o1 || 0),
    odds_draw: Number(odds.ox || 0),
    odds_away: Number(odds.o2 || 0),
    odds_available: !!(Number(odds.o1) > 1 && Number(odds.ox) > 1 && Number(odds.o2) > 1),
    odds_bookmaker: m.odds_full ? 'Bet365' : null,
    odds_event_id: null,
    odds_updated_at: fresh,
    markets: toUiMarkets(m),
    external_id: extId(m.external_ref),
    competition_code: FD_CODES[m.league] || null,
    category_id: footballCategoryId || null,
    source: sourceOf(m.external_ref),
    api_status: null,
    second_half_at: null,
    visible: true,
    created_at: iso(m.created_at),
    synced_at: fresh,
  };
}

function profileRow(user, meta, wager) {
  const m = meta || {};
  const w = wager || {};
  return {
    id: user.id,
    phone: user.phone || '',
    email: user.email || '',
    full_name: user.display_name || m.full_name || '',
    balance: Number(user.balance_ghs || 0),
    country: m.country || COUNTRY_BY_CURRENCY[currencyOfPhone(user.phone)] || 'Ghana',
    referral_code: user.invite_code || null,
    status: user.status || 'active',
    wager_progress: Number(w.progress || 0),
    wager_required: Number(w.required || 0),
    created_at: iso(user.created_at),
  };
}

function userRoleRow(user) {
  return { id: user.id, user_id: user.id, role: user.role === 'player' ? 'user' : 'admin' };
}

function selectionUi(sel, match) {
  const ui = toUiPick(sel.market, sel.pick);
  const label = match ? match.home_team + ' vs ' + match.away_team : '';
  const out = {
    matchId: sel.match_id,
    label,
    market: ui.market,
    option: ui.option,
    optionLabel: ui.optionLabel,
    odds: Number(sel.odds || 0),
    // Stored-bet shape: the ticket page, My Bets, the win dialog and
    // the admin bet list all read selections as { match_id, match,
    // market, pick, odds } (the shape the original place_bet stored).
    // Without these three fields the legs render with no team names,
    // Game ID "—" and a blank pick (Onelord's report, 2026-11-10).
    match_id: sel.match_id,
    match: label,
    pick: ui.option,
    // Extra context the ticket page renders when present.
    home_team: match ? match.home_team : undefined,
    away_team: match ? match.away_team : undefined,
    league: match ? match.league : undefined,
    start_time: match ? iso(match.starts_at) : undefined,
    status: sel.result || 'pending',
    score_home: match ? Number(match.score_home || 0) : undefined,
    score_away: match ? Number(match.score_away || 0) : undefined,
    match_status: match ? match.status : undefined,
  };
  // Live state per leg (Prince, 2026-11-11, his SportyBet reference
  // ticket): while a leg's match is in play the ticket shows the
  // current score, the clock and the pick's moving in-play price
  // (now_odds) next to the placed price — the same fields the
  // engine's own Bets view (mine.js) attaches. Operator-created
  // matches derive state from their real football clock; feed
  // matches use their stored status, score and minute.
  if (match) {
    try {
      const cst = isCustomMatch(match) ? customMatchState(match) : null;
      if (cst) {
        out.match_status = cst.status;
        out.score_home = Number(cst.score_home || 0);
        out.score_away = Number(cst.score_away || 0);
        out.live_home = Number(cst.score_home || 0);
        out.live_away = Number(cst.score_away || 0);
        out.live_minute = cst.minute == null ? null : Number(cst.minute);
        out.live_label = cst.minute_label || null;
      } else {
        out.live_home = Number(match.score_home || 0);
        out.live_away = Number(match.score_away || 0);
        out.live_minute = match.minute == null ? null : Number(match.minute);
        out.live_label = null;
      }
      if (!sel.result || sel.result === 'pending') {
        if (out.match_status === 'live') {
          const src = cst
            ? { ...match, status: 'live', score_home: out.live_home, score_away: out.live_away, minute: out.live_minute }
            : match;
          out.now_odds = livePriceFor(src, sel.market, sel.pick);
        } else if (out.match_status === 'upcoming') {
          out.now_odds = currentPickOdds(match, sel.market, sel.pick);
        } else out.now_odds = null;
      }
    } catch (e) { /* live decoration is best-effort; the stored leg still renders */ }
  }
  return out;
}

function betRow(bet, selections, bookingCode) {
  const stake = Number(bet.stake_ghs || 0);
  const totalOdds = Number(bet.total_odds || 0);
  const potential = Number(bet.potential_ghs || 0);
  const bonus = Math.max(0, Math.round((potential - stake * totalOdds) * 100) / 100);
  return {
    id: bet.id,
    user_id: bet.user_id,
    stake,
    total_odds: totalOdds,
    potential_win: potential,
    bonus_amount: bonus,
    bonus_rate: stake * totalOdds > 0 ? Math.round((bonus / (stake * totalOdds)) * 10000) / 10000 : 0,
    cashed_out: bet.status === 'cashed_out' ? Number(bet.payout_ghs || 0) : 0,
    booking_code: bookingCode || null,
    selections: selections || [],
    status: bet.status,
    created_at: iso(bet.placed_at),
  };
}

const TX_TYPE = {
  deposit: 'deposit', withdrawal: 'withdrawal', bet: 'bet', win: 'win',
  cashout: 'cashout', bonus: 'bonus', commission: 'commission', refund: 'refund',
  game: 'game', adjustment: 'adjustment',
};
function transactionRow(wt) {
  return {
    id: wt.id,
    user_id: wt.user_id,
    type: TX_TYPE[wt.kind] || wt.kind,
    amount: Number(wt.amount_ghs || 0),
    status: wt.status,
    note: wt.note || wt.method || '',
    created_at: iso(wt.created_at),
  };
}

function shinobiDepositRow(wt, mode) {
  const done = wt.status === 'completed';
  return {
    id: wt.id,
    user_id: wt.user_id,
    intent_id: wt.external_ref || null,
    reference: wt.external_ref || '',
    amount_minor: Math.round(Number(wt.amount_ghs || 0) * 100),
    status: done ? 'succeeded' : wt.status === 'failed' ? 'failed' : 'pending',
    mode: mode || 'live',
    network: (wt.payout_meta && wt.payout_meta.network) || null,
    payment_method: 'mobile_money',
    last_sequence: 0,
    webhook_verified_at: done ? iso(wt.confirmed_at) || iso(wt.created_at) : null,
    credited_at: done ? iso(wt.confirmed_at) || iso(wt.created_at) : null,
    created_at: iso(wt.created_at),
  };
}

function bookingCodeRow(bc) {
  return {
    code: bc.code,
    selections: bc.selections || [],
    created_by: bc.user_id || null,
    created_at: iso(bc.created_at),
  };
}

module.exports = { matchRow, profileRow, userRoleRow, selectionUi, betRow, transactionRow, shinobiDepositRow, bookingCodeRow, iso };

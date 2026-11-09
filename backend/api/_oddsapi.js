// The Odds API (the-odds-api.com) odds feed — Prince's provider pick,
// 2026-11-09. ESPN (and API-Football when its key lands) supply the
// fixtures; this module prices them from a real bookmaker feed.
//
// Design rules:
// - One region (eu), two featured markets (h2h, totals) per bulk call
//   = 2 credits per league per sync. The free tier is 500 credits a
//   month, so the refresh gate defaults to 30 minutes and the sync
//   stops when the provider reports < 40 credits remaining.
// - Bookmaker priority prefers sharp books (Pinnacle first); the
//   stored prices are that bookmaker's, merged over the fixture's
//   existing odds map (1X2 + the totals line; the engine derives the
//   rest of the book from 1X2 as it already does for ESPN rows).
// - Quota from the response headers is recorded in odds_sync_state
//   (sport_key 'theoddsapi') so the admin side can see where we stand.
// - No key configured = fully inert. Nothing here may break the
//   matches list: every caller swallows errors.
const { sql, fillOdds, fullBookFromOdds } = require('./_lib');

const API_BASE = 'https://api.the-odds-api.com/v4';
const REGION = 'eu';
const MARKETS = 'h2h,totals';
// 20 minutes: the UI hides prices whose odds_updated_at is 30+
// minutes old, so a fresh provider confirmation must land first.
const REFRESH_MS = Number(process.env.ODDS_API_REFRESH_MS || 20 * 60000);
const CREDIT_FLOOR = 40;
const BOOKMAKER_PRIORITY = ['pinnacle', 'onexbet', 'betsson', 'nordicbet', 'matchbook', 'unibet_se', 'unibet_uk', 'williamhill', 'betfair_ex_eu', 'tipico_de'];

// Our fixtures carry ESPN league names; The Odds API keys differ.
const LEAGUE_TO_SPORT = {
  'english premier league': 'soccer_epl',
  'english league championship': 'soccer_efl_champ',
  'english championship': 'soccer_efl_champ',
  'english league one': 'soccer_england_league1',
  'spanish laliga': 'soccer_spain_la_liga',
  'spanish laliga 2': 'soccer_spain_segunda_division',
  'italian serie a': 'soccer_italy_serie_a',
  'italian serie b': 'soccer_italy_serie_b',
  'german bundesliga': 'soccer_germany_bundesliga',
  'german 2 bundesliga': 'soccer_germany_bundesliga2',
  'french ligue 1': 'soccer_france_ligue_one',
  'french ligue 2': 'soccer_france_ligue_two',
  'dutch eredivisie': 'soccer_netherlands_eredivisie',
  'portuguese primeira liga': 'soccer_portugal_primeira_liga',
  'uefa champions league': 'soccer_uefa_champs_league',
  'uefa europa league': 'soccer_uefa_europa_league',
  'uefa conference league': 'soccer_uefa_europa_conference_league',
  'uefa nations league': 'soccer_uefa_nations_league',
  'mls': 'soccer_usa_mls',
  'brazilian serie a': 'soccer_brazil_campeonato',
  'mexican liga bbva mx': 'soccer_mexico_ligamx',
  'turkish super lig': 'soccer_turkey_super_league',
  'scottish premiership': 'soccer_spl',
  'belgian pro league': 'soccer_belgium_first_div',
  'argentine liga profesional de futbol': 'soccer_argentina_primera_division',
  'chilean primera division': 'soccer_chile_campeonato',
  'australian a league men': 'soccer_australia_aleague',
  'australian a league': 'soccer_australia_aleague',
  'austrian bundesliga': 'soccer_austria_bundesliga',
  'danish superliga': 'soccer_denmark_superliga',
  'swiss super league': 'soccer_switzerland_superleague',
  'greek super league': 'soccer_greece_super_league',
  'norwegian eliteserien': 'soccer_norway_eliteserien',
  'japanese j league': 'soccer_japan_j_league',
  'uefa womens champions league': 'soccer_uefa_champs_league_women',
  'uefa women s champions league': 'soccer_uefa_champs_league_women',
  'south korean k league 1': 'soccer_korea_kleague1',
  'k league 1': 'soccer_korea_kleague1',
  'saudi pro league': 'soccer_saudi_arabia_pro_league',
  'saudi arabian pro league': 'soccer_saudi_arabia_pro_league',
  'swedish allsvenskan': 'soccer_sweden_allsvenskan',
  'polish ekstraklasa': 'soccer_poland_ekstraklasa',
  'finnish veikkausliiga': 'soccer_finland_veikkausliiga',
  'chinese super league': 'soccer_china_superleague',
  'brazilian serie b': 'soccer_brazil_serie_b',
  'irish premier division': 'soccer_league_of_ireland',
  'league of ireland premier division': 'soccer_league_of_ireland',
  'conmebol libertadores': 'soccer_conmebol_copa_libertadores',
  'conmebol copa libertadores': 'soccer_conmebol_copa_libertadores',
  'conmebol sudamericana': 'soccer_conmebol_copa_sudamericana',
  'conmebol copa sudamericana': 'soccer_conmebol_copa_sudamericana',
  'concacaf gold cup': 'soccer_concacaf_gold_cup',
  'africa cup of nations': 'soccer_africa_cup_of_nations',
  'german 3 liga': 'soccer_germany_liga3',
};
function sportKeyForLeague(league) {
  const k = String(league || '').trim().toLowerCase().replace(/['’]/g, '');
  if (LEAGUE_TO_SPORT[k]) return LEAGUE_TO_SPORT[k];
  if (k.includes('world cup qualifying') && k.includes('uefa')) return 'soccer_fifa_world_cup_qualifiers_europe';
  if (k.includes('world cup qualifying') && (k.includes('conmebol') || k.includes('south america'))) return 'soccer_fifa_world_cup_qualifiers_south_america';
  return null;
}

// Team-name matching follows the same token logic as the cross-feed
// dedupe in api/matches.js: accents stripped, filler words dropped,
// every token of the shorter name needs a near-twin in the longer.
const TEAM_FILLER = new Set(['fc', 'afc', 'cf', 'sc', 'fk', 'ac', 'as', 'club', 'de', 'the', 'stade', 'us', 'cd', 'sd', 'bk', 'if', 'bc', 'sv', 'vfb', 'vfl', 'tsg', '1', '04', '05', '09']);
const NAME_ALIAS = {
  'manchester united': 'man utd', 'manchester city': 'man city',
  'tottenham hotspur': 'tottenham', 'wolverhampton wanderers': 'wolves',
  'brighton and hove albion': 'brighton', 'west ham united': 'west ham',
  'newcastle united': 'newcastle', 'leeds united': 'leeds',
  'sheffield united': 'sheffield utd', 'paris saint germain': 'psg',
  'inter milan': 'inter', 'internazionale': 'inter', 'ac milan': 'milan',
  'atletico madrid': 'atletico', 'athletic club': 'athletic bilbao',
  'sporting cp': 'sporting', 'sl benfica': 'benfica', 'fc porto': 'porto',
  'sporting braga': 'braga', 'borussia monchengladbach': 'gladbach',
  'bayer leverkusen': 'leverkusen', 'eintracht frankfurt': 'frankfurt',
  'borussia dortmund': 'dortmund', 'bayern munich': 'bayern',
  'celta vigo': 'celta', 'real betis balompie': 'real betis',
  'ajax amsterdam': 'ajax', 'psv eindhoven': 'psv',
  'feyenoord rotterdam': 'feyenoord', 'rsc anderlecht': 'anderlecht',
  'club brugge kv': 'club brugge', 'red bull salzburg': 'salzburg',
  'sk rapid vienna': 'rapid vienna', 'sk sturm graz': 'sturm graz',
  'fenerbahce': 'fenerbahce', 'besiktas jk': 'besiktas',
  'olympiacos': 'olympiakos', 'olympiakos piraeus': 'olympiakos',
  'stade rennais': 'rennes', 'rennais': 'rennes',
};
// Reserve sides are spelled two ways across feeds: ESPN writes
// "Real Sociedad II" where bookmakers write "Real Sociedad B".
// Fold the trailing roman suffix so both sides land on one form.
function foldReserveSuffix(n) {
  const t = n.split(' ');
  const last = t[t.length - 1];
  if (last === 'ii') t[t.length - 1] = 'b';
  else if (last === 'iii') t[t.length - 1] = 'c';
  return t.join(' ');
}
function normalizeName(s) {
  let n = String(s || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ').trim();
  if (NAME_ALIAS[n]) n = NAME_ALIAS[n];
  return foldReserveSuffix(n);
}
function nameTokens(s) {
  return normalizeName(s).split(' ').filter((t) => t && !TEAM_FILLER.has(t));
}
function lev(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 99;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  }
  return d[a.length][b.length];
}
function tokenMatch(a, b) {
  if (a === b) return true;
  // Prefix matching needs a real stem: without this floor the
  // folded reserve token 'b' would "match" any B-team (Betis,
  // Barcelona) and stamp the wrong book on a fixture.
  if (Math.min(a.length, b.length) >= 3 && (a.startsWith(b) || b.startsWith(a))) return true;
  return lev(a, b) <= 1;
}
function teamsMatch(a, b) {
  const ta = nameTokens(a), tb = nameTokens(b);
  if (!ta.length || !tb.length) return false;
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  return short.every((t) => long.some((u) => tokenMatch(t, u)));
}

// One bookmaker's markets -> the engine's flat odds keys.
function bookToOdds(bookmaker, homeTeam, awayTeam) {
  const out = {};
  const markets = (bookmaker && bookmaker.markets) || [];
  const h2h = markets.find((m) => m.key === 'h2h');
  if (h2h) {
    for (const o of h2h.outcomes || []) {
      const p = Number(o.price);
      if (!(p > 1)) continue;
      if (teamsMatch(o.name, homeTeam)) out.o1 = p;
      else if (teamsMatch(o.name, awayTeam)) out.o2 = p;
      else if (String(o.name).toLowerCase() === 'draw') out.ox = p;
    }
  }
  const totals = markets.find((m) => m.key === 'totals');
  if (totals) {
    for (const o of totals.outcomes || []) {
      const p = Number(o.price);
      const point = Number(o.point);
      if (!(p > 1) || !Number.isFinite(point)) continue;
      const suffix = String(Math.round(point * 10));
      if (/^over/i.test(o.name)) out['over' + suffix] = p;
      else if (/^under/i.test(o.name)) out['under' + suffix] = p;
    }
  }
  return out;
}
function pickBookOdds(event) {
  const books = event.bookmakers || [];
  const ordered = [...books].sort((a, b) => {
    const ia = BOOKMAKER_PRIORITY.indexOf(a.key); const ib = BOOKMAKER_PRIORITY.indexOf(b.key);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  for (const b of ordered) {
    const odds = bookToOdds(b, event.home_team, event.away_team);
    if (odds.o1 > 1 && odds.ox > 1 && odds.o2 > 1) return odds;
  }
  return null;
}

async function fetchSportOdds(sportKey, apiKey) {
  const url = `${API_BASE}/sports/${sportKey}/odds/?apiKey=${encodeURIComponent(apiKey)}&regions=${REGION}&markets=${MARKETS}&oddsFormat=decimal`;
  const r = await fetch(url, { headers: { 'User-Agent': 'StakeKing backend' } });
  const remaining = Number(r.headers.get('x-requests-remaining'));
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    throw new Error(`odds api ${r.status}: ${text.slice(0, 160)}`);
  }
  const events = await r.json();
  return { events: Array.isArray(events) ? events : [], remaining: Number.isFinite(remaining) ? remaining : null };
}

let lastRemaining = null;
async function recordQuota(remaining) {
  lastRemaining = remaining;
  if (remaining == null) return;
  await sql(
    `insert into odds_sync_state (sport_key, requests_remaining, synced_at) values ('theoddsapi', $1, now())
     on conflict (sport_key) do update set requests_remaining = excluded.requests_remaining, synced_at = excluded.synced_at`,
    [remaining]
  ).catch(() => {});
}

// Sync odds for every league we carry that The Odds API covers.
// Returns the number of fixtures priced. Throws only on total
// failure; per-league failures are collected and skipped.
async function syncOddsApi() {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) return 0;
  if (lastRemaining != null && lastRemaining < CREDIT_FLOOR) return 0;
  // Upcoming AND live: the bulk response already carries in-play
  // events at no extra credit cost, so price the live board too.
  const rows = await sql(
    `select id, league, home_team, away_team, starts_at, odds from matches
     where status in ('upcoming', 'live') and starts_at > now() - interval '3 hours' and starts_at < now() + interval '7 days'
     order by starts_at asc limit 2000`
  );
  const bySport = new Map();
  for (const m of rows) {
    const sk = sportKeyForLeague(m.league);
    if (!sk) continue;
    if (!bySport.has(sk)) bySport.set(sk, []);
    bySport.get(sk).push(m);
  }
  let updated = 0;
  for (const [sportKey, fixtures] of bySport) {
    let data;
    try { data = await fetchSportOdds(sportKey, apiKey); } catch (e) { continue; }
    await recordQuota(data.remaining);
    if (lastRemaining != null && lastRemaining < CREDIT_FLOOR) break;
    for (const ev of data.events) {
      const commence = new Date(ev.commence_time).getTime();
      const hit = fixtures.find((m) =>
        Math.abs(new Date(m.starts_at).getTime() - commence) <= 12 * 3600000
        && teamsMatch(m.home_team, ev.home_team) && teamsMatch(m.away_team, ev.away_team));
      if (!hit) continue;
      const priced = pickBookOdds(ev);
      if (!priced) continue;
      const merged = { ...(hit.odds || {}), ...priced };
      // Keep the derived full book (Correct Score etc.) in step with
      // the repriced 1X2, same as the ESPN sweep. These are espn: rows;
      // a real provider book only ever lives on af: rows.
      const book = fullBookFromOdds(fillOdds(merged));
      await sql('update matches set odds = $2::jsonb, odds_full = coalesce($3::jsonb, odds_full), odds_attempt_at = now() where id = $1',
        [hit.id, JSON.stringify(merged), book.length ? JSON.stringify(book) : null]).catch(() => {});
      hit.odds = merged;
      updated++;
    }
  }
  return updated;
}

async function claimGate(key, ms) {
  const now = Date.now();
  const claimed = await sql(
    `insert into operator_settings (key, value) values ($1, $2)
     on conflict (key) do update set value = excluded.value
       where operator_settings.value ~ '^[0-9]+$' and operator_settings.value::bigint <= $3
     returning key`,
    [key, String(now), String(now - ms)]
  );
  return claimed.length > 0;
}
// Returns how many fixtures were priced (0 when gated or keyless),
// so RPC callers can report truthfully without burning quota: the
// gate is the only path to the provider.
async function maybeRefreshOdds() {
  if (!process.env.ODDS_API_KEY) return 0;
  if (await claimGate('oddsapi_refresh_at', REFRESH_MS)) return syncOddsApi();
  return 0;
}

module.exports = { syncOddsApi, maybeRefreshOdds, sportKeyForLeague, normalizeName, teamsMatch, bookToOdds, pickBookOdds };

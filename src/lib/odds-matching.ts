/** Pure helpers that attach The Odds API prices to the exact Football-Data.org fixture. No odds are ever derived or invented. */

export const ODDS_SPORT_KEYS: Record<string, string> = {
  PL: "soccer_epl", ELC: "soccer_efl_champ", PD: "soccer_spain_la_liga", BL1: "soccer_germany_bundesliga",
  SA: "soccer_italy_serie_a", FL1: "soccer_france_ligue_one", CL: "soccer_uefa_champs_league",
  DED: "soccer_netherlands_eredivisie", PPL: "soccer_portugal_primeira_liga", BSA: "soccer_brazil_campeonato",
  EC: "soccer_uefa_european_championship", WC: "soccer_fifa_world_cup",
};

/** Preferred bookmakers, in order; the first one offering 1X2 for a fixture supplies all its prices. */
export const PREFERRED_BOOKMAKERS = ["pinnacle", "williamhill", "betfair_sb_uk", "paddypower", "skybet", "ladbrokes_uk", "coral", "unibet_uk", "sport888", "betway", "betvictor", "boylesports"];

const STOP = new Set(["fc", "cf", "afc", "ac", "sc", "ssc", "club", "de", "cd", "ud", "sd", "rc", "fk", "sk", "as", "us", "the", "and", "calcio", "1", "04", "05", "1846", "1899", "1909", "1913", "1907", "1910"]);
const tokens = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/).filter((t) => t && !STOP.has(t));

/** True when the two names refer to the same club (shared significant word or prefix, e.g. "Internazionale"/"Inter"). */
export function sameTeam(a: string, b: string) {
  const A = tokens(a), B = tokens(b);
  if (!A.length || !B.length) return false;
  if (A.join(" ") === B.join(" ")) return true;
  return A.some((x) => B.some((y) => {
    const [s, l] = x.length <= y.length ? [x, y] : [y, x];
    return s.length >= 4 && l.startsWith(s);
  }));
}

export type OddsOutcome = { name: string; price: number; point?: number };
export type OddsMarket = { key: string; last_update?: string; outcomes: OddsOutcome[] };
export type OddsBookmaker = { key: string; title: string; last_update: string; markets: OddsMarket[] };
export type OddsEvent = { id: string; commence_time: string; home_team: string; away_team: string; bookmakers: OddsBookmaker[] };
export type Fixture = { id: string; start_time: string; names: { home: string[]; away: string[] } };

/** Exactly one event with identical kickoff and both teams matching in the same order; otherwise null. */
export function findEvent(f: Fixture, events: OddsEvent[]) {
  const ko = +new Date(f.start_time);
  const hits = events.filter((e) =>
    +new Date(e.commence_time) === ko &&
    f.names.home.some((n) => sameTeam(n, e.home_team)) &&
    f.names.away.some((n) => sameTeam(n, e.away_team)));
  return hits.length === 1 ? hits[0] : null;
}

const fmtPoint = (p: number) => (p > 0 ? `+${p}` : `${p}`);

/** Preserve home/away orientation even when the provider lists the away team first. */
export function scoreOption(name: string, home: string, away: string): string | null {
  const parts = name.split("|").map((part) => {
    const hit = /^(.*):(\d+)$/.exec(part.trim());
    return hit ? { team: hit[1], goals: hit[2] } : null;
  });
  if (parts.length !== 2) return null;
  const h = parts.find((part) => part?.team === home);
  const a = parts.find((part) => part?.team === away);
  return h && a ? `${h.goals}:${a.goals}` : null;
}

/** Enrich only the already selected bookmaker on the exact matched event. */
export function withCorrectScore(base: OddsEvent, detail: OddsEvent, now: number): OddsEvent {
  if (base.id !== detail.id || base.commence_time !== detail.commence_time || base.home_team !== detail.home_team || base.away_team !== detail.away_team) return base;
  return { ...base, bookmakers: base.bookmakers.map((book) => {
    const extra = (detail.bookmakers.find((b) => b.key === book.key)?.markets ?? []).filter((market) => {
      const age = now - Date.parse(market.last_update ?? "");
      return ["correct_score", "alternate_totals", "double_chance"].includes(market.key) && Number.isFinite(age) && age >= 0 && age < 30 * 60_000;
    });
    return { ...book, markets: [...book.markets.filter((m) => !extra.some((x) => x.key === m.key)), ...extra] };
  }) };
}

/** Converts one bookmaker's markets for an event into StakeKing's 1X2 + markets shape. */
export function priceEvent(e: OddsEvent) {
  const books = [...e.bookmakers].sort((a, b) => {
    const ia = PREFERRED_BOOKMAKERS.indexOf(a.key), ib = PREFERRED_BOOKMAKERS.indexOf(b.key);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || b.markets.length - a.markets.length;
  });
  const book = books.find((b) => b.markets.some((m) => m.key === "h2h" && m.outcomes.length === 3));
  if (!book) return null;
  const h2h = book.markets.find((m) => m.key === "h2h");
  if (!h2h) return null;
  const price = (n: string) => h2h.outcomes.find((o) => o.name === n)?.price ?? null;
  const home = price(e.home_team), away = price(e.away_team), draw = price("Draw");
  if (!home || !away || !draw) return null;
  const markets: Record<string, Record<string, number>> = {};
  for (const m of book.markets) {
    if (m.key === "correct_score") {
      const scores: Record<string, number> = {};
      for (const outcome of m.outcomes) {
        const option = scoreOption(outcome.name, e.home_team, e.away_team);
        if (option && Number.isFinite(outcome.price) && outcome.price > 1) scores[option] = outcome.price;
      }
      if (Object.keys(scores).length) markets["Correct Score"] = scores;
    }
    if (m.key === "totals" || m.key === "alternate_totals") {
      for (const over of m.outcomes.filter((o) => o.name === "Over")) {
        const under = m.outcomes.find((o) => o.name === "Under" && o.point === over.point);
        if (under && over.point != null && Number.isFinite(over.point) && Number.isFinite(over.price) && over.price > 1 && Number.isFinite(under.price) && under.price > 1) {
          markets[`Over/Under ${over.point}`] = { Over: over.price, Under: under.price };
        }
      }
    }
    if (m.key === "spreads") {
      const h = m.outcomes.find((o) => o.name === e.home_team), a = m.outcomes.find((o) => o.name === e.away_team);
      if (h?.point != null && a?.point != null) markets[`Handicap ${fmtPoint(h.point)}`] = { [`Home ${fmtPoint(h.point)}`]: h.price, [`Away ${fmtPoint(a.point)}`]: a.price };
    }
    if (m.key === "btts") {
      const y = m.outcomes.find((o) => o.name === "Yes"), n = m.outcomes.find((o) => o.name === "No");
      if (y && n) markets["GG/NG"] = { GG: y.price, NG: n.price };
    }
    if (m.key === "double_chance") {
      const dc: Record<string, number> = {};
      for (const o of m.outcomes) {
        const hasH = o.name.includes(e.home_team), hasA = o.name.includes(e.away_team), hasD = /draw/i.test(o.name);
        const k = hasH && hasD ? "1X" : hasA && hasD ? "X2" : hasH && hasA ? "12" : null;
        if (k && Number.isFinite(o.price) && o.price > 1) dc[k] = o.price;
      }
      if (Object.keys(dc).length === 3) markets["Double Chance"] = dc;
    }
  }
  return { bookmaker: book.title, updated_at: h2h.last_update ?? book.last_update, home, draw, away, markets };
}

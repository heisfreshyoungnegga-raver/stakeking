import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const BASE = "https://api.football-data.org/v4";
export const FD_COMPETITIONS = [
  { code: "PL", name: "Premier League" },
  { code: "CL", name: "Champions League" },
  { code: "PD", name: "La Liga" },
  { code: "BL1", name: "Bundesliga" },
  { code: "SA", name: "Serie A" },
  { code: "FL1", name: "Ligue 1" },
] as const;
const codes = FD_COMPETITIONS.map((c) => c.code).join(",");

export type FdMatch = {
  id: number; utcDate: string; status: string; minute: number | null;
  competition: string; competitionCode: string; country: string | null;
  home: string; away: string; homeCrest: string | null; awayCrest: string | null;
  homeScore: number | null; awayScore: number | null;
};
export type FdStanding = { position: number; team: string; crest: string | null; played: number; won: number; draw: number; lost: number; gd: number; points: number };
type Result<T> = { data: T; error: string | null };

async function fd(path: string): Promise<{ json: any; error: string | null }> {
  const token = process.env["FOOTBALL_DATA_API_TOKEN"];
  if (!token) return { json: null, error: "Football data is not configured." };
  try {
    const res = await fetch(`${BASE}${path}`, { headers: { "X-Auth-Token": token }, signal: AbortSignal.timeout(10000) });
    if (res.status === 429) return { json: null, error: "Too many requests — please wait a minute and retry." };
    if (!res.ok) {
      console.error(`football-data ${path} [${res.status}]: ${(await res.text()).slice(0, 200)}`);
      return { json: null, error: `Football data unavailable (${res.status}).` };
    }
    return { json: await res.json(), error: null };
  } catch (e) {
    console.error("football-data fetch failed", e);
    return { json: null, error: "Could not reach football data service." };
  }
}

function mapMatch(m: any): FdMatch {
  return {
    id: m.id, utcDate: m.utcDate, status: m.status, minute: m.minute ?? null,
    competition: m.competition?.name ?? "", competitionCode: m.competition?.code ?? "", country: m.area?.name ?? null,
    home: m.homeTeam?.shortName || m.homeTeam?.name || "TBD", away: m.awayTeam?.shortName || m.awayTeam?.name || "TBD",
    homeCrest: m.homeTeam?.crest ?? null, awayCrest: m.awayTeam?.crest ?? null,
    homeScore: m.score?.fullTime?.home ?? null, awayScore: m.score?.fullTime?.away ?? null,
  };
}

const day = (d: Date) => d.toISOString().slice(0, 10);

export const fdMatches = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ view: z.enum(["today", "live", "upcoming"]), competition: z.string().regex(/^[A-Z0-9]{1,5}$/).optional() }).parse(d))
  .handler(async ({ data }): Promise<Result<FdMatch[]>> => {
    const now = new Date();
    const comp = data.competition ?? codes;
    let q = `competitions=${comp}`;
    if (data.view === "today") q += `&dateFrom=${day(now)}&dateTo=${day(now)}`;
    if (data.view === "live") q += `&status=IN_PLAY,PAUSED`;
    if (data.view === "upcoming") q += `&status=SCHEDULED,TIMED&dateFrom=${day(now)}&dateTo=${day(new Date(+now + 9 * 864e5))}`;
    const { json, error } = await fd(`/matches?${q}`);
    return { data: error ? [] : (json.matches ?? []).map(mapMatch), error };
  });

export const fdStandings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ competition: z.string().regex(/^[A-Z0-9]{1,5}$/) }).parse(d))
  .handler(async ({ data }): Promise<Result<FdStanding[]>> => {
    const { json, error } = await fd(`/competitions/${data.competition}/standings`);
    if (error) return { data: [], error };
    const table = (json.standings ?? []).find((s: any) => s.type === "TOTAL")?.table ?? [];
    return {
      data: table.map((r: any) => ({ position: r.position, team: r.team?.shortName || r.team?.name, crest: r.team?.crest ?? null, played: r.playedGames, won: r.won, draw: r.draw, lost: r.lost, gd: r.goalDifference, points: r.points })),
      error: null,
    };
  });

/** Syncs real Football-Data.org fixtures (yesterday → tomorrow, all permitted competitions) into the betting fixtures list. */
export const syncFixtures = createServerFn({ method: "POST" }).handler(async (): Promise<{ synced: number; error: string | null }> => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: last } = await supabaseAdmin.from("matches").select("synced_at").not("synced_at", "is", null).order("synced_at", { ascending: false }).limit(1).maybeSingle();
  if (last?.synced_at && Date.now() - +new Date(last.synced_at) < 30_000) return { synced: 0, error: null };
  const now = Date.now();
  const { json, error } = await fd(`/matches?dateFrom=${day(new Date(now - 864e5))}&dateTo=${day(new Date(now + 2 * 864e5))}`);
  if (error) return { synced: 0, error };
  const fixtures = (json.matches ?? [])
    .filter((m: any) => m.id && m.utcDate && m.homeTeam?.name && m.awayTeam?.name)
    .map((m: any) => {
      const x = mapMatch(m);
      return { id: x.id, utcDate: x.utcDate, status: x.status, minute: x.minute, league: x.competition, code: x.competitionCode, homeFull: m.homeTeam?.name ?? x.home, awayFull: m.awayTeam?.name ?? x.away, home: x.home, away: x.away, homeId: m.homeTeam?.id ?? null, awayId: m.awayTeam?.id ?? null, homeCrest: x.homeCrest, awayCrest: x.awayCrest, homeScore: x.homeScore, awayScore: x.awayScore };
    });
  if (!fixtures.length) return { synced: 0, error: null };
  const { data, error: e } = await supabaseAdmin.rpc("sync_football_fixtures", { _fixtures: fixtures });
  if (e) { console.error("sync_football_fixtures failed", e.message); return { synced: 0, error: "Could not update fixtures." }; }
  return { synced: data ?? 0, error: null };
});

const ODDS_GATEWAY = "https://connector-gateway.lovable.dev/udc_the_odds_api";
const ODDS_REFRESH_MS = 10 * 60_000; // pre-match
const ODDS_LIVE_REFRESH_MS = 5 * 60_000; // in-play

/** Refreshes genuine bookmaker odds from The Odds API for competitions with open fixtures. */
export const syncOdds = createServerFn({ method: "POST" }).handler(async (): Promise<{ updated: number; error: string | null }> => {
  const lovableKey = process.env["LOVABLE_API_KEY"], connKey = process.env["UDC_THE_ODDS_API_API_KEY"];
  if (!lovableKey || !connKey) return { updated: 0, error: "Odds provider is not configured." };
  const { ODDS_SPORT_KEYS, findEvent, priceEvent, withCorrectScore } = await import("./odds-matching");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const horizon = new Date(Date.now() + 2 * 864e5).toISOString();
  const { data: open, error: openError } = await supabaseAdmin.from("matches")
    .select("id, competition_code, start_time, status, home_team, away_team, home_team_full, away_team_full")
    .eq("visible", true).eq("source", "football-data").neq("status", "finished").lte("start_time", horizon);
  const { data: state, error: stateError } = await supabaseAdmin.from("odds_sync_state").select("sport_key, synced_at, requests_remaining");
  if (openError || stateError) return { updated: 0, error: "Could not read odds refresh state." };
  const { checkAllowance, allowanceBlocked, readAllowance, ODDS_ALLOWANCE_KEY } = await import("./odds-allowance");
  const headers = { Authorization: `Bearer ${lovableKey}`, "X-Connection-Api-Key": connKey };
  const saveAllowance = async (remaining: number | null, checkedAt: string) => {
    const { error } = await supabaseAdmin.from("odds_sync_state").upsert({ sport_key: ODDS_ALLOWANCE_KEY, requests_remaining: remaining, synced_at: checkedAt });
    if (error) throw new Error("Could not save odds allowance state.");
  };
  let remaining: number | null;
  try {
    const allowance = await checkAllowance(state ?? [], Date.now(),
      () => fetch(`${ODDS_GATEWAY}/v4/sports`, { headers, signal: AbortSignal.timeout(10000) }), saveAllowance);
    if (allowance.error) return { updated: 0, error: allowance.error };
    remaining = allowance.remaining;
  } catch { return { updated: 0, error: "Could not save odds allowance state." }; }
  if (allowanceBlocked(remaining)) return { updated: 0, error: "Odds provider quota nearly used up; allowance is rechecked every five minutes." };
  const last = new Map((state ?? []).map((r) => [r.sport_key, +new Date(r.synced_at)]));
  const byComp = new Map<string, NonNullable<typeof open>>();
  for (const m of open ?? []) if (m.competition_code && ODDS_SPORT_KEYS[m.competition_code]) byComp.set(m.competition_code, [...(byComp.get(m.competition_code) ?? []), m]);
  let updated = 0, error: string | null = null;
  for (const [code, list] of byComp) {
    if (allowanceBlocked(remaining)) { error = "Odds provider quota nearly used up; allowance is rechecked every five minutes."; break; }
    const sport = ODDS_SPORT_KEYS[code];
    if (!sport) continue;
    // Version the refresh state so this new market is fetched on first use.
    const syncKey = `${sport}:extended-markets-v3`;
    const interval = list.some((m) => m.status === "live") ? ODDS_LIVE_REFRESH_MS : ODDS_REFRESH_MS;
    if (Date.now() - (last.get(syncKey) ?? 0) < interval) continue;
    await supabaseAdmin.from("odds_sync_state").upsert({ sport_key: syncKey, synced_at: new Date().toISOString() });
    let events: any[];
    try {
      const res = await fetch(`${ODDS_GATEWAY}/v4/sports/${sport}/odds?regions=uk&markets=h2h,totals,spreads&oddsFormat=decimal&dateFormat=iso`, {
        headers, signal: AbortSignal.timeout(10000),
      });
      const observed = readAllowance(res.headers);
      if (observed !== null) {
        remaining = observed;
        await saveAllowance(observed, new Date().toISOString());
        await supabaseAdmin.from("odds_sync_state").update({ requests_remaining: observed }).eq("sport_key", syncKey);
      }
      if (!res.ok) { console.error(`odds ${sport} [${res.status}]: ${(await res.text()).slice(0, 200)}`); error = `Odds provider error (${res.status}).`; continue; }
      events = await res.json();
    } catch (e) { console.error("odds fetch failed", e); error = "Could not reach odds provider."; continue; }
    const odds = [];
    for (const m of list) {
      let ev = findEvent({ id: m.id, start_time: m.start_time, names: { home: [m.home_team_full ?? "", m.home_team], away: [m.away_team_full ?? "", m.away_team] } }, events);
      if (!ev) continue;
      const basePrice = priceEvent(ev);
      if (!basePrice) continue;
      const book = ev.bookmakers.find((b) => b.title === basePrice.bookmaker);
      if (book && !allowanceBlocked(remaining)) {
        try {
          const res = await fetch(`${ODDS_GATEWAY}/v4/sports/${sport}/events/${encodeURIComponent(ev.id)}/odds?bookmakers=${encodeURIComponent(book.key)}&markets=correct_score,alternate_totals,double_chance&oddsFormat=decimal&dateFormat=iso`, { headers, signal: AbortSignal.timeout(10000) });
          const observed = readAllowance(res.headers);
          if (observed !== null) { remaining = observed; await saveAllowance(observed, new Date().toISOString()); }
          if (res.ok) ev = withCorrectScore(ev, await res.json(), Date.now());
          else { console.error(`extended markets ${sport} [${res.status}]: ${(await res.text()).slice(0, 200)}`); error = `Additional markets provider error (${res.status}).`; }
        } catch { error = "Could not reach additional markets provider."; }
      }
      const p = priceEvent(ev);
      if (p) odds.push({ match_id: m.id, event_id: ev.id, ...p });
    }
    const { error: e } = await supabaseAdmin.rpc("apply_bookmaker_odds", { _match_ids: list.map((m) => m.id), _odds: odds });
    if (e) { console.error("apply_bookmaker_odds", e.message); error = "Could not save odds."; continue; }
    updated += odds.length;
  }
  return { updated, error };
});

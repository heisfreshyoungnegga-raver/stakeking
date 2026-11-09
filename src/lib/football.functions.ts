import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const BASE = "https://v3.football.api-sports.io";

type Json = string | number | boolean | null | Json[] | { [k: string]: Json };
type ApiResult = { ok: boolean; error: string | null; results: number; data: Json[] };

async function apiFootball(path: string, params: Record<string, string | number> = {}): Promise<ApiResult> {
  const key = process.env["API_FOOTBALL_KEY"];
  if (!key) return { ok: false, error: "API_FOOTBALL_KEY is not configured", results: 0, data: [] };
  const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
  const res = await fetch(`${BASE}${path}${qs.size ? `?${qs}` : ""}`, {
    headers: { "x-apisports-key": key },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error(`API-Football ${path} failed [${res.status}]: ${body.slice(0, 300)}`);
    return { ok: false, error: `API-Football request failed [${res.status}]`, results: 0, data: [] };
  }
  const json = (await res.json()) as { errors?: unknown; results?: number; response?: unknown };
  const errs = json.errors && typeof json.errors === "object" ? Object.values(json.errors as Record<string, string>) : [];
  if (errs.length) return { ok: false, error: errs.join("; "), results: 0, data: [] };
  const resp = json.response;
  return { ok: true, error: null, results: json.results ?? 0, data: (Array.isArray(resp) ? resp : resp ? [resp] : []) as Json[] };
}

const auth = [requireSupabaseAuth];

export const footballStatus = createServerFn({ method: "GET" }).middleware(auth).handler(() => apiFootball("/status"));

export const footballLive = createServerFn({ method: "GET" }).middleware(auth).handler(() => apiFootball("/fixtures", { live: "all" }));

export const footballFixtures = createServerFn({ method: "GET" })
  .middleware(auth)
  .inputValidator((d) => z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).parse(d))
  .handler(({ data }) => apiFootball("/fixtures", { date: data.date }));

export const footballUpcoming = createServerFn({ method: "GET" })
  .middleware(auth)
  .inputValidator((d) => z.object({ league: z.number().int(), season: z.number().int() }).parse(d))
  .handler(({ data }) => apiFootball("/fixtures", { league: data.league, season: data.season, next: 10 }));

export const footballStandings = createServerFn({ method: "GET" })
  .middleware(auth)
  .inputValidator((d) => z.object({ league: z.number().int(), season: z.number().int() }).parse(d))
  .handler(({ data }) => apiFootball("/standings", { league: data.league, season: data.season }));

export const footballStatistics = createServerFn({ method: "GET" })
  .middleware(auth)
  .inputValidator((d) => z.object({ fixture: z.number().int() }).parse(d))
  .handler(({ data }) => apiFootball("/fixtures/statistics", { fixture: data.fixture }));

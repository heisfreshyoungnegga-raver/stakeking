import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { syncFixtures, syncOdds } from "@/lib/football-data.functions";
import { TEAM_BADGES } from "@/lib/team-badges";
import { ChevronRight, LineChart } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import { useOptionalBetSlip } from "@/lib/betslip";
import { cn } from "@/lib/utils";

export type Match = Tables<"matches">;
export type Markets = Record<string, Record<string, number>>;

const ODDS_MAX_AGE_MS = 30 * 60_000;
/** Genuine provider odds present and fresh enough to bet on. */
export const hasOdds = (m: Match) => m.odds_available && !!m.odds_updated_at && Date.now() - +new Date(m.odds_updated_at) < ODDS_MAX_AGE_MS && m.status !== "finished";

export const ONE_X_TWO = (m: Match) => [
  { option: "home", label: "1", odds: Number(m.odds_home) },
  { option: "draw", label: "X", odds: Number(m.odds_draw) },
  { option: "away", label: "2", odds: Number(m.odds_away) },
];

/** Pick handler: adds to bet slip when signed in, otherwise sends visitor to sign-up. */
export function usePick() {
  const slip = useOptionalBetSlip();
  const navigate = useNavigate();
  return {
    isSelected: (id: string, market: string, option: string) => slip?.isSelected(id, market, option) ?? false,
    pick: (m: Match, market: string, option: string, optionLabel: string, odds: number) => {
      if (!slip) { navigate({ to: "/register" }); return; }
      slip.toggle({ matchId: m.id, label: `${m.home_team} vs ${m.away_team}`, market, option, optionLabel, odds });
    },
  };
}

/** Official crest from the fixture's team data; neutral outline only when no logo exists or it fails to load. */
export function Crest({ name, src, size = "md" }: { name: string; src?: string | null; size?: "xs" | "sm" | "md" | "lg" }) {
  const url = src || TEAM_BADGES[name];
  const [failed, setFailed] = useState(false);
  const s = size === "lg" ? "h-16 w-16" : size === "sm" ? "h-7 w-7" : size === "xs" ? "h-4 w-4" : "h-12 w-12";
  if (url && !failed) {
    return <img src={url} alt={`${name} crest`} loading="lazy" decoding="async" onError={() => setFailed(true)} className={cn("shrink-0 object-contain", s)} />;
  }
  return <div className={cn("shrink-0 rounded-full border-2 border-dashed border-paper-border bg-paper-border/40", s)} aria-hidden />;
}

/** Re-renders every `ms` so live clocks tick. */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return now;
}

/** Keeps real fixtures, scores and statuses fresh from Football-Data.org. */
export function useFixtureSync() {
  const qc = useQueryClient();
  const sync = useServerFn(syncFixtures);
  const odds = useServerFn(syncOdds);
  const q = useQuery({ queryKey: ["fixtures-sync"], queryFn: async () => { const r = await sync(); await odds().catch(() => null); return r; }, refetchInterval: 30_000, staleTime: 25_000 });
  useEffect(() => { if (q.data) { qc.invalidateQueries({ queryKey: ["matches"] }); qc.invalidateQueries({ queryKey: ["match"] }); } }, [q.data, qc]);
  return q.data;
}

const mmss = (ms: number) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

/** Live clock from the API minute when supplied, else from the verified kickoff and observed second-half restart. */
export function liveClock(m: Match, now: number): { time: string; half: "H1" | "H2" | "HT" } {
  if (m.api_status === "PAUSED") return { time: "HT", half: "HT" };
  if (m.minute != null) return { time: `${m.minute}'`, half: m.minute > 45 ? "H2" : "H1" };
  if (m.second_half_at) return { time: mmss(45 * 60e3 + now - +new Date(m.second_half_at)), half: "H2" };
  const el = now - +new Date(m.start_time);
  if (el <= 50 * 60e3) return { time: mmss(el), half: "H1" };
  return { time: mmss(el - 17 * 60e3), half: "H2" }; // 15-min break + typical first-half stoppage
}

/** Status/time label from the official kickoff timestamp, in Ghana time. */
export function matchClock(m: Match, now = Date.now()) {
  const t = new Date(m.start_time);
  const time = t.toLocaleTimeString("en-GB", { timeZone: "Africa/Accra", hour: "2-digit", minute: "2-digit" });
  const date = t.toLocaleDateString("en-GB", { timeZone: "Africa/Accra", weekday: "short", day: "numeric", month: "short" });
  if (m.status === "finished") return { main: "FT", date };
  if (m.status === "live") { const c = liveClock(m, now); return { main: c.half === "HT" ? "HT" : `${c.time} ${c.half}`, date: `KO ${time}` }; }
  return { main: time, date };
}

export function OddsUnavailable({ dark }: { dark?: boolean }) {
  return <span className={cn("col-span-3 grid h-11 place-items-center rounded-sm text-xs font-semibold", dark ? "bg-secondary text-muted-foreground" : "bg-paper-border text-paper-muted")}>Odds unavailable</span>;
}

export function LiveBadge() {
  return <span className="rounded-sm bg-odds-soft px-1 text-[10px] font-bold uppercase text-odds-soft-foreground">Live</span>;
}

export function OddsButton({ selected, onClick, label, odds, tone = "soft", className }: { selected: boolean; onClick: () => void; label?: string; odds: number; tone?: "soft" | "dark"; className?: string }) {
  return (
    <button
      onClick={onClick}
      aria-label={`${label ?? ""} ${odds.toFixed(2)}`}
      aria-pressed={selected}
      className={cn(
        "flex h-11 items-center justify-center gap-2 rounded-sm px-2 font-bold transition-colors",
        label && "justify-between",
        selected ? "bg-primary text-primary-foreground" : tone === "dark" ? "bg-secondary text-odds-soft hover:bg-muted" : "bg-odds-soft text-odds-soft-foreground hover:brightness-95",
        className,
      )}
    >
      {label && <span className="truncate text-xs font-semibold opacity-80">{label}</span>}
      <span>{odds.toFixed(2)}</span>
    </button>
  );
}

export function MatchRow({ m, dark }: { m: Match; dark?: boolean }) {
  const { pick, isSelected } = usePick();
  const live = m.status === "live";
  const now = useNow();
  const clock = matchClock(m, now);
  const mcount = hasOdds(m) ? Object.values((m.markets ?? {}) as Markets).reduce((a, o) => a + Object.keys(o).length, 3) : 0;
  const sub = dark ? "text-muted-foreground" : "text-paper-muted";
  return (
    <div className={cn("border-b px-4 py-3", dark ? "border-border" : "border-paper-border")}>
      <div className="flex items-center gap-2 text-xs">
        <span className={cn("flex flex-col leading-tight", live ? "font-semibold text-ring" : "text-odds-soft-foreground")}><b className="flex items-center gap-1">{live && <LiveBadge />}{clock.main}</b><span className={cn("text-[10px] font-normal", sub)}>{clock.date}</span></span>
        <span className={cn("truncate", sub)}>{m.league}</span>
        <LineChart className={cn("ml-auto h-4 w-4 shrink-0", sub)} />
      </div>
      <div className="mt-1 grid grid-cols-[1fr_repeat(3,4.5rem)] items-center gap-1 sm:grid-cols-[1fr_repeat(3,6rem)]">
        <Link to="/match/$id" params={{ id: m.id }} className="min-w-0 space-y-1 pr-2 text-sm">
          <div className="flex items-center justify-between gap-2"><span className="flex min-w-0 items-center gap-1.5"><Crest name={m.home_team} src={m.home_crest} size="xs" /><span className="truncate">{m.home_team}</span></span>{m.status !== "upcoming" && <span>{m.home_score}</span>}</div>
          <div className="flex items-center justify-between gap-2"><span className="flex min-w-0 items-center gap-1.5"><Crest name={m.away_team} src={m.away_crest} size="xs" /><span className="truncate">{m.away_team}</span></span>{m.status !== "upcoming" && <span>{m.away_score}</span>}</div>
        </Link>
        {hasOdds(m) ? ONE_X_TWO(m).map((x) => (
          <OddsButton key={x.option} tone={dark ? "dark" : "soft"} odds={x.odds} selected={isSelected(m.id, "1X2", x.option)} onClick={() => pick(m, "1X2", x.option, x.label, x.odds)} />
        )) : <OddsUnavailable dark={!!dark} />}
      </div>
      <Link to="/match/$id" params={{ id: m.id }} className={cn("mt-1 inline-flex items-center text-xs", sub)}>+{mcount} <ChevronRight className="h-3 w-3" /></Link>
    </div>
  );
}

export function OddsHeader({ dark }: { dark?: boolean }) {
  return (
    <div className={cn("grid grid-cols-[1fr_repeat(3,4.5rem)] gap-1 px-4 py-2 text-center text-xs sm:grid-cols-[1fr_repeat(3,6rem)]", dark ? "bg-secondary text-muted-foreground" : "bg-paper-border text-paper-muted")}>
      <span /> <span>1</span><span>X</span><span>2</span>
    </div>
  );
}

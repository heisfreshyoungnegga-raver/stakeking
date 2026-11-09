import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, ChevronDown, Home, Info, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Crest, hasOdds, LiveBadge, liveClock, matchClock, useFixtureSync, useNow } from "@/components/match-ui";
import { MatchMarkets } from "@/components/MatchMarkets";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useServerFn } from "@tanstack/react-start";
import { fdMatches } from "@/lib/football-data.functions";
import { officialLiveTime } from "@/lib/live-match";

export const Route = createFileRoute("/_authenticated/match/$id")({
  head: () => ({ meta: [
    { title: "Match details, markets & predictions — StakeKing" },
    { name: "description", content: "Fixture-specific bookmaker markets, kickoff times and football match details on StakeKing." },
    { property: "og:title", content: "Match details, markets & predictions — StakeKing" },
    { property: "og:description", content: "Explore genuine bookmaker odds and football match details on StakeKing." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: MatchPage,
});

function MatchPage() {
  const { id } = Route.useParams();
  const [view, setView] = useState("Markets");
  const [summaryOpen, setSummaryOpen] = useState(true);
  useFixtureSync();
  const now = useNow();
  const fetchLive = useServerFn(fdMatches);
  const { data: m, isLoading, error, refetch } = useQuery({
    queryKey: ["match", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("matches").select("*").eq("id", id).eq("visible", true).maybeSingle();
      if (error) throw error;
      return data;
    },
    refetchInterval: 30_000,
  });
  const { data: liveResult, isError: liveError, refetch: refreshLive, dataUpdatedAt } = useQuery({
    queryKey: ["official-live-match-details"],
    queryFn: () => fetchLive({ data: { view: "live" } }),
    enabled: m?.status === "live",
    refetchInterval: 30_000,
    staleTime: 25_000,
  });
  if (isLoading) return <div className="min-h-[70vh] bg-paper p-8 text-center text-paper-muted">Loading match…</div>;
  if (error) return <div className="min-h-[70vh] bg-paper p-8 text-center text-paper-foreground"><p>Unable to load this match.</p><Button variant="outline" onClick={() => refetch()} className="mt-4"><RefreshCw />Try again</Button></div>;
  if (!m) return <div className="min-h-[70vh] bg-paper p-8 text-center text-paper-foreground">Match not found. <Link to="/sports" className="text-primary">Back home</Link></div>;
  const live = m.status === "live";
  const official = liveResult?.data.find((fixture) => fixture.id === m.external_id);
  const officialTime = official ? officialLiveTime(official.status, official.minute) : null;
  const running = live ? liveClock({ ...m, api_status: official?.status ?? m.api_status, minute: null }, now) : null;
  const liveTime = official?.status === "PAUSED" ? "HT" : running ? (running.half === "HT" ? "HT" : `${running.time} ${running.half}`) : officialTime;
  const done = m.status === "finished";
  const clock = matchClock(m, now);
  const kickoff = new Date(m.start_time);
  const kickTime = kickoff.toLocaleTimeString("en-GB", { timeZone: "Africa/Accra", hour: "2-digit", minute: "2-digit" });
  const kickDate = kickoff.toLocaleDateString("en-GB", { timeZone: "Africa/Accra", weekday: "short", day: "numeric", month: "short" });
  return <div className={cn("match-markets-page min-h-[85vh] bg-paper text-paper-foreground", live && "live-match-page min-h-screen")}>
    <header className="sticky top-0 z-30 flex h-12 items-center gap-3 bg-brand-bar px-3 text-primary-foreground">
      <Button asChild variant="ghost" size="icon" className="h-8 w-7 shrink-0 hover:bg-primary-foreground/10"><Link to="/sports" aria-label="Back to matches"><ArrowLeft /></Link></Button>
      <h1 className={cn("min-w-0 flex-1 truncate font-sans text-sm font-medium", live && "text-xl")} title={`${m.home_team} vs ${m.away_team}`}>{live ? "Details" : <>{m.home_team} <span className="text-xs opacity-75">vs</span> {m.away_team}</>}</h1>
      {live && <Button variant="ghost" size="icon" aria-label="Refresh live match" onClick={() => { void refetch(); void refreshLive(); }} className="h-8 w-8 shrink-0 hover:bg-primary-foreground/10"><RefreshCw /></Button>}
      <Button asChild variant="ghost" size="icon" className="h-8 w-8 shrink-0 hover:bg-primary-foreground/10"><Link to="/sports" aria-label="Home"><Home /></Link></Button>
    </header>
    {!live && <div className="flex h-10 items-center gap-1 border-b border-paper-border bg-paper-border px-2">
      { ["Markets", "Details", "Predictions"].map((name) => <Button key={name} variant="ghost" onClick={() => setView(name)} aria-pressed={view === name} className={cn("h-7 rounded-sm px-4 text-[11px]", view === name ? "bg-brand-ink text-primary-foreground hover:bg-brand-ink hover:text-primary-foreground" : "text-paper-muted")}>{name}</Button>)}
    </div>}
    {live ? <section className="border-b border-paper-border px-3 pb-5 pt-4" aria-label="Live match summary">
      <p className="text-sm leading-6 text-odds-soft-foreground underline underline-offset-4">Football · {official?.country ? `${official.country} · ` : ""}{m.league}</p>
      <Scoreboard clock={liveTime} home={m.home_team} away={m.away_team} homeScore={official?.homeScore} awayScore={official?.awayScore} />
      {(liveError || liveResult?.error) && <p role="status" className="mt-3 text-xs text-paper-muted">Live updates unavailable · Retrying automatically</p>}
      {official && <p className="mt-3 text-[10px] text-paper-muted">Football-Data.org · Updated {new Date(dataUpdatedAt).toLocaleTimeString("en-GB", { timeZone: "Africa/Accra", hour: "2-digit", minute: "2-digit", second: "2-digit" })} GMT</p>}
    </section> : <>{done && <section className="live-match-page bg-paper px-3 pb-4 pt-3" aria-label="Final score"><Scoreboard clock="FT" home={m.home_team} away={m.away_team} homeScore={m.home_score} awayScore={m.away_score} /></section>}<div className="border-b border-paper-border">
      <Button variant="ghost" onClick={() => setSummaryOpen(!summaryOpen)} aria-expanded={summaryOpen} aria-label="Match summary" className="flex h-9 w-full min-w-0 justify-between gap-2 rounded-none px-3 text-xs font-normal">
        <span className="truncate">Football · {m.league}</span><span className="flex shrink-0 items-center gap-2">{live ? <LiveBadge /> : done ? "FT" : kickTime}<ChevronDown className={cn("size-3", !summaryOpen && "-rotate-90")} /></span>
      </Button>
      {summaryOpen && <div className="px-3 pb-3">
        <div className="grid grid-cols-[1fr_5rem_1fr] items-center gap-2">
          <div className="flex min-w-0 flex-col items-center gap-1.5 text-center"><Crest name={m.home_team} src={m.home_crest} size="sm" /><span className="text-xs font-semibold leading-tight">{m.home_team}</span></div>
          <div className="text-center tabular-nums">{live || done ? <><b className="block text-xl">{m.home_score} - {m.away_score}</b><span className="text-[11px]">{clock.main}</span></> : <><b className="block text-base">{kickTime}</b><span className="text-[10px] text-paper-muted">{kickDate}</span></>}</div>
          <div className="flex min-w-0 flex-col items-center gap-1.5 text-center"><Crest name={m.away_team} src={m.away_crest} size="sm" /><span className="text-xs font-semibold leading-tight">{m.away_team}</span></div>
        </div>
        <p className={cn("mt-2 text-center text-[10px]", live ? "text-muted-foreground" : "text-paper-muted")}>{done ? "Full time · Betting closed" : live ? `Kickoff ${kickTime} · ${kickDate} GMT` : "Ghana time · GMT"}</p>
      </div>}
    </div></>}
    {live || view === "Markets" ? <>
      {hasOdds(m) && m.odds_updated_at && <p className="border-b border-paper-border px-3 py-1.5 text-[10px] text-paper-muted">{m.odds_bookmaker} · Updated {new Date(m.odds_updated_at).toLocaleTimeString("en-GB", { timeZone: "Africa/Accra", hour: "2-digit", minute: "2-digit" })} GMT</p>}
      <MatchMarkets key={`${m.id}-${live}`} match={m} available={hasOdds(m)} live={live} />
    </> : view === "Details" ? <dl className="divide-y divide-paper-border px-4 text-sm">
      {[["Competition", m.league], ["Kickoff (GMT)", `${kickDate} · ${kickTime}`], ["Status", done ? "Full time" : live ? "Live" : "Not started"], ["Fixture source", "Football-Data.org"], ["Bookmaker", m.odds_bookmaker ?? "Unavailable"]].map(([label, value]) => <div key={label} className="flex justify-between gap-4 py-4"><dt className="text-paper-muted">{label}</dt><dd className="text-right font-semibold">{value}</dd></div>)}
    </dl> : <div className="flex flex-col items-center gap-3 px-4 py-12 text-sm text-paper-muted"><Info className="size-5" /><p>Predictions unavailable</p></div>}
  </div>;
}

function Scoreboard({ clock, home, away, homeScore, awayScore }: { clock: string | null; home: string; away: string; homeScore?: number | null | undefined; awayScore?: number | null | undefined }) {
  return <div className="live-scoreboard">
    <p className="score-clock min-h-9 text-xl tabular-nums leading-9" aria-label="Official match time">{clock ?? "LIVE"}</p>
    <div className="mt-2 space-y-1.5" aria-live="polite">
      {([[home, homeScore], [away, awayScore]] as const).map(([team, score], index) => <div key={index} className="grid min-h-12 grid-cols-[minmax(0,1fr)_3.75rem] gap-1.5">
        <span className="team-bar flex min-w-0 items-center truncate px-3 text-xl font-bold leading-tight">{team}</span>
        <span className="score-cell grid place-items-center text-2xl font-bold tabular-nums">{score ?? "—"}</span>
      </div>)}
    </div>
  </div>;
}

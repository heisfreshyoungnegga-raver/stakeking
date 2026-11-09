import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { LayoutGrid, Tv, Star, Trophy, CircleDot, Volleyball, MoreHorizontal } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ghDay, matchesSportsDay, type SportsDay } from "@/lib/sports-dates";
import { Crest, matchClock, useFixtureSync, useNow, LiveBadge, hasOdds, OddsUnavailable, MatchRow, OddsButton, OddsHeader, ONE_X_TWO, usePick, type Match } from "./match-ui";

type Cat = Tables<"sports_categories">;

export function HomeFeed({ matches: all, categories, signedIn }: { matches: Match[]; categories: Cat[]; signedIn: boolean }) {
  useFixtureSync();
  useNow(1000);
  const matches = all.filter((m) => m.visible && m.status !== "finished");
  const cats = categories.filter((c) => c.active);
  const bySlug = (s: string) => cats.find((c) => c.slug === s)?.id;
  const football = bySlug("football");
  const [liveCat, setLiveCat] = useState<string | undefined>(football);
  const [sportCat, setSportCat] = useState<string | undefined>(football);
  const [sportTab, setSportTab] = useState<SportsDay>("highlights");
  const [quick, setQuick] = useState<string | null>(null);
  const [league, setLeague] = useState<string | null>(null);
  const { pick, isSelected } = usePick();

  const now = Date.now();
  const upcoming = matches.filter((m) => m.status === "upcoming" && +new Date(m.start_time) > now);
  const live = matches.filter((m) => m.status === "live" && (!liveCat || m.category_id === liveCat));
  const leagues = [...new Set(matches.filter((m) => m.category_id === football).map((m) => m.league))];

  const tiles = [
    { k: "today", t: "Today's Football", c: "border-t-brand-bar", f: (m: Match) => m.category_id === football && ghDay(m.start_time) === ghDay(Date.now()) },
    { k: "next3", t: "Football in next 3 hours", c: "border-t-chart-5", f: (m: Match) => m.category_id === football && m.status === "upcoming" && +new Date(m.start_time) > now && +new Date(m.start_time) - now < 3 * 3600e3 },
    { k: "epl", t: "England Premier League", c: "border-t-primary", f: (m: Match) => m.league === "Premier League" },
    { k: "gpl", t: "Ghana Premier League", c: "border-t-gold", f: (m: Match) => m.league.includes("Ghana") },
  ];
  const quickTile = tiles.find((t) => t.k === quick);
  let featured = quickTile ? matches.filter(quickTile.f) : upcoming;
  if (league) featured = featured.filter((m) => m.league === league);

  let sportList = upcoming.filter((m) => !sportCat || m.category_id === sportCat);
  sportList = sportList.filter((m) => matchesSportsDay(m.start_time, sportTab, now));

  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });

  return (
    <div className="bg-paper text-paper-foreground">
      <div className="flex justify-between overflow-x-auto border-b border-paper-border px-2 py-3 text-[11px] text-paper-muted">
        {[
          { i: LayoutGrid, l: "All Sports", a: () => { setSportCat(undefined); scrollTo("sports"); } },
          { i: Tv, l: "Live", a: () => scrollTo("live") },
          { i: Star, l: "Featured", a: () => scrollTo("featured") },
          { i: Trophy, l: "Football", a: () => { setSportCat(football); scrollTo("sports"); } },
          { i: CircleDot, l: "Basketball", a: () => { setSportCat(bySlug("basketball")); scrollTo("sports"); } },
          { i: Volleyball, l: "Tennis", a: () => { setSportCat(bySlug("tennis")); scrollTo("sports"); } },
          { i: Volleyball, l: "Volleyball", a: () => { setSportCat(bySlug("volleyball")); scrollTo("sports"); } },
          { i: MoreHorizontal, l: "Other", a: () => { setSportCat(undefined); scrollTo("sports"); } },
        ].map(({ i: I, l, a }) => (
          <button key={l} onClick={a} className="flex min-w-14 flex-col items-center gap-1 hover:text-paper-foreground">
            <I className="h-6 w-6 text-paper-foreground" />
            {l}
          </button>
        ))}
      </div>

      <div className="flex gap-2 overflow-x-auto px-3 py-3">
        {tiles.map((t) => (
          <button
            key={t.k}
            onClick={() => { setQuick(quick === t.k ? null : t.k); setLeague(null); }}
            className={cn("h-20 w-40 shrink-0 rounded-sm border-t-4 bg-paper p-2 text-left font-display text-lg font-bold uppercase leading-[1.05] shadow-md", t.c, quick === t.k && "ring-2 ring-primary")}
          >
            {t.t}
          </button>
        ))}
      </div>

      <section id="featured" className="border-t-8 border-paper-border">
        <div className="flex items-center gap-6 overflow-x-auto px-4 py-3 text-lg">
          <span className="border-r border-paper-border pr-5 font-display text-2xl font-bold">Featured</span>
          <span className="shrink-0 font-semibold text-primary">{quickTile ? quickTile.t : "Matches"}</span>
        </div>
        <div className="flex gap-2 overflow-x-auto px-3 pb-3">
          <button onClick={() => setLeague(null)} className={cn("shrink-0 rounded-full border px-4 py-1.5 text-sm", !league ? "border-paper-foreground font-semibold" : "border-paper-border")}>All</button>
          {leagues.map((l) => (
            <button key={l} onClick={() => setLeague(l)} className={cn("shrink-0 rounded-full border px-4 py-1.5 text-sm", league === l ? "border-paper-foreground font-semibold" : "border-paper-border")}>{l}</button>
          ))}
        </div>
        <div className="flex gap-3 overflow-x-auto bg-paper-border/60 px-3 py-3">
          {featured.length === 0 && <p className="px-2 py-6 text-sm text-paper-muted">No matches here right now.</p>}
          {featured.map((m) => {

            return (
              <div key={m.id} className="w-[85%] max-w-sm shrink-0 rounded-sm bg-paper p-3 shadow-sm">
                <Link to="/match/$id" params={{ id: m.id }} className="block">
                  <p className="truncate text-xs text-primary underline">{m.league}</p>
                  <div className="mt-2 grid grid-cols-3 items-center text-center">
                    <div className="flex flex-col items-center gap-1"><Crest name={m.home_team} src={m.home_crest} /><span className="w-full truncate text-xs text-paper-muted">{m.home_team}</span></div>
                    <div className="text-sm">
                      {m.status === "live" ? (
                        <><b className="text-lg">{m.home_score} - {m.away_score}</b><span className="flex items-center justify-center gap-1 text-xs text-paper-muted"><LiveBadge />{matchClock(m).main}</span></>
                      ) : (
                        <><b>{matchClock(m).main}</b><span className="block text-xs text-paper-muted">{matchClock(m).date}</span></>
                      )}
                      <span className="mt-2 block text-xs font-semibold text-primary">1X2</span>
                    </div>
                    <div className="flex flex-col items-center gap-1"><Crest name={m.away_team} src={m.away_crest} /><span className="w-full truncate text-xs text-paper-muted">{m.away_team}</span></div>
                  </div>
                </Link>
                <div className="mt-3 grid grid-cols-3 gap-1">
                  {hasOdds(m) ? ONE_X_TWO(m).map((x) => (
                    <OddsButton key={x.option} label={x.label} odds={x.odds} selected={isSelected(m.id, "1X2", x.option)} onClick={() => pick(m, "1X2", x.option, x.label, x.odds)} />
                  )) : <OddsUnavailable />}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section id="live" className="theme-dark bg-background text-foreground">
        <div className="flex items-center gap-6 overflow-x-auto px-4 py-4">
          <span className="border-r border-border pr-5 font-display text-2xl font-bold">LIVE</span>
          {cats.map((c) => (
            <button key={c.id} onClick={() => setLiveCat(c.id)} className={cn("shrink-0 text-base", liveCat === c.id ? "font-semibold text-primary" : "text-foreground/90")}>{c.name}</button>
          ))}
        </div>
        <div className="flex gap-6 overflow-x-auto border-b border-border px-4 text-sm">
          {["1X2", "O/U", "GG/NG", "Handicap", "Correct Score"].map((t, i) => (
            <span key={t} className={cn("shrink-0 pb-3", i === 0 ? "border-b-4 border-primary font-semibold" : "text-muted-foreground")}>{t}</span>
          ))}
        </div>
        <OddsHeader dark />
        {live.length === 0 && <p className="px-4 py-8 text-center text-sm text-muted-foreground">No live events in this sport right now.</p>}
        {live.map((m) => <MatchRow key={m.id} m={m} dark />)}
      </section>

      <section id="sports" className="pb-6">
        <div className="flex items-center gap-6 overflow-x-auto px-4 py-4">
          <span className="font-display text-2xl font-bold">Sports</span>
          {cats.map((c) => (
            <button key={c.id} onClick={() => setSportCat(c.id)} className={cn("shrink-0", sportCat === c.id ? "font-semibold text-primary" : "")}>{c.name}</button>
          ))}
        </div>
        <div className="grid grid-cols-3 border-b border-paper-border text-center">
          {(["highlights", "today", "tomorrow"] as const).map((t) => (
            <Button variant="ghost" key={t} onClick={() => setSportTab(t)} aria-pressed={sportTab === t} className={cn("h-auto rounded-none pb-3 capitalize", sportTab === t ? "border-b-4 border-primary font-semibold" : "text-paper-muted")}>{t}</Button>
          ))}
        </div>
        <OddsHeader />
        {sportList.length === 0 && <p className="px-4 py-8 text-center text-sm text-paper-muted">{sportTab === "tomorrow" ? "No matches scheduled for tomorrow." : "No matches."}</p>}
        {sportList.map((m) => <MatchRow key={m.id} m={m} />)}
      </section>
    </div>
  );
}

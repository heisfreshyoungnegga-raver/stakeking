import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { FD_COMPETITIONS, fdMatches, fdStandings, type FdMatch } from "@/lib/football-data.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/football")({
  head: () => ({
    meta: [
      { title: "Football Scores & Tables — StakeKing" },
      { name: "description", content: "Today's matches, live scores, fixtures and league tables for Europe's top leagues." },
      { property: "og:title", content: "Football Scores & Tables — StakeKing" },
      { property: "og:description", content: "Live scores, fixtures and standings for top European leagues." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Football,
});

type View = "today" | "live" | "upcoming" | "table";

function Football() {
  const [view, setView] = useState<View>("live");
  const [comp, setComp] = useState<string | undefined>(undefined);
  const getMatches = useServerFn(fdMatches);
  const getTable = useServerFn(fdStandings);
  const tableComp = comp ?? "PL";

  const matches = useQuery({
    queryKey: ["fd-matches", view, comp],
    enabled: view !== "table",
    queryFn: () => getMatches({ data: { view: view as "today", competition: comp } }),
    refetchInterval: view === "live" ? 60000 : false,
    staleTime: 30000,
  });
  const table = useQuery({
    queryKey: ["fd-table", tableComp],
    enabled: view === "table",
    queryFn: () => getTable({ data: { competition: tableComp } }),
    staleTime: 300000,
  });
  const q = view === "table" ? table : matches;
  const err = q.error ? "Something went wrong loading football data." : q.data?.error;

  return (
    <div className="min-h-[70vh] bg-paper text-paper-foreground">
      <div className="grid grid-cols-4 border-b border-paper-border text-center text-sm">
        {(["today", "live", "upcoming", "table"] as View[]).map((v) => (
          <button key={v} onClick={() => setView(v)} className={cn("py-3 capitalize", view === v ? "border-b-4 border-primary font-semibold" : "text-paper-muted")}>
            {v === "table" ? "Standings" : v}
          </button>
        ))}
      </div>
      <div className="flex gap-2 overflow-x-auto px-3 py-3">
        {view !== "table" && (
          <button onClick={() => setComp(undefined)} className={cn("shrink-0 rounded-full border px-3 py-1 text-xs", !comp ? "border-primary bg-primary text-primary-foreground" : "border-paper-border")}>All</button>
        )}
        {FD_COMPETITIONS.map((c) => {
          const on = view === "table" ? tableComp === c.code : comp === c.code;
          return (
            <button key={c.code} onClick={() => setComp(c.code)} className={cn("shrink-0 rounded-full border px-3 py-1 text-xs", on ? "border-primary bg-primary text-primary-foreground" : "border-paper-border")}>{c.name}</button>
          );
        })}
      </div>

      {q.isLoading && <div className="flex items-center justify-center gap-2 p-10 text-sm text-paper-muted"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>}
      {!q.isLoading && err && (
        <div className="m-4 rounded-sm border border-destructive/40 p-4 text-center text-sm">
          <p className="text-destructive">{err}</p>
          <button onClick={() => q.refetch()} className="mt-3 inline-flex items-center gap-1 font-semibold text-primary"><RefreshCw className="h-4 w-4" /> Try again</button>
        </div>
      )}

      {!q.isLoading && !err && view !== "table" && (
        matches.data?.data.length ? matches.data.data.map((m) => <Row key={m.id} m={m} />) : <p className="p-8 text-center text-sm text-paper-muted">No matches found.</p>
      )}

      {!q.isLoading && !err && view === "table" && (
        <table className="w-full text-sm">
          <thead className="text-xs text-paper-muted"><tr className="border-b border-paper-border">
            <th className="p-2 text-left">#</th><th className="text-left">Team</th><th>P</th><th>W</th><th>D</th><th>L</th><th>GD</th><th className="pr-3">Pts</th>
          </tr></thead>
          <tbody>
            {table.data?.data.map((r) => (
              <tr key={r.position} className="border-b border-paper-border text-center">
                <td className="p-2 text-left">{r.position}</td>
                <td className="text-left"><span className="flex items-center gap-2">{r.crest && <img src={r.crest} alt="" className="h-5 w-5" />}{r.team}</span></td>
                <td>{r.played}</td><td>{r.won}</td><td>{r.draw}</td><td>{r.lost}</td><td>{r.gd}</td><td className="pr-3 font-bold">{r.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Row({ m }: { m: FdMatch }) {
  const live = m.status === "IN_PLAY" || m.status === "PAUSED";
  const done = m.status === "FINISHED";
  const t = new Date(m.utcDate);
  return (
    <div className="flex items-center gap-3 border-b border-paper-border px-4 py-3">
      <div className="w-16 shrink-0 text-xs">
        {live ? <span className="font-bold text-live">{m.status === "PAUSED" ? "HT" : `LIVE${m.minute ? ` ${m.minute}'` : ""}`}</span>
          : done ? <span className="text-paper-muted">FT</span>
          : <><b>{t.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</b><span className="block text-paper-muted">{t.toLocaleDateString(undefined, { day: "numeric", month: "short" })}</span></>}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[11px] text-primary">{m.competition}</p>
        {[[m.home, m.homeCrest, m.homeScore], [m.away, m.awayCrest, m.awayScore]].map(([n, c, s], i) => (
          <div key={i} className="flex items-center justify-between text-sm">
            <span className="flex min-w-0 items-center gap-2 truncate">{c && <img src={c as string} alt="" className="h-4 w-4" />}{n}</span>
            <b>{live || done ? (s ?? 0) : ""}</b>
          </div>
        ))}
      </div>
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Search } from "lucide-react";
import { MatchRow, OddsHeader } from "@/components/match-ui";
import { categoriesQuery, matchesQuery } from "@/lib/betting";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/all-sports")({
  head: () => ({
    meta: [
      { title: "All Sports — StakeKing" },
      { name: "description", content: "Browse every sport, competition and league." },
      { property: "og:title", content: "All Sports — StakeKing" },
      { property: "og:description", content: "Browse every sport, competition and league." },
    ],
  }),
  component: AllSports,
});

function AllSports() {
  const { data: cats } = useQuery(categoriesQuery);
  const { data: matches } = useQuery(matchesQuery);
  const [cat, setCat] = useState<string | null>(null);
  const [league, setLeague] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const base = (matches ?? []).filter((m) => m.status !== "finished" && (!cat || m.category_id === cat));
  const leagues = [...new Set(base.map((m) => m.league))];
  const list = base.filter((m) => (!league || m.league === league) && (m.home_team + m.away_team + m.league).toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="min-h-[70vh] bg-paper text-paper-foreground">
      <div className="p-3">
        <label className="flex h-11 items-center gap-2 rounded-sm bg-paper-border px-3">
          <Search className="h-4 w-4 text-paper-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search teams or leagues" className="flex-1 bg-transparent text-sm outline-none" />
        </label>
      </div>
      <div className="flex gap-5 overflow-x-auto border-b border-paper-border px-4">
        <button onClick={() => { setCat(null); setLeague(null); }} className={cn("shrink-0 pb-3", !cat ? "border-b-4 border-primary font-semibold" : "text-paper-muted")}>All</button>
        {cats?.filter((c) => c.active).map((c) => (
          <button key={c.id} onClick={() => { setCat(c.id); setLeague(null); }} className={cn("shrink-0 pb-3", cat === c.id ? "border-b-4 border-primary font-semibold" : "text-paper-muted")}>{c.icon} {c.name}</button>
        ))}
      </div>
      <div className="flex gap-2 overflow-x-auto px-3 py-3">
        {leagues.map((l) => (
          <button key={l} onClick={() => setLeague(league === l ? null : l)} className={cn("shrink-0 rounded-full border px-3 py-1 text-xs", league === l ? "border-primary bg-primary text-primary-foreground" : "border-paper-border")}>{l}</button>
        ))}
      </div>
      <OddsHeader />
      {list.map((m) => <MatchRow key={m.id} m={m} />)}
      {list.length === 0 && <p className="p-8 text-center text-sm text-paper-muted">No matches found.</p>}
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { MatchRow, OddsHeader, useFixtureSync } from "@/components/match-ui";
import { categoriesQuery, matchesQuery } from "@/lib/betting";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/live")({
  head: () => ({
    meta: [
      { title: "Live Betting — StakeKing" },
      { name: "description", content: "In-play matches with live scores and odds." },
      { property: "og:title", content: "Live Betting — StakeKing" },
      { property: "og:description", content: "In-play matches with live scores and odds." },
    ],
  }),
  component: Live,
});

function Live() {
  useFixtureSync();
  const { data: cats } = useQuery(categoriesQuery);
  const { data: matches } = useQuery(matchesQuery);
  const [cat, setCat] = useState<string | null>(null);
  const list = (matches ?? []).filter((m) => m.visible && m.status === "live" && (!cat || m.category_id === cat));
  return (
    <div className="theme-dark min-h-[70vh] bg-background text-foreground">
      <div className="flex items-center gap-6 overflow-x-auto px-4 py-4">
        <span className="live-dot flex items-center border-r border-border pr-5 font-display text-2xl font-bold">LIVE</span>
        <button onClick={() => setCat(null)} className={cn("shrink-0", !cat ? "font-semibold text-primary" : "")}>All</button>
        {cats?.filter((c) => c.active).map((c) => (
          <button key={c.id} onClick={() => setCat(c.id)} className={cn("shrink-0", cat === c.id ? "font-semibold text-primary" : "")}>{c.name}</button>
        ))}
      </div>
      <OddsHeader dark />
      {list.map((m) => <MatchRow key={m.id} m={m} dark />)}
      {list.length === 0 && <p className="p-8 text-center text-sm text-muted-foreground">No live events right now.</p>}
    </div>
  );
}

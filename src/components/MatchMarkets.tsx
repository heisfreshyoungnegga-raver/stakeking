import { useState } from "react";
import { ChevronDown, ChevronUp, Star, Search, X, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePick, type Match } from "@/components/match-ui";
import { matchMarketSections, MARKET_TABS, LIVE_MARKET_TABS, type MarketSection } from "@/lib/match-markets";
import { livePriceSelectable } from "@/lib/live-match";
import { cn } from "@/lib/utils";

export function MatchMarkets({ match, available, live = false }: { match: Match; available: boolean; live?: boolean }) {
  const [tab, setTab] = useState("All");
  const [favorites, setFavorites] = useState<string[]>([]);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const sections = available || live ? matchMarketSections(match, live) : [];
  const shown = sections.filter((s) => (tab === "All" || s.category === tab) && (!favoritesOnly || favorites.includes(s.name)) && s.name.toLowerCase().includes(search.toLowerCase()));
  return <>
    <div className="sticky top-12 z-20 border-b border-paper-border bg-paper">
      <div className={cn("flex h-11 items-stretch px-2", live && "h-14 items-center")}>
        <Button variant="ghost" size="icon" aria-label={searchOpen ? "Close market search" : "Search markets"} onClick={() => { setSearchOpen(!searchOpen); setSearch(""); }} className="h-11 w-8 shrink-0 rounded-none text-paper-muted">{searchOpen ? <X /> : <Search />}</Button>
        <Button variant="ghost" size="icon" aria-label="Favorite markets" aria-pressed={favoritesOnly} onClick={() => setFavoritesOnly(!favoritesOnly)} className={cn("h-11 w-8 shrink-0 rounded-none", favoritesOnly ? "text-primary" : "text-paper-foreground")}><Star className={cn(favoritesOnly && "fill-current")} /></Button>
        <div role="tablist" aria-label="Market categories" className="flex min-w-0 flex-1 overflow-x-auto">
          {(live ? LIVE_MARKET_TABS : MARKET_TABS).map((name) => <Button key={name} role="tab" aria-selected={tab === name} variant="ghost" onClick={() => setTab(name)} className={cn("h-11 shrink-0 rounded-none border-b-2 px-3 text-xs font-bold", live && "h-14 px-3 text-sm", tab === name ? "border-primary text-paper-foreground" : "border-transparent text-paper-muted")}>{name}</Button>)}
        </div>
      </div>
      {searchOpen && <div className="px-3 pb-2"><Input autoFocus aria-label="Find a market" placeholder="Search markets" value={search} onChange={(e) => setSearch(e.target.value)} className="h-9 bg-paper text-paper-foreground" /></div>}
    </div>
    <div className="px-2 pb-28 sm:px-3">
      {!shown.length && <div className="py-10 text-center text-sm text-paper-muted">{!available ? "Odds unavailable" : favoritesOnly ? "No favorite markets" : "Odds unavailable"}</div>}
      {shown.map((section) => <MarketBlock key={`${match.id}-${section.name}`} section={section} match={match} live={live} available={available} favorite={favorites.includes(section.name)} toggleFavorite={() => setFavorites((prev) => prev.includes(section.name) ? prev.filter((n) => n !== section.name) : [...prev, section.name])} />)}
    </div>
  </>;
}

function MarketBlock({ section, match, favorite, toggleFavorite, live, available }: { section: MarketSection; match: Match; favorite: boolean; toggleFavorite: () => void; live: boolean; available: boolean }) {
  const [open, setOpen] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const { pick, isSelected } = usePick();
  const lineTable = section.rows.every((r) => r.line != null && r.picks.length === 2);
  const count = section.rows.reduce((sum, row) => sum + row.picks.length, 0);
  const long = count > 12 && !lineTable;
  const rows = section.rows.map((row) => ({ ...row, picks: long && !expanded ? row.picks.slice(0, 12) : row.picks }));
  return <section className={cn("border-b border-paper-border pb-2", live && "pb-3")} aria-label={section.name}>
    <div className="flex min-h-11 items-center gap-1">
      <Button variant="ghost" onClick={() => setOpen(!open)} aria-expanded={open} className={cn("h-auto min-h-11 min-w-0 flex-1 justify-start gap-2 rounded-none px-0 py-2 text-left text-[13px] font-normal text-paper-foreground hover:bg-transparent", live && "min-h-14 text-base")}>
        <ChevronDown className={cn("size-3 text-primary transition-transform", !open && "-rotate-90")} /><span className="whitespace-normal">{section.name === "GG/NG" ? "Both Teams to Score" : section.name}</span>
      </Button>
      <Button variant="ghost" size="icon" aria-label={`${favorite ? "Unfavorite" : "Favorite"} ${section.name}`} aria-pressed={favorite} onClick={toggleFavorite} className="h-8 w-8 text-paper-muted"><Star className={cn("size-3.5", favorite && "fill-current text-gold")} /></Button>
    </div>
    {open && <>
      {lineTable && <div className="mb-1 grid h-6 grid-cols-[3.5rem_1fr_1fr] gap-1 bg-paper-border text-center text-[11px] text-paper-muted"><span />{section.rows[0]?.picks.map((p) => <span key={p.option} className="self-center">{p.label}</span>)}</div>}
      <div className="space-y-1">
        {rows.map((row, i) => <div key={row.line ?? i} className={cn("grid gap-1", lineTable ? "grid-cols-[3.5rem_1fr_1fr]" : row.picks.length === 2 ? "grid-cols-2" : "grid-cols-3")}>
          {lineTable && <span className="grid min-h-9 place-items-center bg-paper-border text-xs text-paper-foreground">{row.line}</span>}
          {row.picks.map((p) => {
            const selected = isSelected(match.id, p.market, p.option);
            const selectable = livePriceSelectable(available, p.odds);
            return <Button key={p.option} variant="ghost" disabled={!selectable} aria-label={`${p.market} ${p.label} ${selectable ? p.odds.toFixed(2) : "unavailable"}`} aria-pressed={selected && selectable} onClick={() => { if (selectable) pick(match, p.market, p.option, p.label, p.odds); }} className={cn("h-auto min-h-9 min-w-0 gap-1 rounded-none px-2 py-1.5 text-[12px] font-bold tabular-nums", live && "live-odds min-h-12 text-sm", lineTable ? "justify-center" : "justify-between", selected ? "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground" : "bg-odds-soft/55 text-odds-soft-foreground hover:bg-odds-soft hover:text-odds-soft-foreground")}>
              {!lineTable && <span className={cn("min-w-0 whitespace-normal text-left text-[11px] font-semibold leading-tight", live && "text-xs")}>{p.label}</span>}<span className="shrink-0">{selectable ? p.odds.toFixed(2) : <LockKeyhole className="size-4" />}</span>
            </Button>;
          })}
        </div>)}
      </div>
      {long && <Button variant="ghost" onClick={() => setExpanded(!expanded)} className="mt-1 h-8 w-full rounded-none text-xs text-paper-foreground">{expanded ? "Show less" : "Show all"}{expanded ? <ChevronUp /> : <ChevronDown />}</Button>}
    </>}
  </section>;
}
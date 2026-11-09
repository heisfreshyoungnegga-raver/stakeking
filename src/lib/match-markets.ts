import type { Match, Markets } from "@/components/match-ui";

export type MarketPick = { market: string; option: string; label: string; odds: number };
export type MarketSection = { name: string; category: string; rows: { line?: string | undefined; picks: MarketPick[] }[] };
export const MARKET_TABS = ["All", "Main", "Goals", "Half", "Handicap", "Correct Score", "Double Chance"];
export const LIVE_MARKET_TABS = ["All", "Main", "Goals", "Corners", "Half", "Cards"];

export function marketCategory(name: string) {
  if (/corner/i.test(name)) return "Corners";
  if (/card|booking/i.test(name)) return "Cards";
  if (/half|\bht\b/i.test(name)) return "Half";
  if (/handicap|spread/i.test(name)) return "Handicap";
  if (/correct score/i.test(name)) return "Correct Score";
  if (/over\/under|total|gg\/ng|both teams|goal/i.test(name)) return "Goals";
  if (name === "Double Chance") return "Double Chance";
  if (name === "1X2") return "Main";
  return "Other";
}

/** Keep provider market/option keys intact for selections and price-change checks. */
export function matchMarketSections(m: Match, includeSuspended = false): MarketSection[] {
  const source: [string, Record<string, number>][] = [
    ["1X2", { home: Number(m.odds_home), draw: Number(m.odds_draw), away: Number(m.odds_away) }],
    ...Object.entries((m.markets ?? {}) as Markets).filter(([name]) => name !== "1X2"),
  ];
  const sections: MarketSection[] = [];
  for (const [market, outcomes] of source) {
    if (!outcomes || typeof outcomes !== "object" || Array.isArray(outcomes)) continue;
    const picks = Object.entries(outcomes).filter(([, price]) => includeSuspended || (typeof price === "number" && Number.isFinite(price) && price > 1))
      .map(([option, odds]) => ({ market, option, odds, label: market === "1X2" ? ({ home: "Home", draw: "Draw", away: "Away" }[option] ?? option) : market === "Double Chance" ? ({ "1X": "Home or Draw", "X2": "Draw or Away", "12": "Home or Away" }[option] ?? option) : option }));
    if (!picks.length) continue;
    if (market === "Double Chance") {
      const order = ["1X", "X2", "12"];
      picks.sort((a, b) => order.indexOf(a.option) - order.indexOf(b.option));
    }
    const total = market.match(/^(.*Over\/Under)\s+(-?\d+(?:\.\d+)?)$/i);
    const name = total?.[1] ?? market;
    const existing = sections.find((section) => section.name === name);
    const row = { line: total?.[2], picks };
    if (existing) existing.rows.push(row);
    else sections.push({ name, category: marketCategory(market), rows: [row] });
  }
  for (const section of sections) {
    if (section.rows.every((row) => row.line !== undefined)) {
      section.rows.sort((a, b) => Number(a.line) - Number(b.line));
      for (const row of section.rows) {
        row.picks.sort((a, b) => (a.option === "Over" ? 0 : 1) - (b.option === "Over" ? 0 : 1));
      }
    }
  }
  return sections;
}
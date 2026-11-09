import { describe, expect, it } from "vitest";
import { matchMarketSections, marketCategory } from "./match-markets";
import type { Match } from "@/components/match-ui";

const fixture = (markets: object) => ({ odds_home: 1.8, odds_draw: 3.4, odds_away: 4.2, markets }) as Match;
describe("provider-only match markets", () => {
  it("keeps all five requested goal lines ordered with exact provider selection keys", () => {
    const lines = [5.5, 3.5, 1.5, 4.5, 2.5];
    const markets = Object.fromEntries(lines.map((line) => [`Over/Under ${line}`, { Under: 1.8, Over: 2.1 }]));
    const rows = matchMarketSections(fixture(markets)).find((section) => section.name === "Over/Under")?.rows;
    expect(rows?.map((row) => row.line)).toEqual(["1.5", "2.5", "3.5", "4.5", "5.5"]);
    expect(rows?.map((row) => row.picks.map((pick) => [pick.market, pick.option, pick.odds]))).toEqual(
      [1.5, 2.5, 3.5, 4.5, 5.5].map((line) => [[`Over/Under ${line}`, "Over", 2.1], [`Over/Under ${line}`, "Under", 1.8]])
    );
  });
  it("does not invent missing markets or predictions", () => {
    expect(matchMarketSections(fixture({})).map((s) => s.name)).toEqual(["1X2"]);
  });
  it("groups total lines without changing the exact selection keys or prices", () => {
    const sections = matchMarketSections(fixture({ "Over/Under 1.5": { Over: 1.25, Under: 4.8 }, "Over/Under 2.5": { Over: 1.9, Under: 1.95 } }));
    expect(sections[1]?.rows[1]).toEqual({ line: "2.5", picks: [{ market: "Over/Under 2.5", option: "Over", label: "Over", odds: 1.9 }, { market: "Over/Under 2.5", option: "Under", label: "Under", odds: 1.95 }] });
  });
  it("excludes invalid or suspended prices", () => {
    expect(matchMarketSections(fixture({ Corners: { Over: 0, Under: NaN, Yes: 2.4 } }))[1]?.rows[0]?.picks.map((p) => p.option)).toEqual(["Yes"]);
  });
  it("retains supplied suspended live outcomes for disabled display and recognises Cards", () => {
    expect(matchMarketSections(fixture({ Cards: { Over: 0, Under: 2.4 } }), true)[1]?.rows[0]?.picks.map((p) => p.odds)).toEqual([0, 2.4]);
    expect(marketCategory("Total Cards")).toBe("Cards");
  });
  it("keeps fixture markets separate", () => {
    expect(matchMarketSections(fixture({ "Correct Score": { "1:0": 7 } })).some((s) => s.name === "Correct Score")).toBe(true);
    expect(matchMarketSections(fixture({})).some((s) => s.name === "Correct Score")).toBe(false);
  });
  it("recognises API half-time and corner markets", () => {
    expect(marketCategory("Half Time/Full Time")).toBe("Half");
    expect(marketCategory("Corners Over/Under 9.5")).toBe("Corners");
  });
  it("keeps double-chance selection keys while giving their full meanings", () => {
    const section = matchMarketSections(fixture({ "Double Chance": { "1X": 1.3, "X2": 1.8, "12": 1.2 } })).find((s) => s.name === "Double Chance");
    expect(section?.rows[0]?.picks).toEqual([
      { market: "Double Chance", option: "1X", label: "Home or Draw", odds: 1.3 },
      { market: "Double Chance", option: "X2", label: "Draw or Away", odds: 1.8 },
      { market: "Double Chance", option: "12", label: "Home or Away", odds: 1.2 },
    ]);
  });
});
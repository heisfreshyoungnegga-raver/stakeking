import { describe, expect, it } from "vitest";
import { findEvent, priceEvent, sameTeam, scoreOption, withCorrectScore, type OddsEvent } from "./odds-matching";

const ev = (id: string, ko: string, h: string, a: string, books: OddsEvent["bookmakers"] = []): OddsEvent => ({ id, commence_time: ko, home_team: h, away_team: a, bookmakers: books });
const h2h = (h: string, a: string, ph: number, pd: number, pa: number) => ({ key: "h2h", last_update: "2026-11-07T19:00:00Z", outcomes: [{ name: h, price: ph }, { name: "Draw", price: pd }, { name: a, price: pa }] });

describe("odds fixture matching", () => {
  it("maps genuine Double Chance prices and rejects stale or invalid coverage", () => {
    const base = ev("dc", "2026-11-08T19:45:00Z", "Fiorentina", "Juventus", [{ key: "williamhill", title: "William Hill", last_update: "2026-11-08T18:49:16Z", markets: [h2h("Fiorentina", "Juventus", 3, 3.2, 2.4)] }]);
    const detail: OddsEvent = { ...base, bookmakers: [{ key: "williamhill", title: "William Hill", last_update: "2026-11-08T18:49:16Z", markets: [{ key: "double_chance", last_update: "2026-11-08T18:49:16Z", outcomes: [{ name: "Fiorentina or Draw", price: 1.67 }, { name: "Juventus or Draw", price: 1.3 }, { name: "Fiorentina or Juventus", price: 1.3 }] }] }] };
    const now = Date.parse("2026-11-08T18:50:00Z");
    expect(priceEvent(withCorrectScore(base, detail, now))?.markets["Double Chance"]).toEqual({ "1X": 1.67, "X2": 1.3, "12": 1.3 });
    expect(priceEvent(withCorrectScore(base, detail, now + 30 * 60_000))?.markets["Double Chance"]).toBeUndefined();
    const invalid: OddsEvent = { ...detail, bookmakers: detail.bookmakers.map((b) => ({ ...b, markets: b.markets.map((m) => ({ ...m, outcomes: m.outcomes.map((o) => ({ ...o, price: 0 })) })) })) };
    expect(priceEvent(withCorrectScore(base, invalid, now))?.markets["Double Chance"]).toBeUndefined();
  });
  it("includes every paired alternate total, including 1.5 and higher, without inventing missing lines", () => {
    const base = ev("totals", "2026-11-08T19:45:00Z", "Fiorentina", "Juventus", [{ key: "williamhill", title: "William Hill", last_update: "2026-11-08T18:24:38Z", markets: [h2h("Fiorentina", "Juventus", 3, 3.2, 2.4)] }]);
    const detail: OddsEvent = { ...base, bookmakers: [{ key: "williamhill", title: "William Hill", last_update: "2026-11-08T18:24:38Z", markets: [{ key: "alternate_totals", last_update: "2026-11-08T18:24:38Z", outcomes: [
      { name: "Over", price: 1.25, point: 1.5 }, { name: "Over", price: 1.85, point: 2.5 },
      { name: "Under", price: 3.6, point: 1.5 }, { name: "Under", price: 1.91, point: 2.5 },
      { name: "Over", price: 3, point: 3.5 }, { name: "Under", price: 1.4, point: 3.5 },
      { name: "Over", price: 6, point: 4.5 },
    ] }] }] };
    const markets = priceEvent(withCorrectScore(base, detail, Date.parse("2026-11-08T18:25:00Z")))?.markets;
    expect(markets).toEqual({ "Over/Under 1.5": { Over: 1.25, Under: 3.6 }, "Over/Under 2.5": { Over: 1.85, Under: 1.91 }, "Over/Under 3.5": { Over: 3, Under: 1.4 } });
    expect(priceEvent(withCorrectScore(base, detail, Date.parse("2026-11-08T19:00:00Z")))?.markets).toEqual({});
  });
  it("maps actual provider Correct Score prices with home-first orientation", () => {
    expect(scoreOption("Hoffenheim:1|Schalke:0", "Hoffenheim", "Schalke")).toBe("1:0");
    expect(scoreOption("Schalke:2|Hoffenheim:0", "Hoffenheim", "Schalke")).toBe("0:2");
    expect(scoreOption("Other:1|Schalke:0", "Hoffenheim", "Schalke")).toBeNull();
    const base = ev("score-event", "2026-11-08T18:30:00Z", "Hoffenheim", "Schalke", [{ key: "williamhill", title: "William Hill", last_update: "2026-11-08T18:19:56Z", markets: [h2h("Hoffenheim", "Schalke", 1.53, 4.2, 5)] }]);
    const detail: OddsEvent = { ...base, bookmakers: [{ key: "williamhill", title: "William Hill", last_update: "2026-11-08T18:20:19Z", markets: [{ key: "correct_score", last_update: "2026-11-08T18:20:19Z", outcomes: [{ name: "Hoffenheim:1|Schalke:0", price: 9.5 }, { name: "Schalke:2|Hoffenheim:0", price: 29 }] }] }] };
    const now = Date.parse("2026-11-08T18:21:00Z");
    expect(priceEvent(withCorrectScore(base, detail, now))?.markets["Correct Score"]).toEqual({ "1:0": 9.5, "0:2": 29 });
    expect(priceEvent(withCorrectScore(base, { ...detail, id: "wrong-event" }, now))?.markets["Correct Score"]).toBeUndefined();
    expect(priceEvent(withCorrectScore(base, detail, now + 30 * 60_000))?.markets["Correct Score"]).toBeUndefined();
    const differentBook = { ...detail, bookmakers: detail.bookmakers.map((b) => ({ ...b, key: "skybet" })) };
    expect(priceEvent(withCorrectScore(base, differentBook, now))?.markets["Correct Score"]).toBeUndefined();
  });
  it("matches club name variants", () => {
    expect(sameTeam("Manchester City FC", "Manchester City")).toBe(true);
    expect(sameTeam("FC Internazionale Milano", "Inter Milan")).toBe(true);
    expect(sameTeam("Manchester City FC", "Manchester United")).toBe(true); // shared word, so kickoff + opponent must also match
  });
  it("never attaches odds from another match", () => {
    const f = { id: "x", start_time: "2026-11-08T14:00:00Z", names: { home: ["Crystal Palace FC"], away: ["Liverpool FC"] } };
    const events = [ev("1", "2026-11-08T14:00:00Z", "Brighton and Hove Albion", "Brentford"), ev("2", "2026-11-08T16:30:00Z", "Crystal Palace", "Liverpool")];
    expect(findEvent(f, events)).toBeNull(); // right teams, wrong kickoff
    expect(findEvent(f, [...events, ev("3", "2026-11-08T14:00:00Z", "Crystal Palace", "Liverpool")])?.id).toBe("3");
    expect(findEvent(f, [ev("4", "2026-11-08T14:00:00Z", "Liverpool", "Crystal Palace")])).toBeNull(); // reversed home/away
  });
  it("uses one bookmaker's real prices and returns null without 1X2", () => {
    const e = ev("1", "2026-11-08T14:00:00Z", "Crystal Palace", "Liverpool", [
      { key: "skybet", title: "Sky Bet", last_update: "x", markets: [h2h("Crystal Palace", "Liverpool", 4.2, 3.9, 1.8), { key: "totals", outcomes: [{ name: "Over", price: 1.7, point: 2.5 }, { name: "Under", price: 2.1, point: 2.5 }] }] },
    ]);
    const p = priceEvent(e)!;
    expect([p.home, p.draw, p.away, p.bookmaker]).toEqual([4.2, 3.9, 1.8, "Sky Bet"]);
    expect(p.markets["Over/Under 2.5"]).toEqual({ Over: 1.7, Under: 2.1 });
    expect(priceEvent(ev("2", "x", "A", "B", [{ key: "skybet", title: "Sky Bet", last_update: "x", markets: [] }]))).toBeNull();
  });
});

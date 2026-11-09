import { describe, expect, it } from "vitest";
import { detectBetResult, type ResultBet } from "../lib/bet-results";
const open: ResultBet = { id: "ticket", status: "open", potential_win: 1095.92, cashed_out: 0 };
describe("confirmed bet results", () => {
  it("announces a newly confirmed win with its actual return", () => {
    expect(detectBetResult(open, { ...open, status: "won" })).toEqual({ betId: "ticket", kind: "won", amount: 1095.92 });
  });
  it("announces confirmed full cashout", () => {
    expect(detectBetResult(open, { ...open, status: "cashed_out", cashed_out: 9.05 })).toEqual({ betId: "ticket", kind: "cashout", amount: 9.05 });
  });
  it("announces only the newly credited partial cashout", () => {
    expect(detectBetResult({ ...open, cashed_out: 5 }, { ...open, cashed_out: 7.3 })).toEqual({ betId: "ticket", kind: "cashout", amount: 2.3 });
  });
  it("does not announce historical results or unchanged running bets", () => {
    expect(detectBetResult(undefined, { ...open, status: "won" })).toBeNull();
    expect(detectBetResult(open, open)).toBeNull();
    expect(detectBetResult({ ...open, status: "won" }, { ...open, status: "won" })).toBeNull();
  });
});
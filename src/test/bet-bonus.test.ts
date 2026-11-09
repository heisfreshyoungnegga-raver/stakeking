import { expect, it } from "vitest";
import { betBonus } from "../lib/bet-bonus";
it("adds a 3 percent bonus to multiple-bet potential winnings", () => {
  expect(betBonus(100, 3.47, 2)).toEqual({ rate: 0.03, bonus: 10.41, payout: 357.41 });
});
it("does not add multiple-bet bonus to a single selection", () => {
  expect(betBonus(100, 3.47, 1)).toEqual({ rate: 0, bonus: 0, payout: 347 });
});
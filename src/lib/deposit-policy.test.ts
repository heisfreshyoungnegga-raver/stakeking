import { describe, expect, it } from "vitest";
import { verifiedDepositCreditGhs } from "./deposit-policy";

describe("verified deposit credits", () => {
  it("credits exactly GHS 1 for GHS 1 paid", () => {
    expect(verifiedDepositCreditGhs(100)).toBe(1);
    expect(verifiedDepositCreditGhs(1250)).toBe(12.5);
  });
});
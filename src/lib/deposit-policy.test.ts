import { describe, expect, it } from "vitest";
import { verifiedDepositCreditGhs } from "./deposit-policy";

describe("verified deposit credits", () => {
  it("credits exactly the amount paid", () => {
    expect(verifiedDepositCreditGhs(20000)).toBe(200);
    expect(verifiedDepositCreditGhs(25050)).toBe(250.5);
  });
  it("refuses amounts below the GHS 200 minimum", () => {
    expect(() => verifiedDepositCreditGhs(100)).toThrow("Invalid deposit amount");
  });
});
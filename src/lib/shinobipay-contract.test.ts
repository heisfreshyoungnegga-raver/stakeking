import { describe, expect, it } from "vitest";
import { assertIntentMatches, eventAmountMatchesIntent, GHANA_PAYMENT_METHODS, paymentStatusLabel, requestedAmountMinor, safePaymentRedirect, shinobiIntentSchema, shinobiOtpSchema, shinobiPhone, verifiedQuote } from "./shinobipay-contract";

describe("ShinobiPay deposit contract", () => {
  it("uses only the documented GHS payment types, not manual bank transfers", () => {
    expect(GHANA_PAYMENT_METHODS.map((method) => method.method)).toEqual(["mobile_money", "mobile_money", "mobile_money", "card"]);
  });
  it("never treats an unknown payment as failed or successful", () => {
    expect(paymentStatusLabel("unknown")).toBe("Pending");
    expect(paymentStatusLabel("requires_action")).toBe("Pending");
    expect(paymentStatusLabel("succeeded")).toBe("Successful");
    expect(paymentStatusLabel("failed")).toBe("Failed");
  });
  it("requires the exact GHS 1 deposit amount before verification", () => {
    const intent = shinobiIntentSchema.parse({ id: "pi_test", amount: 100, currency: "GHS", status: "succeeded", reference: "stakeking-test" });
    expect(() => assertIntentMatches(intent, { amountMinor: 100, reference: "stakeking-test" })).not.toThrow();
    expect(() => assertIntentMatches(intent, { amountMinor: 100, reference: "another-user" })).toThrow();
  });
  it("verifies a 102 grossed charge for a 100 requested deposit as 100, never 102", () => {
    const intent = shinobiIntentSchema.parse({ id: "pi_test", amount: 102, merchant_amount: 100, currency: "GHS", status: "succeeded", reference: "stakeking-test" });
    expect(requestedAmountMinor(intent)).toBe(100);
    expect(() => assertIntentMatches(intent, { amountMinor: 100, reference: "stakeking-test" })).not.toThrow();
    expect(() => assertIntentMatches(intent, { amountMinor: 102, reference: "stakeking-test" })).toThrow();
  });
  it("still verifies a legacy intent with no merchant_amount against amount", () => {
    const intent = shinobiIntentSchema.parse({ id: "pi_test", amount: 100, currency: "GHS", status: "succeeded", reference: "stakeking-test" });
    expect(requestedAmountMinor(intent)).toBe(100);
    expect(() => assertIntentMatches(intent, { amountMinor: 100, reference: "stakeking-test" })).not.toThrow();
    expect(() => assertIntentMatches({ ...intent, amount: 102 }, { amountMinor: 100, reference: "stakeking-test" })).toThrow();
  });
  it("still throws on a real mismatch: wrong merchant_amount, wrong id, wrong reference", () => {
    const intent = shinobiIntentSchema.parse({ id: "pi_test", amount: 102, merchant_amount: 100, currency: "GHS", status: "succeeded", reference: "stakeking-test" });
    expect(() => assertIntentMatches({ ...intent, merchant_amount: 99 }, { amountMinor: 100, reference: "stakeking-test" })).toThrow();
    expect(() => assertIntentMatches(intent, { id: "pi_other", amountMinor: 100, reference: "stakeking-test" })).toThrow();
    expect(() => assertIntentMatches(intent, { amountMinor: 100, reference: "another-user" })).toThrow();
  });
  it("accepts a webhook event amount matching either the grossed or requested amount", () => {
    const intent = shinobiIntentSchema.parse({ id: "pi_test", amount: 102, merchant_amount: 100, currency: "GHS", status: "succeeded", reference: "stakeking-test" });
    expect(eventAmountMatchesIntent(102, intent)).toBe(true);
    expect(eventAmountMatchesIntent(100, intent)).toBe(true);
    expect(eventAmountMatchesIntent(101, intent)).toBe(false);
  });
  it("parses a verify-number quote only when verified, promptable and the total is exact", () => {
    const response = { verified: true, can_prompt: true, account_name: "AMA SERWAA", phone: "233244123456", network: "MTN", amount: { requested_minor: 25000, customer_fee_minor: 625, total_minor: 25625, currency: "GHS" } };
    expect(verifiedQuote(response, 25000)).toEqual({ accountName: "AMA SERWAA", requestedMinor: 25000, feeMinor: 625, totalMinor: 25625, currency: "GHS" });
    expect(verifiedQuote({ ...response, verified: false }, 25000)).toBeNull();
    expect(verifiedQuote({ ...response, can_prompt: false }, 25000)).toBeNull();
    expect(verifiedQuote(response, 26000)).toBeNull();
    expect(verifiedQuote({ ...response, amount: { ...response.amount, total_minor: 25000 } }, 25000)).toBeNull();
    expect(verifiedQuote({}, 25000)).toBeNull();
  });
  it("normalizes Ghana numbers to canonical 233 form", () => {
    expect(shinobiPhone("0244123456")).toBe("233244123456");
    expect(shinobiPhone("+233244123456")).toBe("233244123456");
    expect(shinobiPhone("233244123456")).toBe("233244123456");
    expect(() => shinobiPhone("12345")).toThrow();
  });
  it("accepts only 4–8 digit one-time payment codes", () => {
    expect(shinobiOtpSchema.safeParse("123456").success).toBe(true);
    expect(shinobiOtpSchema.safeParse("1234").success).toBe(true);
    expect(shinobiOtpSchema.safeParse("123").success).toBe(false);
    expect(shinobiOtpSchema.safeParse("123456789").success).toBe(false);
    expect(shinobiOtpSchema.safeParse("12a456").success).toBe(false);
  });
  it("rejects unsafe redirect origins, credentials and insecure URLs", () => {
    expect(safePaymentRedirect("https://akwapay.vercel.app/checkout/pi_test")).toBe("https://akwapay.vercel.app/checkout/pi_test");
    expect(safePaymentRedirect("https://attacker.example/pay")).toBeNull();
    expect(safePaymentRedirect("http://akwapay.vercel.app/pay")).toBeNull();
    expect(safePaymentRedirect("https://akwapay.vercel.app/pay?cs=example")).toBeNull();
  });
});
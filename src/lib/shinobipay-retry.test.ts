import { describe, expect, it } from "vitest";
import { retryAfterMs } from "./shinobipay-retry";

describe("ShinobiPay Retry-After", () => {
  it("honours the provider's waiting period in seconds", () => {
    expect(retryAfterMs("120", 0)).toBe(120000);
  });
  it("honours the provider's HTTP date", () => {
    expect(retryAfterMs("Sat, 07 Nov 2026 05:12:00 GMT", Date.parse("2026-11-07T05:10:00Z"))).toBe(120000);
  });
  it("backs off when the provider omits its waiting period", () => {
    expect(retryAfterMs(null, 0)).toBe(60000);
  });
});
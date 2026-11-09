import { describe, expect, it } from "vitest";
import { evaluatePaymentReadiness } from "./shinobipay-readiness";

const configured = { requested: true, webhookSecretPresent: true };
describe("Payment verification safety", () => {
  it("permits configured test payments", () => {
    expect(evaluatePaymentReadiness({ ...configured, mode: "test", accountMode: "test" }).ready).toBe(true);
  });
  it("keeps real-money payments disabled even with matching live credentials", () => {
    const result = evaluatePaymentReadiness({ ...configured, mode: "live", accountMode: "live" });
    expect(result.ready).toBe(false);
    expect(result.liveEnabled).toBe(false);
  });
  it("rejects live credentials for test payments", () => {
    expect(evaluatePaymentReadiness({ ...configured, mode: "test", accountMode: "live" }).ready).toBe(false);
  });
  it("requires a webhook secret for test verification", () => {
    expect(evaluatePaymentReadiness({ ...configured, webhookSecretPresent: false, mode: "test", accountMode: "test" }).ready).toBe(false);
  });
  it("respects the enabled request", () => {
    expect(evaluatePaymentReadiness({ ...configured, requested: false, mode: "test", accountMode: "test" }).ready).toBe(false);
  });
});
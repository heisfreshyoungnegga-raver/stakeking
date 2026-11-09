export function evaluatePaymentReadiness(input: { requested: boolean; webhookSecretPresent: boolean; mode: "test" | "live"; accountMode: "test" | "live" }) {
  let reason = "Ready for test payments; no wallet credit or real money.";
  if (!input.requested) reason = "Payments are switched off in Admin.";
  else if (!input.webhookSecretPresent) reason = "Save your ShinobiPay webhook secret in Admin.";
  else if (input.mode === "live") reason = "Real-money deposits are disabled until payment verification and real-money accounting are complete. Select Test in Admin to verify payments.";
  else if (input.accountMode !== "test") reason = "Test mode requires a ShinobiPay test API key or connected test account. Real-money payments remain disabled.";
  return { ready: input.requested && input.webhookSecretPresent && input.mode === "test" && input.accountMode === "test", liveEnabled: false as const, reason };
}
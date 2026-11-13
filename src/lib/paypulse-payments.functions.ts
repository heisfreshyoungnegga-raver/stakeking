import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// StakeKing engine build: PayPulse instant MoMo (Prince, 2026-11-13).
// These functions keep the same server-function shape as the retired
// ShinobiPay plumbing, but the work happens on the platform backend
// (the PrimeStake/Oddaroa engine, reached through its adapter RPCs).
// PayPulse flow: create a payment -> the engine returns a checkout_url
// -> the player is redirected there and approves the USSD prompt on
// their phone -> the signed webhook credits the wallet. There is no
// verify-number step (PayPulse resolves the network from the phone)
// and no OTP step, and crediting only ever happens from the webhook.

const paypulseNetworkSchema = z.enum(["mtn", "telecel", "airteltigo", "at"]);

type PayPulseMethod = { id: string; method: string; label: string };

async function adapterRpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { getRequest } = await import("@tanstack/react-start/server");
  const auth = getRequest()?.headers.get("authorization");
  if (!auth) throw new Error("Unauthorized: No authorization header provided");
  const base = (process.env["SUPABASE_URL"] ?? "").replace(/\/+$/, "");
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"] ?? "";
  const resp = await fetch(`${base}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { Authorization: auth, apikey: key, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  const data: unknown = await resp.json().catch(() => null);
  if (!resp.ok) {
    const message = (data as { message?: string } | null)?.message ?? `Payment service error (${resp.status})`;
    throw new Error(message);
  }
  return data as T;
}

export const getPayPulseReadiness = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).handler(async () => {
  try {
    const result = await adapterRpc<{ ready: boolean; accountMode: "live" | "test" | null; reason: string; methods: PayPulseMethod[] }>("payment_readiness", {});
    return { ready: result.ready, liveEnabled: result.ready && result.accountMode === "live", accountMode: result.accountMode, reason: result.reason, retryAt: 0, methods: [...result.methods], methodSource: "documented_ghs" as const };
  } catch (error) {
    return { ready: false, liveEnabled: false as const, accountMode: null, reason: error instanceof Error ? error.message : "PayPulse account check failed.", retryAt: 0, methods: [], methodSource: "unavailable" as const };
  }
});

export const createPayPulsePayment = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ amountMinor: z.number().int().min(20000).max(500000), network: paypulseNetworkSchema }).parse(input))
  .handler(async ({ data }) => {
    const result = await adapterRpc<{ id: string | null; status: string; reference: string; checkout_url: string | null; expires_at: string | null; fee_ghs: number | null; reason: string; action: { type: string; redirectUrl: string | null; expiresAt: string | null; ussdFallback: string | null } }>("deposit_create", {
      _amount_minor: data.amountMinor,
      _method: "mobile_money",
      _network: data.network,
    });
    return { id: result.id, status: result.status, reference: result.reference, checkoutUrl: result.checkout_url, expiresAt: result.expires_at, feeGhs: result.fee_ghs, reason: result.reason, action: result.action };
  });

export const checkPayPulsePayment = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().min(1).max(200) }).parse(input))
  .handler(async ({ data }) => {
    return adapterRpc<{ status: string; credited: boolean; webhookVerified: boolean; action: { type: string; redirectUrl: string | null; expiresAt: string | null; ussdFallback: string | null } }>("deposit_status", { _id: data.id });
  });

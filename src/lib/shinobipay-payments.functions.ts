import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { shinobiNetworkSchema, shinobiOtpSchema, type ShinobiQuote, type publicPaymentAction, GHANA_PAYMENT_METHODS } from "./shinobipay-contract";

type PaymentAction = ReturnType<typeof publicPaymentAction>;
type GhanaMethod = (typeof GHANA_PAYMENT_METHODS)[number];

// StakeKing engine build: these functions keep their exact exported
// names and return shapes, but the work happens on the platform
// backend (the PrimeStake/Oddaroa engine, reached through its
// adapter RPCs) instead of this app's old test-mode plumbing. Live
// is the only mode now: verify-number first, one prompt per
// confirmation, OTP step when the provider asks, and crediting only
// ever from the provider webhook on the backend.

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

export const getPaymentReadiness = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).handler(async () => {
  try {
    const result = await adapterRpc<{ ready: boolean; accountMode: "live" | "test" | null; reason: string; methods: GhanaMethod[] }>("payment_readiness", {});
    return { ready: result.ready, liveEnabled: result.ready && result.accountMode === "live", accountMode: result.accountMode, reason: result.reason, retryAt: 0, methods: [...result.methods], methodSource: "documented_ghs" as const };
  } catch (error) {
    return { ready: false, liveEnabled: false as const, accountMode: null, reason: error instanceof Error ? error.message : "ShinobiPay account check failed.", retryAt: 0, methods: [], methodSource: "unavailable" as const };
  }
});

export const verifyShinobiPaymentNumber = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ amountMinor: z.number().int().min(100).max(500000), method: z.enum(["mobile_money", "card"]).default("mobile_money"), network: shinobiNetworkSchema.optional() }).refine((input) => input.method !== "mobile_money" || Boolean(input.network), "Select a mobile money network").parse(input))
  .handler(async ({ data }) => {
    if (data.method !== "mobile_money" || !data.network) throw new Error("Number verification is only for mobile money payments.");
    const result = await adapterRpc<{ ok: boolean; quote: ShinobiQuote | null; error: string; retryAfter: number }>("deposit_verify_number", {
      _amount_minor: data.amountMinor,
      _network: data.network,
    });
    if (!result.ok || !result.quote) return { ok: false as const, error: result.error || "Number verification failed.", retryAfter: result.retryAfter ?? 0, quote: null };
    return { ok: true as const, quote: result.quote, error: "", retryAfter: 0 };
  });

export const createTestPayment = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ amountMinor: z.number().int().min(100).max(500000), method: z.enum(["mobile_money", "card"]).default("mobile_money"), network: shinobiNetworkSchema.optional(), attemptId: z.string().uuid() }).refine((input) => input.method !== "mobile_money" || Boolean(input.network), "Select a mobile money network").parse(input))
  .handler(async ({ data, context }) => {
    const result = await adapterRpc<{ id: string | null; status: string; reference: string; retryAt: number; reason: string; action: PaymentAction }>("deposit_create", {
      _amount_minor: data.amountMinor,
      _method: data.method,
      _network: data.network ?? null,
      _attempt_id: data.attemptId,
    });
    // Keep the attempts list live: bind the intent into the payment
    // bookkeeping the history view reads. Best effort only; the
    // wallet credit never depends on it.
    if (result.id) {
      try {
        await context.supabase.rpc("bind_shinobipay_test_intent", {
          _reference: result.reference,
          _intent: result.id,
          _amount: data.amountMinor,
          _status: result.status,
        });
      } catch { /* history binding is cosmetic */ }
    }
    return { id: result.id, status: result.status, reference: result.reference, retryAt: 0, reason: "", action: result.action };
  });

export const checkTestPayment = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().regex(/^pi_[A-Za-z0-9_-]+$/).max(200) }).parse(input))
  .handler(async ({ data }) => {
    return adapterRpc<{ status: string; credited: boolean; webhookVerified: boolean; action: PaymentAction }>("deposit_status", { _id: data.id });
  });

export const submitShinobiOtp = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().regex(/^pi_[A-Za-z0-9_-]+$/).max(200), otp: shinobiOtpSchema }).parse(input))
  .handler(async ({ data }) => {
    return adapterRpc<{ status: string; credited: boolean; webhookVerified: boolean; action: PaymentAction; otpError: string }>("deposit_otp", { _id: data.id, _otp: data.otp });
  });

export const getMyPaymentAttempts = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { data, error } = await context.supabase.from("shinobipay_deposits").select("id,intent_id,reference,amount_minor,status,mode,webhook_verified_at,created_at").eq("user_id", context.userId).order("created_at", { ascending: false }).limit(10);
  if (error) throw new Error("Payment history unavailable");
  return data ?? [];
});

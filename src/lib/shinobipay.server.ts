import { z } from "zod";
import { decryptPaymentCredential } from "./payment-credential-crypto.server";
import { evaluatePaymentReadiness } from "./shinobipay-readiness";
import { retryAfterMs, ShinobiPayRateLimitError } from "./shinobipay-retry";
import { GHANA_PAYMENT_METHODS, shinobiPhone, verifiedQuote, type ShinobiQuote } from "./shinobipay-contract";
import { consumeShinobiQuote, peekShinobiQuote, saveShinobiQuote } from "./shinobipay-quote-cache.server";

// Cache only provider account mode, never user data or credentials in a response.
const accountCache = new Map<string, { mode: "test" | "live"; expiresAt: number }>();
const accountRequests = new Map<string, Promise<{ mode: "test" | "live" }>>();
const providerCooldowns = new Map<string, { retryAt: number; code: string }>();

export async function shinobiAccount(apiKey: string | undefined) {
  const key = apiKey ?? "connected-account";
  const cached = accountCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return { mode: cached.mode };
  const pending = accountRequests.get(key);
  if (pending) return pending;
  const request = (async () => {
    const account = z.object({ mode: z.enum(["test", "live"]) }).parse(await shinobiRequest("/account", apiKey));
    accountCache.set(key, { mode: account.mode, expiresAt: Date.now() + 60000 });
    return account;
  })();
  accountRequests.set(key, request);
  try { return await request; } finally { accountRequests.delete(key); }
}

export async function paymentConfig() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: credentials, error } = await supabaseAdmin.from("payment_credentials").select("api_key_ciphertext,webhook_secret_ciphertext").eq("provider", "shinobipay").maybeSingle();
  if (error) throw new Error("Payment settings unavailable");
  const encryptionSecret = process.env["PAYMENT_CREDENTIALS_ENCRYPTION_KEY"];
  let apiKey: string | undefined;
  let webhookSecret: string | undefined;
  if (encryptionSecret && credentials?.api_key_ciphertext) apiKey = await decryptPaymentCredential(credentials.api_key_ciphertext, encryptionSecret, "shinobipay:api-key");
  if (encryptionSecret && credentials?.webhook_secret_ciphertext) webhookSecret = await decryptPaymentCredential(credentials.webhook_secret_ciphertext, encryptionSecret, "shinobipay:webhook-secret");
  const { data: settings, error: settingsError } = await supabaseAdmin.from("site_content").select("key,value").in("key", ["shinobipay_mode", "shinobipay_enabled_requested"]);
  if (settingsError) throw new Error("Payment settings unavailable");
  const mode: "live" | "test" = settings?.find((row) => row.key === "shinobipay_mode")?.value === "live" ? "live" : "test";
  const requested = settings?.find((row) => row.key === "shinobipay_enabled_requested")?.value === "true";
  // The API key saved in Admin wins; the connected account is only a fallback when none is saved.
  return { apiKey, webhookSecret, mode, requested, supabaseAdmin };
}

export async function shinobiRequest(path: string, apiKey: string | undefined, body?: Record<string, unknown>, operationId?: string): Promise<unknown> {
  const key = apiKey ?? "connected-account";
  const cooldown = providerCooldowns.get(key);
  if (cooldown && cooldown.retryAt > Date.now()) throw new ShinobiPayRateLimitError(cooldown.retryAt, cooldown.code);
  const headers = new Headers({ "Content-Type": "application/json" });
  let url: string;
  if (apiKey) {
    headers.set("Authorization", `Bearer ${apiKey}`);
    url = `https://akwapayapi.onrender.com/v1${path}`;
  } else {
    const gatewayKey = process.env["LOVABLE_API_KEY"];
    const connectionKey = process.env["UDC_SHINOBIPAY_API_KEY"];
    if (!gatewayKey || !connectionKey) throw new Error("ShinobiPay API key is missing");
    headers.set("Authorization", `Bearer ${gatewayKey}`);
    headers.set("X-Connection-Api-Key", connectionKey);
    url = `https://connector-gateway.lovable.dev/udc_shinobipay${path}`;
  }
  if (operationId) headers.set("Idempotency-Key", operationId);
  const response = await fetch(url, { method: body ? "POST" : "GET", headers, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(7000) });
  if (response.status === 429) {
    const payload = await response.json().catch(() => null);
    const parsed = z.object({ error: z.object({ code: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/) }) }).safeParse(payload);
    const code = parsed.success ? parsed.data.error.code : "rate_limited";
    const retryAt = Date.now() + retryAfterMs(response.headers.get("Retry-After"), Date.now());
    providerCooldowns.set(key, { retryAt, code });
    throw new ShinobiPayRateLimitError(retryAt, code);
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const parsed = z.object({ error: z.object({ code: z.enum(["malformed", "not_authenticated", "invalid_api_key", "duplicate_reference", "invalid_method_for_currency", "insufficient_funds", "payment_in_progress", "not_found", "otp_required", "otp_invalid"]) }) }).safeParse(payload);
    const code = parsed.success ? parsed.data.error.code : "provider_request_failed";
    // Never log raw provider payloads: they may include credentials or customer details.
    console.error("ShinobiPay request rejected", { status: response.status, code, operation: body ? "create" : "retrieve" });
    throw new Error(`ShinobiPay request failed (${response.status}, ${code}). No wallet credit was added.`);
  }
  return response.json();
}

// Verify-first deposit flow (same pattern as the other ShinobiPay skins).
// POST /v1/verify-number confirms the number holds a live MoMo account
// and returns the exact total the customer will be charged (requested +
// 2.5% customer fee). Only verified:true + can_prompt:true with that
// exact total approves sending a prompt. The quote is cached briefly
// (10 min, single use) and must be confirmed in-flow before any intent
// is created; it is never re-verified on Confirm. Each verification is
// a provider call against the shared daily quota, so a cached quote for
// the same number/network/amount is reused, never re-checked.
export async function verifyShinobiNumber(userId: string, apiKey: string | undefined, phoneRaw: string, network: string, amountMinor: number): Promise<{ ok: true; quote: ShinobiQuote } | { ok: false; error: string; retryAfter: number }> {
  const phone = shinobiPhone(phoneRaw);
  const cached = peekShinobiQuote(userId, phone, network, amountMinor);
  if (cached) return { ok: true, quote: cached };
  const raw = await shinobiRequest("/verify-number", apiKey, { phone, network, amount_minor: amountMinor, currency: "GHS" });
  const parsed = raw as { verified?: boolean; reason?: string };
  if (parsed?.verified === false) return { ok: false, error: parsed.reason === "no_account" ? "This number has no live MoMo account on this network. Check the number and network." : "This number could not be verified. Check the number and network.", retryAfter: 0 };
  const quote = verifiedQuote(raw, amountMinor);
  if (!quote) return { ok: false, error: "Number verification is unavailable. Please retry later.", retryAfter: 0 };
  saveShinobiQuote(userId, phone, network, quote);
  return { ok: true, quote };
}

// Consume the in-flow confirmation before a new intent is created.
// Returns an error message when there is no live, unused confirmation
// for this exact number/network/amount, or null when it is consumed.
// A consumed confirmation can never dispatch a second prompt.
export function requireShinobiConfirmation(userId: string, phoneRaw: string, network: string, amountMinor: number): string | null {
  const phone = shinobiPhone(phoneRaw);
  if (!consumeShinobiQuote(userId, phone, network, amountMinor)) return "Verify your number and confirm the total before paying.";
  return null;
}

export async function paymentReadiness() {
  const config = await paymentConfig();
  const account = await shinobiAccount(config.apiKey);
  const result = evaluatePaymentReadiness({ requested: config.requested, webhookSecretPresent: Boolean(config.webhookSecret), mode: config.mode, accountMode: account.mode });
  return { ...result, accountMode: account.mode, config, methods: GHANA_PAYMENT_METHODS, methodSource: "documented_ghs" as const };
}
import { z } from "zod";

export const shinobiNetworkSchema = z.enum(["MTN", "TELECEL", "AIRTELTIGO"]);
// One-time payment codes are digits only (documented OTP flow).
export const shinobiOtpSchema = z.string().regex(/^\d{4,8}$/, "Enter the 4–8 digit code from ShinobiPay.");
export const shinobiStatusSchema = z.enum(["requires_action", "processing", "succeeded", "failed", "unknown"]);
export const shinobiIntentSchema = z.object({
  id: z.string().regex(/^pi_[A-Za-z0-9_-]+$/).max(200),
  status: shinobiStatusSchema,
  amount: z.number().int().positive(),
  currency: z.literal("GHS"),
  reference: z.string().max(200).optional(),
  // Keep optional provider fee fields for reconciliation; never guess fee semantics.
  merchant_amount: z.number().int().positive().optional(),
  amount_charged: z.number().int().positive().optional(),
  next_action: z.object({
    type: z.enum(["await_prompt", "redirect", "submit_otp", "none", "virtual_account"]),
    url: z.string().url().optional(),
    expires_at: z.string().optional(),
    ussd_fallback: z.string().max(80).optional(),
  }).optional(),
});

export const GHANA_PAYMENT_METHODS = [
  { id: "MTN", method: "mobile_money", label: "MTN Mobile Money" },
  { id: "TELECEL", method: "mobile_money", label: "Telecel Cash" },
  { id: "AIRTELTIGO", method: "mobile_money", label: "AirtelTigo Money" },
  { id: "CARD", method: "card", label: "Card" },
] as const;

export function paymentStatusLabel(status: string) {
  if (status === "succeeded") return "Successful";
  if (status === "failed") return "Failed";
  return "Pending";
}

// Fee semantics (confirmed against the live provider): the customer is
// charged the requested amount PLUS a 2.5% customer fee, so a GHS 100
// deposit creates an intent with amount 10200 (grossed) and
// merchant_amount 10000 (requested). The wallet is only ever credited
// the REQUESTED amount — merchant_amount when the provider returns it,
// amount for legacy unpinned charges that carry no merchant_amount.
export function requestedAmountMinor(intent: z.infer<typeof shinobiIntentSchema>): number {
  return intent.merchant_amount ?? intent.amount;
}

export function assertIntentMatches(intent: z.infer<typeof shinobiIntentSchema>, expected: { id?: string; amountMinor: number; reference: string }) {
  if ((expected.id && intent.id !== expected.id) || requestedAmountMinor(intent) !== expected.amountMinor || (intent.reference !== undefined && intent.reference !== expected.reference)) {
    throw new Error("ShinobiPay payment details differ from the deposit. Verification is paused; no wallet credit was added.");
  }
}

// A webhook event amount is the grossed charge (amount) on some
// deliveries and the requested amount (merchant_amount) on others;
// accept either, never a third value.
export function eventAmountMatchesIntent(eventAmountMinor: number, intent: z.infer<typeof shinobiIntentSchema>): boolean {
  return eventAmountMinor === intent.amount || eventAmountMinor === requestedAmountMinor(intent);
}

// Normalize a Ghana MoMo number to canonical 233… form.
export function shinobiPhone(raw: string): string {
  const phone = raw.replace(/[^0-9]/g, "").replace(/^0/, "233");
  if (!/^233\d{9}$/.test(phone)) throw new Error("Enter a valid Ghana MoMo number.");
  return phone;
}

export type ShinobiQuote = { accountName: string; requestedMinor: number; feeMinor: number; totalMinor: number; currency: "GHS" };

// Parse a POST /v1/verify-number response. Only verified:true +
// can_prompt:true with the exact total (requested + customer fee)
// approves sending a prompt; anything else returns null.
export function verifiedQuote(raw: unknown, requestedMinor: number): ShinobiQuote | null {
  const p = raw as { verified?: boolean; can_prompt?: boolean; account_name?: string; amount?: { requested_minor?: number; customer_fee_minor?: number; total_minor?: number; currency?: string } };
  const a = p?.amount;
  if (p?.verified !== true || p.can_prompt !== true || !p.account_name?.trim() || !a ||
      a.currency !== "GHS" || a.requested_minor !== requestedMinor ||
      !Number.isSafeInteger(a.total_minor) || !Number.isSafeInteger(a.customer_fee_minor) ||
      Number(a.customer_fee_minor) < 0 || a.total_minor !== requestedMinor + Number(a.customer_fee_minor)) return null;
  return { accountName: p.account_name.trim(), requestedMinor, feeMinor: Number(a.customer_fee_minor), totalMinor: Number(a.total_minor), currency: "GHS" };
}

// Only provider-owned HTTPS actions are accepted until other gateway origins are verified.
export function safePaymentRedirect(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || !["akwapay.vercel.app", "shinobipay.vercel.app"].includes(parsed.hostname)) return null;
    if ([...parsed.searchParams.keys()].some((key) => /secret|token|api.?key|^cs$/i.test(key))) return null;
    return parsed.href;
  } catch { return null; }
}

export function publicPaymentAction(intent: z.infer<typeof shinobiIntentSchema>) {
  return {
    type: intent.next_action?.type ?? "none",
    redirectUrl: safePaymentRedirect(intent.next_action?.url),
    expiresAt: intent.next_action?.expires_at ?? null,
    ussdFallback: intent.next_action?.ussd_fallback ?? null,
  };
}
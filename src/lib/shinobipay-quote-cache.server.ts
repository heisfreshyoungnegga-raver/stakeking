import type { ShinobiQuote } from "./shinobipay-contract";

// In-memory verify-first quote cache (test mode only).
//
// The PowerPlay reference persists verify quotes in a
// shinobipay_number_checks table with an atomic consume. StakeKing has
// no such table and Lovable owns the schema, so quotes live in process
// memory here: 10-minute expiry, single use, keyed by user + phone +
// network + exact requested amount. A server restart or a second
// instance drops the quote and the user simply re-verifies — safe,
// never double-prompting. For live money this MUST be replaced by a
// durable table + atomic-consume RPC (see
// docs/shinobipay-live-enablement.md); do not enable live on this cache.

export const SHINOBI_QUOTE_TTL_MS = 10 * 60 * 1000;

type StoredQuote = ShinobiQuote & { expiresAt: number; used: boolean };

const quotes = new Map<string, StoredQuote>();

function key(userId: string, phone: string, network: string, amountMinor: number): string {
  return `${userId}|${phone}|${network}|${amountMinor}`;
}

export function saveShinobiQuote(userId: string, phone: string, network: string, quote: ShinobiQuote): void {
  quotes.set(key(userId, phone, network, quote.requestedMinor), { ...quote, expiresAt: Date.now() + SHINOBI_QUOTE_TTL_MS, used: false });
}

// A live, unused quote for this exact number/network/amount, or null.
// Peeking never consumes: the confirm panel may re-read it.
export function peekShinobiQuote(userId: string, phone: string, network: string, amountMinor: number): ShinobiQuote | null {
  const stored = quotes.get(key(userId, phone, network, amountMinor));
  if (!stored || stored.used || stored.expiresAt <= Date.now()) return null;
  return { accountName: stored.accountName, requestedMinor: stored.requestedMinor, feeMinor: stored.feeMinor, totalMinor: stored.totalMinor, currency: stored.currency };
}

// Atomically consume a live, unused quote for this exact
// number/network/amount. Returns the quote on first use, null on a
// second use, an expired quote, or no quote — so one confirmation can
// never dispatch two prompts.
export function consumeShinobiQuote(userId: string, phone: string, network: string, amountMinor: number): ShinobiQuote | null {
  const stored = quotes.get(key(userId, phone, network, amountMinor));
  if (!stored || stored.used || stored.expiresAt <= Date.now()) return null;
  stored.used = true;
  return { accountName: stored.accountName, requestedMinor: stored.requestedMinor, feeMinor: stored.feeMinor, totalMinor: stored.totalMinor, currency: stored.currency };
}

// Test-only reset.
export function _resetShinobiQuoteCache(): void {
  quotes.clear();
}

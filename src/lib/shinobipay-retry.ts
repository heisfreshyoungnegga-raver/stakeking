export function retryAfterMs(header: string | null, now: number): number {
  if (header !== null && /^\d+(\.\d+)?$/.test(header.trim())) return Math.max(1000, Math.ceil(Number(header) * 1000));
  const date = header ? Date.parse(header) : NaN;
  return Number.isFinite(date) ? Math.max(1000, date - now) : 60000;
}

export class ShinobiPayRateLimitError extends Error {
  constructor(public retryAt: number, public providerCode: string) {
    super(providerCode === "payment_in_progress"
      ? "ShinobiPay has a payment still in progress. Let it finish or expire before retrying; no wallet credit was added."
      : `ShinobiPay is limiting requests (${providerCode}). Wait before retrying; no wallet credit was added.`);
  }
}
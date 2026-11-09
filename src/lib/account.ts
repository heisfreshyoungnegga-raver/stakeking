export const ACCOUNT_SECTIONS = ["social", "streak", "support", "notifications", "rate", "how-to-play", "idea", "update", "responsible", "terms"] as const;
export type AccountSection = (typeof ACCOUNT_SECTIONS)[number];
export const isAccountSection = (s: string): s is AccountSection => (ACCOUNT_SECTIONS as readonly string[]).includes(s);

const ghDate = (d: Date | string) => new Date(d).toLocaleDateString("en-CA", { timeZone: "Africa/Accra" });

/** Consecutive Ghana calendar days with at least one bet, ending today (or yesterday if none yet today). */
export function dailyStreak(betDates: (string | Date)[], now = new Date()): number {
  const days = new Set(betDates.map(ghDate));
  const cursor = new Date(now);
  if (!days.has(ghDate(cursor))) cursor.setUTCDate(cursor.getUTCDate() - 1);
  let n = 0;
  while (days.has(ghDate(cursor))) { n++; cursor.setUTCDate(cursor.getUTCDate() - 1); }
  return n;
}

/** wa.me link from a configured number; Ghana local 0XXXXXXXXX becomes 233XXXXXXXXX. */
export function whatsappLink(phone: string | undefined | null): string | null {
  let d = (phone ?? "").replace(/\D/g, "");
  if (/^0\d{9}$/.test(d)) d = "233" + d.slice(1);
  return /^\d{10,15}$/.test(d) ? `https://wa.me/${d}` : null;
}

export function supportEmailLink(email: string | undefined | null): string | null {
  const e = (email ?? "").trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? `mailto:${e}` : null;
}

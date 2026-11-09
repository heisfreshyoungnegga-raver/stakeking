export const MULTIPLE_BONUS_RATE = 0.03;
export function betBonus(stake: number, odds: number, selections: number) {
  const base = Math.round((stake * odds + Number.EPSILON) * 100) / 100;
  const rate = selections >= 2 ? MULTIPLE_BONUS_RATE : 0;
  const bonus = Math.round((base * rate + Number.EPSILON) * 100) / 100;
  return { rate, bonus, payout: Math.round((base + bonus) * 100) / 100 };
}
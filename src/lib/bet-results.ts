export type ResultBet = { id: string; status: string; potential_win: number; cashed_out: number };
export type BetResult = { betId: string; kind: "won" | "cashout"; amount: number };

export function detectBetResult(previous: ResultBet | undefined, current: ResultBet): BetResult | null {
  if (!previous) return null;
  if (current.status === "won" && previous.status !== "won") {
    return { betId: current.id, kind: "won", amount: Number(current.potential_win) };
  }
  const cashout = Math.round((Number(current.cashed_out) - Number(previous.cashed_out)) * 100) / 100;
  return cashout > 0 ? { betId: current.id, kind: "cashout", amount: cashout } : null;
}
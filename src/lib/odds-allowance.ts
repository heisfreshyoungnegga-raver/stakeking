export const ODDS_ALLOWANCE_KEY = "__provider_allowance__";
export const ODDS_ALLOWANCE_CHECK_MS = 5 * 60_000;
export const ODDS_MIN_ALLOWANCE = 25;
export type AllowanceState = { sport_key: string; synced_at: string; requests_remaining: number | null };

export function savedAllowance(state: AllowanceState[]): number | null {
  const shared = state.find((row) => row.sport_key === ODDS_ALLOWANCE_KEY);
  if (shared) return shared.requests_remaining;
  const known = state.flatMap((row) => row.requests_remaining === null ? [] : [row.requests_remaining]);
  return known.length ? Math.min(...known) : null;
}

export const allowanceBlocked = (remaining: number | null) => remaining !== null && remaining < ODDS_MIN_ALLOWANCE;

export function allowanceCheckDue(state: AllowanceState[], now: number): boolean {
  const shared = state.find((row) => row.sport_key === ODDS_ALLOWANCE_KEY);
  return !shared || now - Date.parse(shared.synced_at) >= ODDS_ALLOWANCE_CHECK_MS;
}

export function readAllowance(headers: Headers): number | null {
  const value = headers.get("x-requests-remaining");
  if (value === null || !/^\d+$/.test(value.trim())) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

/** Always consult the provider when due, even if persisted allowance is below the cutoff. */
export async function checkAllowance(
  state: AllowanceState[], now: number, probe: () => Promise<Response>,
  save: (remaining: number | null, checkedAt: string) => Promise<void>,
): Promise<{ remaining: number | null; error: string | null }> {
  const previous = savedAllowance(state);
  if (!allowanceCheckDue(state, now)) return { remaining: previous, error: null };
  const checkedAt = new Date(now).toISOString();
  // Persist the attempt first so repeated failures cannot hammer the provider.
  await save(previous, checkedAt);
  try {
    const response = await probe();
    const remaining = readAllowance(response.headers);
    if (!response.ok || remaining === null) return { remaining: previous, error: "Could not verify odds provider allowance." };
    await save(remaining, checkedAt);
    return { remaining, error: null };
  } catch {
    return { remaining: previous, error: "Could not verify odds provider allowance." };
  }
}
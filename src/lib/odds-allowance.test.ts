import { describe, expect, it, vi } from "vitest";
import { allowanceBlocked, checkAllowance, ODDS_ALLOWANCE_KEY, readAllowance, type AllowanceState } from "./odds-allowance";

const now = Date.parse("2026-11-08T18:10:00Z");
const staleSports: AllowanceState[] = [{ sport_key: "soccer_epl", synced_at: "2026-11-08T15:47:00Z", requests_remaining: 20 }];
const response = (remaining: number) => new Response("[]", { headers: { "x-requests-remaining": String(remaining) } });

describe("odds allowance renewal", () => {
  it("rechecks saved 20 requests and resumes on renewed 500 despite stale low sport rows", async () => {
    const save = vi.fn();
    const probe = vi.fn(async () => response(500));
    const result = await checkAllowance(staleSports, now, probe, save);
    expect(probe).toHaveBeenCalledOnce();
    expect(result).toEqual({ remaining: 500, error: null });
    expect(allowanceBlocked(result.remaining)).toBe(false);
    const persisted = [...staleSports, { sport_key: ODDS_ALLOWANCE_KEY, synced_at: new Date(now).toISOString(), requests_remaining: 500 }];
    const cached = await checkAllowance(persisted, now + 30_000, probe, save);
    expect(allowanceBlocked(cached.remaining)).toBe(false);
    expect(probe).toHaveBeenCalledOnce();
    expect(save).toHaveBeenLastCalledWith(500, "2026-11-08T18:10:00.000Z");
  });
  it("keeps the 25-request cutoff and rechecks low allowance after five minutes", async () => {
    const state = [...staleSports, { sport_key: ODDS_ALLOWANCE_KEY, synced_at: new Date(now).toISOString(), requests_remaining: 20 }];
    const probe = vi.fn(async () => response(25));
    expect(allowanceBlocked((await checkAllowance(state, now + 299_999, probe, vi.fn())).remaining)).toBe(true);
    expect(probe).not.toHaveBeenCalled();
    expect(allowanceBlocked((await checkAllowance(state, now + 300_000, probe, vi.fn())).remaining)).toBe(false);
    expect(probe).toHaveBeenCalledOnce();
    expect(allowanceBlocked(24)).toBe(true);
  });
  it("does not unlock on an unsuccessful or missing-header probe", async () => {
    for (const res of [new Response("", { status: 429 }), new Response("[]")]) {
      const result = await checkAllowance(staleSports, now, async () => res, vi.fn());
      expect(allowanceBlocked(result.remaining)).toBe(true);
      expect(result.error).toBe("Could not verify odds provider allowance.");
    }
    expect(readAllowance(new Headers({ "x-requests-remaining": "garbage" }))).toBeNull();
  });
  it("backs off after a network failure without inventing renewed allowance", async () => {
    const save = vi.fn();
    const result = await checkAllowance(staleSports, now, async () => { throw new Error("offline"); }, save);
    expect(result.remaining).toBe(20);
    expect(result.error).toBeTruthy();
    expect(save).toHaveBeenCalledWith(20, "2026-11-08T18:10:00.000Z");
  });
});
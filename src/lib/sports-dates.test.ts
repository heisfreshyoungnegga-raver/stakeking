import { describe, expect, it } from "vitest";
import { matchesSportsDay } from "./sports-dates";

describe("Ghana sports dates", () => {
  it("shows only November 9 fixtures under tomorrow on November 8", () => {
    const now = Date.parse("2026-11-08T18:07:00Z");
    expect(matchesSportsDay("2026-11-09T00:00:00Z", "tomorrow", now)).toBe(true);
    expect(matchesSportsDay("2026-11-09T23:59:59Z", "tomorrow", now)).toBe(true);
    expect(matchesSportsDay("2026-11-08T20:00:00Z", "tomorrow", now)).toBe(false);
    expect(matchesSportsDay("2026-11-10T00:00:00Z", "tomorrow", now)).toBe(false);
  });
});
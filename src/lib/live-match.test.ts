import { describe, expect, it } from "vitest";
import { officialLiveTime, livePriceSelectable } from "./live-match";

describe("official live match display", () => {
  it("uses only the supplied minute, with the half it implies", () => {
    expect(officialLiveTime("IN_PLAY", 89)).toBe("89′ H2");
    expect(officialLiveTime("IN_PLAY", null)).toBeNull();
    expect(officialLiveTime("IN_PLAY", 12)).toBe("12′ H1");
    expect(officialLiveTime("IN_PLAY", 105)).toBe("105′ ET");
    expect(officialLiveTime("IN_PLAY", 47)).toBe("47′ H2");
  });
  it("shows the provider-confirmed halftime only", () => {
    expect(officialLiveTime("PAUSED", null)).toBe("HT");
  });
  it("hides live time for pre-match and finished fixtures", () => {
    expect(officialLiveTime("TIMED", 12)).toBeNull();
    expect(officialLiveTime("FINISHED", 90)).toBeNull();
  });
  it("blocks suspended and invalid prices", () => {
    expect(livePriceSelectable(false, 2.4)).toBe(false);
    expect(livePriceSelectable(true, 0)).toBe(false);
    expect(livePriceSelectable(true, NaN)).toBe(false);
    expect(livePriceSelectable(true, 2.4)).toBe(true);
  });
});
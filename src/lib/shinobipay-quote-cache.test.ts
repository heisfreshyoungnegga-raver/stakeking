import { describe, expect, it, beforeEach, vi, afterEach } from "vitest";
import { _resetShinobiQuoteCache, consumeShinobiQuote, peekShinobiQuote, saveShinobiQuote, SHINOBI_QUOTE_TTL_MS } from "./shinobipay-quote-cache.server";

const quote = { accountName: "AMA SERWAA", requestedMinor: 10000, feeMinor: 250, totalMinor: 10250, currency: "GHS" as const };

describe("ShinobiPay verify-first quote cache", () => {
  beforeEach(() => { _resetShinobiQuoteCache(); vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("peeks a live quote without consuming it, then consumes it exactly once", () => {
    saveShinobiQuote("user-1", "233244123456", "MTN", quote);
    expect(peekShinobiQuote("user-1", "233244123456", "MTN", 10000)).toEqual(quote);
    expect(peekShinobiQuote("user-1", "233244123456", "MTN", 10000)).toEqual(quote);
    expect(consumeShinobiQuote("user-1", "233244123456", "MTN", 10000)).toEqual(quote);
    expect(consumeShinobiQuote("user-1", "233244123456", "MTN", 10000)).toBeNull();
    expect(peekShinobiQuote("user-1", "233244123456", "MTN", 10000)).toBeNull();
  });
  it("a quote for a different amount, number, network or user cannot be reused", () => {
    saveShinobiQuote("user-1", "233244123456", "MTN", quote);
    expect(consumeShinobiQuote("user-1", "233244123456", "MTN", 11000)).toBeNull();
    expect(consumeShinobiQuote("user-1", "233244123457", "MTN", 10000)).toBeNull();
    expect(consumeShinobiQuote("user-1", "233244123456", "TELECEL", 10000)).toBeNull();
    expect(consumeShinobiQuote("user-2", "233244123456", "MTN", 10000)).toBeNull();
    expect(consumeShinobiQuote("user-1", "233244123456", "MTN", 10000)).toEqual(quote);
  });
  it("an expired quote cannot be consumed", () => {
    saveShinobiQuote("user-1", "233244123456", "MTN", quote);
    vi.advanceTimersByTime(SHINOBI_QUOTE_TTL_MS + 1000);
    expect(peekShinobiQuote("user-1", "233244123456", "MTN", 10000)).toBeNull();
    expect(consumeShinobiQuote("user-1", "233244123456", "MTN", 10000)).toBeNull();
  });
  it("re-verifying the same number and amount replaces the quote", () => {
    saveShinobiQuote("user-1", "233244123456", "MTN", quote);
    expect(consumeShinobiQuote("user-1", "233244123456", "MTN", 10000)).toEqual(quote);
    saveShinobiQuote("user-1", "233244123456", "MTN", quote);
    expect(consumeShinobiQuote("user-1", "233244123456", "MTN", 10000)).toEqual(quote);
  });
});

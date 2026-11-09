import { describe, expect, it } from "vitest";
import { dailyStreak, supportEmailLink, whatsappLink } from "./account";

describe("account helpers", () => {
  it("counts consecutive betting days", () => {
    const now = new Date("2026-11-08T12:00:00Z");
    expect(dailyStreak(["2026-11-08T10:00:00Z", "2026-11-07T10:00:00Z", "2026-11-05T10:00:00Z"], now)).toBe(2);
    expect(dailyStreak(["2026-11-07T10:00:00Z", "2026-11-06T10:00:00Z"], now)).toBe(2);
    expect(dailyStreak(["2026-11-05T10:00:00Z"], now)).toBe(0);
  });
  it("builds WhatsApp links from the configured Ghana number", () => {
    expect(whatsappLink("024 123 4567")).toBe("https://wa.me/233241234567");
    expect(whatsappLink("+233241234567")).toBe("https://wa.me/233241234567");
    expect(whatsappLink("")).toBeNull();
  });
  it("accepts only a valid support email", () => {
    expect(supportEmailLink("help@gmail.com")).toBe("mailto:help@gmail.com");
    expect(supportEmailLink("nope")).toBeNull();
  });
});

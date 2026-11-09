import { describe, expect, it } from "vitest";
import { canDeleteTicket, isDeleteSwipe } from "../lib/ticket-deletion";

describe("Individual settled-ticket deletion", () => {
  it.each(["won", "lost", "void", "cashed_out"])("allows deletion of a %s ticket", (status) => {
    expect(canDeleteTicket(status)).toBe(true);
  });
  it("protects running bets", () => {
    expect(canDeleteTicket("open")).toBe(false);
  });
  it("does not allow unknown ticket states", () => {
    expect(canDeleteTicket("pending")).toBe(false);
  });
  it("recognizes a left swipe, not scrolling or a right swipe", () => {
    expect(isDeleteSwipe(200, 100, 100, 105)).toBe(true);
    expect(isDeleteSwipe(200, 100, 100, 180)).toBe(false);
    expect(isDeleteSwipe(100, 100, 200, 100)).toBe(false);
  });
});
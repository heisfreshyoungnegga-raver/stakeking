import { expect, it } from "vitest";
import { ghanaPhone } from "./ghana-phone";
it("normalizes Ghana local and international numbers", () => {
  expect(ghanaPhone("024 123 4567")).toBe("+233241234567");
  expect(ghanaPhone("241234567")).toBe("+233241234567");
  expect(ghanaPhone("+233241234567")).toBe("+233241234567");
});
it("rejects non-Ghana and incomplete numbers", () => {
  expect(ghanaPhone("+234241234567")).toBeNull();
  expect(ghanaPhone("024123")).toBeNull();
});
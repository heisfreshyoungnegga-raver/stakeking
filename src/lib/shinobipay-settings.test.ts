import { describe, expect, it } from "vitest";
import { shinobiPaySettingsSchema } from "./shinobipay-settings";

describe("ShinobiPay activation", () => {
  it("allows an admin to request enabled live settings", () => {
    expect(shinobiPaySettingsSchema.parse({ mode: "live", enabled: true })).toEqual({ mode: "live", enabled: true });
    expect(shinobiPaySettingsSchema.parse({ mode: "live", enabled: false })).toEqual({ mode: "live", enabled: false });
  });
  it("allows blank credential fields so saved credentials can be retained", () => {
    expect(shinobiPaySettingsSchema.parse({ mode: "sandbox", enabled: false, apiKey: "", webhookSecret: "" })).toEqual({ mode: "sandbox", enabled: false, apiKey: "", webhookSecret: "" });
  });
});
import { describe, it, expect } from "vitest";
import { verifyShinobiSignature, shinobiEventSchema } from "./shinobipay-verification";

describe("ShinobiPay webhook verification", () => {
  it("accepts signed raw bytes and rejects alteration and signatures over five minutes old", async () => {
    const secret = "synthetic-test-only";
    const raw = '{ "amount":100 }';
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`1000.${raw}`)));
    const header = `t=1000,v1=${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
    expect(await verifyShinobiSignature(raw, header, secret, 1300)).toBe(true);
    expect(await verifyShinobiSignature(raw, header, secret, 1301)).toBe(false);
    expect(await verifyShinobiSignature('{}', header, secret, 1000)).toBe(false);
    expect(await verifyShinobiSignature(raw, 't=1000,v1=bad', secret, 1000)).toBe(false);
  });
  it("rejects conflicting success status and non-Ghana currency", () => {
    const event = { id: "evt_test", type: "payment_intent.succeeded", sequence: 3, data: { intent_id: "pi_test", reference: "test", amount: 100, currency: "GHS", status: "succeeded" } };
    expect(shinobiEventSchema.safeParse(event).success).toBe(true);
    expect(shinobiEventSchema.safeParse({ ...event, data: { ...event.data, status: "processing" } }).success).toBe(false);
    expect(shinobiEventSchema.safeParse({ ...event, data: { ...event.data, currency: "NGN" } }).success).toBe(false);
  });
});
import { z } from "zod";

export const shinobiEventSchema = z.object({
  id: z.string().regex(/^evt_[A-Za-z0-9_-]+$/).max(200),
  type: z.enum(["payment_intent.succeeded", "payment_intent.failed", "payment_intent.processing"]),
  sequence: z.number().int().nonnegative(),
  data: z.object({ intent_id: z.string().regex(/^pi_[A-Za-z0-9_-]+$/).max(200), reference: z.string().min(1).max(200), amount: z.number().int().min(100).max(500000), currency: z.literal("GHS"), status: z.enum(["succeeded", "failed", "processing"]) }),
}).refine((event) => event.type === `payment_intent.${event.data.status}`);

export async function verifyShinobiSignature(raw: string, header: string | null, secret: string, nowSeconds = Math.floor(Date.now() / 1000)): Promise<boolean> {
  if (!header) return false;
  const parts = header.split(",").map((part) => part.trim().split("="));
  const timestamp = parts.find(([key]) => key === "t")?.[1];
  const signature = parts.find(([key]) => key === "v1")?.[1];
  if (!timestamp || !/^\d+$/.test(timestamp) || !signature || !/^[a-f0-9]{64}$/i.test(signature) || Math.abs(nowSeconds - Number(timestamp)) > 300) return false;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const bytes = Uint8Array.from(signature.match(/.{2}/g) ?? [], (pair) => parseInt(pair, 16));
  return crypto.subtle.verify("HMAC", key, bytes, encoder.encode(`${timestamp}.${raw}`));
}
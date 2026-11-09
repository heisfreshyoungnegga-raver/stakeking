import { z } from "zod";

// Enabled records admin intent only; payment processing remains independently blocked.
export const shinobiPaySettingsSchema = z.object({
  mode: z.enum(["sandbox", "live"]),
  enabled: z.boolean(),
  apiKey: z.string().trim().max(4096).optional(),
  webhookSecret: z.string().trim().max(4096).optional(),
});
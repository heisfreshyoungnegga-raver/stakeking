import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { shinobiPaySettingsSchema } from "./shinobipay-settings";

export const getShinobiPaySettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: admin, error: roleError } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (roleError || !admin) throw new Error("Admin access required");
    const { data, error } = await context.supabase.from("site_content").select("value").eq("key", "shinobipay_mode").maybeSingle();
    if (error) throw new Error("Payment settings could not be loaded");
    const { data: presence, error: presenceError } = await context.supabase.rpc("shinobipay_credential_status");
    if (presenceError) throw new Error("Payment settings could not be loaded");
    const { data: requested, error: requestedError } = await context.supabase.from("site_content").select("value").eq("key", "shinobipay_enabled_requested").maybeSingle();
    if (requestedError) throw new Error("Payment settings could not be loaded");
    const status = presence && typeof presence === "object" && !Array.isArray(presence) ? presence : {};
    return {
      mode: data?.value === "live" ? "live" as const : "sandbox" as const,
      enabled: false as const,
      enabledRequested: requested?.value === "true",
      apiKeySet: Boolean(status["apiKeySet"]) || Boolean(process.env["UDC_SHINOBIPAY_API_KEY"]),
      webhookSecretSet: Boolean(status["webhookSecretSet"]) || Boolean(process.env["SHINOBIPAY_WEBHOOK_SECRET"]),
    };
  });

export const saveShinobiPaySettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => shinobiPaySettingsSchema.parse(input))
  .handler(async ({ context, data }) => {
    const { data: admin, error: roleError } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (roleError || !admin) throw new Error("Admin access required");
    if (data.apiKey || data.webhookSecret) {
      const encryptionKey = process.env["PAYMENT_CREDENTIALS_ENCRYPTION_KEY"];
      if (!encryptionKey) throw new Error("Secure credential storage is unavailable");
      const { encryptPaymentCredential } = await import("./payment-credential-crypto.server");
      const encrypted: { _api_key_ciphertext?: string; _webhook_secret_ciphertext?: string } = {};
      if (data.apiKey) encrypted._api_key_ciphertext = await encryptPaymentCredential(data.apiKey, encryptionKey, "shinobipay:api-key");
      if (data.webhookSecret) encrypted._webhook_secret_ciphertext = await encryptPaymentCredential(data.webhookSecret, encryptionKey, "shinobipay:webhook-secret");
      const { error: credentialError } = await context.supabase.rpc("save_shinobipay_credentials", encrypted);
      if (credentialError) throw new Error("Credentials could not be saved");
    }
    const { error } = await context.supabase.from("site_content").upsert([
      { key: "shinobipay_mode", value: data.mode },
      { key: "shinobipay_enabled_requested", value: String(data.enabled) },
    ]);
    if (error) throw new Error("Payment settings could not be saved");
    return { saved: true, enabled: false, enabledRequested: data.enabled };
  });
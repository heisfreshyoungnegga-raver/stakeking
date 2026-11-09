export async function encryptPaymentCredential(value: string, encryptionSecret: string, purpose: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyBytes = await crypto.subtle.digest("SHA-256", encoder.encode(encryptionSecret));
  const key = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: encoder.encode(purpose) }, key, encoder.encode(value)));
  const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
  return `v1.${encode(iv)}.${encode(ciphertext)}`;
}

export async function decryptPaymentCredential(value: string, encryptionSecret: string, purpose: string): Promise<string> {
  const [version, ivText, cipherText] = value.split(".");
  if (version !== "v1" || !ivText || !cipherText) throw new Error("Credential storage unavailable");
  const decode = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
  const encoder = new TextEncoder();
  const keyBytes = await crypto.subtle.digest("SHA-256", encoder.encode(encryptionSecret));
  const key = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["decrypt"]);
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: decode(ivText), additionalData: encoder.encode(purpose) }, key, decode(cipherText)));
}
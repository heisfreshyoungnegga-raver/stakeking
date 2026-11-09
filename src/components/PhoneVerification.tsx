import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ghanaPhone } from "@/lib/ghana-phone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function PhoneVerification() {
  const [phone, setPhone] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [verified, setVerified] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => {
      if (data.user?.phone) { setPhone(`+${data.user.phone.replace(/^\+/, "")}`); setVerified(Boolean(data.user.phone_confirmed_at)); }
    });
  }, []);
  async function send() {
    const normalized = ghanaPhone(phone);
    if (!normalized) { setMessage("Enter a valid Ghana number, such as 024 123 4567."); return; }
    setBusy(true); setMessage("");
    try {
      const { error } = await supabase.auth.updateUser({ phone: normalized });
      if (error) { setMessage(error.message); return; }
      setPending(normalized); setCode(""); setMessage("Verification code sent by SMS.");
    } catch { setMessage("Unable to send a code. Please try again."); }
    finally { setBusy(false); }
  }
  async function confirm() {
    if (!pending || !/^\d{6,8}$/.test(code)) { setMessage("Enter the verification code from your text message."); return; }
    setBusy(true); setMessage("");
    try {
      const { error } = await supabase.auth.verifyOtp({ phone: pending, token: code, type: "phone_change" });
      if (error) { setMessage(error.message); return; }
      const { data, error: userError } = await supabase.auth.getUser();
      if (userError || !data.user?.phone_confirmed_at || data.user.phone?.replace(/^\+/, "") !== pending.replace(/^\+/, "")) { setMessage("Verification is not confirmed yet. Please try again."); return; }
      setPhone(pending); setVerified(true); setPending(null); setCode(""); setMessage("Number verified. Use it with your existing password to log in.");
    } catch { setMessage("Unable to verify the code. Please try again."); }
    finally { setBusy(false); }
  }
  return <section className="space-y-4 border-y border-border py-5">
    <h2 className="text-xl font-bold uppercase">Phone sign-in</h2>
    <div><Label htmlFor="login-phone">Ghana phone number</Label><Input id="login-phone" type="tel" autoComplete="tel" placeholder="024 123 4567" value={phone} disabled={busy || Boolean(pending)} onChange={(e) => { setPhone(e.target.value); setVerified(false); }} className="mt-1.5 h-11" /></div>
    {verified && <p className="text-sm text-primary">Verified number</p>}
    {pending ? <>
      <div><Label htmlFor="phone-code">SMS verification code</Label><Input id="phone-code" inputMode="numeric" autoComplete="one-time-code" maxLength={8} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} className="mt-1.5 h-11" /></div>
      <div className="flex flex-wrap gap-2"><Button disabled={busy} onClick={confirm}>Verify number</Button><Button variant="outline" disabled={busy} onClick={send}>Resend code</Button><Button variant="ghost" disabled={busy} onClick={() => { setPending(null); setCode(""); setMessage(""); }}>Change number</Button></div>
    </> : <Button disabled={busy || verified} onClick={send}>{busy ? "Sending…" : "Send verification code"}</Button>}
    {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
  </section>;
}
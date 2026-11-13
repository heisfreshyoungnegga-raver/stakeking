import { createFileRoute } from "@tanstack/react-router";
import { WalletPage } from "@/components/WalletPage";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Check, Copy, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CURRENCY, fmt, profileQuery } from "@/lib/betting";
import { DEPOSIT_MIN_GHS as MIN, DEPOSIT_MAX_GHS as MAX } from "@/lib/deposit-policy";
import { cn } from "@/lib/utils";

// Manual deposit only (Prince, 2026-11-13: automatic PayPulse gateway
// off, manual back). The recipient matches the operator_settings rows
// in the database; change both together.
//
// Manual deposit recipient (Prince, 2026-11-12): Telecel Cash to
// HARUNA IBRAHIM. Instant MoMo on PayPulse was live 2026-11-13 and
// was switched off the same day — its code (paypulse-payments lib,
// engine deposit-momo, PayPulse settings tab) stays in place, unused,
// so it can come back later without a rebuild.
const RECIPIENT = { network: "Telecel Cash", number: "0504936181", name: "HARUNA IBRAHIM" };
const DISPLAY_NUMBER = "0504 936 181";

export const Route = createFileRoute("/_authenticated/deposit")({
  head: () => ({ meta: [
    { title: "Deposit — StakeKing" },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "description", content: "Send Telecel Cash and submit your transaction ID for super admin approval." },
    { property: "og:title", content: "Deposit — StakeKing" },
    { property: "og:description", content: "Send Telecel Cash and submit your transaction ID for super admin approval." },
  ] }),
  component: Deposit,
});

type MyDeposit = { id: string; amount: number; status: string; external_ref?: string; created_at: string };

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-gold/20 text-gold",
  completed: "bg-primary/15 text-primary",
  rejected: "bg-destructive/15 text-destructive",
};

function Deposit() {
  const { data: profile } = useQuery(profileQuery);
  const qc = useQueryClient();
  const [amount, setAmount] = useState("");
  const [senderName, setSenderName] = useState("");
  const [senderPhone, setSenderPhone] = useState("");
  const [txnId, setTxnId] = useState("");
  // Screenshot preview only (Prince, 2026-11-12: no blob storage):
  // the image is read into the browser and shown back to the player
  // so it looks uploaded. It is never sent to the server — only the
  // amount, transaction ID and sender's name go to the super admin.
  const [shot, setShot] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const { data: mine = [] } = useQuery({
    queryKey: ["transactions", "my-deposits"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return [] as MyDeposit[];
      const { data, error } = await supabase
        .from("transactions")
        .select("*")
        .eq("user_id", u.user.id)
        .eq("type", "deposit")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as unknown as MyDeposit[];
    },
  });

  const value = Number(amount);
  const valid = /^\d+(\.\d{1,2})?$/.test(amount) && value >= MIN && value <= MAX;
  const phoneDigits = senderPhone.replace(/\D/g, "");

  async function copyNumber() {
    try {
      await navigator.clipboard.writeText(RECIPIENT.number);
      setCopied(true);
      toast.success("Number copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Copy failed — long-press the number to copy it");
    }
  }

  function pickShot(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Pick an image file for the screenshot"); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("That screenshot is too big — pick one under 5 MB"); return; }
    const reader = new FileReader();
    reader.onload = () => setShot(String(reader.result));
    reader.readAsDataURL(file);
  }

  async function submit() {
    if (!valid) { toast.error(`Enter an amount between ${MIN} and ${fmt(MAX)}, with at most two decimal places`); return; }
    if (senderName.trim().length < 2) { toast.error("Enter the name on the MoMo account you paid from"); return; }
    if (phoneDigits.length < 9) { toast.error("Enter the MoMo number you paid from"); return; }
    if (txnId.trim().length < 4) { toast.error("Enter the transaction ID from your MoMo payment"); return; }
    setBusy(true);
    const { error } = await supabase.rpc("deposit_manual", {
      _amount_ghs: value,
      _sender_name: senderName.trim(),
      _sender_phone: phoneDigits,
      _external_ref: txnId.trim(),
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Deposit sent — the super admin will check the payment and credit your wallet");
    setAmount("");
    setSenderName("");
    setSenderPhone("");
    setTxnId("");
    setShot(null);
    void qc.invalidateQueries({ queryKey: ["transactions", "my-deposits"] });
    void qc.invalidateQueries({ queryKey: ["profile"] });
  }

  return <WalletPage title="Deposit" helpText="Send Telecel Cash manually and submit your transaction ID. The super admin checks manual payments before crediting.">
    <div className="space-y-4 px-3 pb-8">
      <div className="space-y-4">
        <div className="border-b border-border bg-paper py-4"><div className="flex items-center justify-between gap-2"><h2 className="text-xl font-bold">Manual transfer</h2><span className="text-xs font-semibold text-paper-muted">Telecel Cash</span></div><p className="mt-1 text-xs text-paper-muted">Send with Telecel Cash, then submit your details below for approval.</p></div>

        <section className="space-y-3 border border-border bg-paper p-4" aria-label="Where to send the money">
          <div className="flex justify-between gap-3 text-sm"><span className="text-paper-muted">Network</span><span className="font-semibold">{RECIPIENT.network}</span></div>
          <div className="flex items-center justify-between gap-3">
            <div><p className="text-xs text-paper-muted">Number</p><p className="text-lg font-bold tracking-wide">{DISPLAY_NUMBER}</p></div>
            <Button type="button" variant="outline" size="sm" onClick={() => void copyNumber()}>{copied ? <Check className="size-4" /> : <Copy className="size-4" />}{copied ? "Copied" : "Copy number"}</Button>
          </div>
          <div className="flex justify-between gap-3 text-sm"><span className="text-paper-muted">Name</span><span className="font-semibold">{RECIPIENT.name}</span></div>
        </section>

        <ol className="list-inside list-decimal space-y-1 bg-paper p-3 text-xs leading-5 text-paper-muted">
          <li>Dial *170# and send the amount to {DISPLAY_NUMBER} ({RECIPIENT.name}).</li>
          <li>Fill in the amount, your name, your number and the transaction ID from the payment.</li>
          <li>You can attach a screenshot — it stays on your phone, for your records.</li>
          <li>The super admin checks the payment and credits your wallet.</li>
        </ol>

        <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
          <div className="relative"><Input inputMode="decimal" placeholder={`Amount(${CURRENCY})`} value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} className="h-12 rounded-none bg-transparent pr-20" aria-label="Amount" /><span className="pointer-events-none absolute right-3 top-4 text-xs text-paper-muted">min. {fmt(MIN)}</span></div>
          <Input placeholder="Your name (on the MoMo account)" value={senderName} onChange={(e) => setSenderName(e.target.value)} className="h-12 rounded-none bg-transparent" aria-label="Sender name" />
          <Input inputMode="tel" placeholder={`Your MoMo number (${profile?.phone ?? "e.g. 0501234567"})`} value={senderPhone} onChange={(e) => setSenderPhone(e.target.value.trim())} className="h-12 rounded-none bg-transparent" aria-label="Sender MoMo number" />
          <Input placeholder="Transaction ID (from the MoMo message)" value={txnId} onChange={(e) => setTxnId(e.target.value.trim())} className="h-12 rounded-none bg-transparent" aria-label="Transaction ID" />
          <div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" aria-label="Attach screenshot" onChange={(e) => { pickShot(e.target.files?.[0]); e.target.value = ""; }} />
            {!shot ? (
              <Button type="button" variant="outline" className="h-12 w-full rounded-none" onClick={() => fileRef.current?.click()}>Attach screenshot (optional)</Button>
            ) : (
              <div className="relative border border-border bg-paper p-2">
                <img src={shot} alt="Payment screenshot preview" className="max-h-56 w-full object-contain" />
                <Button type="button" variant="ghost" size="icon" aria-label="Remove screenshot" className="absolute right-2 top-2 bg-paper" onClick={() => setShot(null)}><X className="size-4" /></Button>
                <p className="pt-2 text-center text-xs font-semibold text-primary">Screenshot attached</p>
              </div>
            )}
            <p className="pt-1 text-xs text-paper-muted">Shown here for your records — the screenshot stays on your phone and is not uploaded.</p>
          </div>
          <Button type="submit" className="h-12 w-full rounded-none" disabled={busy || !valid}>{busy ? "Submitting…" : "Submit deposit for approval"}</Button>
        </form>
      </div>

      <p className="text-right text-[11px] text-paper-muted">Balance ({CURRENCY}) {profile ? fmt(profile.balance) : "—"}</p>

      <section className="border-t border-border pt-4"><h2 className="mb-2 font-sans text-sm font-semibold">My deposits</h2>
        {mine.length === 0 ? <p className="text-xs text-paper-muted">No deposits yet.</p> : <div className="divide-y divide-border">{mine.map((d) => <div key={d.id} className="flex items-center justify-between gap-3 py-3 text-sm"><div><p className="font-bold">{CURRENCY} {fmt(d.amount)}</p><p className="text-xs text-paper-muted">{d.external_ref ? `Txn ${d.external_ref} · ` : ""}{new Date(d.created_at).toLocaleString()}</p></div><span className={cn("px-2 py-1 text-xs capitalize", STATUS_STYLE[d.status] ?? "bg-secondary text-muted-foreground")}>{d.status}</span></div>)}</div>}
      </section>

      <div className="flex gap-2 border-t border-border pt-3 text-xs text-paper-muted"><ShieldCheck className="size-4 shrink-0" /><p>Your wallet is credited once the super admin confirms your payment — the full amount, credited exactly once.</p></div>
      <ol className="list-inside list-decimal space-y-1 bg-paper p-3 text-xs leading-5 text-paper-muted"><li>Maximum per transaction is {CURRENCY} {fmt(MAX)}.</li><li>Minimum per transaction is {CURRENCY} {fmt(MIN)}.</li><li>Only send to the number on this page, and keep your transaction ID.</li></ol>
    </div>
  </WalletPage>;
}

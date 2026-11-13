import { createFileRoute } from "@tanstack/react-router";
import { WalletPage } from "@/components/WalletPage";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Check, Copy, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CURRENCY, fmt, profileQuery } from "@/lib/betting";
import { DEPOSIT_MIN_GHS as MIN, DEPOSIT_MAX_GHS as MAX } from "@/lib/deposit-policy";
import { getPayPulseReadiness, createPayPulsePayment, checkPayPulsePayment } from "@/lib/paypulse-payments.functions";
import { cn } from "@/lib/utils";

// Manual deposit recipient (Prince, 2026-11-12): Telecel Cash to
// HARUNA IBRAHIM. This matches the operator_settings rows in the
// database; change both together. Instant MoMo runs on PayPulse
// (Prince, 2026-11-13) in the tab above.
const RECIPIENT = { network: "Telecel Cash", number: "0504936181", name: "HARUNA IBRAHIM" };
const DISPLAY_NUMBER = "0504 936 181";

export const Route = createFileRoute("/_authenticated/deposit")({
  head: () => ({ meta: [
    { title: "Deposit — StakeKing" },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "description", content: "Pay instantly with MoMo, or send Telecel Cash and submit your transaction ID for super admin approval." },
    { property: "og:title", content: "Deposit — StakeKing" },
    { property: "og:description", content: "Pay instantly with MoMo, or send Telecel Cash and submit your transaction ID for super admin approval." },
  ] }),
  component: Deposit,
});

type MyDeposit = { id: string; amount: number; status: string; external_ref?: string; created_at: string };

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-gold/20 text-gold",
  completed: "bg-primary/15 text-primary",
  rejected: "bg-destructive/15 text-destructive",
};

type InstantNetwork = "mtn" | "telecel" | "airteltigo";
const NETWORKS: { id: InstantNetwork; label: string }[] = [
  { id: "mtn", label: "MTN Mobile Money" },
  { id: "telecel", label: "Telecel Cash" },
  { id: "airteltigo", label: "AT Money" },
];

function networkFromPhone(phone: string): InstantNetwork | null {
  const d = phone.replace(/\D/g, "");
  const local = d.startsWith("233") ? "0" + d.slice(3) : d;
  const pre = local.slice(0, 3);
  if (["024", "025", "053", "054", "055", "059"].includes(pre)) return "mtn";
  if (["020", "050"].includes(pre)) return "telecel";
  if (["026", "027", "056", "057"].includes(pre)) return "airteltigo";
  return null;
}

type ReturnState = { ref: string; phase: "polling" | "credited" | "failed" | "waiting" };

function Deposit() {
  const { data: profile } = useQuery(profileQuery);
  const qc = useQueryClient();
  const [tab, setTab] = useState<"instant" | "manual">("manual");
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

  // ---- Instant MoMo (PayPulse, Prince 2026-11-13) ----
  const readinessFn = useServerFn(getPayPulseReadiness);
  const createPayment = useServerFn(createPayPulsePayment);
  const checkPayment = useServerFn(checkPayPulsePayment);
  const readiness = useQuery({ queryKey: ["payment-readiness", "paypulse"], queryFn: () => readinessFn(), staleTime: 60000, retry: false, refetchOnWindowFocus: false });
  const [instantAmount, setInstantAmount] = useState("");
  const [instantPhone, setInstantPhone] = useState("");
  const [networkPick, setNetworkPick] = useState<InstantNetwork | null>(null);
  const [instantBusy, setInstantBusy] = useState(false);
  const [returnState, setReturnState] = useState<ReturnState | null>(null);
  const autoTabDone = useRef(false);

  // Default to the instant tab once readiness confirms it is live;
  // manual stays the default until then (it always works).
  useEffect(() => {
    if (!autoTabDone.current && readiness.data?.ready) {
      autoTabDone.current = true;
      setTab("instant");
    }
  }, [readiness.data]);

  // Pre-fill the MoMo number from the account phone.
  useEffect(() => {
    if (!instantPhone && profile?.phone) setInstantPhone(profile.phone);
  }, [profile?.phone]); // eslint-disable-line react-hooks/exhaustive-deps

  // Coming back from the PayPulse checkout: poll until the webhook
  // credits the wallet (or the payment fails, or ~5 minutes pass).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("paypulse") !== "return") return;
    const ref = params.get("ref") || "";
    if (!ref) return;
    let pending: { ref: string; paymentRef: string; amount: number } | null = null;
    try { pending = JSON.parse(sessionStorage.getItem("sk-paypulse-pending") || "null"); } catch { pending = null; }
    if (!pending || pending.ref !== ref || !pending.paymentRef) {
      setReturnState({ ref, phase: "waiting" });
      return;
    }
    setReturnState({ ref, phase: "polling" });
    let polls = 0;
    const timer = window.setInterval(() => {
      polls += 1;
      void checkPayment({ data: { id: pending.paymentRef } }).then((r) => {
        if (r.credited || r.status === "succeeded") {
          window.clearInterval(timer);
          setReturnState({ ref, phase: "credited" });
          try { sessionStorage.removeItem("sk-paypulse-pending"); } catch { /* ignore */ }
          toast.success("Payment confirmed — your wallet has been credited");
          void qc.invalidateQueries({ queryKey: ["transactions", "my-deposits"] });
          void qc.invalidateQueries({ queryKey: ["profile"] });
          window.history.replaceState({}, "", "/deposit");
        } else if (r.status === "failed") {
          window.clearInterval(timer);
          setReturnState({ ref, phase: "failed" });
          try { sessionStorage.removeItem("sk-paypulse-pending"); } catch { /* ignore */ }
          toast.error("That payment did not go through — try again or use manual transfer");
          window.history.replaceState({}, "", "/deposit");
        } else if (polls >= 100) {
          window.clearInterval(timer);
          setReturnState({ ref, phase: "waiting" });
          window.history.replaceState({}, "", "/deposit");
        }
      }).catch(() => { /* keep polling; the webhook may still land */ });
    }, 3000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const instantValue = Number(instantAmount);
  const instantValid = /^\d+(\.\d{1,2})?$/.test(instantAmount) && instantValue >= MIN && instantValue <= MAX;
  const instantPhoneDigits = instantPhone.replace(/\D/g, "");
  const instantPhoneValid = /^0\d{9}$/.test(instantPhoneDigits) || /^233\d{9}$/.test(instantPhoneDigits);
  const network = networkPick ?? networkFromPhone(instantPhone);

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

  async function submitInstant() {
    if (!instantValid) { toast.error(`Enter an amount between ${MIN} and ${fmt(MAX)}, with at most two decimal places`); return; }
    if (!instantPhoneValid) { toast.error("Enter a valid Ghana MoMo number"); return; }
    if (!network) { toast.error("Pick the network for that number"); return; }
    setInstantBusy(true);
    try {
      const r = await createPayment({ data: { amountMinor: Math.round(instantValue * 100), network } });
      if (!r.checkoutUrl) { toast.error(r.reason || "The payment could not be started."); return; }
      try { sessionStorage.setItem("sk-paypulse-pending", JSON.stringify({ ref: r.reference, paymentRef: r.id, amount: instantValue })); } catch { /* storage unavailable; the return page still shows a note */ }
      window.location.href = r.checkoutUrl;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "The payment could not be started.");
    } finally {
      setInstantBusy(false);
    }
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

  return <WalletPage title="Deposit" helpText="Pay instantly with MoMo, or send Telecel Cash manually and submit your transaction ID. The super admin checks manual payments before crediting.">
    <div className="space-y-4 px-3 pb-8">
      {returnState && (
        <div className={cn("border p-4 text-sm", returnState.phase === "credited" ? "border-primary bg-primary/10" : returnState.phase === "failed" ? "border-destructive bg-destructive/10" : "border-border bg-paper")}>
          {returnState.phase === "polling" && <p><strong>Checking your payment…</strong><br />You approved the prompt on your phone. Your wallet is credited automatically once it confirms — stay on this page.</p>}
          {returnState.phase === "credited" && <p><strong>Payment confirmed.</strong><br />Your wallet has been credited. Check your balance below.</p>}
          {returnState.phase === "failed" && <p><strong>That payment did not go through.</strong><br />Try the instant payment again, or use manual transfer below.</p>}
          {returnState.phase === "waiting" && <p><strong>Still waiting for confirmation.</strong><br />If you approved the prompt on your phone, your wallet will be credited shortly. If nothing arrives in a few minutes, check your balance or use manual transfer.</p>}
        </div>
      )}

      <div className="flex gap-2" role="tablist" aria-label="Deposit method">
        <Button type="button" variant={tab === "instant" ? "default" : "outline"} className="h-11 flex-1 rounded-none" onClick={() => setTab("instant")}>Instant MoMo</Button>
        <Button type="button" variant={tab === "manual" ? "default" : "outline"} className="h-11 flex-1 rounded-none" onClick={() => setTab("manual")}>Manual transfer</Button>
      </div>

      {tab === "instant" && (
        <div className="space-y-4">
          <div className="border-b border-border bg-paper py-4"><div className="flex items-center justify-between gap-2"><h2 className="text-xl font-bold">Instant MoMo</h2><span className="text-xs font-semibold text-paper-muted">PayPulse</span></div><p className="mt-1 text-xs text-paper-muted">Approve the prompt on your phone — your wallet is credited automatically.</p></div>
          {!readiness.data?.ready ? (
            <p className="border border-border bg-paper p-4 text-sm text-paper-muted">{readiness.isPending ? "Checking instant payments…" : (readiness.data?.reason ?? "Instant deposits are switched off right now.")} Use manual transfer below for now.</p>
          ) : (
            <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); void submitInstant(); }}>
              <div className="relative"><Input inputMode="decimal" placeholder={`Amount(${CURRENCY})`} value={instantAmount} onChange={(e) => setInstantAmount(e.target.value.replace(/[^\d.]/g, ""))} className="h-12 rounded-none bg-transparent pr-20" aria-label="Amount" /><span className="pointer-events-none absolute right-3 top-4 text-xs text-paper-muted">min. {fmt(MIN)}</span></div>
              <Input inputMode="tel" placeholder={`Your MoMo number (${profile?.phone ?? "e.g. 0501234567"})`} value={instantPhone} onChange={(e) => { setInstantPhone(e.target.value.trim()); }} className="h-12 rounded-none bg-transparent" aria-label="MoMo number" />
              <div>
                <p className="pb-2 text-xs text-paper-muted">Network {network ? `— ${NETWORKS.find((n) => n.id === network)?.label}` : "— pick one"}</p>
                <div className="flex gap-2">
                  {NETWORKS.map((n) => (
                    <Button key={n.id} type="button" variant={network === n.id ? "default" : "outline"} className="h-10 flex-1 rounded-none text-xs" onClick={() => setNetworkPick(n.id)}>{n.label}</Button>
                  ))}
                </div>
              </div>
              <Button type="submit" className="h-12 w-full rounded-none" disabled={instantBusy || !instantValid || !instantPhoneValid || !network}>{instantBusy ? "Starting payment…" : "Pay with MoMo"}</Button>
              <p className="text-xs text-paper-muted">You will be taken to PayPulse to approve the payment on your phone. Approve the exact amount — your wallet is credited the full amount, automatically.</p>
            </form>
          )}
        </div>
      )}

      {tab === "manual" && (
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
      )}

      <p className="text-right text-[11px] text-paper-muted">Balance ({CURRENCY}) {profile ? fmt(profile.balance) : "—"}</p>

      <section className="border-t border-border pt-4"><h2 className="mb-2 font-sans text-sm font-semibold">My deposit requests</h2>
        {mine.length === 0 ? <p className="text-xs text-paper-muted">No deposit requests yet.</p> : <div className="divide-y divide-border">{mine.map((d) => <div key={d.id} className="flex items-center justify-between gap-3 py-3 text-sm"><div><p className="font-bold">{CURRENCY} {fmt(d.amount)}</p><p className="text-xs text-paper-muted">{d.external_ref ? `Txn ${d.external_ref} · ` : ""}{new Date(d.created_at).toLocaleString()}</p></div><span className={cn("px-2 py-1 text-xs capitalize", STATUS_STYLE[d.status] ?? "bg-secondary text-muted-foreground")}>{d.status}</span></div>)}</div>}
      </section>

      <div className="flex gap-2 border-t border-border pt-3 text-xs text-paper-muted"><ShieldCheck className="size-4 shrink-0" /><p>Your wallet is credited once the super admin confirms your payment — the full amount, credited exactly once.</p></div>
      <ol className="list-inside list-decimal space-y-1 bg-paper p-3 text-xs leading-5 text-paper-muted"><li>Maximum per transaction is {CURRENCY} {fmt(MAX)}.</li><li>Minimum per transaction is {CURRENCY} {fmt(MIN)}.</li><li>Only send to the number on this page, and keep your transaction ID.</li></ol>
    </div>
  </WalletPage>;
}

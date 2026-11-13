import { createFileRoute } from "@tanstack/react-router";
import { WalletPage } from "@/components/WalletPage";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CURRENCY, fmt, profileQuery } from "@/lib/betting";
import { DEPOSIT_MIN_GHS as MIN, DEPOSIT_MAX_GHS as MAX } from "@/lib/deposit-policy";
import { getPayPulseReadiness, createPayPulsePayment, checkPayPulsePayment } from "@/lib/paypulse-payments.functions";
import { cn } from "@/lib/utils";

// Deposit is Instant MoMo only (PayPulse, Prince 2026-11-13). Manual
// transfer was removed entirely on Prince's order the same day — the
// engine's deposit-manual handler now refuses new submissions with
// 410, and the super-admin Deposits review tab is gone with it.

export const Route = createFileRoute("/_authenticated/deposit")({
  head: () => ({ meta: [
    { title: "Deposit — StakeKing" },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "description", content: "Pay instantly with MoMo. Approve the prompt on your phone and your wallet is credited automatically." },
    { property: "og:title", content: "Deposit — StakeKing" },
    { property: "og:description", content: "Pay instantly with MoMo. Approve the prompt on your phone and your wallet is credited automatically." },
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
          toast.error("That payment did not go through — try again");
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

  const instantValue = Number(instantAmount);
  const instantValid = /^\d+(\.\d{1,2})?$/.test(instantAmount) && instantValue >= MIN && instantValue <= MAX;
  const instantPhoneDigits = instantPhone.replace(/\D/g, "");
  const instantPhoneValid = /^0\d{9}$/.test(instantPhoneDigits) || /^233\d{9}$/.test(instantPhoneDigits);
  const network = networkPick ?? networkFromPhone(instantPhone);

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

  return <WalletPage title="Deposit" helpText="Pay instantly with MoMo. Approve the prompt on your phone and your wallet is credited automatically.">
    <div className="space-y-4 px-3 pb-8">
      {returnState && (
        <div className={cn("border p-4 text-sm", returnState.phase === "credited" ? "border-primary bg-primary/10" : returnState.phase === "failed" ? "border-destructive bg-destructive/10" : "border-border bg-paper")}>
          {returnState.phase === "polling" && <p><strong>Checking your payment…</strong><br />You approved the prompt on your phone. Your wallet is credited automatically once it confirms — stay on this page.</p>}
          {returnState.phase === "credited" && <p><strong>Payment confirmed.</strong><br />Your wallet has been credited. Check your balance below.</p>}
          {returnState.phase === "failed" && <p><strong>That payment did not go through.</strong><br />Try the instant payment again.</p>}
          {returnState.phase === "waiting" && <p><strong>Still waiting for confirmation.</strong><br />If you approved the prompt on your phone, your wallet will be credited shortly. If nothing arrives in a few minutes, check your balance.</p>}
        </div>
      )}

      <div className="space-y-4">
        <div className="border-b border-border bg-paper py-4"><div className="flex items-center justify-between gap-2"><h2 className="text-xl font-bold">Instant MoMo</h2><span className="text-xs font-semibold text-paper-muted">PayPulse</span></div><p className="mt-1 text-xs text-paper-muted">Approve the prompt on your phone — your wallet is credited automatically.</p></div>
        {!readiness.data?.ready ? (
          <p className="border border-border bg-paper p-4 text-sm text-paper-muted">{readiness.isPending ? "Checking instant payments…" : (readiness.data?.reason ?? "Instant deposits are switched off right now.")}</p>
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

      <p className="text-right text-[11px] text-paper-muted">Balance ({CURRENCY}) {profile ? fmt(profile.balance) : "—"}</p>

      <section className="border-t border-border pt-4"><h2 className="mb-2 font-sans text-sm font-semibold">My deposits</h2>
        {mine.length === 0 ? <p className="text-xs text-paper-muted">No deposits yet.</p> : <div className="divide-y divide-border">{mine.map((d) => <div key={d.id} className="flex items-center justify-between gap-3 py-3 text-sm"><div><p className="font-bold">{CURRENCY} {fmt(d.amount)}</p><p className="text-xs text-paper-muted">{d.external_ref ? `Txn ${d.external_ref} · ` : ""}{new Date(d.created_at).toLocaleString()}</p></div><span className={cn("px-2 py-1 text-xs capitalize", STATUS_STYLE[d.status] ?? "bg-secondary text-muted-foreground")}>{d.status}</span></div>)}</div>}
      </section>

      <ol className="list-inside list-decimal space-y-1 bg-paper p-3 text-xs leading-5 text-paper-muted"><li>Maximum per transaction is {CURRENCY} {fmt(MAX)}.</li><li>Minimum per transaction is {CURRENCY} {fmt(MIN)}.</li></ol>
    </div>
  </WalletPage>;
}

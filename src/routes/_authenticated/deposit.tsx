import { createFileRoute } from "@tanstack/react-router";
import { WalletPage } from "@/components/WalletPage";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getPaymentReadiness, createTestPayment, checkTestPayment, getMyPaymentAttempts, verifyShinobiPaymentNumber, submitShinobiOtp } from "@/lib/shinobipay-payments.functions";
import { paymentStatusLabel } from "@/lib/shinobipay-contract";
import { toast } from "sonner";
import { RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CURRENCY, fmt, profileQuery } from "@/lib/betting";
import { DEPOSIT_MIN_GHS as MIN, DEPOSIT_MAX_GHS as MAX } from "@/lib/deposit-policy";

export const Route = createFileRoute("/_authenticated/deposit")({
  head: () => ({ meta: [
    { title: "ShinobiPay Deposit — StakeKing Ghana" },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "description", content: "Track secure ShinobiPay GHS deposits and payment verification on StakeKing." },
    { property: "og:title", content: "ShinobiPay Deposit — StakeKing Ghana" },
    { property: "og:description", content: "Track secure ShinobiPay GHS deposits and payment verification on StakeKing." },
  ] }),
  component: Deposit,
});

type PaymentAction = { type: string; redirectUrl: string | null; expiresAt: string | null; ussdFallback: string | null };
type Payment = { id: string; status: string; action: PaymentAction | null; webhookVerified: boolean };

function Deposit() {
  const { data: profile } = useQuery(profileQuery);
  const qc = useQueryClient();
  const [methodId, setMethodId] = useState("MTN");
  const [amount, setAmount] = useState("");
  const getReadiness = useServerFn(getPaymentReadiness);
  const createPayment = useServerFn(createTestPayment);
  const verifyNumber = useServerFn(verifyShinobiPaymentNumber);
  const checkPayment = useServerFn(checkTestPayment);
  const sendOtp = useServerFn(submitShinobiOtp);
  const [otp, setOtp] = useState("");
  const [otpError, setOtpError] = useState("");
  const getAttempts = useServerFn(getMyPaymentAttempts);
  const readiness = useQuery({ queryKey: ["payment-readiness"], queryFn: () => getReadiness(), staleTime: 60000, retry: false, refetchOnWindowFocus: false, refetchOnReconnect: false });
  const attempts = useQuery({ queryKey: ["my-payment-attempts"], queryFn: () => getAttempts(), retry: false, refetchOnWindowFocus: false });
  const [payment, setPayment] = useState<Payment | null>(null);
  const [busy, setBusy] = useState(false);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  // Verify-first state: the provider-confirmed quote (account name +
  // exact total) for this number/network/amount, shown in the confirm
  // panel. Confirm never re-verifies; the server consumes this exact
  // confirmation once when the intent is created.
  const [verification, setVerification] = useState<{ quote: { accountName: string; requestedMinor: number; feeMinor: number; totalMinor: number }; network: string } | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [retryAt, setRetryAt] = useState(0);
  const [retryReason, setRetryReason] = useState("");
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!retryAt && !readiness.data?.retryAt) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [retryAt, readiness.data?.retryAt]);
  const waitSeconds = Math.max(0, Math.ceil((Math.max(retryAt, readiness.data?.retryAt ?? 0) - now) / 1000));
  const value = Number(amount);
  const valid = /^\d+(\.\d{1,2})?$/.test(amount) && value >= MIN && value <= MAX;
  const methods = readiness.data?.methods ?? [];
  const selected = methods.find((method) => method.id === methodId);
  const amountMinor = Math.round(value * 100);
  // The confirmation only stands for the exact number/network/amount it
  // was verified for; changing any of them drops back to Verify.
  const activeVerification = verification && verification.quote.requestedMinor === amountMinor && verification.network === selected?.id ? verification : null;

  async function verify() {
    if (!valid) { toast.error(`Enter an amount between ${MIN} and ${fmt(MAX)}, with at most two decimal places`); return; }
    if (!readiness.data?.ready || !selected || busy || verifying || waitSeconds > 0) return;
    if (selected.method !== "mobile_money") return;
    setVerifying(true);
    setRetryReason("");
    try {
      const result = await verifyNumber({ data: { amountMinor, method: selected.method, network: selected.id as "MTN" | "TELECEL" | "AIRTELTIGO" } });
      if (result.ok && result.quote) {
        setVerification({ quote: result.quote, network: selected.id });
      } else {
        setVerification(null);
        setRetryReason(result.error);
        if (result.retryAfter) { setRetryAt(result.retryAfter); setNow(Date.now()); }
      }
    } catch (error) { setVerification(null); setRetryReason(error instanceof Error ? error.message : "Number verification is unavailable"); }
    finally { setVerifying(false); }
  }

  async function submit() {
    if (!valid) { toast.error(`Enter an amount between ${MIN} and ${fmt(MAX)}, with at most two decimal places`); return; }
    if (!readiness.data?.ready || !selected || busy || waitSeconds > 0) return;
    // Fail closed: a mobile-money intent needs a live in-flow
    // confirmation; Confirm never re-verifies, the server consumes it.
    if (selected.method === "mobile_money" && !activeVerification) { toast.error("Verify your number and confirm the total before paying."); return; }
    setBusy(true);
    const attempt = attemptId ?? crypto.randomUUID();
    setAttemptId(attempt);
    try {
      const network = selected.id === "MTN" || selected.id === "TELECEL" || selected.id === "AIRTELTIGO" ? selected.id : undefined;
      const result = await createPayment({ data: { amountMinor: Math.round(value * 100), method: selected.method, network, attemptId: attempt } });
      if (result.id) {
        setPayment({ id: result.id, status: result.status, action: result.action, webhookVerified: false });
        if (result.action?.type === "redirect" && result.action.redirectUrl) window.location.assign(result.action.redirectUrl);
      } else if (/Verify your number first/.test(result.reason ?? "")) {
        // The server-side confirmation lapsed: drop the stale panel so
        // the user lands back on Verify instead of a dead Confirm button.
        setVerification(null);
        setRetryReason("That confirmation has expired. Verify your number again, then confirm.");
      } else { setRetryAt(result.retryAt); setNow(Date.now()); setRetryReason(result.reason); }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Payment could not be started";
      if (/Verify your number first/.test(message)) {
        setVerification(null);
        setRetryReason("That confirmation has expired. Verify your number again, then confirm.");
      } else setRetryReason(message);
    }
    finally { setBusy(false); void qc.invalidateQueries({ queryKey: ["my-payment-attempts"] }); }
  }

  async function submitOtpCode() {
    if (!payment || busy || otp.length < 4) return;
    setBusy(true);
    setOtpError("");
    try {
      const result = await sendOtp({ data: { id: payment.id, otp } });
      setPayment({ id: payment.id, status: result.status, action: result.action, webhookVerified: result.webhookVerified });
      setOtp("");
      if (result.otpError) setOtpError(result.otpError);
    } catch (error) { setOtpError(error instanceof Error ? error.message : "The code could not be sent"); }
    finally { setBusy(false); }
  }

  async function check(id: string) {
    if (busy || waitSeconds > 0) return;
    setBusy(true);
    try {
      const result = await checkPayment({ data: { id } });
      setPayment({ id, status: result.status, action: result.action, webhookVerified: result.webhookVerified });
      setRetryReason("");
      setRetryAt(Date.now() + 15000);
      setNow(Date.now());
      await qc.invalidateQueries({ queryKey: ["my-payment-attempts"] });
    } catch (error) { toast.error(error instanceof Error ? error.message : "Payment status unavailable"); }
    finally { setBusy(false); }
  }

  return <WalletPage title="Deposit" helpText="Deposits are made through ShinobiPay. Verify your number, confirm the exact total, then approve the prompt on your phone. Your wallet is credited as soon as ShinobiPay confirms the payment.">
    <div className="space-y-4 px-3 pb-8">
      <div className="border-b border-border bg-paper py-4"><div className="flex items-center justify-between gap-2"><h2 className="text-xl font-bold">ShinobiPay</h2><span className="text-xs font-semibold text-paper-muted">Online payment gateway</span></div><p className="mt-1 text-xs text-paper-muted">{readiness.data?.ready ? "Live payments available" : "Deposits unavailable"}</p></div>
      <div className="space-y-2"><label htmlFor="payment-method" className="text-sm font-semibold">Payment method</label><Select value={methodId} onValueChange={(value) => { setMethodId(value); setVerification(null); }} disabled={Boolean(attemptId) || Boolean(activeVerification) || methods.length === 0}><SelectTrigger id="payment-method" className="h-12 w-full rounded-none"><SelectValue placeholder="Checking ShinobiPay methods…" /></SelectTrigger><SelectContent>{methods.map((method) => <SelectItem key={method.id} value={method.id}>{method.label}</SelectItem>)}</SelectContent></Select>
      <p className="text-xs text-paper-muted">{readiness.data?.methodSource === "documented_ghs" ? "MTN Mobile Money, Telecel and AirtelTigo are supported." : "Payment methods could not be checked."}</p></div>
      {methodId !== "CARD" && <div className="flex justify-between text-xs text-paper-muted"><span>Mobile Number</span><span>{profile?.phone ?? "—"}</span></div>}
      <p className="pt-2 text-right text-[11px] text-paper-muted">Balance ({CURRENCY}) {profile ? fmt(profile.balance) : "—"}</p>
      <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        <div className="relative"><Input disabled={Boolean(attemptId) || Boolean(activeVerification)} inputMode="decimal" placeholder={`Amount(${CURRENCY})`} value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} className="h-12 rounded-none bg-transparent pr-20" aria-label="Amount" /><span className="pointer-events-none absolute right-3 top-4 text-xs text-paper-muted">min. {fmt(MIN)}</span></div>
        {selected?.method === "mobile_money" && !activeVerification ? (
          <Button type="button" className="h-12 w-full rounded-none" disabled={!readiness.data?.ready || !selected || !valid || busy || verifying || Boolean(payment) || waitSeconds > 0} onClick={() => void verify()}>{verifying ? "Verifying number…" : waitSeconds > 0 ? `Retry in ${waitSeconds}s` : readiness.data?.ready ? "Verify number" : "Deposits unavailable"}</Button>
        ) : !activeVerification ? (
          <Button type="submit" className="h-12 w-full rounded-none" disabled={!readiness.data?.ready || !selected || !valid || busy || Boolean(payment) || waitSeconds > 0}>{busy ? "Checking…" : waitSeconds > 0 ? `Retry in ${waitSeconds}s` : readiness.data?.ready ? "Deposit" : "Deposits unavailable"}</Button>
        ) : null}
      </form>
      {activeVerification && !payment && <section className="space-y-3 border border-border bg-paper p-4" aria-label="Confirm payment">
        <h2 className="text-lg font-semibold">Confirm payment</h2>
        <p className="text-xs text-paper-muted">ShinobiPay verified this number. Check the details, then confirm — confirming never re-checks your number.</p>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between gap-3"><dt className="text-paper-muted">Mobile number</dt><dd className="font-semibold">{profile?.phone ?? "—"}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-paper-muted">Network</dt><dd className="font-semibold">{selected?.label ?? activeVerification.network}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-paper-muted">Account name</dt><dd className="font-semibold">{activeVerification.quote.accountName}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-paper-muted">Deposit</dt><dd className="font-semibold">{CURRENCY} {fmt(activeVerification.quote.requestedMinor / 100)}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-paper-muted">Customer fee (2.5%)</dt><dd className="font-semibold">{CURRENCY} {fmt(activeVerification.quote.feeMinor / 100)}</dd></div>
          <div className="flex justify-between gap-3 border-t border-border pt-2"><dt className="font-semibold">Total you will be charged</dt><dd className="font-bold">{CURRENCY} {fmt(activeVerification.quote.totalMinor / 100)}</dd></div>
        </dl>
        <Button className="h-12 w-full rounded-none" disabled={busy || waitSeconds > 0} onClick={() => void submit()}>{busy ? "Checking…" : `Confirm & pay ${CURRENCY} ${fmt(activeVerification.quote.totalMinor / 100)}`}</Button>
        <Button variant="ghost" className="h-auto w-full px-0 text-xs" disabled={busy} onClick={() => setVerification(null)}>Change amount or method</Button>
      </section>}
      <p role="status" className="text-xs text-paper-muted">{readiness.isError ? "Payment availability could not be checked. Please try again in a moment." : readiness.data?.reason ?? "Checking payment availability…"}</p>
      <Button variant="link" className="h-auto px-0" disabled={busy || waitSeconds > 0 || readiness.isFetching} onClick={() => void readiness.refetch()}><RefreshCw className="size-4" />Check gateway</Button>
      {retryReason && <p role="alert" className="text-xs text-destructive">{retryReason}</p>}
      {payment && <section className="space-y-3 border-t border-border py-3">
        {payment.action?.type === "await_prompt" && payment.action.ussdFallback && <p className="text-xs font-semibold">No prompt on your phone? Dial {payment.action.ussdFallback} to approve the payment.</p>}
        {payment.action?.type === "submit_otp" && <form className="space-y-2" onSubmit={(event) => { event.preventDefault(); void submitOtpCode(); }}>
          <label htmlFor="payment-otp" className="text-sm font-semibold">Enter the code ShinobiPay sent you</label>
          <Input id="payment-otp" inputMode="numeric" autoComplete="one-time-code" placeholder="4–8 digit code" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 8))} className="h-12 rounded-none bg-transparent" />
          {otpError && <p role="alert" className="text-xs text-destructive">{otpError}</p>}
          <Button type="submit" variant="outline" disabled={busy || otp.length < 4}>{busy ? "Sending…" : "Submit code"}</Button>
        </form>}
        {payment.action?.type === "redirect" && !payment.action.redirectUrl && <p role="alert" className="text-xs text-paper-muted">ShinobiPay requires an additional payment step that could not be safely opened. Payment stays pending.</p>}
        {payment.action?.redirectUrl && <Button variant="outline" asChild><a href={payment.action.redirectUrl}>Continue with ShinobiPay</a></Button>}
        <Button variant="outline" disabled={busy || waitSeconds > 0} onClick={() => void check(payment.id)}><RefreshCw className="size-4" />Check payment</Button>
        {(payment.status === "failed" || payment.webhookVerified) && <Button variant="link" onClick={() => { setPayment(null); setAttemptId(null); setVerification(null); setRetryReason(""); setRetryAt(0); }}>New payment</Button>}
      </section>}
      <section className="border-t border-border pt-4"><div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Recent payment requests</h2><Button variant="ghost" size="icon" aria-label="Refresh payment requests" disabled={attempts.isFetching || busy} onClick={() => void attempts.refetch()}><RefreshCw className="size-4" /></Button></div>
        {attempts.isError ? <p role="alert" className="text-xs text-destructive">Payment requests could not be loaded.</p> : attempts.isPending ? <p className="text-xs text-paper-muted">Loading requests…</p> : !attempts.data?.length ? <p className="text-xs text-paper-muted">No payment requests yet.</p> : <div className="divide-y divide-border">{attempts.data.map((attempt) => <div key={attempt.id} className="flex items-center justify-between gap-3 py-3"><div className="min-w-0"><p className="text-sm font-semibold">GHS {fmt(attempt.amount_minor / 100)} · {paymentStatusLabel(attempt.status)}</p><p className="text-xs text-paper-muted">{attempt.mode === "test" ? "Test · no wallet credit" : "Live"}{attempt.webhook_verified_at ? " · Confirmation verified" : ""}</p></div>{attempt.intent_id && <Button variant="outline" size="sm" disabled={busy || waitSeconds > 0} onClick={() => { if (attempt.intent_id) void check(attempt.intent_id); }}>Check</Button>}</div>)}</div>}
      </section>
      <div className="flex gap-2 border-t border-border pt-3 text-xs text-paper-muted"><ShieldCheck className="size-4 shrink-0" /><p>Your wallet is credited once ShinobiPay confirms your payment — the full amount you paid, credited exactly once.</p></div>
      <ol className="list-inside list-decimal space-y-1 bg-paper p-3 text-xs leading-5 text-paper-muted"><li>Maximum per transaction is {CURRENCY} {fmt(MAX)}.</li><li>Minimum per transaction is {CURRENCY} {fmt(MIN)}.</li><li>Never retry an unknown payment as a new charge.</li></ol>
    </div>
  </WalletPage>;
}

import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Copy, ExternalLink, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { getPayPulseReadiness } from "@/lib/paypulse-payments.functions";

// PayPulse — instant MoMo (Prince, 2026-11-13; replaces ShinobiPay).
// Keys live ONLY in the server env on stakeking-api — nothing is
// typed or stored here. This tab shows whether the gateway is live
// and the webhook address to register in the PayPulse dashboard.
const WEBHOOK_URL = "https://stakeking-api.vercel.app/api/payments/paypulse-webhook";

export function PayPulseSettings() {
  const checkReadiness = useServerFn(getPayPulseReadiness);
  const readiness = useQuery({ queryKey: ["payment-readiness", "paypulse"], queryFn: () => checkReadiness(), staleTime: 60000, retry: false, refetchOnWindowFocus: false, refetchOnReconnect: false });
  const [copied, setCopied] = useState(false);

  const paymentStatus = readiness.isPending
    ? "Checking…"
    : readiness.data?.ready
      ? readiness.data.accountMode === "live" ? "On · Live" : "On · Test"
      : "Off";

  async function copyWebhook() {
    try {
      await navigator.clipboard.writeText(WEBHOOK_URL);
      setCopied(true);
      toast.success("Webhook address copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy address");
    }
  }

  return <section className="space-y-5 rounded-md border border-border bg-card p-4 text-card-foreground">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-xl font-bold">PayPulse — instant MoMo</h2>
      <span role="status" className={`text-sm font-semibold ${readiness.data?.ready ? "text-primary" : "text-muted-foreground"}`}>{paymentStatus}</span>
    </div>
    <p role="status" className="text-sm text-muted-foreground">{readiness.data?.reason ?? "Checking PayPulse account…"}</p>
    <p className="text-sm text-muted-foreground">Instant deposits run when the PayPulse keys are set on the server and the gateway is switched on. Keys are never typed here — they live only in the server env on <code>stakeking-api</code>: <code>PAYPULSE_SECRET_KEY</code> and <code>PAYPULSE_WEBHOOK_SECRET</code>.</p>
    <div className="space-y-2 border-t border-border pt-4">
      <Label>Webhook URL to add in PayPulse</Label>
      <div className="flex items-start gap-2"><code className="min-w-0 flex-1 break-all text-xs">{WEBHOOK_URL}</code><Button variant="outline" size="icon" aria-label="Copy webhook address" onClick={() => void copyWebhook()}><Copy className="size-4" /></Button></div>
      <p className="text-xs text-muted-foreground">Register this address in the PayPulse app for StakeKing, and save that app&rsquo;s webhook secret as <code>PAYPULSE_WEBHOOK_SECRET</code>. The address must be publicly reachable; a sign-in page or unpublished site prevents confirmation delivery.</p>
      <Button variant="link" className="h-auto max-w-full justify-start whitespace-normal px-0" asChild><a href="https://paypulse.totalh.net/docs.php" target="_blank" rel="noopener noreferrer"><KeyRound className="size-4 shrink-0" /> PayPulse Docs <ExternalLink className="size-4 shrink-0" /></a></Button>
    </div>
  </section>;
}

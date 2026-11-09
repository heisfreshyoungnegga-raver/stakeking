import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, ExternalLink, KeyRound, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getShinobiPaySettings, saveShinobiPaySettings } from "@/lib/shinobipay-settings.functions";
import { getPaymentReadiness } from "@/lib/shinobipay-payments.functions";

export function ShinobiPaySettings() {
  const getSettings = useServerFn(getShinobiPaySettings);
  const saveSettings = useServerFn(saveShinobiPaySettings);
  const checkReadiness = useServerFn(getPaymentReadiness);
  const readiness = useQuery({ queryKey: ["payment-readiness"], queryFn: () => checkReadiness(), staleTime: 60000, retry: false, refetchOnWindowFocus: false, refetchOnReconnect: false });
  const qc = useQueryClient();
  const { data, isPending, error } = useQuery({ queryKey: ["admin", "shinobipay"], queryFn: () => getSettings() });
  const [mode, setMode] = useState<"sandbox" | "live">("sandbox");
  const [saving, setSaving] = useState(false);
  const [enabledRequested, setEnabledRequested] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  useEffect(() => { if (data) { setMode(data.mode); setEnabledRequested(data.enabledRequested); } }, [data]);
  const webhookUrl = mode === "sandbox"
    ? "https://project--6fb19987-14a3-4fc0-876d-b5b963e81f7c-dev.lovable.app/api/public/shinobipay-webhook"
    : "https://project--6fb19987-14a3-4fc0-876d-b5b963e81f7c.lovable.app/api/public/shinobipay-webhook";
  const paymentStatus = data?.enabledRequested
    ? data.mode === "live" ? "Off · Live verification pending" : readiness.data?.ready ? "On (test only)" : "Off · Test setup pending"
    : "Off";

  async function save() {
    setSaving(true);
    try {
      await saveSettings({ data: { mode, enabled: enabledRequested, apiKey: apiKey || undefined, webhookSecret: webhookSecret || undefined } });
      setApiKey("");
      setWebhookSecret("");
      await qc.invalidateQueries({ queryKey: ["admin", "shinobipay"] });
      await qc.invalidateQueries({ queryKey: ["payment-readiness"] });
      toast.success("Settings saved securely. Real-money deposits remain disabled.");
    } catch { toast.error("Payment settings could not be saved"); }
    finally { setSaving(false); }
  }

  return <section className="space-y-5 rounded-md border border-border bg-card p-4 text-card-foreground">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-xl font-bold">ShinobiPay — instant MoMo prompt</h2>
      <span role="status" className={`text-sm font-semibold ${data?.mode === "sandbox" && data.enabledRequested && readiness.data?.ready ? "text-primary" : "text-muted-foreground"}`}>{paymentStatus}</span>
    </div>
    {error && <p role="alert" className="text-sm text-destructive">Payment settings could not be loaded.</p>}
    <div className="space-y-2">
      <Label htmlFor="shinobi-key">Secret API key</Label>
      <Input id="shinobi-key" type="password" autoComplete="new-password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={isPending ? "Checking…" : data?.apiKeySet ? "Secret key saved — paste to replace" : "Enter ShinobiPay secret API key"} disabled={saving} maxLength={4096} />
    </div>
    <div className="space-y-2">
      <Label htmlFor="shinobi-webhook-secret">Webhook secret</Label>
      <Input id="shinobi-webhook-secret" type="password" autoComplete="new-password" value={webhookSecret} onChange={(event) => setWebhookSecret(event.target.value)} placeholder={isPending ? "Checking…" : data?.webhookSecretSet ? "Webhook secret saved — paste to replace" : "Enter ShinobiPay webhook secret"} disabled={saving} maxLength={4096} />
    </div>
    <div className="space-y-2">
      <Label htmlFor="shinobi-mode">Payment mode</Label>
      <Select value={mode} onValueChange={(value) => setMode(value === "live" ? "live" : "sandbox")}>
        <SelectTrigger id="shinobi-mode"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="sandbox">Test (no real money)</SelectItem><SelectItem value="live">Live (real money)</SelectItem></SelectContent>
      </Select>
    </div>
    <div className="flex items-center gap-3"><Checkbox id="shinobi-enabled" checked={enabledRequested} onCheckedChange={(checked) => setEnabledRequested(checked === true)} disabled={saving || isPending || Boolean(error)} /><Label htmlFor="shinobi-enabled">Enabled</Label><Button onClick={() => void save()} disabled={saving || isPending || Boolean(error)}><Save className="size-4" />{saving ? "Saving…" : "Save"}</Button></div>
    <p role="status" className="text-sm text-muted-foreground">{readiness.data?.reason ?? "Checking ShinobiPay account…"}</p>
    <p className="text-xs text-muted-foreground">Enabled saves your request, not live activation. Real-money deposits remain off until payment verification and real-money accounting are complete. Leave key fields blank to keep saved keys.</p>
    <div className="space-y-2 border-t border-border pt-4">
      <Label>{mode === "sandbox" ? "Test webhook URL" : "Live webhook URL"} to add in ShinobiPay</Label>
      <div className="flex items-start gap-2"><code className="min-w-0 flex-1 break-all text-xs">{webhookUrl}</code><Button variant="outline" size="icon" aria-label="Copy webhook address" onClick={async () => { try { await navigator.clipboard.writeText(webhookUrl); toast.success("Webhook address copied"); } catch { toast.error("Could not copy address"); } }}><Copy className="size-4" /></Button></div>
      <p className="text-xs text-muted-foreground">Register this address in the matching ShinobiPay mode and save that endpoint’s webhook secret. The address must be publicly reachable; a sign-in page or unpublished site prevents confirmation delivery. Live payments remain locked.</p>
      <Button variant="link" className="h-auto max-w-full justify-start whitespace-normal px-0" asChild><a href="https://shinobipay.vercel.app/dashboard/developers" target="_blank" rel="noopener noreferrer"><KeyRound className="size-4 shrink-0" /> ShinobiPay Developers <ExternalLink className="size-4 shrink-0" /></a></Button>
    </div>
  </section>;
}
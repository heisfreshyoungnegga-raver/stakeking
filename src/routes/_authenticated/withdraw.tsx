import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { CURRENCY, fmt, profileQuery } from "@/lib/betting";
import { WalletPage, WalletMethod } from "@/components/WalletPage";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/withdraw")({
  head: () => ({
    meta: [
      { title: "Withdraw — StakeKing" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "description", content: "Request a withdrawal for admin approval." },
      { property: "og:title", content: "Withdraw — StakeKing" },
      { property: "og:description", content: "Request a withdrawal for admin approval." },
    ],
  }),
  component: Withdraw,
});

const MOMO_METHODS = ["MTN Mobile Money", "Telecel Cash", "AirtelTigo Money"];
const BANK_METHODS = ["Bank Transfer"];

type WithdrawalTx = { id: string; amount: number; status: string; created_at: string; note: string };

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-gold/20 text-gold",
  approved: "bg-primary/15 text-primary",
  paid: "bg-primary/15 text-primary",
  rejected: "bg-destructive/15 text-destructive",
};

function Withdraw() {
  const { data: p } = useQuery(profileQuery);
  const qc = useQueryClient();
  const [tab, setTab] = useState<"momo" | "bank">("momo");
  const [method, setMethod] = useState(MOMO_METHODS[0]);
  const [account, setAccount] = useState("");
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);

  const { data: requests = [] } = useQuery({
    queryKey: ["transactions", "my-withdrawals"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return [];
      const { data, error } = await supabase
        .from("transactions")
        .select("id, amount, status, created_at, note")
        .eq("user_id", u.user.id)
        .eq("type", "withdrawal")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data as WithdrawalTx[];
    },
  });

  const req = Number(p?.wager_required ?? 0);
  const prog = Math.min(Number(p?.wager_progress ?? 0), req);
  const met = prog >= req;

  async function submit() {
    setLoading(true);
    const { error } = await supabase.rpc("request_withdrawal", { _amount: Number(amount) });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`Withdrawal of ${fmt(Number(amount))} to ${method} ${account} sent for approval`);
    setAmount("");
    qc.invalidateQueries({ queryKey: ["profile"] });
    qc.invalidateQueries({ queryKey: ["transactions"] });
  }

  return <WalletPage title="Withdraw">
    <div className="space-y-4 px-3 pb-8">
      <WalletMethod bank={tab === "bank"} onBankChange={(bank) => { setTab(bank ? "bank" : "momo"); setMethod(bank ? BANK_METHODS[0] : MOMO_METHODS[0]); }} method={method ?? "MTN Mobile Money"} onMethodChange={setMethod} />
      <Input inputMode={tab === "momo" ? "tel" : "text"} placeholder={tab === "momo" ? `Mobile money number (${p?.phone ?? "+233"})` : "Bank account number"} value={account} onChange={(e) => setAccount(e.target.value.trim())} className="h-12 rounded-none bg-transparent" aria-label="Account number" />
      <div className="space-y-1 pt-3 text-right text-[11px] text-paper-muted"><p>Balance ({CURRENCY}) {p ? fmt(p.balance) : "—"}</p><p>Withdrawable Balance ({CURRENCY}) {p ? fmt(met ? p.balance : 0) : "—"}</p></div>
      <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        <Input inputMode="decimal" placeholder={`Amount(${CURRENCY})`} value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} className="h-12 rounded-none bg-transparent" aria-label="Amount" />
        <Button type="submit" className="h-12 w-full rounded-none" disabled={!met || loading || !amount || !account}>{loading ? "Submitting…" : "Withdraw"}</Button>
      </form>
      <div className="space-y-2 text-xs text-paper-muted">
        <p>Wagering requirement (2× deposits): {fmt(prog)} / {fmt(req)}</p>
        <Progress value={req ? (prog / req) * 100 : 100} className="h-1" />
        <p>{met ? "Eligible to request withdrawal." : `Wager ${fmt(req - prog)} more before withdrawing.`}</p>
        <p>Every request needs manual approval before payment is sent.</p>
      </div>
      {requests.length > 0 && <section className="border-t border-border pt-4"><h2 className="mb-2 font-sans text-sm font-semibold">My withdrawal requests</h2><div className="divide-y divide-border">{requests.map((r) => <div key={r.id} className="flex items-center justify-between py-3 text-sm"><div><p className="font-bold">{CURRENCY} {fmt(r.amount)}</p><p className="text-xs text-paper-muted">{new Date(r.created_at).toLocaleString()}</p></div><span className={cn("px-2 py-1 text-xs capitalize", STATUS_STYLE[r.status] ?? "bg-secondary text-muted-foreground")}>{r.status}</span></div>)}</div></section>}
    </div>
  </WalletPage>;
}

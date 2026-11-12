import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import { categoriesQuery, contentQuery, CURRENCY, fmt } from "@/lib/betting";
import { PayoutSmsMoment, type PayoutData } from "@/components/PayoutSms";
import { supportEmailLink, whatsappLink } from "@/lib/account";

export const Route = createFileRoute("/_authenticated/admin")({
  beforeLoad: async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) throw redirect({ to: "/login" });
    const { data } = await supabase.rpc("has_role", { _user_id: u.user.id, _role: "admin" });
    if (!data) throw redirect({ to: "/sports" });
  },
  head: () => ({
    meta: [
      { title: "Admin — StakeKing" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "description", content: "StakeKing administration dashboard." },
      { property: "og:title", content: "Admin — StakeKing" },
      { property: "og:description", content: "StakeKing administration dashboard." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Admin,
});

const Box = ({ children }: { children: ReactNode }) => <div className="space-y-3 rounded-xl border border-border bg-card p-4">{children}</div>;
const err = (e: { message: string } | null) => { if (e) { toast.error(e.message); return true; } return false; };
// Adapter-added RPCs (admin teams + invites) are not in the generated
// Supabase types, so call them through this narrow untyped bridge.
export const rpcCall = (name: string, args: Record<string, unknown> = {}) =>
  (supabase.rpc as unknown as (n: string, a: Record<string, unknown>) => Promise<{ data: any; error: { message: string } | null }>)(name, args);

function Admin() {
  return (
    <div className="space-y-5">
      <h1 className="text-4xl font-bold uppercase">Admin <span className="text-gold">portal</span></h1>
      <Tabs defaultValue="matches">
        <TabsList className="flex h-auto w-full flex-wrap justify-start">
          {["matches", "team", "categories", "bets", "transactions", "promotions", "referrals", "content", "support", "feedback"].map((t) => (
            <TabsTrigger key={t} value={t} className="capitalize">{t === "team" ? "My Team" : t}</TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="matches"><Matches /></TabsContent>
        <TabsContent value="team"><MyTeam /></TabsContent>
        <TabsContent value="categories"><Categories /></TabsContent>
        <TabsContent value="bets"><Bets /></TabsContent>
        <TabsContent value="transactions"><Transactions /></TabsContent>
        <TabsContent value="promotions"><Promotions /></TabsContent>
        <TabsContent value="referrals"><Referrals /></TabsContent>
        <TabsContent value="content"><Content /></TabsContent>
        <TabsContent value="support"><SupportSettings /></TabsContent>
        <TabsContent value="feedback"><Feedback /></TabsContent>
      </Tabs>
    </div>
  );
}

export function Users() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const { data } = useQuery({
    queryKey: ["admin", "users"],
    queryFn: async () => (await supabase.from("profiles").select("*").order("created_at", { ascending: false })).data ?? [],
  });
  async function adjust(id: string) {
    const v = Number(prompt("Adjust balance by (use negative to deduct):") ?? "");
    if (!v) return;
    if (err((await supabase.rpc("admin_adjust_balance", { _user: id, _amount: v })).error)) return;
    toast.success("Balance updated");
    qc.invalidateQueries({ queryKey: ["admin"] });
  }
  const list = (data ?? []).filter((u) => (u.full_name + u.email + u.phone).toLowerCase().includes(q.toLowerCase()));
  return (
    <Box>
      <Input placeholder="Search users…" value={q} onChange={(e) => setQ(e.target.value)} />
      <p className="text-xs text-muted-foreground">{list.length} users</p>
      <div className="divide-y divide-border">
        {list.map((u) => (
          <div key={u.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
            <div className="min-w-0">
              <p className="font-semibold">{u.full_name || "—"} <span className="text-xs text-muted-foreground">({u.country})</span></p>
              <p className="truncate text-xs text-muted-foreground">{u.email} · {u.phone} {u.referral_code && `· ref ${u.referral_code}`}</p>
            </div>
            <div className="flex items-center gap-2">
              {(u as { status?: string }).status === "pending" && <span className="rounded bg-gold/20 px-2 py-0.5 text-xs font-bold text-gold">PENDING ADMIN</span>}
              <span className="font-bold text-primary">{fmt(u.balance)} {CURRENCY}</span>
              {(u as { status?: string }).status === "pending" ? (
                <>
                  <Button size="sm" variant="brand" onClick={async () => { if (err((await rpcCall("verify_admin", { _user: u.id, _action: "verify" })).error)) return; toast.success("Admin verified"); qc.invalidateQueries({ queryKey: ["admin"] }); }}>Verify</Button>
                  <Button size="sm" variant="outline" onClick={async () => { if (err((await rpcCall("verify_admin", { _user: u.id, _action: "remove" })).error)) return; toast.success("Admin removed"); qc.invalidateQueries({ queryKey: ["admin"] }); }}>Remove</Button>
                </>
              ) : (
                <Button size="sm" variant="secondary" onClick={() => adjust(u.id)}>Adjust</Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </Box>
  );
}

export function MyTeam() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["admin", "my-team"],
    queryFn: async () => {
      const r = await rpcCall("my_team");
      if (r.error) throw new Error(r.error.message);
      return r.data as {
        invite_code: string;
        invited_users: { id: string; phone: string; display_name: string | null; created_at: string; deposits_ghs: number }[];
        commissions: { earned_ghs: number; paid_ghs: number; pending_ghs: number };
        recent: { amount_ghs: number; pct: number; paid_at: string | null; created_at: string; from_phone: string }[];
        payout_request: { amount_ghs: number } | null;
        referrals_with_deposit: number;
        commission_pct: number;
      };
    },
  });
  if (!data) return <Box><p className="text-sm text-muted-foreground">Loading your team…</p></Box>;
  const link = `${window.location.origin}/register?ref=${data.invite_code}`;
  return (
    <Box>
      <div>
        <p className="text-sm font-semibold">Your referral link</p>
        <p className="text-xs text-muted-foreground">Players who register with this link join your team, and you earn {data.commission_pct}% commission on their deposits.</p>
        <div className="mt-2 flex gap-2">
          <Input readOnly value={link} className="font-mono text-xs" />
          <Button variant="brand" onClick={async () => { await navigator.clipboard.writeText(link).catch(() => {}); toast.success("Referral link copied"); }}>Copy</Button>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">Your code: <b className="text-gold">{data.invite_code}</b></p>
      </div>
      <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div className="rounded-lg bg-muted p-3"><p className="text-xs text-muted-foreground">Team members</p><p className="text-lg font-bold">{data.invited_users.length}</p></div>
        <div className="rounded-lg bg-muted p-3"><p className="text-xs text-muted-foreground">With deposits</p><p className="text-lg font-bold">{data.referrals_with_deposit}</p></div>
        <div className="rounded-lg bg-muted p-3"><p className="text-xs text-muted-foreground">Commission earned</p><p className="text-lg font-bold">{fmt(data.commissions.earned_ghs)} {CURRENCY}</p></div>
        <div className="rounded-lg bg-muted p-3"><p className="text-xs text-muted-foreground">Pending payout</p><p className="text-lg font-bold">{fmt(data.commissions.pending_ghs)} {CURRENCY}</p></div>
      </div>
      {data.payout_request ? (
        <p className="text-sm">Payout of <b>{fmt(data.payout_request.amount_ghs)} {CURRENCY}</b> requested — waiting for the super admin.</p>
      ) : data.commissions.pending_ghs > 0 ? (
        <Button variant="brand" onClick={async () => { if (err((await rpcCall("request_commission_payout")).error)) return; toast.success("Payout requested"); qc.invalidateQueries({ queryKey: ["admin", "my-team"] }); }}>Request payout</Button>
      ) : null}
      <div>
        <p className="text-sm font-semibold">Team members</p>
        <div className="divide-y divide-border">
          {data.invited_users.length === 0 && <p className="py-2 text-sm text-muted-foreground">Nobody has joined through your link yet.</p>}
          {data.invited_users.map((u) => (
            <div key={u.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <span>{u.display_name || "—"} <span className="text-xs text-muted-foreground">{u.phone} · joined {new Date(u.created_at).toLocaleDateString()}</span></span>
              <span className="font-semibold">{fmt(u.deposits_ghs)} {CURRENCY} deposited</span>
            </div>
          ))}
        </div>
      </div>
      {data.recent.length > 0 && (
        <div>
          <p className="text-sm font-semibold">Recent commissions</p>
          <div className="divide-y divide-border">
            {data.recent.map((r, i) => (
              <div key={i} className="flex items-center justify-between py-2 text-sm">
                <span>{r.from_phone} <span className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</span></span>
                <span className="font-semibold">+{fmt(r.amount_ghs)} {CURRENCY} <span className="text-xs text-muted-foreground">{r.paid_at ? "paid" : "pending"}</span></span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Box>
  );
}

// Correct Score grid for the Add Match form (Prince, 2026-11-10: the
// super admin sets these prices himself; players see exactly these).
// Auto prices mirror the engine's fullBookFromOdds Correct Score
// pricer — same Poisson split of the 1X2 line (mu = 2.7, 5% margin) —
// so the prefill matches what the server would derive untouched.
const CS_RANGE = [0, 1, 2, 3, 4, 5];
function csAutoPrices(o1: number, ox: number, o2: number): Record<string, number> {
  if (!(o1 > 1 && ox > 1 && o2 > 1)) return {};
  const r0 = 1 / o1, r2 = 1 / o2;
  const margin = r0 + 1 / ox + r2;
  const pH = r0 / margin, pA = r2 / margin;
  const mu = 2.7;
  const muH = (mu * (pH / (pH + pA || 1))) || mu / 2;
  const muA = Math.max(mu - muH, 0.15);
  const pmf = (lambda: number) => {
    const arr: number[] = [Math.exp(-lambda)];
    for (let k = 1; k <= 12; k++) arr.push(((arr[k - 1] as number) * lambda) / k);
    return arr;
  };
  const PH = pmf(muH), PA = pmf(muA);
  const out: Record<string, number> = {};
  for (let h = 0; h <= 5; h++) for (let a = 0; a <= 5; a++) {
    const p = (PH[h] as number) * (PA[a] as number);
    if (!(p >= 0.002)) continue;
    const v = Math.round(((1 / p) / (margin > 1 ? 1.05 : 1)) * 100) / 100;
    if (v >= 1.02 && v <= 500) out[h + ":" + a] = v;
  }
  return out;
}

function Matches() {
  const qc = useQueryClient();
  const { data: cats } = useQuery(categoriesQuery);
  const { data } = useQuery({
    queryKey: ["admin", "matches"],
    queryFn: async () => (await supabase.from("matches").select("*").order("start_time")).data ?? [],
  });
  const blank = { category_id: "", league: "", home_team: "", away_team: "", start_time: "", odds_home: "2.00", odds_draw: "3.00", odds_away: "3.50" };
  const [f, setF] = useState(blank);
  // Goal timing: the created match's clock, live score and final
  // score all run from this script (Prince's featured-match model).
  const [goals, setGoals] = useState<{ minute: number; side: "home" | "away" }[]>([]);
  const [gMin, setGMin] = useState("");
  const [noGoals, setNoGoals] = useState(false);
  const [htStop, setHtStop] = useState("");
  const [ftStop, setFtStop] = useState("");
  // Correct Score prices: auto-filled from the 1X2 line, any cell the
  // admin types over becomes his own price (tracked in csEdited and
  // never overwritten by later 1X2 edits).
  const [cs, setCs] = useState<Record<string, string>>({});
  const [csEdited, setCsEdited] = useState<Set<string>>(new Set());
  useEffect(() => {
    const auto = csAutoPrices(Number(f.odds_home), Number(f.odds_draw), Number(f.odds_away));
    setCs((prev) => {
      const next: Record<string, string> = {};
      for (const [k, v] of Object.entries(auto)) next[k] = String(v);
      csEdited.forEach((k) => { const pv = prev[k]; if (pv !== undefined) next[k] = pv; });
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.odds_home, f.odds_draw, f.odds_away]);
  function setCsCell(key: string, val: string) {
    setCs((prev) => ({ ...prev, [key]: val }));
    setCsEdited((prev) => new Set(prev).add(key));
  }
  function resetCs() {
    setCsEdited(new Set());
    const auto = csAutoPrices(Number(f.odds_home), Number(f.odds_draw), Number(f.odds_away));
    const next: Record<string, string> = {};
    for (const [k, v] of Object.entries(auto)) next[k] = String(v);
    setCs(next);
  }
  const refresh = () => { qc.invalidateQueries({ queryKey: ["admin"] }); qc.invalidateQueries({ queryKey: ["matches"] }); };

  function addGoal(side: "home" | "away") {
    const minute = Math.round(Number(gMin));
    if (!(minute >= 1 && minute <= 90)) { toast.error("Goal minute must be 1 to 90"); return; }
    setGoals((g) => [...g, { minute, side }].sort((a, b) => a.minute - b.minute));
    setGMin(""); setNoGoals(false);
  }

  async function add() {
    if (!f.home_team || !f.away_team || !f.category_id) { toast.error("Category and teams required"); return; }
    if (!goals.length && !noGoals) { toast.error("Goal timing is required — add the goals, or tick No goals for a 0-0 match"); return; }
    const csObj: Record<string, number> = {};
    for (const [k, v] of Object.entries(cs)) {
      const n = Number(v);
      if (n > 1) csObj[k] = Math.round(n * 100) / 100;
    }
    const payload = {
      ...f, start_time: f.start_time ? new Date(f.start_time).toISOString() : new Date().toISOString(),
      odds_home: Number(f.odds_home), odds_draw: Number(f.odds_draw), odds_away: Number(f.odds_away),
      goal_events: goals, ht_stoppage: Number(htStop) || 0, ft_stoppage: Number(ftStop) || 0,
      ...(Object.keys(csObj).length ? { markets: { "Correct Score": csObj } } : {}),
    };
    // goal_events / stoppages / markets are adapter-level fields the
    // generated client types do not know; the cast keeps them on the
    // payload.
    const { error } = await supabase.from("matches").insert(payload as TablesInsert<"matches">);
    if (err(error)) return;
    setF(blank); setGoals([]); setNoGoals(false); setHtStop(""); setFtStop(""); setCs({}); setCsEdited(new Set()); refresh(); toast.success("Match added");
  }
  async function upd(id: string, patch: TablesUpdate<"matches">) {
    if (err((await supabase.from("matches").update(patch).eq("id", id)).error)) return;
    refresh();
  }
  async function del(id: string) {
    if (!confirm("Delete match?")) return;
    if (err((await supabase.from("matches").delete().eq("id", id)).error)) return;
    refresh();
  }

  return (
    <div className="space-y-4">
      <Box>
        <h3 className="text-lg font-bold uppercase">Add match</h3>
        <div className="grid gap-2 sm:grid-cols-2">
          <select className="h-9 rounded-md border border-input bg-secondary px-2 text-sm" value={f.category_id} onChange={(e) => setF({ ...f, category_id: e.target.value })}>
            <option value="">Category…</option>
            {cats?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <Input placeholder="League" value={f.league} onChange={(e) => setF({ ...f, league: e.target.value })} />
          <Input placeholder="Home team" value={f.home_team} onChange={(e) => setF({ ...f, home_team: e.target.value })} />
          <Input placeholder="Away team" value={f.away_team} onChange={(e) => setF({ ...f, away_team: e.target.value })} />
          <Input type="datetime-local" value={f.start_time} onChange={(e) => setF({ ...f, start_time: e.target.value })} />
          <div className="grid grid-cols-3 gap-2">
            <Input aria-label="Odds 1" value={f.odds_home} onChange={(e) => setF({ ...f, odds_home: e.target.value })} />
            <Input aria-label="Odds X" value={f.odds_draw} onChange={(e) => setF({ ...f, odds_draw: e.target.value })} />
            <Input aria-label="Odds 2" value={f.odds_away} onChange={(e) => setF({ ...f, odds_away: e.target.value })} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <p className="text-sm font-semibold">Goal timing <span className="text-xs font-normal text-muted-foreground">— required. The match clock, live score and final score all run from this script, and the full market book is priced from the 1 X 2 odds automatically. Correct Score prices are set in the section below.</span></p>
            <div className="flex flex-wrap items-center gap-2">
              <Input className="w-24" placeholder="Minute" inputMode="numeric" value={gMin} onChange={(e) => setGMin(e.target.value.replace(/[^\d]/g, ""))} aria-label="Goal minute" />
              <Button size="sm" variant="secondary" onClick={() => addGoal("home")}>+ Home goal</Button>
              <Button size="sm" variant="secondary" onClick={() => addGoal("away")}>+ Away goal</Button>
              <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={noGoals} onChange={(e) => { setNoGoals(e.target.checked); if (e.target.checked) setGoals([]); }} /> No goals — ends 0-0</label>
            </div>
            {goals.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                {goals.map((g, i) => (
                  <span key={i} className="flex items-center gap-1 rounded bg-muted px-2 py-1 text-xs font-semibold">
                    {g.minute}′ {g.side === "home" ? (f.home_team || "Home") : (f.away_team || "Away")}
                    <button type="button" aria-label="Remove goal" onClick={() => setGoals(goals.filter((_, j) => j !== i))}>×</button>
                  </span>
                ))}
                <span className="text-xs text-muted-foreground">Final score from script: {goals.filter((g) => g.side === "home").length}–{goals.filter((g) => g.side === "away").length}</span>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <Input className="w-40" placeholder="1st-half stoppage (min)" inputMode="numeric" value={htStop} onChange={(e) => setHtStop(e.target.value.replace(/[^\d]/g, ""))} aria-label="First half stoppage minutes" />
              <Input className="w-40" placeholder="2nd-half stoppage (min)" inputMode="numeric" value={ftStop} onChange={(e) => setFtStop(e.target.value.replace(/[^\d]/g, ""))} aria-label="Second half stoppage minutes" />
              <span className="text-xs text-muted-foreground">Clock: 45 + 1st-half stoppage, 15 min half-time break, 45 + 2nd-half stoppage. Blank kickoff starts the match now.</span>
            </div>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <p className="text-sm font-semibold">Correct Score <span className="text-xs font-normal text-muted-foreground">— you set these prices. Auto-filled from the 1 X 2 odds; type over any score to set your own price, or blank a score to not offer it. What is set here is exactly what players see and bet at. Rows are home goals, columns are away goals.</span></p>
            <div className="overflow-x-auto">
              <table className="border-separate" style={{ borderSpacing: 4 }}>
                <thead>
                  <tr>
                    <th className="text-xs text-muted-foreground">H \ A</th>
                    {CS_RANGE.map((a) => <th key={a} className="text-xs text-muted-foreground">{a}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {CS_RANGE.map((h) => (
                    <tr key={h}>
                      <th className="pr-1 text-xs text-muted-foreground">{h}</th>
                      {CS_RANGE.map((a) => {
                        const k = h + ":" + a;
                        return (
                          <td key={a}>
                            <Input
                              className={"h-8 w-14 px-1 text-center text-xs" + (csEdited.has(k) ? " ring-2 ring-primary" : "")}
                              inputMode="decimal"
                              value={cs[k] ?? ""}
                              onChange={(e) => setCsCell(k, e.target.value.replace(/[^\d.]/g, ""))}
                              aria-label={"Correct score " + k}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="secondary" onClick={resetCs}>Reset to auto prices</Button>
              {csEdited.size > 0 && <span className="text-xs text-muted-foreground">{csEdited.size} price{csEdited.size === 1 ? "" : "s"} set by you</span>}
            </div>
          </div>
        </div>
        <Button variant="brand" onClick={add}>Add match</Button>
      </Box>
      <Box>
        <div className="divide-y divide-border">
          {data?.map((m) => (
            <div key={m.id} className="flex flex-wrap items-center gap-2 py-3 text-sm">
              <div className="min-w-40 flex-1">
                <p className="font-semibold">{m.home_team} vs {m.away_team}</p>
                <p className="text-xs text-muted-foreground">{m.league} · {new Date(m.start_time).toLocaleString()}</p>
              </div>
              <select className="h-8 rounded-md border border-input bg-secondary px-2 text-xs" value={m.status} onChange={(e) => upd(m.id, { status: e.target.value })}>
                <option value="upcoming">Upcoming</option><option value="live">Live</option><option value="finished">Finished</option>
              </select>
              <Input className="h-8 w-14" aria-label="Minute" defaultValue={m.minute ?? ""} onBlur={(e) => upd(m.id, { minute: e.target.value ? Number(e.target.value) : null })} />
              <Input className="h-8 w-12" aria-label="Home score" defaultValue={m.home_score} onBlur={(e) => upd(m.id, { home_score: Number(e.target.value) || 0 })} />
              <Input className="h-8 w-12" aria-label="Away score" defaultValue={m.away_score} onBlur={(e) => upd(m.id, { away_score: Number(e.target.value) || 0 })} />
              <Button size="sm" variant={m.visible ? "secondary" : "outline"} onClick={() => upd(m.id, { visible: !m.visible })}>{m.visible ? "Shown" : "Hidden"}</Button>
              <Button size="icon" variant="ghost" onClick={() => del(m.id)} aria-label="Delete"><Trash2 /></Button>
            </div>
          ))}
        </div>
      </Box>
    </div>
  );
}

function Categories() {
  const qc = useQueryClient();
  const { data } = useQuery(categoriesQuery);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("🏆");
  const refresh = () => qc.invalidateQueries({ queryKey: ["categories"] });
  async function add() {
    if (!name.trim()) return;
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    if (err((await supabase.from("sports_categories").insert({ name: name.trim(), slug, icon, sort_order: (data?.length ?? 0) + 1 })).error)) return;
    setName(""); refresh();
  }
  return (
    <Box>
      <div className="flex gap-2">
        <Input className="w-16" value={icon} onChange={(e) => setIcon(e.target.value)} aria-label="Icon" />
        <Input placeholder="Category name" value={name} onChange={(e) => setName(e.target.value)} />
        <Button variant="brand" onClick={add}>Add</Button>
      </div>
      <div className="divide-y divide-border">
        {data?.map((c) => (
          <div key={c.id} className="flex items-center justify-between py-2 text-sm">
            <span>{c.icon} {c.name}</span>
            <div className="flex gap-2">
              <Button size="sm" variant={c.active ? "secondary" : "outline"} onClick={async () => { await supabase.from("sports_categories").update({ active: !c.active }).eq("id", c.id); refresh(); }}>{c.active ? "Active" : "Inactive"}</Button>
              <Button size="icon" variant="ghost" aria-label="Delete" onClick={async () => { if (confirm("Delete category and its matches?")) { await supabase.from("sports_categories").delete().eq("id", c.id); refresh(); } }}><Trash2 /></Button>
            </div>
          </div>
        ))}
      </div>
    </Box>
  );
}

function Bets() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["admin", "bets"],
    queryFn: async () => (await supabase.from("bets").select("*").order("created_at", { ascending: false }).limit(200)).data ?? [],
  });
  async function settle(id: string, won: boolean) {
    if (err((await supabase.rpc("admin_settle_bet", { _bet: id, _won: won })).error)) return;
    toast.success("Bet settled"); qc.invalidateQueries({ queryKey: ["admin"] });
  }
  return (
    <Box>
      <div className="divide-y divide-border">
        {data?.map((b) => (
          <div key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
            <div className="min-w-0">
              <p className="font-semibold">{(b.selections as { match: string }[]).map((s) => s.match).join(", ")}</p>
              <p className="text-xs text-muted-foreground">Stake {fmt(b.stake)} · Odds {Number(b.total_odds).toFixed(2)} · Win {fmt(b.potential_win)} · {new Date(b.created_at).toLocaleString()}</p>
            </div>
            {b.status === "open" ? (
              <div className="flex gap-2">
                <Button size="sm" onClick={() => settle(b.id, true)}>Won</Button>
                <Button size="sm" variant="destructive" onClick={() => settle(b.id, false)}>Lost</Button>
              </div>
            ) : <span className="text-xs font-bold uppercase">{b.status}</span>}
          </div>
        ))}
        {data?.length === 0 && <p className="text-sm text-muted-foreground">No bets yet.</p>}
      </div>
    </Box>
  );
}

function Transactions() {
  const { data } = useQuery({
    queryKey: ["admin", "transactions"],
    queryFn: async () => (await supabase.from("transactions").select("*").order("created_at", { ascending: false }).limit(300)).data ?? [],
  });
  return (
    <Box>
      <div className="divide-y divide-border">
        {data?.map((t) => (
          <div key={t.id} className="flex justify-between py-2 text-sm">
            <div><p className="font-semibold capitalize">{t.type} <span className="text-xs font-normal text-muted-foreground">· {t.status}</span></p><p className="text-xs text-muted-foreground">{t.note} · {t.user_id.slice(0, 8)} · {new Date(t.created_at).toLocaleString()}</p></div>
            <span className="font-bold">{fmt(t.amount)}</span>
          </div>
        ))}
      </div>
    </Box>
  );
}

function Promotions() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["admin", "promos"], queryFn: async () => (await supabase.from("promotions").select("*").order("created_at")).data ?? [] });
  const [t, setT] = useState(""); const [d, setD] = useState("");
  const refresh = () => { qc.invalidateQueries({ queryKey: ["admin"] }); qc.invalidateQueries({ queryKey: ["promotions"] }); };
  return (
    <Box>
      <Input placeholder="Title" value={t} onChange={(e) => setT(e.target.value)} />
      <Textarea placeholder="Description" value={d} onChange={(e) => setD(e.target.value)} />
      <Button variant="brand" onClick={async () => { if (!t.trim()) return; if (err((await supabase.from("promotions").insert({ title: t.trim(), description: d.trim() })).error)) return; setT(""); setD(""); refresh(); }}>Add promotion</Button>
      <div className="divide-y divide-border">
        {data?.map((p) => (
          <div key={p.id} className="flex items-center justify-between gap-2 py-2 text-sm">
            <div><p className="font-semibold">{p.title}</p><p className="text-xs text-muted-foreground">{p.description}</p></div>
            <div className="flex gap-2">
              <Button size="sm" variant={p.active ? "secondary" : "outline"} onClick={async () => { await supabase.from("promotions").update({ active: !p.active }).eq("id", p.id); refresh(); }}>{p.active ? "Active" : "Off"}</Button>
              <Button size="icon" variant="ghost" aria-label="Delete" onClick={async () => { await supabase.from("promotions").delete().eq("id", p.id); refresh(); }}><Trash2 /></Button>
            </div>
          </div>
        ))}
      </div>
    </Box>
  );
}

function Referrals() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["admin", "refs"], queryFn: async () => (await supabase.from("referral_codes").select("*").order("created_at")).data ?? [] });
  const [code, setCode] = useState(""); const [bonus, setBonus] = useState("100");
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin"] });
  return (
    <Box>
      <div className="flex gap-2">
        <Input placeholder="CODE" value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} />
        <Input className="w-28" aria-label="Bonus" value={bonus} onChange={(e) => setBonus(e.target.value)} />
        <Button variant="brand" onClick={async () => { if (!code) return; if (err((await supabase.from("referral_codes").insert({ code, bonus: Number(bonus) || 0 })).error)) return; setCode(""); refresh(); }}>Add</Button>
      </div>
      <div className="divide-y divide-border">
        {data?.map((r) => (
          <div key={r.id} className="flex items-center justify-between py-2 text-sm">
            <span><b className="text-gold">{r.code}</b> · bonus {fmt(r.bonus)} · {r.uses} uses</span>
            <div className="flex gap-2">
              <Button size="sm" variant={r.active ? "secondary" : "outline"} onClick={async () => { await supabase.from("referral_codes").update({ active: !r.active }).eq("id", r.id); refresh(); }}>{r.active ? "Active" : "Off"}</Button>
              <Button size="icon" variant="ghost" aria-label="Delete" onClick={async () => { await supabase.from("referral_codes").delete().eq("id", r.id); refresh(); }}><Trash2 /></Button>
            </div>
          </div>
        ))}
      </div>
    </Box>
  );
}

function Content() {
  const qc = useQueryClient();
  const { data } = useQuery(contentQuery);
  const keys = ["hero_title", "hero_subtitle", "announcement"];
  const [vals, setVals] = useState<Record<string, string>>({});
  async function save() {
    const rows = keys.map((k) => ({ key: k, value: vals[k] ?? data?.[k] ?? "" }));
    if (err((await supabase.from("site_content").upsert(rows)).error)) return;
    toast.success("Content saved"); qc.invalidateQueries({ queryKey: ["content"] });
  }
  return (
    <Box>
      {keys.map((k) => (
        <div key={k}>
          <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">{k.replace("_", " ")}</p>
          <Textarea value={vals[k] ?? data?.[k] ?? ""} onChange={(e) => setVals({ ...vals, [k]: e.target.value })} />
        </div>
      ))}
      <Button variant="brand" onClick={save}>Save content</Button>
    </Box>
  );
}

export function Withdrawals() {
  const qc = useQueryClient();
  const [payout, setPayout] = useState<PayoutData | null>(null);
  const { data } = useQuery({
    queryKey: ["admin", "withdrawals"],
    queryFn: async () => (await supabase.from("transactions").select("*").eq("type", "withdrawal").order("created_at", { ascending: false }).limit(200)).data ?? [],
  });
  const { data: users } = useQuery({
    queryKey: ["admin", "users"],
    queryFn: async () => (await supabase.from("profiles").select("*").order("created_at", { ascending: false })).data ?? [],
  });
  async function review(id: string, approve: boolean) {
    const { data, error } = await supabase.rpc("admin_review_withdrawal", { _tx: id, _approve: approve });
    if (err(error)) return;
    toast.success(approve ? "Approved" : "Rejected and refunded");
    // The Oddaroa SMS moment: approving a payout plays the animated
    // MobileMoney receipt for the admin (Prince, 2026-11-09).
    if (approve && data) setPayout(data as unknown as PayoutData);
    qc.invalidateQueries({ queryKey: ["admin"] });
  }
  return (
    <Box>
      <div className="divide-y divide-border">
        {data?.map((t) => {
          const u = users?.find((x) => x.id === t.user_id);
          // Payout number + receiver name ride structured on
          // payout_meta (manual payouts, Prince 2026-11-12); older rows
          // only carry the free-text note ("payout NAME · NUMBER").
          const meta = (t as unknown as { payout_meta?: TxMeta | null }).payout_meta ?? null;
          let payoutLine = u?.phone ?? "";
          if (meta?.currency === "NGN") payoutLine = `${meta.account_name ?? ""} · ${meta.bank_name ?? ""} ${meta.account_number ?? ""}`.trim();
          else if (meta?.momo_number) payoutLine = `${meta.account_name ?? ""} · ${meta.momo_number}`.trim();
          else if (t.note.startsWith("payout ")) payoutLine = t.note.slice("payout ".length);
          return (
            <div key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
              <div>
                <p className="font-semibold">{u?.full_name ?? t.user_id.slice(0, 8)} · {fmt(Math.abs(Number(t.amount)))} {CURRENCY}</p>
                <p className="text-xs text-muted-foreground">{payoutLine} · {new Date(t.created_at).toLocaleString()} · {t.status}</p>
              </div>
              {t.status === "pending" && (
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => review(t.id, true)}>Approve</Button>
                  <Button size="sm" variant="destructive" onClick={() => review(t.id, false)}>Reject</Button>
                </div>
              )}
            </div>
          );
        })}
        {data?.length === 0 && <p className="text-sm text-muted-foreground">No withdrawal requests.</p>}
      </div>
      {payout && <PayoutSmsMoment payout={payout} variant="payout" onClose={() => setPayout(null)} />}
    </Box>
  );
}

// Structured payout/sender details carried on wallet_transactions
// payout_meta (manual deposits + withdrawals, Prince 2026-11-12).
type TxMeta = {
  currency?: string;
  method?: string;
  momo_number?: string;
  account_name?: string;
  sender_name?: string;
  sender_phone?: string;
  bank_name?: string;
  account_number?: string;
};

// Manual deposit review — super admin only (Prince, 2026-11-12).
// The player sends Telecel Cash to the number in operator_settings and
// submits amount + transaction ID + sender name; the super admin
// matches the payment by those details, then approves (credits the
// wallet) or rejects. No screenshot is stored: the player-side upload
// is a preview only, so nothing to open here.
export function Deposits() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["admin", "deposits"],
    queryFn: async () => (await supabase.from("transactions").select("*").eq("type", "deposit").order("created_at", { ascending: false }).limit(200)).data ?? [],
  });
  const { data: users } = useQuery({
    queryKey: ["admin", "users"],
    queryFn: async () => (await supabase.from("profiles").select("*").order("created_at", { ascending: false })).data ?? [],
  });
  async function review(id: string, approve: boolean) {
    const { error } = await supabase.rpc("admin_review_deposit", { _tx: id, _approve: approve });
    if (err(error)) return;
    toast.success(approve ? "Deposit approved and credited" : "Deposit rejected");
    qc.invalidateQueries({ queryKey: ["admin"] });
  }
  return (
    <Box>
      <div className="divide-y divide-border">
        {data?.map((t) => {
          const u = users?.find((x) => x.id === t.user_id);
          const meta = (t as unknown as { payout_meta?: TxMeta | null }).payout_meta ?? null;
          let senderName = meta?.sender_name ?? "";
          let senderPhone = meta?.sender_phone ?? "";
          if (!senderName && t.note.startsWith("sender ")) {
            const parts = t.note.slice("sender ".length).split(" · ");
            senderName = parts[0] ?? "";
            senderPhone = parts[1] ?? "";
          }
          const txnRef = (t as unknown as { external_ref?: string }).external_ref ?? "";
          return (
            <div key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
              <div>
                <p className="font-semibold">{u?.full_name ?? t.user_id.slice(0, 8)} · {fmt(Math.abs(Number(t.amount)))} {CURRENCY}</p>
                <p className="text-xs text-muted-foreground">{senderName ? `Sender ${senderName} · ${senderPhone} · ` : ""}{txnRef ? `Txn ${txnRef} · ` : ""}{u?.phone} · {new Date(t.created_at).toLocaleString()} · {t.status}</p>
              </div>
              {t.status === "pending" && (
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => review(t.id, true)}>Approve</Button>
                  <Button size="sm" variant="destructive" onClick={() => review(t.id, false)}>Reject</Button>
                </div>
              )}
            </div>
          );
        })}
        {data?.length === 0 && <p className="text-sm text-muted-foreground">No deposit requests.</p>}
      </div>
    </Box>
  );
}

function SupportSettings() {
  const qc = useQueryClient();
  const { data } = useQuery(contentQuery);
  const [phone, setPhone] = useState<string>();
  const [email, setEmail] = useState<string>();
  const p = phone ?? data?.["support_whatsapp"] ?? "";
  const e = email ?? data?.["support_email"] ?? "";
  async function save() {
    if (p && !whatsappLink(p)) { toast.error("Enter a valid WhatsApp number, e.g. 0241234567 or +233241234567"); return; }
    if (e && !supportEmailLink(e)) { toast.error("Enter a valid email address"); return; }
    if (err((await supabase.from("site_content").upsert([{ key: "support_whatsapp", value: p.trim() }, { key: "support_email", value: e.trim() }])).error)) return;
    toast.success("Customer service details saved"); qc.invalidateQueries({ queryKey: ["content"] });
  }
  return (
    <Box>
      <p className="text-sm font-semibold">Customer service contacts</p>
      <label className="block text-xs font-semibold uppercase text-muted-foreground">WhatsApp number<Input className="mt-1" inputMode="tel" value={p} onChange={(x) => setPhone(x.target.value)} placeholder="0241234567" /></label>
      <label className="block text-xs font-semibold uppercase text-muted-foreground">Support email<Input className="mt-1" type="email" value={e} onChange={(x) => setEmail(x.target.value)} placeholder="support@gmail.com" /></label>
      <Button variant="brand" onClick={save}>Save support details</Button>
    </Box>
  );
}

function Feedback() {
  const { data } = useQuery({
    queryKey: ["feedback"],
    queryFn: async () => (await supabase.from("user_feedback").select("*").order("created_at", { ascending: false }).limit(100)).data ?? [],
  });
  if (!data?.length) return <Box><p className="text-sm text-muted-foreground">No ideas or ratings yet.</p></Box>;
  return (
    <Box>
      {data.map((f) => (
        <div key={f.id} className="border-b border-border pb-2 text-sm last:border-0">
          <p className="text-xs text-muted-foreground">{new Date(f.created_at).toLocaleString("en-GB")} · {f.kind === "rating" ? `Rating ${f.rating}/5` : "Idea"}</p>
          {f.message && <p className="whitespace-pre-wrap">{f.message}</p>}
        </div>
      ))}
    </Box>
  );
}

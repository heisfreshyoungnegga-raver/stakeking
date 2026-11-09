import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { TablesUpdate } from "@/integrations/supabase/types";
import { categoriesQuery, contentQuery, CURRENCY, fmt } from "@/lib/betting";
import { supportEmailLink, whatsappLink } from "@/lib/account";
import { ShinobiPaySettings } from "@/components/ShinobiPaySettings";

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

function Admin() {
  return (
    <div className="space-y-5">
      <h1 className="text-4xl font-bold uppercase">Admin <span className="text-gold">dashboard</span></h1>
      <Tabs defaultValue="users">
        <TabsList className="flex h-auto w-full flex-wrap justify-start">
          {["users", "withdrawals", "ShinobiPay", "matches", "categories", "bets", "transactions", "promotions", "referrals", "content", "support", "feedback"].map((t) => (
            <TabsTrigger key={t} value={t} className="capitalize">{t}</TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="users"><Users /></TabsContent>
        <TabsContent value="withdrawals"><Withdrawals /></TabsContent>
        <TabsContent value="ShinobiPay"><ShinobiPaySettings /></TabsContent>
        <TabsContent value="matches"><Matches /></TabsContent>
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

function Users() {
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
              <span className="font-bold text-primary">{fmt(u.balance)} {CURRENCY}</span>
              <Button size="sm" variant="secondary" onClick={() => adjust(u.id)}>Adjust</Button>
            </div>
          </div>
        ))}
      </div>
    </Box>
  );
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
  const refresh = () => { qc.invalidateQueries({ queryKey: ["admin"] }); qc.invalidateQueries({ queryKey: ["matches"] }); };

  async function add() {
    if (!f.home_team || !f.away_team || !f.category_id) { toast.error("Category and teams required"); return; }
    const { error } = await supabase.from("matches").insert({
      ...f, start_time: f.start_time ? new Date(f.start_time).toISOString() : new Date().toISOString(),
      odds_home: Number(f.odds_home), odds_draw: Number(f.odds_draw), odds_away: Number(f.odds_away),
    });
    if (err(error)) return;
    setF(blank); refresh(); toast.success("Match added");
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

function Withdrawals() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["admin", "withdrawals"],
    queryFn: async () => (await supabase.from("transactions").select("*").eq("type", "withdrawal").order("created_at", { ascending: false }).limit(200)).data ?? [],
  });
  const { data: users } = useQuery({
    queryKey: ["admin", "users"],
    queryFn: async () => (await supabase.from("profiles").select("*").order("created_at", { ascending: false })).data ?? [],
  });
  async function review(id: string, approve: boolean) {
    if (err((await supabase.rpc("admin_review_withdrawal", { _tx: id, _approve: approve })).error)) return;
    toast.success(approve ? "Approved" : "Rejected and refunded");
    qc.invalidateQueries({ queryKey: ["admin"] });
  }
  return (
    <Box>
      <div className="divide-y divide-border">
        {data?.map((t) => {
          const u = users?.find((x) => x.id === t.user_id);
          return (
            <div key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
              <div>
                <p className="font-semibold">{u?.full_name ?? t.user_id.slice(0, 8)} · {fmt(Math.abs(Number(t.amount)))} {CURRENCY}</p>
                <p className="text-xs text-muted-foreground">{u?.phone} · {new Date(t.created_at).toLocaleString()} · {t.status}</p>
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

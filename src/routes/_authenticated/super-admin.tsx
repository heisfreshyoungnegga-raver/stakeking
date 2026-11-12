import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ShinobiPaySettings } from "@/components/ShinobiPaySettings";
import { MyTeam, Users, Withdrawals, Deposits, rpcCall } from "./admin";
import { CURRENCY, fmt } from "@/lib/betting";

export const Route = createFileRoute("/_authenticated/super-admin")({
  beforeLoad: async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) throw redirect({ to: "/login" });
    // The adapter extends the generated role enum with a super tier:
    // has_role('super_admin') is true only for engine super_admins.
    const SUPER_ROLE = "super_admin" as unknown as "admin";
    const { data } = await supabase.rpc("has_role", { _user_id: u.user.id, _role: SUPER_ROLE });
    if (!data) throw redirect({ to: "/sports" });
  },
  head: () => ({
    meta: [
      { title: "Super Admin — StakeKing" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "description", content: "StakeKing super administration portal." },
      { property: "og:title", content: "Super Admin — StakeKing" },
      { property: "og:description", content: "StakeKing super administration portal." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SuperAdmin,
});

const Box = ({ children }: { children: ReactNode }) => <div className="space-y-3 rounded-xl border border-border bg-card p-4">{children}</div>;
const err = (e: { message: string } | null) => { if (e) { toast.error(e.message); return true; } return false; };

function SuperAdmin() {
  return (
    <div className="space-y-5">
      <h1 className="text-4xl font-bold uppercase">Super Admin <span className="text-gold">portal</span></h1>
      <Tabs defaultValue="users">
        <TabsList className="flex h-auto w-full flex-wrap justify-start">
          {["users", "deposits", "withdrawals", "invites", "team", "ShinobiPay"].map((t) => (
            <TabsTrigger key={t} value={t} className="capitalize">{t === "invites" ? "Admin Invites" : t === "team" ? "My Team" : t}</TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="users"><Users /></TabsContent>
        <TabsContent value="deposits"><Deposits /></TabsContent>
        <TabsContent value="withdrawals"><Withdrawals /></TabsContent>
        <TabsContent value="invites"><AdminInvites /></TabsContent>
        <TabsContent value="team"><MyTeam /></TabsContent>
        <TabsContent value="ShinobiPay"><ShinobiPaySettings /></TabsContent>
      </Tabs>
    </div>
  );
}

type Invite = { token: string; kind: string; expires_at: string; created_at: string; created_by_phone: string | null };
type AdminSummary = {
  id: string; phone: string; display_name: string | null; role: string;
  earned: number; paid: number; pending: number; payout_requested_ghs: number | null; invited_count: number;
};

function AdminInvites() {
  const qc = useQueryClient();
  const [link, setLink] = useState("");
  const { data: invites } = useQuery({
    queryKey: ["super", "invites"],
    queryFn: async () => {
      const r = await rpcCall("list_admin_invites");
      if (r.error) throw new Error(r.error.message);
      return r.data as Invite[];
    },
  });
  const { data: team } = useQuery({
    queryKey: ["admin", "my-team"],
    queryFn: async () => {
      const r = await rpcCall("my_team");
      if (r.error) throw new Error(r.error.message);
      return r.data as { admins?: AdminSummary[] };
    },
  });
  async function mint(kind: string) {
    const r = await rpcCall("create_admin_invite", { _kind: kind });
    if (err(r.error)) return;
    setLink(`${window.location.origin}${(r.data as { path: string }).path}`);
    toast.success(kind === "super_admin" ? "Super admin invite created" : "Admin invite created");
    qc.invalidateQueries({ queryKey: ["super", "invites"] });
  }
  return (
    <Box>
      <div>
        <p className="text-sm font-semibold">Invite links</p>
        <p className="text-xs text-muted-foreground">
          Send a link to someone who should join as an admin. The link works once and expires in 48 hours.
          An <b>admin</b> invite creates the account in pending — verify it under the Users tab before their portal opens.
          A <b>super admin</b> invite is active immediately, so only send it to someone you fully trust.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button variant="brand" onClick={() => mint("admin")}>Invite an admin</Button>
          <Button variant="secondary" onClick={() => mint("super_admin")}>Invite a super admin</Button>
        </div>
        {link && (
          <div className="mt-2 flex gap-2">
            <code className="flex-1 overflow-x-auto whitespace-nowrap rounded-md bg-muted px-3 py-2 text-xs">{link}</code>
            <Button variant="brand" onClick={async () => { await navigator.clipboard.writeText(link).catch(() => {}); toast.success("Invite link copied"); }}>Copy</Button>
          </div>
        )}
      </div>
      <div>
        <p className="text-sm font-semibold">Outstanding invites</p>
        <div className="divide-y divide-border">
          {(invites ?? []).length === 0 && <p className="py-2 text-sm text-muted-foreground">No unused invites right now.</p>}
          {(invites ?? []).map((i) => (
            <div key={i.token} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <span className="capitalize">{i.kind.replace("_", " ")} <span className="text-xs text-muted-foreground">by {i.created_by_phone || "super admin"}</span></span>
              <span className="text-xs text-muted-foreground">expires {new Date(i.expires_at).toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>
      <div>
        <p className="text-sm font-semibold">Admin commissions &amp; payouts</p>
        <div className="divide-y divide-border">
          {(team?.admins ?? []).length === 0 && <p className="py-2 text-sm text-muted-foreground">No admins yet.</p>}
          {(team?.admins ?? []).map((a) => (
            <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <span>{a.display_name || "—"} <span className="text-xs text-muted-foreground">{a.phone} · {a.role} · team {a.invited_count}</span></span>
              <span className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">earned {fmt(a.earned)} · pending {fmt(a.pending)} {CURRENCY}</span>
                {a.pending > 0 && (
                  <Button size="sm" variant="brand" onClick={async () => { if (err((await rpcCall("pay_out_admin", { _user: a.id })).error)) return; toast.success("Commissions paid out"); qc.invalidateQueries({ queryKey: ["admin", "my-team"] }); }}>Pay out{a.payout_requested_ghs ? ` (${fmt(a.payout_requested_ghs)})` : ""}</Button>
                )}
              </span>
            </div>
          ))}
        </div>
      </div>
    </Box>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { COUNTRIES, profileQuery } from "@/lib/betting";
import { PhoneVerification } from "@/components/PhoneVerification";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Account settings — StakeKing" },
      { name: "description", content: "Manage your StakeKing profile and account settings." },
      { property: "og:title", content: "Account settings — StakeKing" },
      { property: "og:description", content: "Manage your profile and account settings." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Profile,
});

const schema = z.object({
  full_name: z.string().trim().min(2).max(100),
  phone: z.string().trim().regex(/^\+?\d{7,15}$/, "Invalid phone"),
  country: z.enum(["Ghana"]),
});

function Profile() {
  const { data: profile } = useQuery(profileQuery);
  const qc = useQueryClient();
  const [f, setF] = useState({ full_name: "", phone: "", country: "Ghana" });
  const [cur, setCur] = useState("");
  const [pw, setPw] = useState("");

  useEffect(() => {
    if (profile) setF({ full_name: profile.full_name, phone: profile.phone, country: profile.country });
  }, [profile]);

  async function save() {
    const r = schema.safeParse(f);
    if (!r.success) { toast.error(r.error.issues[0]?.message ?? "Invalid"); return; }
    if (!profile) return;
    const { error } = await supabase.from("profiles").update(r.data).eq("id", profile.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Profile saved");
    qc.invalidateQueries({ queryKey: ["profile"] });
  }

  async function changePw() {
    if (pw.length < 8) { toast.error("New password must be at least 8 characters"); return; }
    const { error } = await supabase.auth.updateUser({ password: pw, ...(cur ? { current_password: cur } : {}) } as { password: string });
    if (error) { toast.error(error.message); return; }
    setPw(""); setCur("");
    toast.success("Password changed");
  }

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <h1 className="text-4xl font-bold uppercase">Account settings</h1>
      <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-5">
        <div className="grid h-14 w-14 place-items-center rounded-full bg-brand-gradient font-display text-2xl font-bold text-primary-foreground">
          {profile?.full_name?.[0]?.toUpperCase() ?? "?"}
        </div>
        <div className="min-w-0">
          <p className="truncate text-lg font-bold">{profile?.full_name}</p>
          <p className="truncate text-sm text-muted-foreground">{profile?.email}</p>
        </div>
      </div>
      <div className="space-y-4 rounded-xl border border-border bg-card p-5">
        <h2 className="text-xl font-bold uppercase">Profile</h2>
        <div><Label>Full name</Label><Input className="mt-1.5 h-11" value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></div>
        <div><Label>Phone</Label><Input className="mt-1.5 h-11" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div>
        <div>
          <Label>Country</Label>
          <select className="mt-1.5 h-11 w-full rounded-md border border-input bg-secondary px-3 text-sm" value={f.country} onChange={(e) => setF({ ...f, country: e.target.value })}>
            {COUNTRIES.map((c) => <option key={c.name} value={c.name}>{c.flag} {c.name}</option>)}
          </select>
        </div>
        <Button variant="brand" onClick={save}>Save changes</Button>
      </div>
      <PhoneVerification />
      <div className="space-y-4 rounded-xl border border-border bg-card p-5">
        <h2 className="text-xl font-bold uppercase">Change password</h2>
        <div><Label>Current password</Label><Input type="password" className="mt-1.5 h-11" value={cur} onChange={(e) => setCur(e.target.value)} /></div>
        <div><Label>New password</Label><Input type="password" className="mt-1.5 h-11" value={pw} onChange={(e) => setPw(e.target.value)} /></div>
        <Button variant="secondary" onClick={changePw}>Update password</Button>
      </div>
    </div>
  );
}

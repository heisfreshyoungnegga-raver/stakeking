import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AuthCard } from "@/components/AuthCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Reset password — StakeKing" },
      { name: "description", content: "Choose a new password for your StakeKing account." },
      { property: "og:title", content: "Reset password — StakeKing" },
      { property: "og:description", content: "Choose a new password for your StakeKing account." },
    ],
  }),
  component: Reset,
});

function Reset() {
  const navigate = useNavigate();
  const [pw, setPw] = useState("");
  const [loading, setLoading] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pw.length < 8) { toast.error("At least 8 characters"); return; }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Password updated");
    navigate({ to: "/sports" });
  }
  return (
    <AuthCard title="New password" subtitle="Set a new password for your account">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <Label htmlFor="pw">New password</Label>
          <Input id="pw" type="password" value={pw} onChange={(e) => setPw(e.target.value)} className="mt-1.5 h-11" />
        </div>
        <Button type="submit" variant="brand" size="lg" className="w-full" disabled={loading}>Update password</Button>
      </form>
    </AuthCard>
  );
}

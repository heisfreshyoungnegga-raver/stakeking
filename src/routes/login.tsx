import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AuthCard } from "@/components/AuthCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ghanaPhone } from "@/lib/ghana-phone";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/login")({
  // Keep this essential entry screen in the main route bundle so navigation
  // does not depend on a second, lazy sign-in module download.
  codeSplitGroupings: [],
  head: () => ({
    meta: [
      { title: "Log in — StakeKing" },
      { name: "description", content: "Log in to your StakeKing betting account." },
      { property: "og:title", content: "Log in — StakeKing" },
      { property: "og:description", content: "Log in to your StakeKing betting account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Login,
});

function Login() {
  const navigate = useNavigate();
  const [method, setMethod] = useState<"email" | "phone">("email");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!password || !identifier.trim()) { toast.error("Enter your details and password"); return; }
    if (method === "phone" && !ghanaPhone(identifier)) { toast.error("Enter a valid Ghana number"); return; }
    setLoading(true);
    const credentials = method === "phone"
      ? { phone: ghanaPhone(identifier) as string, password }
      : { email: identifier.trim(), password };
    const { error } = await supabase.auth.signInWithPassword(credentials);
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    navigate({ to: "/sports" });
  }

  return (
    <AuthCard title="Welcome back" subtitle="Log in to continue betting">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          {(["email", "phone"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => { setMethod(m); setIdentifier(""); }}
              className={cn(
                "h-10 rounded-md border text-sm font-semibold transition-colors",
                method === m ? "border-primary bg-primary/15 text-primary" : "border-input bg-secondary hover:border-primary/50",
              )}
            >
              {m === "email" ? "Email" : "Phone"}
            </button>
          ))}
        </div>
        <div>
          <Label htmlFor="login-id">{method === "email" ? "Email address" : "Phone number"}</Label>
          <Input
            id="login-id"
            type={method === "email" ? "email" : "tel"}
            autoComplete={method === "email" ? "email" : "tel"}
            placeholder={method === "email" ? "you@example.com" : "024 123 4567"}
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            className="mt-1.5 h-11"
          />
        </div>
        <div>
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
          </div>
          <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1.5 h-11" />
        </div>
        <Button type="submit" variant="brand" size="lg" className="w-full" disabled={loading}>
          {loading ? "Logging in…" : "Log In"}
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          New here? <Link to="/register" className="font-semibold text-primary hover:underline">Create an account</Link>
        </p>
      </form>
    </AuthCard>
  );
}

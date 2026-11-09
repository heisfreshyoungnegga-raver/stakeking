import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { Eye, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AuthCard } from "@/components/AuthCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { COUNTRIES, passwordStrength } from "@/lib/betting";
import { cn } from "@/lib/utils";
import { ghanaPhone } from "@/lib/ghana-phone";

export const Route = createFileRoute("/register")({
  head: () => ({
    meta: [
      { title: "Create account — StakeKing" },
      { name: "description", content: "Register for a free StakeKing account in Ghana." },
      { property: "og:title", content: "Create account — StakeKing" },
      { property: "og:description", content: "Register for a free StakeKing account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Register,
});

function isAdult(dob: string) {
  const d = new Date(dob + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return false;
  const now = new Date();
  const adult = new Date(Date.UTC(d.getUTCFullYear() + 18, d.getUTCMonth(), d.getUTCDate()));
  return adult <= now && d.getUTCFullYear() > 1900;
}

const schema = z
  .object({
    fullName: z.string().trim().min(2, "Enter your full name").max(100),
    dob: z.string().refine(isAdult, "You must be 18 or older"),
    email: z.string().trim().email("Enter a valid email address").max(255),
    phone: z.string().trim().refine((v) => ghanaPhone(v) !== null, "Enter a valid Ghana phone number"),
    referral: z.string().trim().max(30).optional(),
    password: z.string().min(8, "At least 8 characters").max(72),
    confirm: z.string(),
    age: z.literal(true, { errorMap: () => ({ message: "Please accept the terms" }) }),
  })
  .refine((d) => d.password === d.confirm, { message: "Passwords do not match", path: ["confirm"] });

function Register() {
  const navigate = useNavigate();
  const [f, setF] = useState({ fullName: "", dob: "", email: "", phone: "", referral: "", password: "", confirm: "", age: false });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  // Invite + referral links land here as ?admin_invite=<token> (from the
  // super admin) or ?ref=<code> (an admin's team referral link).
  const [invite, setInvite] = useState("");
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const inv = p.get("admin_invite") || "";
    if (inv) setInvite(inv);
    const ref = p.get("ref") || "";
    if (ref) setF((prev) => ({ ...prev, referral: ref.toUpperCase() }));
  }, []);
  const country = COUNTRIES[0];
  const strength = passwordStrength(f.password);
  const set = (k: keyof typeof f, v: string | boolean) => setF((p) => ({ ...p, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const r = schema.safeParse(f);
    if (!r.success) {
      setErrors(Object.fromEntries(r.error.issues.map((i) => [i.path[0], i.message])));
      return;
    }
    setErrors({});
    setLoading(true);
    const phone = ghanaPhone(r.data.phone) ?? "";
    const { data, error } = await supabase.auth.signUp({
      email: r.data.email,
      password: r.data.password,
      options: {
        data: { full_name: r.data.fullName, date_of_birth: r.data.dob, country: "Ghana", phone, referral_code: r.data.referral || "", ...(invite ? { admin_invite: invite } : {}) },
      },
    });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    if (data.session) navigate({ to: "/sports" });
    else if (invite) { toast.success("Admin account created — the super admin will verify it, then you can log in."); navigate({ to: "/login" }); }
    else toast.success("Account created — please log in.");
  }

  const err = (k: string) => errors[k] && <p className="mt-1 text-xs text-destructive">{errors[k]}</p>;

  return (
    <AuthCard title="Create account" subtitle="Join free — deposit GHS 1, play with GHS 1">
      {invite && (
        <div className="mb-4 rounded-lg border border-gold/40 bg-gold/10 p-3 text-sm">
          <b>Admin invite.</b> You are creating an admin account for StakeKing. After you register, the super admin verifies your account — then you can log in and open the Admin Portal.
        </div>
      )}
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div>
          <Label htmlFor="fullName">Full name</Label>
          <Input id="fullName" autoComplete="name" value={f.fullName} onChange={(e) => set("fullName", e.target.value)} className="mt-1.5 h-11" />
          {err("fullName")}
        </div>
        <div>
          <Label htmlFor="dob">Date of birth</Label>
          <Input id="dob" type="date" autoComplete="bday" value={f.dob} onChange={(e) => set("dob", e.target.value)} className="mt-1.5 h-11" />
          {err("dob")}
        </div>
        <div>
          <Label htmlFor="email">Email address</Label>
          <Input id="email" type="email" autoComplete="email" placeholder="you@example.com" value={f.email} onChange={(e) => set("email", e.target.value)} className="mt-1.5 h-11" />
          {err("email")}
        </div>
        <div>
          <Label htmlFor="phone">Phone number</Label>
          <div className="mt-1.5 flex">
            <span className="flex h-11 items-center gap-1 whitespace-nowrap rounded-l-md border border-r-0 border-input bg-muted px-3 text-sm font-semibold">
              {country?.flag} {country?.code}
            </span>
            <Input id="phone" inputMode="tel" autoComplete="tel-national" placeholder="24 123 4567" value={f.phone} onChange={(e) => set("phone", e.target.value.replace(/\D/g, ""))} className="h-11 rounded-l-none" />
          </div>
          {err("phone")}
        </div>
        {!invite && (
          <div>
            <Label htmlFor="referral">Referral code <span className="text-muted-foreground">(optional)</span></Label>
            <Input id="referral" value={f.referral} onChange={(e) => set("referral", e.target.value.toUpperCase())} className="mt-1.5 h-11 uppercase" />
          </div>
        )}
        <div>
          <Label htmlFor="password">Password</Label>
          <div className="relative mt-1.5">
            <Input id="password" type={show ? "text" : "password"} autoComplete="new-password" value={f.password} onChange={(e) => set("password", e.target.value)} className="h-11 pr-10" />
            <button type="button" aria-label={show ? "Hide password" : "Show password"} onClick={() => setShow(!show)} className="absolute inset-y-0 right-0 px-3 text-muted-foreground">
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {f.password && (
            <div className="mt-2">
              <div className="flex gap-1">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className={cn("h-1.5 flex-1 rounded-full", i < strength.score ? (strength.score <= 1 ? "bg-destructive" : strength.score === 2 ? "bg-gold" : "bg-primary") : "bg-muted")} />
                ))}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Strength: {strength.label}</p>
            </div>
          )}
          {err("password")}
        </div>
        <div>
          <Label htmlFor="confirm">Confirm password</Label>
          <Input id="confirm" type={show ? "text" : "password"} autoComplete="new-password" value={f.confirm} onChange={(e) => set("confirm", e.target.value)} className="mt-1.5 h-11" />
          {err("confirm")}
        </div>
        <label className="flex items-start gap-2 text-sm text-muted-foreground">
          <input type="checkbox" checked={f.age} onChange={(e) => set("age", e.target.checked)} className="mt-0.5 h-4 w-4 accent-primary" />
          I accept the terms and conditions.
        </label>
        {err("age")}
        <Button type="submit" variant="brand" size="lg" className="w-full" disabled={loading}>
          {loading ? "Creating account…" : "Create Account"}
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          Already have an account? <Link to="/login" className="font-semibold text-primary hover:underline">Log in</Link>
        </p>
      </form>
    </AuthCard>
  );
}

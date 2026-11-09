import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Users, Flame, Headphones, Bell, Star, CircleHelp, Lightbulb, RefreshCw,
  HeartHandshake, FileText, LogOut, ChevronRight, Shield, Ticket,
  Receipt, Settings, Wallet, ArrowDownToLine,
} from "lucide-react";
import type { AccountSection } from "@/lib/account";
import { supabase } from "@/integrations/supabase/client";
import { CURRENCY, fmt, profileQuery } from "@/lib/betting";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({
    meta: [
      { title: "My Account — StakeKing" },
      { name: "description", content: "Your balance, bets, transactions and account settings." },
      { property: "og:title", content: "My Account — StakeKing" },
      { property: "og:description", content: "Your balance, bets, transactions and account settings." },
    ],
  }),
  component: Account,
});

function Account() {
  const { data: p } = useQuery(profileQuery);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const tier = Number(p?.wager_progress ?? 0) >= 5000 ? "Gold" : Number(p?.wager_progress ?? 0) >= 1000 ? "Silver" : "Bronze";

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/login", replace: true });
  }

  const menu: { i: typeof Users; l: string; r?: string; section: AccountSection }[] = [
    { i: Users, l: "My SportsSocial", r: "Create", section: "social" },
    { i: Flame, l: "Daily Streak", section: "streak" },
    { i: Headphones, l: "Customer Service", r: "Online 24/7", section: "support" },
    { i: Bell, l: "Notification Center", section: "notifications" },
    { i: Star, l: "Rate Our App", section: "rate" },
    { i: CircleHelp, l: "How to Play", section: "how-to-play" },
    { i: Lightbulb, l: "Share an Idea", section: "idea" },
    { i: RefreshCw, l: "Update App", section: "update" },
    { i: HeartHandshake, l: "Responsible Gambling", section: "responsible" },
    { i: FileText, l: "Terms and Conditions", section: "terms" },
  ];

  return (
    <div className="mx-auto max-w-lg space-y-3">
      {/* Dark profile header */}
      <div className="theme-dark rounded-md bg-surface p-4 text-foreground">
        <div className="flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-full bg-brand-bar font-display text-xl font-bold">
            {p?.full_name?.[0]?.toUpperCase() ?? "?"}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-bold">{p?.full_name}</p>
            <p className="truncate text-xs text-muted-foreground">{p?.phone} · {p?.country}</p>
          </div>
          <Link to="/settings" aria-label="Account settings"><ChevronRight className="h-5 w-5 text-muted-foreground" /></Link>
        </div>
        <div className="mt-4 flex items-end justify-between">
          <p className="text-xs text-muted-foreground">Total Balance</p>
          <p className="font-display text-2xl font-bold">{CURRENCY} {p ? fmt(p.balance) : "—"}</p>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Link to="/deposit" className="flex h-12 items-center justify-center gap-2 rounded-sm bg-primary text-base font-bold text-primary-foreground">
            <Wallet className="h-5 w-5" /> Deposit
          </Link>
          <Link to="/withdraw" className="flex h-12 items-center justify-center gap-2 rounded-sm border-2 border-primary bg-surface text-base font-bold text-primary">
            <ArrowDownToLine className="h-5 w-5" /> Withdraw
          </Link>
        </div>
      </div>

      {/* Loyalty banner */}
      <div className="theme-dark flex items-center gap-3 rounded-md bg-surface p-4 text-foreground">
        <div className="flex-1">
          <p className="font-display text-lg font-bold italic text-gold">StakeKing Loyalty</p>
          <p className="text-xs text-muted-foreground">Tier: {tier} · Silver at 1,000 wagered · Gold at 5,000</p>
        </div>
      </div>

      {/* Activity shortcuts */}
      <div className="theme-dark grid grid-cols-3 divide-x divide-border rounded-md bg-surface py-3 text-center text-foreground">
        <Link to="/transactions" search={{ tab: undefined }} className="flex flex-col items-center gap-1 text-xs">
          <Ticket className="h-6 w-6 text-primary" /> My Bets
        </Link>
        <Link to="/transactions" search={{ tab: "history" }} className="flex flex-col items-center gap-1 text-xs">
          <Receipt className="h-6 w-6 text-primary" /> Transactions
        </Link>
        <Link to="/settings" className="flex flex-col items-center gap-1 text-xs">
          <Settings className="h-6 w-6 text-primary" /> Settings
        </Link>
      </div>

      {/* White vertical menu */}
      <div className="divide-y divide-border rounded-md bg-card">
        {p?.isAdmin && (
          <Link to="/admin" className="flex items-center gap-3 p-4 hover:bg-secondary">
            <Shield className="h-5 w-5 text-gold" /><span className="flex-1 font-medium">Admin Dashboard</span><ChevronRight className="h-4 w-4 text-muted-foreground" />
          </Link>
        )}
        {menu.map(({ i: I, l, r, section }) => (
          <Link key={l} to="/account/$section" params={{ section }} className="flex items-center gap-3 p-4 hover:bg-secondary">
            <I className="h-5 w-5 text-foreground" /><span className="flex-1 font-medium">{l}</span>
            {r && <span className="text-xs text-muted-foreground">{r}</span>}
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </Link>
        ))}
      </div>

      {/* Dark footer */}
      <div className="theme-dark space-y-3 rounded-md bg-surface p-4 text-center text-foreground">
        <p className="text-xs text-muted-foreground">Payment methods</p>
        <div className="flex flex-wrap justify-center gap-2">
          {["MTN", "Telecel", "AirtelTigo", "VISA"].map((m) => (
            <span key={m} className="rounded-sm border border-border px-3 py-1 text-xs font-bold">{m}</span>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          18+ only. Play responsibly. Betting is addictive and can be psychologically harmful.
        </p>
        <p className="text-xs text-muted-foreground">© 2026 StakeKing. All rights reserved.</p>
      </div>

      <button onClick={signOut} className="theme-dark flex w-full items-center justify-center gap-2 rounded-md bg-surface p-4 font-bold text-foreground">
        <LogOut className="h-5 w-5" /> Log Out
      </button>
    </div>
  );
}

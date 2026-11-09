import { createFileRoute, Link, Outlet, redirect, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { User, Search, Shield, Ticket, CircleDollarSign } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/Logo";
import { BetSlip } from "@/components/BetSlip";
import { BetSlipProvider, useBetSlip } from "@/lib/betslip";
import { CURRENCY, fmt, profileQuery } from "@/lib/betting";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { BetResultNotifications } from "@/components/BetResultNotifications";
import { BookingShareSheet } from "@/components/BookingShareSheet";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/login" });
  },
  component: () => (
    <BetSlipProvider>
      <BetResultNotifications><Shell /></BetResultNotifications>
    </BetSlipProvider>
  ),
});

function HomeGlyph({ className }: { className?: string }) {
  return <span className={cn("grid place-items-center font-display text-2xl font-black italic leading-none", className)}>S</span>;
}

const NAV = [
  { to: "/sports", label: "Home", icon: HomeGlyph },
  { to: "/transactions", label: "Open Bets", icon: CircleDollarSign, badge: true, search: { tab: undefined } },
  { to: "/profile", label: "My Account", icon: User },
] as const;

function Shell() {
  const { data: profile } = useQuery(profileQuery);
  const { selections } = useBetSlip();
  const [slipOpen, setSlipOpen] = useState(false);
  const { data: openBets = 0 } = useQuery({
    queryKey: ["bets", "open-count"],
    queryFn: async () => {
      const { count } = await supabase.from("bets").select("id", { count: "exact", head: true }).eq("status", "open");
      return count ?? 0;
    },
  });
  const path = useRouterState({ select: (s) => s.location.pathname });
  const ticketPage = path.startsWith("/ticket/");
  const historyPage = path === "/transactions";
  const walletPage = path === "/deposit" || path === "/withdraw";
  const matchPage = path.startsWith("/match/");
  const fullBleed = ["/sports", "/all-sports", "/live"].includes(path) || path.startsWith("/match/");

  return (
    <div className={cn("min-h-screen bg-surface lg:pb-0", !ticketPage && !walletPage && "pb-20")}>
      {!ticketPage && !historyPage && !walletPage && !matchPage && <header className="theme-dark sticky top-0 z-30 bg-brand-bar text-foreground shadow-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4">
          <Logo />
          <nav className="ml-6 hidden gap-1 lg:flex">
            {NAV.map((n) => (
              <Link key={n.label} to={n.to} search={"search" in n ? n.search : { tab: undefined }} className="rounded-sm px-3 py-2 text-sm font-semibold text-foreground/85 hover:text-foreground" activeProps={{ className: "bg-surface/25 !text-foreground" }}>{n.label}</Link>
            ))}
            {profile?.isAdmin && <Link to="/admin" className="rounded-sm px-3 py-2 text-sm font-semibold text-gold">Admin</Link>}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <Link to="/all-sports" aria-label="Search matches"><Search className="h-6 w-6" /></Link>
            {profile?.isAdmin && <Link to="/admin" aria-label="Admin" className="lg:hidden"><Shield className="h-6 w-6 text-gold" /></Link>}
            <Link to="/profile" className="flex items-center gap-1.5 rounded-sm border-2 border-foreground px-2 py-1 text-sm font-bold">
              <span className="h-4 w-4 rounded-full bg-gold" />
              {CURRENCY} {profile ? fmt(profile.balance) : "—"}
            </Link>
          </div>
        </div>
      </header>}

      <div className={cn("mx-auto flex max-w-7xl gap-6", ticketPage || historyPage || walletPage ? "" : fullBleed ? "lg:px-4 lg:py-5" : "px-4 py-5")}>
        <main className={cn("min-w-0 flex-1", fullBleed && "overflow-hidden lg:rounded-md")}><Outlet /></main>
        {fullBleed && (
          <aside className="sticky top-24 hidden h-[calc(100vh-7rem)] w-80 shrink-0 overflow-hidden rounded-md border border-border bg-card lg:block">
            <BetSlip />
          </aside>
        )}
      </div>

      {!ticketPage && !historyPage && !walletPage && <button onClick={() => setSlipOpen(true)} aria-label="Open bet slip" className="fixed bottom-20 right-4 z-40 grid h-16 w-16 place-items-center rounded-full border-4 border-surface bg-primary text-primary-foreground shadow-glow lg:hidden">
        <Ticket className="h-7 w-7" />
        <span className="absolute -right-1 -top-1 grid h-6 w-6 place-items-center rounded-full bg-paper text-xs font-bold text-paper-foreground">{selections.length}</span>
      </button>}
      <Sheet open={slipOpen} onOpenChange={setSlipOpen}>
        <SheetContent side="bottom" className="h-[85vh] p-0">
          <SheetTitle className="sr-only">Bet slip</SheetTitle>
          <BetSlip onDone={() => setSlipOpen(false)} />
        </SheetContent>
      </Sheet>

      {!ticketPage && !walletPage && <nav className="theme-dark fixed inset-x-0 bottom-0 z-30 grid grid-cols-3 bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden">
        {NAV.map((n) => (
          <Link key={n.label} to={n.to} search={"search" in n ? n.search : { tab: undefined }} className="flex flex-col items-center gap-1 py-2 text-xs text-muted-foreground" activeProps={{ className: "!text-foreground font-semibold" }}>
            <span className="relative">
              <n.icon className={"h-7 w-7"} />
              {"badge" in n && openBets > 0 && (
                <span className="absolute -right-3 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-live px-1 text-[11px] font-bold text-foreground">{openBets}</span>
              )}
            </span>
            {n.label}
          </Link>
        ))}
      </nav>}
      <BookingShareSheet />
    </div>
  );
}

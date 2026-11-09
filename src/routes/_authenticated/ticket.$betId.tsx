import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  ArrowLeft, Headset, House, Copy, Share2, Info, Clock, CheckCircle2,
  TrendingUp, ChevronRight, Trophy, Megaphone, Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { CURRENCY, fmt, matchesQuery } from "@/lib/betting";
import { useBetSlip, type Selection } from "@/lib/betslip";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { shareBookingImage } from "@/lib/booking-image";

export const Route = createFileRoute("/_authenticated/ticket/$betId")({
  head: () => ({
    meta: [
      { title: "Ticket Details — StakeKing" },
      { name: "description", content: "Full details of your StakeKing bet ticket." },
      { property: "og:title", content: "Ticket Details — StakeKing" },
      { property: "og:description", content: "Full details of your StakeKing bet ticket." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TicketDetails,
});

type BetSel = { match_id?: string; match: string; market?: string; pick: string; odds: number };
type Bet = {
  id: string;
  stake: number;
  total_odds: number;
  potential_win: number;
  bonus_amount: number;
  status: string;
  cashed_out: number;
  booking_code: string | null;
  selections: BetSel[];
  created_at: string;
};

const betRef = (id: string) => id.replace(/-/g, "").slice(0, 10).toUpperCase();

const STATUS_LABEL: Record<string, string> = {
  open: "Running",
  won: "Won",
  lost: "Lost",
  void: "Void",
  cashed_out: "Cashed Out",
};

function TicketDetails() {
  const { betId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const slip = useBetSlip();
  const [busy, setBusy] = useState(false);

  const { data: bet, isLoading } = useQuery({
    queryKey: ["ticket", betId],
    queryFn: async () => {
      const { data, error } = await supabase.from("bets").select("*").eq("id", betId).maybeSingle();
      if (error) throw error;
      return data as unknown as Bet | null;
    },
  });
  const { data: matches = [] } = useQuery(matchesQuery);
  const matchById = new Map(matches.map((m) => [m.id, m]));

  if (isLoading) {
    return <div className="-mx-4 -my-5 grid min-h-[calc(100vh-8rem)] place-items-center bg-surface text-sm text-muted-foreground">Loading ticket…</div>;
  }
  if (!bet) {
    return (
      <div className="-mx-4 -my-5 grid min-h-[calc(100vh-8rem)] place-items-center bg-surface">
        <div className="text-center">
          <p className="mb-3 text-sm text-muted-foreground">Ticket not found.</p>
          <Link to="/transactions" search={{ tab: "history" }} className="text-sm font-bold text-primary">Back to Bet History</Link>
        </div>
      </div>
    );
  }

  const won = bet.status === "won";
  const cashedOut = bet.status === "cashed_out";
  const returned = won || cashedOut;
  const running = bet.status === "open";
  const ret = won ? bet.potential_win : cashedOut ? bet.cashed_out : null;
  const placed = new Date(bet.created_at);

  const remix = () => {
    slip.load((bet.selections ?? []).map((s) => ({
      matchId: s.match_id ?? "",
      label: s.match,
      market: s.market ?? "1X2",
      option: s.pick,
      optionLabel: s.pick,
      odds: Number(s.odds),
    })) as Selection[]);
    toast.success("Selections loaded into your bet slip");
    navigate({ to: "/sports" });
  };

  const copyCode = async () => {
    if (!bet.booking_code) return;
    await navigator.clipboard.writeText(bet.booking_code);
    toast.success("Booking code copied");
  };

  const share = async () => {
    try {
      const { data: code, error } = await supabase.rpc("create_booking_code", { _selections: (bet.selections ?? []).map((s) => ({ matchId: s.match_id ?? "", label: s.match, market: s.market ?? "1X2", option: s.pick, optionLabel: s.pick, odds: Number(s.odds) })) as never });
      if (error) throw error;
      await shareBookingImage({ code: String(code), selections: bet.selections.map((s) => ({ ...s, market: s.market ?? "1X2" })), stake: Number(bet.stake), createdAt: bet.created_at, compact: true });
    } catch {
      /* share dismissed */
    }
  };

  const deleteTicket = async () => {
    if (busy) return;
    setBusy(true);
    const { error } = await supabase.rpc("delete_ticket", { _bet: bet.id });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Ticket deleted");
    qc.invalidateQueries({ queryKey: ["bets"] });
    navigate({ to: "/transactions", search: { tab: "history" } });
  };

  return (
    <div className="ticket-details-page min-h-dvh bg-background lg:mx-auto lg:max-w-2xl">
      {/* red header */}
      <div className="flex items-center justify-between h-12 bg-brand-bar px-3 text-primary-foreground">
        <Button variant="ghost" onClick={() => navigate({ to: "/transactions", search: { tab: "history" } })} className="h-8 gap-1 px-0 text-sm hover:bg-brand-bar hover:text-primary-foreground" aria-label="Back"><ArrowLeft /> Back</Button>
        <h1 className="font-sans text-base font-semibold">Ticket Details</h1>
        <span className="flex items-center gap-4">
          <Headset className="h-5 w-5" />
          <Link to="/" aria-label="Home"><House className="h-5 w-5" /></Link>
        </span>
      </div>

      {/* dark summary panel */}
      <div className="theme-dark bg-brand-ink px-4 pb-3 pt-3 text-foreground">
        <div className="flex items-center justify-between text-[9px] text-foreground/50">
          <span>Ticket ID: {betRef(bet.id)}</span>
          <span>{placed.toLocaleString("en-GB", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).replace(",", ",")}</span>
        </div>
        <div className="mt-2 flex items-center justify-between">
          <span className="text-xs">{bet.selections?.length > 1 ? "Multiple" : "Single"}</span>
          <span className={cn("flex items-center gap-1.5 text-xs font-medium", returned ? "text-primary" : bet.status === "lost" ? "text-destructive" : "text-foreground")}>
            {returned && <Trophy className="h-5 w-5" />}
            {STATUS_LABEL[bet.status] ?? bet.status}
          </span>
        </div>
        <div className="mt-1 flex items-center justify-between border-b border-foreground/10 pb-3">
          <span className="text-[11px] text-foreground/50">Total StakeKing Return</span>
          <span className={cn("text-sm font-bold", returned ? "text-primary" : "text-foreground/60")}>
            {ret != null ? fmt(ret) : "--"}
          </span>
        </div>

        <div className={cn("space-y-1.5 py-3 text-[11px]", !returned && "border-b border-foreground/10")}>
          <div className="flex justify-between"><span className="text-foreground/60">Total Stake</span><span>{fmt(bet.stake)}</span></div>
          <div className="flex justify-between"><span className="text-foreground/60">Total Odds</span><span>{Number(bet.total_odds).toFixed(2)}</span></div>
          {!returned && <div className="flex justify-between"><span className="text-foreground/60">Max. Bonus</span><span>{fmt(bet.bonus_amount ?? 0)}</span></div>}
          {!returned && <div className="flex justify-between pt-1 text-[11px]"><span className="text-foreground/60">Total Pot. Win</span><span>{fmt(bet.potential_win)}</span></div>}
          {!cashedOut && Number(bet.cashed_out) > 0 && (
            <div className="flex justify-between"><span className="text-foreground/60">Cashed Out</span><b className="text-primary">{fmt(bet.cashed_out)}</b></div>
          )}
        </div>

        {returned ? (
          <div className="grid grid-cols-2 gap-2 pt-1">
            <Button variant="gold"
              onClick={share}
              className="h-12 min-w-0 gap-1 rounded-sm px-2 text-base font-semibold shadow-none"
            >
              <Megaphone className="h-5 w-5" /> Show Off
            </Button>
            <Button
              onClick={remix}
              className="h-12 min-w-0 gap-1 rounded-sm px-2 text-base font-semibold shadow-none"
            >
              <Sparkles className="h-5 w-5" /> Remix Bet
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-between pt-4">
            <div>
              <p className="text-[8px] text-foreground/60">Booking Code</p>
              <p className="flex items-center gap-3 text-xs font-medium">
                {bet.booking_code ?? "—"}
                {bet.booking_code && (
                  <>
                    <Button variant="ghost" className="h-6 w-5 p-0" onClick={copyCode} aria-label="Copy booking code"><Copy className="h-4 w-4 text-foreground/70" /></Button>
                    <Button variant="ghost" className="h-6 w-5 p-0" onClick={share} aria-label="Share ticket"><Share2 className="h-4 w-4 text-foreground/70" /></Button>
                  </>
                )}
              </p>
            </div>
            <span className="flex items-center gap-3">
              <Info className="h-5 w-5 text-foreground/50" />
              <Button onClick={remix} className="h-10 rounded-sm px-7 text-xs font-medium shadow-none">Rebet</Button>
            </span>
          </div>
        )}
      </div>

      {/* selections */}
      <div className="divide-y divide-paper-border bg-paper text-paper-foreground">
        {(bet.selections ?? []).map((s, i) => {
          const m = s.match_id ? matchById.get(s.match_id) : undefined;
          const gameId = s.match_id ? s.match_id.replace(/-/g, "").slice(0, 5).toUpperCase() : "—";
          const kickoff = m ? new Date(m.start_time) : null;
          return (
            <div key={i} className="flex gap-4 px-3 py-3">
              {won ? (
                <CheckCircle2 className="mt-14 h-4 w-4 shrink-0 fill-primary text-primary-foreground" />
              ) : cashedOut ? (
                <Trophy className="mt-12 h-4 w-4 shrink-0 text-primary" />
              ) : (
                <Clock className="mt-12 h-4 w-4 shrink-0 text-muted-foreground" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-[9px] text-paper-muted/70">
                  Game ID: {gameId}
                  {kickoff && ` | ${kickoff.toLocaleString("en-GB", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).replace(",", ",")}`}
                </p>
                <p className="mt-0.5 break-words text-xs font-normal">{s.match}</p>
                <p className="mt-1 flex items-center gap-1 text-[10px] font-normal text-primary">
                  <TrendingUp className="h-4 w-4" /> Match Tracker
                </p>
                {m && m.status === "finished" && (
                  <p className="mt-1 text-[10px] text-paper-muted/70">FT Score <span className="ml-2 text-paper-foreground">{m.home_score}:{m.away_score}</span></p>
                )}
                <div className={cn("relative mt-1 space-y-1 overflow-hidden px-3 py-2 text-[10px]", returned ? "bg-odds-soft/40" : "bg-background")}>
                  <p>
                    <span className="mr-2 inline-block w-9 text-right text-paper-muted/70">Pick</span>
                    <span className="capitalize">{s.pick}@{Number(s.odds).toFixed(2)}</span>
                    {won && <CheckCircle2 className="ml-1.5 inline h-4 w-4 text-primary" />}
                  </p>
                  <p><span className="mr-2 inline-block w-9 text-right text-paper-muted/70">Market</span>{s.market ?? "1X2"}</p>
                  {won && <p><span className="mr-2 inline-block w-9 text-right text-paper-muted/70">Outcome</span><span className="capitalize">{s.pick}</span></p>}
                  {won && <Trophy className="pointer-events-none absolute right-3 top-1/2 h-9 w-9 -translate-y-1/2 text-primary/10" />}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* footer rows */}
      <div className="mt-2 space-y-2 pb-6">
        <Button variant="ghost"
          onClick={() => toast.info(`Total Stake ${CURRENCY} ${fmt(bet.stake)} · Total Odds ${Number(bet.total_odds).toFixed(2)} · Potential Win ${CURRENCY} ${fmt(bet.potential_win)}`)}
          className="flex h-14 w-full items-center justify-between rounded-none bg-paper px-4 text-paper-foreground"
        >
          <span className="text-base font-normal">Number of Bets: 1</span>
          <span className="flex items-center gap-2 font-medium text-primary">Bet Details <ChevronRight className="h-5 w-5" /></span>
        </Button>
        <Link
          to="/transactions"
          search={{ tab: "history" }}
          className="flex h-14 w-full items-center justify-between bg-paper px-4 text-paper-foreground"
        >
          <span className="text-base">Check Transaction History</span>
          <ChevronRight className="h-5 w-5 text-primary" />
        </Link>
        {(
          <Button variant="ghost"
            onClick={deleteTicket}
            disabled={busy || running}
            title={running ? "Running tickets cannot be deleted" : "Delete settled ticket"}
            className="h-16 w-full rounded-none bg-paper px-4 text-center text-base font-medium text-destructive disabled:opacity-60"
          >
            {busy ? "Deleting…" : "Delete Ticket"}
          </Button>
        )}
      </div>
    </div>
  );
}

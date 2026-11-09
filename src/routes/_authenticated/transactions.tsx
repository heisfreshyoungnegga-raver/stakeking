import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { CircleHelp, Info, X, RefreshCw, Share2, Trophy, ChevronRight, ChevronDown, ChevronUp, Clock, CircleDot, CalendarDays } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { CURRENCY, fmt, matchesQuery, profileQuery } from "@/lib/betting";
import { useBetSlip, type Selection } from "@/lib/betslip";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { SwipeDeleteTicket } from "@/components/SwipeDeleteTicket";
import { useBetResultNotification } from "@/components/BetResultNotifications";
import { shareBookingImage } from "@/lib/booking-image";

export const Route = createFileRoute("/_authenticated/transactions")({
  head: () => ({
    meta: [
      { title: "Open Bets — StakeKing" },
      { name: "description", content: "Your open bets, cashout and bet history." },
      { property: "og:title", content: "Open Bets — StakeKing" },
      { property: "og:description", content: "Your open bets, cashout and bet history." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  validateSearch: (s: Record<string, unknown>) => ({
    tab: s["tab"] === "history" ? ("history" as const) : undefined,
  }),
  component: OpenBets,
});

type BetSel = { match_id?: string; match: string; market?: string; pick: string; odds: number };
type Bet = {
  id: string;
  stake: number;
  total_odds: number;
  potential_win: number;
  status: string;
  cashed_out: number;
  selections: BetSel[];
  created_at: string;
};

function useMyBets() {
  return useQuery({
    queryKey: ["bets", "mine"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return [];
      const { data, error } = await supabase.from("bets").select("*").eq("user_id", u.user.id).order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return data as unknown as Bet[];
    },
  });
}

function useLiveMatchIds() {
  return useQuery({
    queryKey: ["matches", "live-ids"],
    queryFn: async () => {
      const { data, error } = await supabase.from("matches").select("id").eq("status", "live");
      if (error) throw error;
      return new Set(data.map((m) => m.id));
    },
  });
}

/** Cashout offers come from the server-side betting engine, never computed here. */
function useOffers(open: Bet[]) {
  const ids = open.map((b) => b.id).join(",");
  return useQuery({
    queryKey: ["cashout-offers", ids],
    enabled: open.length > 0,
    refetchInterval: 30_000,
    queryFn: async () => {
      const entries = await Promise.all(
        open.map(async (b) => {
          const { data, error } = await supabase.rpc("cashout_offer", { _bet: b.id });
          if (error) throw error;
          return [b.id, Number(data)] as const;
        }),
      );
      return Object.fromEntries(entries) as Record<string, number>;
    },
  });
}

function toSlipSelections(b: Bet): Selection[] {
  return (b.selections ?? []).map((s) => ({
    matchId: s.match_id ?? "",
    label: s.match,
    market: s.market ?? "1X2",
    option: s.pick,
    optionLabel: s.pick,
    odds: Number(s.odds),
  }));
}

const betRef = (id: string) => id.replace(/-/g, "").slice(0, 10).toUpperCase();

function OpenBets() {
  const { tab: initialTab } = Route.useSearch();
  const [tab, setTab] = useState<"open" | "history">(initialTab ?? "open");
  const [filter, setFilter] = useState<"all" | "cashout" | "live">("all");
  const [histStatus, setHistStatus] = useState<"all" | "open" | "settled">("all");
  const [histResult, setHistResult] = useState<"all" | "won" | "lost" | "cashed_out" | "void">("all");
  const [historyDate, setHistoryDate] = useState("");
  const [showCalendar, setShowCalendar] = useState(false);
  useEffect(() => setTab(initialTab ?? "open"), [initialTab]);
  const [banner, setBanner] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [cashoutBet, setCashoutBet] = useState<Bet | null>(null);
  const { data: profile } = useQuery(profileQuery);
  const { data: matches = [] } = useQuery(matchesQuery);
  const bets = useMyBets();
  const liveIds = useLiveMatchIds();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const slip = useBetSlip();

  const all = bets.data ?? [];
  const open = all.filter((b) => b.status === "open");
  const offers = useOffers(open);
  const matchById = useMemo(() => new Map(matches.map((m) => [m.id, m])), [matches]);

  const shown = open.filter((b) => {
    if (filter === "live") return (b.selections ?? []).some((s) => s.match_id && liveIds.data?.has(s.match_id));
    if (filter === "cashout") return (offers.data?.[b.id] ?? 0) > 0;
    return true;
  });

  const historyByDay = useMemo(() => {
    const list = all.filter((b) => {
      if (histStatus === "open" && b.status !== "open") return false;
      if (histStatus === "settled" && b.status === "open") return false;
      if (histResult !== "all" && b.status !== histResult) return false;
      if (historyDate && new Date(b.created_at).toLocaleDateString("en-CA", { timeZone: "Africa/Accra" }) !== historyDate) return false;
      return true;
    });
    const groups = new Map<string, Bet[]>();
    for (const b of list) {
      const key = new Date(b.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
      groups.set(key, [...(groups.get(key) ?? []), b]);
    }
    return [...groups.entries()];
  }, [all, histStatus, histResult, historyDate]);

  const toggleExpand = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const remix = (b: Bet) => {
    slip.load(toSlipSelections(b));
    toast.success("Selections loaded into your bet slip");
    navigate({ to: "/sports" });
  };

  const share = async (b: Bet) => {
    try {
      const { data: code, error } = await supabase.rpc("create_booking_code", { _selections: toSlipSelections(b) as never });
      if (error) throw error;
      await shareBookingImage({ code: String(code), selections: b.selections.map((s) => ({ ...s, market: s.market ?? "1X2" })), stake: Number(b.stake), createdAt: b.created_at, compact: true });
    } catch {
      /* share dismissed */
    }
  };

  const deleteSettledBet = async (b: Bet) => {
    const { error } = await supabase.rpc("delete_ticket", { _bet: b.id });
    if (error) {
      toast.error(error.message);
      return;
    }
    qc.setQueryData<Bet[]>(["bets", "mine"], (previous) => previous?.filter((ticket) => ticket.id !== b.id));
    qc.removeQueries({ queryKey: ["ticket", b.id] });
    await qc.invalidateQueries({ queryKey: ["bets"] });
    toast.success("Settled bet deleted");
  };

  return (
    <div className="bet-history-page min-h-[calc(100dvh-4rem)] bg-paper lg:mx-auto lg:max-w-2xl">
      {/* dark strip */}
      <div className="theme-dark flex h-12 items-center justify-between bg-history-bar px-3 text-foreground">
        <span className="flex items-center gap-2 text-sm"><CircleHelp className="h-5 w-5" /> How to Cashout?</span>
        <span className="flex items-center gap-1.5 text-sm font-bold text-gold">
          <span className="h-4 w-4 rounded-full bg-gold" /> {CURRENCY} {profile ? fmt(profile.balance) : "—"}
        </span>
      </div>

      {/* tabs */}
      <div className="theme-dark grid grid-cols-2 gap-1 bg-history-bar px-[21%] pt-1">
        {(["open", "history"] as const).map((t) => (
          <Button variant="ghost"
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "h-11 rounded-b-none rounded-t-sm px-1 text-xs font-medium hover:bg-paper hover:text-paper-foreground",
              tab === t ? "bg-paper text-paper-foreground" : "bg-history-tab text-foreground/70",
            )}
          >
            {t === "open" ? `Open Bets (${open.length})` : "Bet History"}
          </Button>
        ))}
      </div>

      <div className={cn("bg-paper text-paper-foreground", tab === "open" ? "px-3 py-3" : "py-2")}>
        {tab === "open" ? (
          <>
            {/* filter chips + refresh offers */}
            <div className="mb-3 flex items-center gap-2">
              {([
                ["all", "All"],
                ["cashout", "Cashout Available"],
                ["live", "Live Games"],
              ] as const).map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => setFilter(k)}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs font-semibold",
                    filter === k ? "bg-brand-ink text-white" : "bg-secondary text-secondary-foreground",
                  )}
                >
                  {label}
                </button>
              ))}
              <button
                onClick={() => { offers.refetch(); toast.success("Cashout offers refreshed"); }}
                aria-label="Refresh cashout offers"
                className="ml-auto rounded-md bg-secondary p-1.5 text-secondary-foreground"
              >
                <RefreshCw className={cn("h-4 w-4", offers.isFetching && "animate-spin")} />
              </button>
            </div>

            {banner && (
              <div className="mb-3 flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2.5 text-sm shadow-sm">
                <span>Set a rule to <b>Auto Cashout</b> your bet.</span>
                <Info className="h-4 w-4 shrink-0 text-muted-foreground" />
                <button onClick={() => setBanner(false)} aria-label="Dismiss" className="ml-auto"><X className="h-5 w-5 text-muted-foreground" /></button>
              </div>
            )}

            <div className="space-y-3">
              {shown.map((b) => {
                const offer = offers.data?.[b.id] ?? 0;
                const isOpen = expanded.has(b.id);
                return (
                  <div key={b.id} className="rounded-md border border-border bg-card p-3 shadow-sm">
                    <div className="mb-2 flex items-center justify-between border-b border-border pb-2">
                      <Link to="/ticket/$betId" params={{ betId: b.id }} className="font-bold">{b.selections?.length > 1 ? "Multiple" : "Single"}</Link>
                      <span className="flex items-center gap-4 text-primary">
                        <button onClick={() => remix(b)} className="flex items-center gap-1 text-xs font-semibold"><RefreshCw className="h-4 w-4" /> Rebet</button>
                        <button onClick={() => share(b)} aria-label="Share bet"><Share2 className="h-4 w-4" /></button>
                      </span>
                    </div>

                    {isOpen ? (
                      <div className="divide-y divide-border">
                        {(b.selections ?? []).map((s, i) => {
                          const m = s.match_id ? matchById.get(s.match_id) : undefined;
                          return (
                            <div key={i} className="flex gap-3 py-3 text-sm">
                              <Clock className="mt-1 h-5 w-5 shrink-0 text-muted-foreground" />
                              <div className="min-w-0">
                                <p className="flex items-center gap-1.5">
                                  <CircleDot className="h-4 w-4 text-muted-foreground" />
                                  <b className="capitalize">{s.pick} @{Number(s.odds).toFixed(2)}</b>
                                  <span className="text-xs text-muted-foreground">{s.market ?? "1X2"}</span>
                                </p>
                                <p className="mt-0.5 truncate underline underline-offset-2">{s.match}</p>
                                <p className="mt-0.5 text-xs text-muted-foreground">
                                  {m ? `${new Date(m.start_time).toLocaleString("en-GB", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}${m.status === "live" ? ` · Live ${m.minute ?? ""}'` : ""}` : ""}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="truncate py-1 text-sm">{b.selections?.[0]?.match}</p>
                    )}

                    <button onClick={() => toggleExpand(b.id)} className="mt-1 flex w-full items-center justify-end gap-1 text-xs font-semibold text-muted-foreground">
                      {isOpen ? <>Hide Match Details <ChevronUp className="h-4 w-4" /></> : <>View Match Details <ChevronDown className="h-4 w-4" /></>}
                    </button>

                    {isOpen ? (
                      <div className="mt-2 border-t border-border pt-3">
                        <div className="space-y-1 text-sm">
                          <div className="flex justify-between"><span className="text-muted-foreground">Stake</span><b>{fmt(b.stake)}</b></div>
                          <div className="flex justify-between"><span className="text-muted-foreground">Pot. Win</span><b>{fmt(b.potential_win)}</b></div>
                          {Number(b.cashed_out) > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Cashed out</span><b className="text-primary">{CURRENCY} {fmt(b.cashed_out)}</b></div>}
                        </div>
                        {offer > 0 ? (
                          <button
                            onClick={() => setCashoutBet(b)}
                            className="mt-3 w-full rounded-sm bg-primary py-3 text-center text-sm font-bold text-primary-foreground"
                          >
                            Cashout {CURRENCY} {fmt(offer)}
                          </button>
                        ) : (
                          <p className="mt-3 w-full rounded-sm bg-secondary py-3 text-center text-sm font-semibold text-muted-foreground">No cashout offer</p>
                        )}
                      </div>
                    ) : (
                      <div className="mt-2 flex items-center justify-between">
                        <p className="text-sm text-muted-foreground">Stake <b className="text-foreground">{fmt(b.stake)}</b></p>
                        {offer > 0 ? (
                          <button
                            onClick={() => setCashoutBet(b)}
                            className="rounded-sm bg-primary px-6 py-2 text-center text-sm font-bold leading-tight text-primary-foreground"
                          >
                            Cashout<br />{CURRENCY} {fmt(offer)}
                          </button>
                        ) : (
                          <span className="rounded-sm bg-secondary px-6 py-2 text-sm font-semibold text-muted-foreground">No offer</span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              {shown.length === 0 && (
                <p className="py-16 text-center text-sm text-muted-foreground">
                  {filter === "live" ? "No live bets right now" : filter === "cashout" ? "No cashout offers right now" : "No open bets right now"}
                </p>
              )}
            </div>
          </>
        ) : (
          <div>
            {/* history filters */}
            <div className="flex items-center gap-1 border-b border-paper-border px-2 pb-3">
              <select
                value={histStatus}
                onChange={(e) => setHistStatus(e.target.value as typeof histStatus)}
                className={cn("h-7 min-w-0 rounded-sm border border-paper-border px-1 text-[10px] text-paper-muted", histStatus !== "all" ? "bg-odds-soft/40" : "bg-paper")}
                aria-label="Bet status filter"
              >
                <option value="all">Bet Status: All</option>
                <option value="open">Bet Status: Unsettled</option>
                <option value="settled">Bet Status: Settled</option>
              </select>
              <select
                value={histResult}
                onChange={(e) => setHistResult(e.target.value as typeof histResult)}
                className="h-7 min-w-0 rounded-sm border border-paper-border bg-paper px-1 text-[10px] text-paper-muted"
                aria-label="Bet result filter"
              >
                <option value="all">Bet Result: All</option>
                <option value="won">Won</option>
                <option value="lost">Lost</option>
                <option value="cashed_out">Cashed Out</option>
                <option value="void">Void</option>
              </select>
              <Button variant="ghost" size="icon" className="ml-auto h-7 w-7 text-paper-muted" aria-label="Filter by date" title="Filter by date" onClick={() => setShowCalendar(!showCalendar)}><CalendarDays /></Button>
              {(histStatus !== "all" || histResult !== "all" || historyDate) && <Button variant="ghost" size="icon" className="h-7 w-7 text-paper-muted" aria-label="Clear history filters" title="Clear filters" onClick={() => { setHistStatus("all"); setHistResult("all"); setHistoryDate(""); }}><X /></Button>}
            </div>
            {showCalendar && <div className="border-b border-paper-border px-2 py-2"><input type="date" aria-label="History date" value={historyDate} onChange={(e) => setHistoryDate(e.target.value)} className="h-8 border border-paper-border bg-paper px-2 text-xs text-paper-foreground [color-scheme:light]" /></div>}
            {historyByDay.map(([day, dayBets]) => (
              <div key={day} className="flex gap-2 px-2 pt-3">
                <div className="w-7 shrink-0 pt-0.5 text-paper-muted">
                  <p className="text-base font-bold leading-5">{day.split(" ")[0]}</p><p className="mt-1 text-[10px]">{day.split(" ")[1]}</p>
                </div>
                <div className="min-w-0 flex-1 space-y-2">
                  {dayBets.map((b) => (
                    <SwipeDeleteTicket key={b.id} status={b.status} onDelete={() => deleteSettledBet(b)}>
                    <Link to="/ticket/$betId" params={{ betId: b.id }} className="block border-b border-paper-border bg-paper">
                      <div
                        className={cn(
                          "flex h-6 items-center justify-between px-1.5 text-xs font-bold text-primary-foreground",
                          b.status === "won" || b.status === "cashed_out" ? "bg-primary" : b.status === "lost" ? "bg-destructive" : "bg-history-bar",
                        )}
                      >
                        <span>{b.selections?.length > 1 ? "Multiple" : "Single"}</span>
                        <span className="flex items-center gap-1">
                          {(b.status === "won" || b.status === "cashed_out") && <Trophy className="h-4 w-4" />}
                          {b.status === "won" ? "Won" : b.status === "lost" ? "Lost" : b.status === "void" ? "Void" : b.status === "open" ? "Running" : "Cashed Out"}
                          <ChevronRight className="h-4 w-4" />
                        </span>
                      </div>
                      <div className="space-y-1.5 py-3 pr-3 text-xs">
                        <div className="flex justify-between"><span className="text-paper-muted">Total Stake({CURRENCY})</span><span>{fmt(b.stake)}</span></div>
                        <div className="flex justify-between">
                          <span className="text-paper-muted">Total Return</span>
                          <span className={cn(b.status === "won" || b.status === "cashed_out" ? "text-base font-bold leading-5 text-primary" : "font-bold text-paper-muted")}>
                            {b.status === "won" ? fmt(b.potential_win) : b.status === "cashed_out" ? fmt(b.cashed_out) : "--"}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-2 border-t border-paper-border py-2.5">
                        <div className="min-w-0 text-[11px] leading-4 text-paper-muted">
                          {(b.selections ?? []).map((s, i) => <p key={i} className="break-words">{s.match}</p>)}
                        </div>
                        <Button onClick={(e) => { e.preventDefault(); e.stopPropagation(); remix(b); }} className="h-8 shrink-0 rounded-sm px-3 text-[11px] font-medium shadow-none">
                          Remix Bet
                        </Button>
                      </div>
                    </Link>
                    </SwipeDeleteTicket>
                  ))}
                </div>
              </div>
            ))}
            {historyByDay.length === 0 && <p className="py-16 text-center text-sm text-muted-foreground">No bets found.</p>}
          </div>
        )}
      </div>

      <CashoutSheet
        bet={cashoutBet}
        offer={cashoutBet ? (offers.data?.[cashoutBet.id] ?? 0) : 0}
        onClose={() => setCashoutBet(null)}
        onDone={() => {
          setCashoutBet(null);
          qc.invalidateQueries({ queryKey: ["bets"] });
          qc.invalidateQueries({ queryKey: ["profile"] });
          qc.invalidateQueries({ queryKey: ["transactions"] });
          qc.invalidateQueries({ queryKey: ["ticket"] });
          qc.invalidateQueries({ queryKey: ["cashout-offers"] });
        }}
      />
    </div>
  );
}

function CashoutSheet({ bet, offer, onClose, onDone }: { bet: Bet | null; offer: number; onClose: () => void; onDone: () => void }) {
  const notifyResult = useBetResultNotification();
  const [tab, setTab] = useState<"now" | "auto">("now");
  const [amount, setAmount] = useState(0);
  const [busy, setBusy] = useState(false);

  // Reset slider whenever a new bet is opened
  const [lastBet, setLastBet] = useState<string | null>(null);
  if (bet && bet.id !== lastBet) {
    setLastBet(bet.id);
    setAmount(offer);
    setTab("now");
  }
  if (!bet && lastBet) setLastBet(null);

  const isFull = offer > 0 && amount >= offer - 0.005;

  async function confirm() {
    if (!bet || busy) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("cashout_bet", { _bet: bet.id, _amount: amount });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    notifyResult({ betId: bet.id, kind: "cashout", amount: Number(data) });
    onDone();
  }

  return (
    <Sheet open={!!bet} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="rounded-t-2xl p-0">
        <SheetTitle className="sr-only">Cashout</SheetTitle>
        {/* tabs */}
        <div className="grid grid-cols-2 border-b border-border">
          <button
            onClick={() => setTab("now")}
            className={cn("py-3 text-sm font-bold", tab === "now" ? "border-b-4 border-primary text-foreground" : "text-muted-foreground")}
          >
            Cashout now
          </button>
          <button
            onClick={() => setTab("auto")}
            className={cn("flex items-center justify-center gap-1.5 py-3 text-sm font-bold", tab === "auto" ? "border-b-4 border-primary text-foreground" : "text-muted-foreground")}
          >
            Set auto rule <span className="rounded-sm bg-gold px-1.5 py-0.5 text-[10px] font-bold text-brand-ink">NEW</span>
          </button>
        </div>

        {tab === "auto" ? (
          <p className="p-6 text-center text-sm text-muted-foreground">
            Auto cashout rules are coming soon. Use Cashout now for full or partial cashout.
          </p>
        ) : (
          <div className="space-y-4 p-5">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Stake<br /><b className="text-foreground">{bet ? fmt(bet.stake) : "—"}</b></span>
              <span className="text-right text-muted-foreground">Pot. Win<br /><b className="text-foreground">{bet ? fmt(bet.potential_win) : "—"}</b></span>
            </div>

            <p className="text-center font-display text-3xl font-bold">
              {isFull ? "Full Cashout" : "Partial Cashout"} <span className="text-primary">{fmt(amount)}</span>
            </p>

            <input
              type="range"
              min={0.01}
              max={Math.max(offer, 0.01)}
              step={0.01}
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              className="h-2 w-full cursor-pointer accent-primary"
              aria-label="Cashout amount"
            />
            <div className="flex justify-between text-xs font-semibold text-muted-foreground">
              <span>Min. 0.01</span>
              <span>Max. {fmt(offer)}</span>
            </div>

            <button
              onClick={confirm}
              disabled={busy || offer <= 0 || amount <= 0}
              className="h-13 w-full rounded-sm bg-primary py-3.5 text-base font-bold text-primary-foreground disabled:opacity-60"
            >
              {busy ? "Processing…" : `Confirm ${CURRENCY} ${fmt(amount)}`}
            </button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

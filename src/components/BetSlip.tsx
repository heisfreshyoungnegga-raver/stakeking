import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { X, Copy, Share2, CheckCircle2, Settings, Trash2, CircleDot, Info, Gift, QrCode, Pin, History, ChevronUp } from "lucide-react";
import type { Selection } from "@/lib/betslip";
import { supabase } from "@/integrations/supabase/client";
import { useBetSlip } from "@/lib/betslip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CURRENCY, fmt, matchesQuery, profileQuery } from "@/lib/betting";
import { hasOdds, type Markets } from "@/components/match-ui";
import { cn } from "@/lib/utils";
import { BookingImagePreview } from "@/components/BookingImagePreview";
import { shareBookingImage, type BookingImageData } from "@/lib/booking-image";
import { betBonus } from "@/lib/bet-bonus";

type CodeRow = { code: string; selections: Selection[]; created_at: string };

export function BetSlip({ onDone, initialCodeHub = false }: { onDone?: () => void; initialCodeHub?: boolean }) {
  const { selections, remove, clear, load } = useBetSlip();
  const { data: profile } = useQuery(profileQuery);
  const [booked, setBooked] = useState<(BookingImageData & { placed: boolean; win?: number }) | null>(null);
  const [loadCode, setLoadCode] = useState("");
  const [codeHub, setCodeHub] = useState(initialCodeHub);
  const [stake, setStake] = useState("10");
  const [loading, setLoading] = useState(false);
  const [betType, setBetType] = useState<"single" | "multiple" | "system">("multiple");
  const qc = useQueryClient();
  const { data: matches = [] } = useQuery({ ...matchesQuery, refetchInterval: 30_000 });
  /** Latest genuine price for each selection; null = market suspended / odds unavailable. */
  const current = (s: Selection): number | null => {
    const m = matches.find((x) => x.id === s.matchId);
    if (!m || !hasOdds(m)) return null;
    const v = s.market === "1X2" ? ({ home: m.odds_home, draw: m.odds_draw, away: m.odds_away } as Record<string, number>)[s.option] : ((m.markets ?? {}) as Markets)[s.market]?.[s.option];
    return v == null ? null : Number(v);
  };
  const suspended = matches.length ? selections.filter((s) => current(s) === null) : [];
  const changed = selections.filter((s) => { const c = current(s); return c !== null && c !== Number(s.odds); });
  const acceptChanges = () => load(selections.map((s) => { const c = current(s); return c !== null ? { ...s, odds: c } : s; }));
  const total = selections.reduce((a, s) => a * s.odds, 1);
  const stakeN = Number(stake) || 0;
  const bonus = betBonus(stakeN, total, selections.length);

  const { data: codes = [] } = useQuery({
    queryKey: ["booking-codes", "recent"],
    queryFn: async () => {
      const { data, error } = await supabase.from("booking_codes").select("*").order("created_at", { ascending: false }).limit(5);
      if (error) throw error;
      return data as unknown as CodeRow[];
    },
  });

  async function makeCode(list: Selection[]) {
    const { data, error } = await supabase.rpc("create_booking_code", { _selections: list as never });
    if (error) { toast.error(error.message); return null; }
    return data as string;
  }
  async function bookOnly() {
    setLoading(true);
    const code = await makeCode(selections);
    setLoading(false);
    if (code) setBooked({ code, placed: false, selections: imagePicks(selections), createdAt: new Date().toISOString() });
  }
  async function loadFromCode() {
    const c = loadCode.trim().toUpperCase();
    if (!c) return;
    const { data, error } = await supabase.from("booking_codes").select("selections").eq("code", c).maybeSingle();
    if (error || !data) { toast.error("Booking code not found"); return; }
    load(data.selections as unknown as Selection[]);
    setCodeHub(false);
    setLoadCode("");
    toast.success(`Loaded code ${c}`);
  }
  function imagePicks(list: Selection[]) {
    return list.map((s) => ({ match: s.label, pick: s.optionLabel, market: s.market, odds: Number(s.odds) }));
  }
  async function share(code: string, list: Selection[]) {
    try { await shareBookingImage({ code, selections: imagePicks(list) }); }
    catch (e) { if (!(e instanceof DOMException && e.name === "AbortError")) toast.error("Unable to share image"); }
  }

  async function place() {
    if (stakeN < 1) { toast.error("Minimum stake is 1"); return; }
    setLoading(true);
    const { error } = await supabase.rpc("place_bet", {
      _stake: stakeN,
      _match_ids: selections.map((s) => s.matchId),
      _picks: selections.map((s) => `${s.market}|${s.option}`),
      _expected_odds: selections.map((s) => Number(s.odds)),
    });
    if (error) {
      setLoading(false);
      qc.invalidateQueries({ queryKey: ["matches"] });
      toast.error(error.message.includes("ODDS_CHANGED") ? "Odds have changed. Review and accept the new prices." : error.message);
      return;
    }
    const code = await makeCode(selections);
    setBooked({ code: code ?? "—", placed: true, stake: stakeN, win: bonus.payout, selections: imagePicks(selections), createdAt: new Date().toISOString() });
    clear();
    qc.invalidateQueries({ queryKey: ["profile"] });
    qc.invalidateQueries({ queryKey: ["bets"] });
    qc.invalidateQueries({ queryKey: ["transactions"] });
    qc.invalidateQueries({ queryKey: ["booking-codes"] });
    setLoading(false);
  }

  const strip = (
    <div className="theme-dark flex items-center justify-between bg-brand-ink px-4 py-2.5 text-foreground">
      <span className="flex items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-full bg-surface text-sm font-bold">{selections.length}</span>
        <span className="flex overflow-hidden rounded-full border border-border text-xs font-bold">
          <span className="bg-primary px-2.5 py-1 text-primary-foreground">REAL</span>
          <span className="px-2.5 py-1 text-muted-foreground">SIM</span>
        </span>
      </span>
      <ChevronUp className="h-5 w-5 text-muted-foreground" />
      <span className="flex items-center gap-1.5 text-sm font-bold text-gold">
        <span className="h-4 w-4 rounded-full bg-gold" /> {CURRENCY} {profile ? fmt(profile.balance) : "—"}
      </span>
    </div>
  );

  return (
    <div className="flex h-full flex-col bg-paper text-paper-foreground">
      {strip}
      {booked ? (
        <div className="flex-1 space-y-4 overflow-y-auto p-4 text-center">
          <CheckCircle2 className="mx-auto h-12 w-12 text-primary" />
          <p className="text-xl font-bold">{booked.placed ? "Bet Successful" : "Bet Booked"}</p>
          {booked.placed && (
            <div className="space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Total stake</span><b>{fmt(booked.stake ?? 0)}</b></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Potential win</span><b>{fmt(booked.win ?? 0)} {CURRENCY}</b></div>
            </div>
          )}
          <BookingImagePreview data={booked} />
          <Button variant="brand" size="lg" className="w-full" onClick={() => { setBooked(null); if (booked.placed) onDone?.(); }}>OK</Button>
        </div>
      ) : selections.length === 0 || codeHub ? (
        <div className="flex-1 overflow-y-auto">
          <div className="border-b border-border p-4">
            <p className="mb-2 flex items-center gap-1.5 font-bold">Please insert booking code <Info className="h-4 w-4 text-muted-foreground" /></p>
            <form className="flex" onSubmit={(event) => { event.preventDefault(); void loadFromCode(); }}>
              <Input autoFocus={initialCodeHub} value={loadCode} onChange={(e) => setLoadCode(e.target.value)} placeholder="Booking Code" aria-label="Booking code" className="h-12 rounded-r-none uppercase" />
              <Button type="submit" variant="secondary" className="h-12 rounded-l-none px-6 font-bold">Load</Button>
            </form>
            {selections.length > 0 && <Button variant="ghost" className="mt-2 px-0 text-primary" onClick={() => setCodeHub(false)}>Back to Betslip ({selections.length})</Button>}
          </div>
          {/* code tabs */}
          <div className="grid grid-cols-3 border-b border-border text-sm font-semibold">
            {[[QrCode, "Booking Codes"], [Pin, "My Pins"], [History, "Recent Codes"]].map(([I, l], i) => {
              const Icon = I as typeof QrCode;
              return (
                <span key={l as string} className={cn("flex items-center justify-center gap-1.5 py-3", i === 0 && "border-b-2 border-primary")}>
                  <Icon className="h-4 w-4" /> {l as string}
                </span>
              );
            })}
          </div>

          {/* recommended codes */}
          {codes.length > 0 && (
            <div className="border-b border-border p-3">
              <p className="mb-2 flex items-center justify-between font-bold">Recommended Football Codes <ChevronUp className="h-4 w-4" /></p>
              <div className="space-y-3">
                {codes.map((c) => {
                  const sels = c.selections ?? [];
                  const odds = sels.reduce((a, s) => a * Number(s.odds), 1);
                  return (
                    <div key={c.code} className="rounded-md border border-border bg-card shadow-sm">
                      <div className="flex items-center justify-between bg-secondary px-3 py-1.5 text-sm">
                        <b>{c.code}</b>
                        <span className="text-xs text-muted-foreground">Folds: <b className="text-foreground">{sels.length}</b></span>
                        <span className="text-xs text-muted-foreground">Odds: <b className="text-primary">{odds.toFixed(2)}</b></span>
                      </div>
                      <div className="space-y-2 px-3 py-2">
                        {sels.slice(0, 4).map((s, i) => (
                          <div key={i} className="text-xs">
                            <p><b className="capitalize">{s.optionLabel} @{Number(s.odds).toFixed(2)}</b> <span className="text-muted-foreground">| {s.market}</span></p>
                            <p className="truncate text-muted-foreground">{s.label}</p>
                          </div>
                        ))}
                        {sels.length > 4 && <p className="text-xs text-muted-foreground">+{sels.length - 4} more</p>}
                      </div>
                      <div className="flex items-center justify-between border-t border-border px-3 py-2">
                        <Button variant="ghost" onClick={() => share(c.code, c.selections)} className="h-8 px-0 text-sm font-semibold text-primary"><Share2 className="h-4 w-4" /> Share</Button>
                        <button onClick={() => { load(c.selections); setCodeHub(false); toast.success(`Loaded code ${c.code}`); }} className="rounded-sm bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">Add to Betslip</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

        </div>
      ) : (
        <>
          {/* remove all / settings */}
          <div className="flex items-center justify-between px-4 py-2 text-sm">
            <button onClick={clear} className="flex items-center gap-1.5 text-muted-foreground"><Trash2 className="h-4 w-4" /> Remove All</button>
            <span className="flex items-center gap-1.5 text-muted-foreground">Bet Settings <Settings className="h-4 w-4" /></span>
          </div>
          <Button variant="ghost" className="mx-4 justify-start px-0 text-primary" onClick={() => setCodeHub(true)}><QrCode className="h-4 w-4" /> Insert booking code</Button>

          {/* bet type tabs */}
          <div className="grid grid-cols-3 gap-1 px-2">
            {(["single", "multiple", "system"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setBetType(t)}
                className={cn(
                  "rounded-t-md py-2.5 text-sm font-bold capitalize",
                  betType === t ? "bg-card text-foreground shadow-sm" : "bg-secondary text-muted-foreground",
                )}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="flex-1 space-y-2 overflow-y-auto bg-card p-3">
            {betType === "system" ? (
              <p className="py-8 text-center text-sm text-muted-foreground">System bets are coming soon. Use Single or Multiple.</p>
            ) : (
              selections.map((s) => (
                <div key={s.matchId} className="border-b border-border pb-2 text-sm last:border-0">
                  <p className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 font-bold capitalize"><CircleDot className="h-4 w-4 text-muted-foreground" /> {s.optionLabel}</span>
                    <b>{s.odds.toFixed(2)}</b>
                  </p>
                  {current(s) === null && matches.length > 0 ? <p className="pl-6 text-xs font-semibold text-destructive">Suspended — remove to continue</p>
                    : current(s) !== Number(s.odds) && current(s) !== null ? <p className="pl-6 text-xs font-semibold text-destructive">Odds changed: {Number(s.odds).toFixed(2)} → {current(s)!.toFixed(2)}</p> : null}
                  <p className="mt-0.5 flex items-center gap-1.5 text-muted-foreground">
                    <button onClick={() => remove(s.matchId)} aria-label="Remove selection" className="text-foreground"><X className="h-4 w-4" /></button>
                    <span className="truncate">{s.label}</span>
                  </p>
                  <p className="pl-6 text-xs text-muted-foreground">{s.market}</p>
                </div>
              ))
            )}

            <p className="rounded-sm bg-primary/10 px-3 py-2 text-center text-xs font-semibold text-primary">
              {selections.length >= 2 ? "3% Multiple Bet Bonus" : "Multiple Bet Bonus: 3%"}
            </p>

            {/* stake */}
            <div className="flex items-center justify-between gap-3 py-1">
              <span className="flex items-center gap-2 text-sm font-semibold">
                Stake
                <label className="flex items-center gap-1 text-xs font-normal text-muted-foreground">
                  <input type="checkbox" className="accent-primary" /> <Gift className="h-4 w-4 text-primary" /> Gift
                </label>
              </span>
              <span className="flex items-center gap-2 text-sm font-semibold">
                {CURRENCY}
                <Input inputMode="decimal" value={stake} onChange={(e) => setStake(e.target.value.replace(/[^\d.]/g, ""))} aria-label="Stake" className="h-10 w-28 text-right font-bold" />
              </span>
            </div>
            <div className="flex gap-2">
              {[10, 50, 100].map((v) => (
                <Button key={v} size="sm" variant="secondary" className="flex-1" onClick={() => setStake(String(v))}>{v}</Button>
              ))}
            </div>

            {/* totals */}
            <div className="space-y-1.5 pt-1 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Total Odds</span><b>{total.toFixed(2)}</b></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Max Bonus</span><b>{fmt(bonus.bonus)}</b></div>
              <div className="flex justify-between rounded-sm bg-primary/10 px-2 py-1.5"><span className="font-semibold">Potential Win</span><b>{fmt(bonus.payout)}</b></div>
            </div>
          </div>

          {/* actions */}
          {changed.length > 0 && (
            <button onClick={acceptChanges} className="bg-gold py-2.5 text-sm font-bold text-gold-foreground">Odds changed — Accept new odds</button>
          )}
          <div className="grid grid-cols-2">
            <button onClick={bookOnly} disabled={loading} className="theme-dark bg-brand-ink py-3.5 text-base font-bold text-foreground disabled:opacity-60">
              Book Bet
            </button>
            <button onClick={place} disabled={loading || changed.length > 0 || suspended.length > 0} className="bg-primary py-2.5 text-base font-bold leading-tight text-primary-foreground disabled:opacity-60">
              {loading ? "Placing…" : <>Place Bet<br /><span className="text-xs font-semibold opacity-80">About to pay {fmt(stakeN)}</span></>}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

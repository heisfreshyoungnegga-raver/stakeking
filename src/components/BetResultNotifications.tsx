import { createContext, useContext, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Crown, Trophy } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { CURRENCY, fmt } from "@/lib/betting";
import { detectBetResult, type BetResult, type ResultBet } from "@/lib/bet-results";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogPortal } from "@/components/ui/dialog";
import trophy from "@/assets/result-trophy-clear.png";
import { shareBookingImage } from "@/lib/booking-image";

const GOLD = "#f5c542";
const WIN_PARTICLES: { tx: string; ty: string; size: number; color: string; delay: string; diamond?: boolean }[] = [
  { tx: "-168px", ty: "-196px", size: 9, color: GOLD, delay: "0s" },
  { tx: "150px", ty: "-210px", size: 7, color: "#ffffff", delay: "0.35s", diamond: true },
  { tx: "-205px", ty: "-60px", size: 7, color: "#ffd970", delay: "0.7s" },
  { tx: "198px", ty: "-40px", size: 9, color: GOLD, delay: "1.05s", diamond: true },
  { tx: "-120px", ty: "-248px", size: 6, color: "#ffffff", delay: "1.4s" },
  { tx: "96px", ty: "-256px", size: 8, color: "#ffd970", delay: "1.75s", diamond: true },
  { tx: "-228px", ty: "66px", size: 6, color: GOLD, delay: "0.5s", diamond: true },
  { tx: "222px", ty: "84px", size: 7, color: "#ffffff", delay: "0.9s" },
  { tx: "-88px", ty: "196px", size: 8, color: "#ffd970", delay: "1.25s" },
  { tx: "118px", ty: "188px", size: 6, color: GOLD, delay: "1.6s", diamond: true },
  { tx: "-186px", ty: "-140px", size: 5, color: "#ffffff", delay: "1.95s" },
  { tx: "176px", ty: "-150px", size: 5, color: GOLD, delay: "2.2s" },
  { tx: "-40px", ty: "-272px", size: 7, color: GOLD, delay: "0.2s", diamond: true },
  { tx: "30px", ty: "224px", size: 7, color: "#ffffff", delay: "2.45s" },
];

const ResultContext = createContext<(result: BetResult) => void>(() => {});
export const useBetResultNotification = () => useContext(ResultContext);

export function BetResultNotifications({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<BetResult[]>([]);
  const previous = useRef(new Map<string, ResultBet>());
  const ready = useRef(false);
  const locallyAnnounced = useRef(new Map<string, number>());
  const qc = useQueryClient();
  const { data: results } = useQuery({
    queryKey: ["bet-result-watch"],
    refetchInterval: 3000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return [];
      const { data, error } = await supabase.from("bets").select("id,status,potential_win,cashed_out").eq("user_id", auth.user.id).order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return data as ResultBet[];
    },
  });

  const announce = (result: BetResult) => {
    locallyAnnounced.current.set(result.betId, (locallyAnnounced.current.get(result.betId) ?? 0) + result.amount);
    setQueue((pending) => [...pending, result]);
  };

  useEffect(() => {
    if (!results) return;
    const incoming: BetResult[] = [];
    for (const bet of results) {
      const result = ready.current ? detectBetResult(previous.current.get(bet.id), bet) : null;
      if (result) {
        const already = locallyAnnounced.current.get(bet.id) ?? 0;
        if (result.kind === "cashout" && already > 0) locallyAnnounced.current.delete(bet.id);
        else incoming.push(result);
      }
      previous.current.set(bet.id, bet);
    }
    ready.current = true;
    if (incoming.length) {
      setQueue((pending) => [...pending, ...incoming]);
      for (const key of ["bets", "profile", "ticket", "transactions", "cashout-offers"]) qc.invalidateQueries({ queryKey: [key] });
    }
  }, [results, qc]);

  const result = queue[0];
  const [bannerVisible, setBannerVisible] = useState(false);
  useEffect(() => {
    if (!result) { setBannerVisible(false); return; }
    setBannerVisible(true);
    const timer = window.setTimeout(() => setBannerVisible(false), 4000);
    return () => window.clearTimeout(timer);
  }, [result]);
  const dismiss = () => setQueue((pending) => pending.slice(1));
  const share = async () => {
    if (!result) return;
    try {
      const { data: bet, error } = await supabase.from("bets").select("selections,stake,created_at").eq("id", result.betId).single();
      if (error) throw error;
      const picks = bet.selections as unknown as { match_id?: string; match: string; pick: string; market?: string; odds: number }[];
      const { data: code, error: codeError } = await supabase.rpc("create_booking_code", { _selections: picks.map((s) => ({ matchId: s.match_id ?? "", label: s.match, market: s.market ?? "1X2", option: s.pick, optionLabel: s.pick, odds: Number(s.odds) })) as never });
      if (codeError) throw codeError;
      await shareBookingImage({ code: String(code), selections: picks.map((s) => ({ ...s, market: s.market ?? "1X2" })), stake: Number(bet.stake), createdAt: bet.created_at });
    } catch { /* Sharing dismissed. */ }
  };

  return <ResultContext.Provider value={announce}>
    {children}
    <Dialog open={Boolean(result)} onOpenChange={(open) => { if (!open) dismiss(); }}>
      {result && bannerVisible && <DialogPortal>
        <div role="status" className="pointer-events-none fixed inset-x-3 top-[max(12px,env(safe-area-inset-top))] z-[70] mx-auto flex max-w-md items-center gap-2 rounded-lg bg-paper px-3 py-2 text-paper-foreground shadow-lg motion-safe:animate-in motion-safe:slide-in-from-top-4">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-bar text-primary-foreground"><Crown className="h-6 w-6" /></span>
          <div className="pr-5 text-[11px] leading-4"><b>Bet Results In!</b><p>{result.kind === "won" ? "Congrats! 🎉 You've won" : "Cashout successful! You've received"} {CURRENCY} {fmt(result.amount)} on your bet. Check your bet history.</p></div>
        </div>
      </DialogPortal>}
      {result && <DialogContent overlayClassName="bg-result-panel/80" className="theme-dark left-0 top-0 flex h-dvh w-screen max-w-none translate-x-0 translate-y-0 flex-col justify-center overflow-y-auto rounded-none border-0 bg-transparent px-4 pb-7 pt-20 text-foreground shadow-none sm:rounded-none [&>button]:bg-brand-ink [&>button]:text-primary-foreground">
        <div className="mx-auto flex w-full max-w-lg flex-col items-center text-center">
          <DialogTitle className="font-sans text-4xl font-bold">{result.kind === "won" ? "YOU WON" : "CASHOUT SUCCESSFUL"}</DialogTitle>
          <DialogDescription className="result-caption mt-3 text-2xl font-bold text-foreground">{CURRENCY} {fmt(result.amount)}</DialogDescription>
          <div className="relative mx-auto my-5 w-full motion-safe:animate-in motion-safe:zoom-in-90">
            <div aria-hidden className="win-glow absolute left-1/2 top-1/2 h-[70%] w-[62%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(245,197,66,0.5),rgba(245,197,66,0.12)_55%,transparent_75%)] blur-xl" />
            <img src={trophy} alt="Gold trophy cup" width={768} height={987} className="win-cup-float relative mx-auto h-[min(58dvh,620px)] w-full object-contain drop-shadow-[0_18px_28px_rgba(0,0,0,0.45)]" />
            <div aria-hidden className="pointer-events-none absolute inset-0 overflow-visible">
              {WIN_PARTICLES.map((p, i) => (
                <span key={i} className={`win-particle${p.diamond ? " diamond" : ""}`} style={{ "--tx": p.tx, "--ty": p.ty, width: p.size, height: p.size, backgroundColor: p.color, animationDelay: p.delay } as CSSProperties} />
              ))}
            </div>
          </div>
          <div className="grid w-full grid-cols-2 gap-2">
            <Button variant="outline" asChild className="h-12 rounded-sm border-2 border-primary bg-transparent text-primary hover:bg-primary/10"><Link to="/ticket/$betId" params={{ betId: result.betId }} onClick={dismiss}>Details</Link></Button>
            <Button onClick={share} className="h-11 rounded-sm"><Trophy className="h-4 w-4" /> Show Off</Button>
          </div>
          <p className="result-caption mt-5 font-display text-2xl font-bold italic">StakeKing</p>
        </div>
      </DialogContent>}
    </Dialog>
  </ResultContext.Provider>;
}
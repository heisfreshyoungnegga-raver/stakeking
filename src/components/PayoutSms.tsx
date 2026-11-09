import { useEffect, useRef, useState } from "react";
import { Check, MessageSquareText, X } from "lucide-react";
import { fmt } from "@/lib/betting";

// The Oddaroa SMS moment, ported to StakeKing (Prince, 2026-11-09:
// "the admins actually take the SMS notification, which we actually
// use for Oddaroa — set up the entire system"). It is the animated
// SMS-style payout receipt Oddaroa shows its admins: a MobileMoney
// text banner that slides in with a ding, and on a confirmed payout
// the "Withdrawal successful" card under it. Admin-tier eyes only —
// players never see this component. It is a UI costume over the real
// approval flow, not an SMS gateway.

export type PayoutData = {
  amount_ghs: number;
  phone?: string;
  balance_ghs?: number;
  reference?: string;
  txn_ref?: string;
  method?: string;
};

function ding() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const t = ctx.currentTime;
    [880, 1318].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t + i * 0.16);
      gain.gain.exponentialRampToValueAtTime(0.18, t + i * 0.16 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.16 + 0.3);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t + i * 0.16);
      osc.stop(t + i * 0.16 + 0.32);
    });
    setTimeout(() => void ctx.close().catch(() => undefined), 900);
  } catch {
    /* sound is decoration; never block the receipt on it */
  }
}

export function PayoutSmsMoment({
  payout,
  variant,
  onClose,
}: {
  payout: PayoutData;
  variant: "payout" | "request";
  onClose: () => void;
}) {
  const [shown, setShown] = useState(false);
  const [gone, setGone] = useState(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    ding();
    const raf = requestAnimationFrame(() => setShown(true));
    const t = setTimeout(() => {
      setGone(true);
      setTimeout(() => onCloseRef.current(), 450);
    }, 12000);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
    };
  }, []);

  function dismiss() {
    setGone(true);
    setTimeout(() => onCloseRef.current(), 300);
  }

  const amount = `GHS ${fmt(Math.abs(Number(payout.amount_ghs || 0)))}`;
  const balance = `GHS ${fmt(Number(payout.balance_ghs || 0))}`;

  return (
    <>
      {/* SMS banner — modelled on a phone's incoming-text alert */}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[90] flex justify-center px-3">
        <div
          role="button"
          aria-label="Dismiss notification"
          onClick={dismiss}
          className={`pointer-events-auto flex w-full max-w-md cursor-pointer items-start gap-3 rounded-2xl bg-white p-3 text-left shadow-2xl ring-1 ring-black/10 transition-all duration-500 ${
            shown && !gone ? "translate-y-0 opacity-100" : "-translate-y-6 opacity-0"
          }`}
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-emerald-500 text-white">
            <MessageSquareText className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1 text-[13px] leading-snug text-neutral-800">
            <div className="flex items-baseline justify-between gap-2">
              <b className="text-sm text-neutral-900">MobileMoney</b>
              <span className="text-xs text-neutral-400">now</span>
            </div>
            <p>
              Payment received for <b>{amount}</b> from StakeKing. Current Balance: <b>{balance}</b>. Available
              Balance: <b>{balance}</b>.
              {payout.reference ? (
                <>
                  {" "}
                  Reference: <b>{payout.reference}</b>.
                </>
              ) : null}
              {payout.txn_ref ? <> Trans ID: {payout.txn_ref}.</> : null}
            </p>
          </div>
          <span className="shrink-0 rounded-full p-1 text-neutral-400 hover:text-neutral-600" aria-hidden>
            <X className="h-4 w-4" />
          </span>
        </div>
      </div>

      {/* Success card — confirmed payouts only (portal approvals) */}
      {variant === "payout" && (
        <div
          className={`fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4 transition-opacity duration-300 ${
            gone ? "opacity-0" : "opacity-100"
          }`}
          onClick={(e) => {
            if (e.target === e.currentTarget) dismiss();
          }}
        >
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-2xl">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              <Check className="h-8 w-8" strokeWidth={3} />
            </div>
            <div className="text-lg font-bold text-neutral-900">Withdrawal successful</div>
            <p className="mt-1 text-sm text-neutral-500">
              The withdrawal has been paid to {payout.phone || "the player"} successfully.
            </p>
            <div className="my-4 text-3xl font-extrabold text-emerald-600">{amount}</div>
            <div className="flex gap-2 border-t border-neutral-100 pt-4">
              <button
                type="button"
                onClick={dismiss}
                className="h-10 flex-1 rounded-md bg-neutral-100 text-sm font-semibold text-neutral-700 hover:bg-neutral-200"
              >
                Transactions
              </button>
              <button
                type="button"
                onClick={dismiss}
                className="h-10 flex-1 rounded-md bg-emerald-500 text-sm font-semibold text-white hover:bg-emerald-600"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

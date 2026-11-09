import type React from "react";
import { createContext, useContext, useState, type ReactNode } from "react";

/** market "1X2" uses options home/draw/away; other markets use keys from matches.markets */
export type Selection = { matchId: string; label: string; market: string; option: string; optionLabel: string; odds: number };

type Ctx = {
  selections: Selection[];
  toggle: (s: Selection) => void;
  remove: (matchId: string) => void;
  clear: () => void;
  load: (s: Selection[]) => void;
  isSelected: (matchId: string, market: string, option: string) => boolean;
};

// Keep one context instance across hot reloads so provider and consumers always match.
const g = globalThis as unknown as { __betSlipCtx?: React.Context<Ctx | null> };
const BetSlipContext = (g.__betSlipCtx ??= createContext<Ctx | null>(null));

export function BetSlipProvider({ children }: { children: ReactNode }) {
  const [selections, setSelections] = useState<Selection[]>([]);
  const toggle = (s: Selection) =>
    setSelections((prev) => {
      const ex = prev.find((p) => p.matchId === s.matchId);
      if (ex && ex.market === s.market && ex.option === s.option) return prev.filter((p) => p.matchId !== s.matchId);
      return [...prev.filter((p) => p.matchId !== s.matchId), s];
    });
  return (
    <BetSlipContext.Provider
      value={{
        selections,
        toggle,
        remove: (id) => setSelections((p) => p.filter((x) => x.matchId !== id)),
        clear: () => setSelections([]),
        load: (list) => setSelections(list),
        isSelected: (id, market, option) => selections.some((s) => s.matchId === id && s.market === market && s.option === option),
      }}
    >
      {children}
    </BetSlipContext.Provider>
  );
}

export function useBetSlip() {
  const c = useContext(BetSlipContext);
  if (!c) throw new Error("useBetSlip outside provider");
  return c;
}

/** Safe variant for public pages rendered outside the provider. */
export function useOptionalBetSlip() {
  return useContext(BetSlipContext);
}

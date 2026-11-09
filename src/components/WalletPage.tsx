import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, CircleHelp, Smartphone, Landmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";

export function WalletPage({ title, children, helpText }: { title: string; children: ReactNode; helpText?: string }) {
  const [help, setHelp] = useState(false);
  return <div className="min-h-dvh bg-background text-foreground">
    <header className="grid h-14 grid-cols-[1fr_auto_1fr] items-center bg-brand-bar px-3 text-primary-foreground">
      <Link to="/profile" className="flex items-center gap-1 text-sm"><ChevronLeft className="h-5 w-5" /> Me</Link>
      <h1 className="font-sans text-base font-semibold">{title}</h1>
      <Button variant="ghost" size="icon" aria-label={`${title} help`} className="ml-auto text-primary-foreground" onClick={() => setHelp(true)}><CircleHelp className="h-5 w-5" /></Button>
    </header>
    <div className="mx-auto max-w-2xl">{children}</div>
    <Sheet open={help} onOpenChange={setHelp}><SheetContent side="bottom" className="bg-paper text-paper-foreground"><SheetTitle>{title} help</SheetTitle><p className="mt-4 text-sm">{helpText ?? "Deposits credit GHS 1 for every GHS 1 paid. Withdrawals require 2× deposit wagering and manual approval."}</p></SheetContent></Sheet>
  </div>;
}

export function WalletMethod({ bank, onBankChange, method, onMethodChange, deposit = false }: { bank: boolean; onBankChange: (bank: boolean) => void; method: string; onMethodChange: (method: string) => void; deposit?: boolean }) {
  const [open, setOpen] = useState(false);
  return <>
    <div className="grid grid-cols-2 border-b border-border bg-paper">
      {[false, true].map((value) => <Button key={String(value)} variant="ghost" onClick={() => onBankChange(value)} className={`h-14 rounded-none border-b-2 text-sm ${bank === value ? "border-primary font-bold" : "border-transparent font-normal"}`}>{value ? "Bank" : deposit ? "Online Deposit" : "Mobile Money"}</Button>)}
    </div>
    <Button variant="outline" onClick={() => setOpen(true)} className="h-16 w-full justify-start rounded-none border-input bg-transparent px-3 text-left font-normal">
      {bank ? <Landmark className="h-6 w-6 text-primary" /> : <Smartphone className="h-6 w-6 text-primary" />}<span className="text-base">{method}</span><span className="ml-auto text-xs text-paper-muted">Switch</span><ChevronRight className="h-5 w-5 text-paper-muted" />
    </Button>
    <Sheet open={open} onOpenChange={setOpen}><SheetContent side="bottom" className="bg-paper text-paper-foreground"><SheetTitle>Select payment method</SheetTitle><div className="mt-4 space-y-2">{(bank ? ["Bank Transfer"] : ["MTN Mobile Money", "Telecel Cash", "AirtelTigo Money"]).map((name) => <Button key={name} variant={method === name ? "default" : "outline"} className="h-12 w-full justify-start" onClick={() => { onMethodChange(name); setOpen(false); }}>{name}</Button>)}</div></SheetContent></Sheet>
  </>;
}
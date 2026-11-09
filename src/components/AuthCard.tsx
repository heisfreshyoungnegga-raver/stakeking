import type { ReactNode } from "react";
import { Logo } from "./Logo";

export function AuthCard({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background pb-8">
      <div className="flex justify-center bg-brand-bar px-4 py-3">
        <Logo />
      </div>
      <div className="mx-auto w-full max-w-md px-4 pt-6">
        <div className="rounded-lg border border-border bg-card p-6 shadow-sm sm:p-8">
          <h1 className="text-3xl font-bold uppercase">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
          <div className="mt-6">{children}</div>
        </div>
        <p className="mt-6 text-center text-xs text-muted-foreground">
          18+ only · Play responsibly
        </p>
      </div>
    </div>
  );
}

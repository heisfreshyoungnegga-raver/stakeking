import { Link } from "@tanstack/react-router";
import { Crown } from "lucide-react";

export function Logo() {
  return (
    <Link to="/" className="flex items-center gap-1.5">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-paper text-brand-bar">
        <Crown className="h-5 w-5" />
      </span>
      <span className="font-display text-2xl font-extrabold uppercase italic tracking-wide text-foreground">
        Stake<span className="text-gold">King</span>
      </span>
    </Link>
  );
}

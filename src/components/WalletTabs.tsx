import { Link } from "@tanstack/react-router";

export function WalletTabs({ active }: { active: "deposit" | "withdraw" }) {
  const on = "rounded-md bg-primary py-2 text-center text-primary-foreground";
  const off = "py-2 text-center text-muted-foreground";
  return (
    <div className="grid grid-cols-2 rounded-lg bg-secondary p-1 text-sm font-semibold">
      <Link to="/deposit" className={active === "deposit" ? on : off}>Deposit</Link>
      <Link to="/withdraw" className={active === "withdraw" ? on : off}>Withdraw</Link>
    </div>
  );
}

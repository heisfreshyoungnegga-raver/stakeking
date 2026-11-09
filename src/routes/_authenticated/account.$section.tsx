import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { ChevronLeft, Mail, MessageCircle, Star, Share2, Copy, Flame, Bell, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { contentQuery, CURRENCY, fmt, profileQuery } from "@/lib/betting";
import { dailyStreak, isAccountSection, supportEmailLink, whatsappLink, type AccountSection } from "@/lib/account";
import { cn } from "@/lib/utils";

const TITLES: Record<AccountSection, string> = {
  social: "My SportsSocial", streak: "Daily Streak", support: "Customer Service", notifications: "Notification Center",
  rate: "Rate Our App", "how-to-play": "How to Play", idea: "Share an Idea", update: "Update App",
  responsible: "Responsible Gambling", terms: "Terms and Conditions",
};

export const Route = createFileRoute("/_authenticated/account/$section")({
  beforeLoad: ({ params }) => { if (!isAccountSection(params.section)) throw notFound(); },
  head: ({ params }) => {
    const t = isAccountSection(params.section) ? TITLES[params.section] : "My Account";
    const d = `${t} on StakeKing, Ghana sports betting.`;
    return { meta: [{ title: `${t} — StakeKing` }, { name: "description", content: d }, { property: "og:title", content: `${t} — StakeKing` }, { property: "og:description", content: d }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] };
  },
  component: Section,
});

function Section() {
  const section = Route.useParams().section as AccountSection;
  const Body = { social: Social, streak: Streak, support: Support, notifications: Notifications, rate: Rate, "how-to-play": HowToPlay, idea: Idea, update: Update, responsible: Responsible, terms: Terms }[section];
  return (
    <div className="mx-auto min-h-[80vh] max-w-lg bg-paper text-paper-foreground">
      <header className="theme-dark flex h-12 items-center gap-2 bg-surface px-2 text-foreground">
        <Link to="/profile" aria-label="Back to My Account" className="grid h-9 w-9 place-items-center"><ChevronLeft className="h-6 w-6" /></Link>
        <h1 className="text-base font-bold">{TITLES[section]}</h1>
      </header>
      <div className="space-y-4 p-4 text-sm leading-relaxed"><Body /></div>
    </div>
  );
}

const Card = ({ children, className }: { children: ReactNode; className?: string }) => <div className={cn("rounded-md border border-paper-border p-4", className)}>{children}</div>;
const H = ({ children }: { children: ReactNode }) => <h2 className="mb-1 text-base font-bold">{children}</h2>;

function Support() {
  const { data } = useQuery(contentQuery);
  const wa = whatsappLink(data?.["support_whatsapp"]);
  const mail = supportEmailLink(data?.["support_email"]);
  const opt = (href: string | null, Icon: typeof Mail, label: string, value?: string) => href
    ? <a href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noreferrer" className="flex items-center gap-3 rounded-md border border-paper-border p-4 active:bg-paper-border">
        <span className="grid h-10 w-10 place-items-center rounded-full bg-primary text-primary-foreground"><Icon className="h-5 w-5" /></span>
        <span className="flex-1"><b className="block">{label}</b><span className="text-xs text-paper-muted">{value}</span></span>
      </a>
    : <div className="flex items-center gap-3 rounded-md border border-paper-border p-4 text-paper-muted"><Icon className="h-5 w-5" /><span>{label} is not available yet.</span></div>;
  return <>
    <p className="text-paper-muted">Choose how you'd like to reach our support team.</p>
    {opt(wa, MessageCircle, "WhatsApp support", data?.["support_whatsapp"])}
    {opt(mail, Mail, "Email support", data?.["support_email"])}
  </>;
}

type Note = { id: string; title: string; body: string; at: string };
function Notifications() {
  const { data, isLoading } = useQuery({
    queryKey: ["notifications"],
    queryFn: async (): Promise<Note[]> => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return [];
      const [tx, bets] = await Promise.all([
        supabase.from("transactions").select("id,type,amount,status,note,created_at").eq("user_id", u.user.id).neq("type", "bet").order("created_at", { ascending: false }).limit(30),
        supabase.from("bets").select("id,status,potential_win,cashed_out,created_at").eq("user_id", u.user.id).in("status", ["won", "lost"]).order("created_at", { ascending: false }).limit(20),
      ]);
      const label: Record<string, string> = { deposit: "Deposit", withdrawal: "Withdrawal", win: "Winnings paid", cashout: "Cash out", bonus: "Bonus", adjustment: "Balance adjustment" };
      const a: Note[] = (tx.data ?? []).map((t) => ({ id: "t" + t.id, title: `${label[t.type] ?? t.type} · ${t.status}`, body: `${CURRENCY} ${fmt(Math.abs(Number(t.amount)))}${t.note ? ` — ${t.note}` : ""}`, at: t.created_at }));
      const b: Note[] = (bets.data ?? []).map((x) => ({ id: "b" + x.id, title: x.status === "won" ? "Your bet won" : "Your bet lost", body: x.status === "won" ? `Return ${CURRENCY} ${fmt(x.potential_win)}` : "Better luck next time.", at: x.created_at }));
      return [...a, ...b].sort((p, q) => +new Date(q.at) - +new Date(p.at));
    },
  });
  if (isLoading) return <p className="text-paper-muted">Loading…</p>;
  if (!data?.length) return <div className="py-10 text-center text-paper-muted"><Bell className="mx-auto mb-2 h-8 w-8" />No notifications yet.</div>;
  return <ul className="divide-y divide-paper-border">{data.map((n) => <li key={n.id} className="py-3"><p className="font-semibold capitalize">{n.title}</p><p className="text-paper-muted">{n.body}</p><p className="text-xs text-paper-muted">{new Date(n.at).toLocaleString("en-GB", { timeZone: "Africa/Accra", dateStyle: "medium", timeStyle: "short" })}</p></li>)}</ul>;
}

function Streak() {
  const { data } = useQuery({
    queryKey: ["streak"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { data } = await supabase.from("bets").select("created_at").eq("user_id", u.user?.id ?? "").gte("created_at", new Date(Date.now() - 90 * 864e5).toISOString());
      return dailyStreak((data ?? []).map((r) => r.created_at));
    },
  });
  return <Card className="text-center">
    <Flame className="mx-auto h-10 w-10 text-brand-bar" />
    <p className="mt-2 text-4xl font-bold">{data ?? "—"}</p>
    <p className="text-paper-muted">day{data === 1 ? "" : "s"} in a row with a bet placed</p>
    <p className="mt-3 text-xs text-paper-muted">Place at least one bet each day (Ghana time) to keep your streak going. Streaks are for fun only and don't add money to your balance.</p>
    <Button asChild variant="brand" className="mt-4 w-full"><Link to="/sports">Find a match</Link></Button>
  </Card>;
}

function Social() {
  const { data: p } = useQuery(profileQuery);
  const link = typeof window !== "undefined" ? `${window.location.origin}/register${p?.referral_code ? `?ref=${p.referral_code}` : ""}` : "";
  async function share() {
    if (navigator.share) { await navigator.share({ title: "StakeKing", text: "Join me on StakeKing", url: link }).catch(() => null); return; }
    await navigator.clipboard.writeText(link); toast.success("Invite link copied");
  }
  return <>
    <Card><H>Invite your friends</H><p className="text-paper-muted">Share StakeKing with friends and share your booking codes from the bet slip.</p>
      <p className="mt-3 break-all rounded-sm bg-paper-border p-2 text-xs">{link}</p>
      <div className="mt-3 grid grid-cols-2 gap-2"><Button variant="brand" onClick={share}><Share2 /> Share</Button><Button variant="outline" onClick={async () => { await navigator.clipboard.writeText(link); toast.success("Invite link copied"); }}><Copy /> Copy</Button></div>
    </Card>
    <Button asChild variant="outline" className="w-full"><Link to="/transactions" search={{ tab: undefined }}>Share one of my bets</Link></Button>
  </>;
}

function Rate() {
  const [stars, setStars] = useState(0);
  const [busy, setBusy] = useState(false);
  async function submit() {
    setBusy(true);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("user_feedback").insert({ kind: "rating", rating: stars, user_id: u.user!.id });
    setBusy(false);
    if (error) { toast.error("Could not save your rating"); return; }
    toast.success("Thanks for rating StakeKing!"); setStars(0);
  }
  return <Card className="text-center"><H>How are we doing?</H>
    <div className="my-4 flex justify-center gap-2">{[1, 2, 3, 4, 5].map((n) => <button key={n} aria-label={`${n} star${n > 1 ? "s" : ""}`} aria-pressed={stars >= n} onClick={() => setStars(n)}><Star className={cn("h-9 w-9", stars >= n ? "fill-gold text-gold" : "text-paper-muted")} /></button>)}</div>
    <Button variant="brand" className="w-full" disabled={!stars || busy} onClick={submit}>Submit rating</Button>
  </Card>;
}

function Idea() {
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  async function submit() {
    setBusy(true);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("user_feedback").insert({ kind: "idea", message: msg.trim(), user_id: u.user!.id });
    setBusy(false);
    if (error) { toast.error("Could not send your idea"); return; }
    toast.success("Thanks! Your idea was sent."); setMsg(""); qc.invalidateQueries({ queryKey: ["feedback"] });
  }
  return <>
    <p className="text-paper-muted">Tell us what would make StakeKing better.</p>
    <Textarea value={msg} maxLength={1000} rows={6} onChange={(e) => setMsg(e.target.value)} placeholder="Your suggestion…" className="bg-paper" />
    <p className="text-right text-xs text-paper-muted">{msg.length}/1000</p>
    <Button variant="brand" className="w-full" disabled={msg.trim().length < 5 || busy} onClick={submit}>Send idea</Button>
  </>;
}

function Update() {
  return <Card className="text-center"><RefreshCw className="mx-auto h-9 w-9 text-primary" /><H>Get the latest version</H>
    <p className="text-paper-muted">StakeKing runs in your browser, so reloading loads the newest version.</p>
    <Button variant="brand" className="mt-4 w-full" onClick={() => window.location.reload()}>Reload now</Button></Card>;
}

const Article = ({ items }: { items: [string, string][] }) => <>{items.map(([h, b]) => <Card key={h}><H>{h}</H><p className="text-paper-muted">{b}</p></Card>)}</>;

function HowToPlay() {
  return <Article items={[
    ["1. Deposit", "Open Deposit and add funds. Your balance updates only after the payment is confirmed."],
    ["2. Pick your selections", "Go to Sports, open a match and tap the odds you want — 1X2, Over/Under, Double Chance, Correct Score and more. Each pick goes into your bet slip."],
    ["3. Place your bet", "Open the bet slip, enter your stake and check your potential win. Multiple bets with several selections earn a bonus on the return."],
    ["4. Follow and cash out", "Track bets in Open Bets. Where available, cash out early to lock in a return before the matches finish."],
    ["5. Withdraw", "Request a withdrawal from My Account. Every request is reviewed and approved by our team before payment."],
    ["Share booking codes", "Book a slip to get a code your friends can load and play."],
  ]} />;
}

function Responsible() {
  return <Article items={[
    ["18+ only", "You must be 18 or older to bet. Underage gambling is an offence."],
    ["Bet for fun", "Only stake money you can afford to lose. Never chase losses or borrow to bet."],
    ["Set limits", "Decide a budget and time limit before you play, and stick to them. Take regular breaks."],
    ["Warning signs", "Betting more than you planned, hiding it from family, or feeling anxious about it can mean it's time to stop."],
    ["Get help", "Contact Customer Service to ask for a break or to close your account. You can also speak to a counsellor or a trusted person."],
  ]} />;
}

function Terms() {
  return <Article items={[
    ["Eligibility", "Accounts are for Ghana residents aged 18+. One account per person."],
    ["Bets", "Bets are accepted only at the odds shown when placed. Odds that change before confirmation must be accepted again. Bets on matches that have started may be refused."],
    ["Settlement", "Bets are settled from official match results. Void or abandoned matches are handled under standard rules."],
    ["Deposits and withdrawals", "Deposits are credited only after the payment is confirmed. Withdrawals are reviewed and approved by StakeKing before payment."],
    ["Account security", "Keep your password private. You're responsible for activity on your account."],
    ["Changes", "StakeKing may update these terms; continued use means you accept the latest version."],
  ]} />;
}

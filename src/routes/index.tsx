import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { HomeFeed } from "@/components/HomeFeed";
import { categoriesQuery, contentQuery, matchesQuery } from "@/lib/betting";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "StakeKing — Live Odds & Betting for Ghana" },
      { name: "description", content: "Football odds, live scores and betting. Built for Ghana." },
      { property: "og:title", content: "StakeKing — Live Odds & Betting" },
      { property: "og:description", content: "Football odds, live scores and betting for Ghana." },
    ],
  }),
  component: Index,
});

function Index() {
  const { data: matches } = useQuery(matchesQuery);
  const { data: cats } = useQuery(categoriesQuery);
  const { data: content } = useQuery(contentQuery);

  return (
    <div className="min-h-screen bg-paper">
      <header className="sticky top-0 z-30 bg-brand-bar shadow-md">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4">
          <Logo />
          <div className="flex gap-2">
            <Button asChild variant="dark" size="sm" className="text-paper"><Link to="/login">Log in</Link></Button>
            <Button asChild variant="brand" size="sm"><Link to="/register">Register</Link></Button>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-5xl">
        <div className="bg-surface px-4 py-2 text-center text-xs font-semibold text-gold">
          {content?.["announcement"] ?? "Real odds, live scores."} <Link to="/register" className="underline">Create your account</Link>
        </div>
        <HomeFeed matches={matches ?? []} categories={cats ?? []} signedIn={false} />
        <footer className="bg-background py-8 text-center text-xs text-muted-foreground">18+ · Play responsibly · StakeKing</footer>
      </div>
    </div>
  );
}

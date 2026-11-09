import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useBetSlip, type Selection } from "@/lib/betslip";
import { HomeFeed } from "@/components/HomeFeed";
import { categoriesQuery, matchesQuery } from "@/lib/betting";

export const Route = createFileRoute("/_authenticated/sports")({
  validateSearch: (search: Record<string, unknown>): { code?: string } => typeof search["code"] === "string" ? { code: search["code"] } : {},
  head: () => ({
    meta: [
      { title: "Home — StakeKing" },
      { name: "description", content: "Featured matches, live betting and sports odds." },
      { property: "og:title", content: "Home — StakeKing" },
      { property: "og:description", content: "Featured matches, live betting and sports odds." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Sports,
});

function Sports() {
  const { code } = Route.useSearch();
  const slip = useBetSlip();
  const { data: booking } = useQuery({
    queryKey: ["booking-code", code],
    enabled: Boolean(code),
    queryFn: async () => {
      const { data, error } = await supabase.from("booking_codes").select("selections").eq("code", (code ?? "").toUpperCase()).maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Booking code not found");
      return data;
    },
  });
  useEffect(() => {
    if (booking) {
      slip.load(booking.selections as unknown as Selection[]);
      toast.success("Booking code loaded");
    }
  // Load only when the fetched code changes, not when slip selections change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booking]);
  const { data: cats } = useQuery(categoriesQuery);
  const { data: matches } = useQuery(matchesQuery);
  return <HomeFeed matches={matches ?? []} categories={cats ?? []} signedIn />;
}

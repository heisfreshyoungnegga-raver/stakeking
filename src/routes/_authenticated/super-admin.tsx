import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ShinobiPaySettings } from "@/components/ShinobiPaySettings";
import { Users, Withdrawals } from "./admin";

export const Route = createFileRoute("/_authenticated/super-admin")({
  beforeLoad: async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) throw redirect({ to: "/login" });
    // The adapter extends the generated role enum with a super tier:
    // has_role('super_admin') is true only for engine super_admins.
    const SUPER_ROLE = "super_admin" as unknown as "admin";
    const { data } = await supabase.rpc("has_role", { _user_id: u.user.id, _role: SUPER_ROLE });
    if (!data) throw redirect({ to: "/sports" });
  },
  head: () => ({
    meta: [
      { title: "Super Admin — StakeKing" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "description", content: "StakeKing super administration portal." },
      { property: "og:title", content: "Super Admin — StakeKing" },
      { property: "og:description", content: "StakeKing super administration portal." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SuperAdmin,
});

function SuperAdmin() {
  return (
    <div className="space-y-5">
      <h1 className="text-4xl font-bold uppercase">Super Admin <span className="text-gold">portal</span></h1>
      <Tabs defaultValue="users">
        <TabsList className="flex h-auto w-full flex-wrap justify-start">
          {["users", "withdrawals", "ShinobiPay"].map((t) => (
            <TabsTrigger key={t} value={t} className="capitalize">{t}</TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="users"><Users /></TabsContent>
        <TabsContent value="withdrawals"><Withdrawals /></TabsContent>
        <TabsContent value="ShinobiPay"><ShinobiPaySettings /></TabsContent>
      </Tabs>
    </div>
  );
}

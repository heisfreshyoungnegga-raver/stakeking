import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const CURRENCY = "GHS"; // Ghana cedi

export function fmt(n: number | string) {
  return Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export const profileQuery = queryOptions({
  queryKey: ["profile"],
  queryFn: async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return null;
    const { data, error } = await supabase.from("profiles").select("*").eq("id", u.user.id).maybeSingle();
    if (error) throw error;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: u.user.id, _role: "admin" });
    return data ? { ...data, isAdmin: !!isAdmin } : null;
  },
});

export const categoriesQuery = queryOptions({
  queryKey: ["categories"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("sports_categories")
      .select("*")
      .order("sort_order");
    if (error) throw error;
    return data;
  },
});

export const matchesQuery = queryOptions({
  queryKey: ["matches"],
  queryFn: async () => {
    const { data, error } = await supabase.from("matches").select("*").order("start_time");
    if (error) throw error;
    return data;
  },
});

export const contentQuery = queryOptions({
  queryKey: ["content"],
  queryFn: async () => {
    const { data, error } = await supabase.from("site_content").select("*");
    if (error) throw error;
    return Object.fromEntries((data ?? []).map((r) => [r.key, r.value])) as Record<string, string>;
  },
});

export const promosQuery = queryOptions({
  queryKey: ["promotions"],
  queryFn: async () => {
    const { data, error } = await supabase.from("promotions").select("*").order("created_at");
    if (error) throw error;
    return data;
  },
});

export function passwordStrength(pw: string) {
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  const level = Math.min(4, s);
  const labels = ["Too weak", "Weak", "Fair", "Good", "Strong"];
  return { score: level, label: labels[level] };
}

export const COUNTRIES = [
  { name: "Ghana", code: "+233", flag: "🇬🇭" },
] as const;

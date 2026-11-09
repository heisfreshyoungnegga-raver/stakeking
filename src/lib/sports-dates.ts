export type SportsDay = "highlights" | "today" | "tomorrow";

export const ghDay = (date: Date | string | number) =>
  new Date(date).toLocaleDateString("en-CA", { timeZone: "Africa/Accra" });

export function matchesSportsDay(startTime: string, day: SportsDay, now: number): boolean {
  if (day === "highlights") return true;
  const target = day === "tomorrow" ? now + 86_400_000 : now;
  return ghDay(startTime) === ghDay(target);
}
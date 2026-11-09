/** Never turn kickoff or a locally observed restart into an official match clock. */
export function officialLiveTime(status: string | null, minute: number | null) {
  if (status === "PAUSED") return "HT";
  if (!["IN_PLAY", "LIVE"].includes(status ?? "")) return null;
  if (minute === null || !Number.isFinite(minute) || minute < 0) return null;
  // Half follows from the official minute reported after a provider-confirmed restart.
  const period = minute > 90 ? "ET" : minute > 45 ? "H2" : "H1";
  return `${minute}′ ${period}`;
}

export function livePriceSelectable(available: boolean, odds: number) {
  return available && Number.isFinite(odds) && odds > 1;
}
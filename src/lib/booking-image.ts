import { betBonus } from "@/lib/bet-bonus";
export type BookingImagePick = { match: string; pick: string; market: string; odds: number };
export type BookingImageData = { code: string; selections: BookingImagePick[]; stake?: number; createdAt?: string; compact?: boolean };

export function createBookingImage(data: BookingImageData): string {
  const canvas = document.createElement("canvas");
  canvas.width = 720;
  canvas.height = 560 + data.selections.length * 130;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Image creation is unavailable");
  const tokens = getComputedStyle(document.documentElement);
  const color = (name: string) => tokens.getPropertyValue(name).trim();
  const text = (value: string, x: number, y: number, size = 22, fill = "--paper-foreground", bold = false, align: CanvasTextAlign = "left") => {
    ctx.fillStyle = color(fill); ctx.font = `${bold ? "bold " : ""}${size}px Arial`; ctx.textAlign = align; ctx.fillText(value, x, y);
  };
  const rect = (x: number, y: number, w: number, h: number, fill: string) => { ctx.fillStyle = color(fill); ctx.fillRect(x, y, w, h); };
  const odds = data.selections.reduce((total, s) => total * s.odds, 1);
  const stake = data.stake ?? 100;
  const bonus = betBonus(stake, odds, data.selections.length);
  const line = (x1: number, y1: number, x2: number, y2: number, fill: string, width = 2) => {
    ctx.strokeStyle = color(fill); ctx.lineWidth = width; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  };
  rect(0, 0, 720, canvas.height, "--brand-ink");
  rect(0, 0, 720, 80, "--brand-bar");
  text("StakeKing", 24, 49, 34, "--primary-foreground", true);
  text("🇬🇭 Ghana", 230, 48, 20, "--primary-foreground");
  text("Betslip", 694, 28, 18, "--primary-foreground", false, "right");
  text(new Date(data.createdAt ?? Date.now()).toLocaleString("en-GB", { timeZone: "Africa/Accra", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }), 694, 58, 16, "--primary-foreground", false, "right");
  text("Booking Code", 360, 128, 18, "--paper", false, "center");
  text(data.code, 360, 186, 46, "--odds-soft", true, "center");
  rect(120, 216, 480, 100, "--history-bar");
  rect(120, 313, 480, 3, "--odds-soft");
  text("Odds", 140, 258, 22, "--paper"); text(odds.toFixed(2), 580, 258, 28, "--paper", true, "right");
  text("Max Bonus", 140, 294, 20, "--paper"); text(`${(bonus.rate * 100).toFixed(2)}%`, 580, 294, 20, "--paper", false, "right");
  rect(0, 340, 720, canvas.height - 340, "--paper");
  rect(0, 340, 720, 40, "--odds-soft");
  text("Example Bet", 24, 367, 19, "--odds-soft-foreground", true);
  const exampleRows: [string, string][] = [["Stake", stake.toFixed(2)], ["Bonus", bonus.bonus.toFixed(2)], ["Payout", bonus.payout.toFixed(2)]];
  for (const [i, [label, value]] of exampleRows.entries()) {
    const y = 420 + i * 44;
    text(label, 24, y, 21, "--paper-muted"); text(value, 696, y, 21, "--paper-muted", false, "right");
    if (i < exampleRows.length - 1) line(24, y + 16, 696, y + 16, "--paper-border", 1);
  }
  rect(0, 516, 720, 40, "--odds-soft");
  text("Selections", 24, 543, 19, "--odds-soft-foreground", true);
  data.selections.forEach((s, i) => {
    const y = 556 + i * 130;
    const pick = s.pick === "home" ? "Home" : s.pick === "away" ? "Away" : s.pick === "draw" ? "Draw" : s.pick;
    text(`⚽ ${pick}`, 24, y + 38, 24, "--paper-foreground", true);
    text(s.odds.toFixed(2), 696, y + 38, 24, "--paper-foreground", true, "right");
    let label = s.match;
    ctx.font = "20px Arial";
    while (ctx.measureText(label).width > 640 && label.length > 0) label = label.slice(0, -1);
    text(label === s.match ? label : `${label}…`, 44, y + 76, 20, "--paper-muted");
    text(s.market, 44, y + 108, 18, "--paper-muted");
    if (i < data.selections.length - 1) line(24, y + 126, 696, y + 126, "--paper-border", 1);
  });
  if (data.compact) {
    const small = document.createElement("canvas");
    const scale = Math.min(360 / canvas.width, 540 / canvas.height);
    small.width = Math.round(canvas.width * scale);
    small.height = Math.round(canvas.height * scale);
    const smallContext = small.getContext("2d");
    if (!smallContext) throw new Error("Image creation is unavailable");
    smallContext.drawImage(canvas, 0, 0, small.width, small.height);
    return small.toDataURL("image/png");
  }
  return canvas.toDataURL("image/png");
}

export async function saveBookingImage(data: BookingImageData) {
  const image = createBookingImage({ ...data, compact: true });
  const encoded = image.split(",")[1];
  if (!encoded) throw new Error("Image creation is unavailable");
  const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
  const file = new File([bytes], `StakeKing-${data.code}.png`, { type: "image/png" });
  // iOS can navigate to an image instead of downloading it inside a preview iframe.
  // Its native file sheet offers Save Image / Save to Files without replacing the ticket.
  if (matchMedia("(pointer: coarse)").matches && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file] }); return; }
    catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      throw error;
    }
  }
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = `StakeKing-${data.code}.png`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export async function shareBookingImage(data: BookingImageData) {
  window.dispatchEvent(new CustomEvent<BookingImageData>("stakeking:share-booking", { detail: data }));
}

export async function deliverBookingImage(data: BookingImageData) {
  const url = createBookingImage(data);
  const blob = await (await fetch(url)).blob();
  const file = new File([blob], `StakeKing-${data.code}.png`, { type: "image/png" });
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: `StakeKing Booking Code ${data.code}` });
  } else await saveBookingImage(data);
}
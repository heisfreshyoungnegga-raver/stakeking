import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Copy, Link2, MessageCircle, Send, Share2, Ticket, ZoomIn } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useBetSlip, type Selection } from "@/lib/betslip";
import { createBookingImage, deliverBookingImage, type BookingImageData } from "@/lib/booking-image";

export function BookingShareSheet() {
  const [data, setData] = useState<BookingImageData | null>(null);
  const [zoom, setZoom] = useState(false);
  const [loading, setLoading] = useState(false);
  const slip = useBetSlip();
  const navigate = useNavigate();
  useEffect(() => {
    const open = (event: Event) => { setZoom(false); setData((event as CustomEvent<BookingImageData>).detail); };
    window.addEventListener("stakeking:share-booking", open);
    return () => window.removeEventListener("stakeking:share-booking", open);
  }, []);
  const image = useMemo(() => data ? createBookingImage({ ...data, compact: true }) : "", [data]);
  const bookingLink = data ? `${window.location.origin}/sports?code=${encodeURIComponent(data.code)}` : "";
  const copy = async (value: string, message: string) => {
    try { await navigator.clipboard.writeText(value); toast.success(message); }
    catch { toast.error("Unable to copy"); }
  };
  const load = async () => {
    if (!data || loading) return;
    setLoading(true);
    const { data: booking, error } = await supabase.from("booking_codes").select("selections").eq("code", data.code).maybeSingle();
    setLoading(false);
    if (error || !booking) { toast.error("Booking code not found"); return; }
    slip.load(booking.selections as unknown as Selection[]);
    setData(null);
    await navigate({ to: "/sports" });
    toast.success("Selections loaded into your bet slip");
  };
  const shareImage = async () => {
    if (!data) return;
    try { await deliverBookingImage({ ...data, compact: true }); }
    catch (error) { if (!(error instanceof DOMException && error.name === "AbortError")) toast.error("Unable to share image"); }
  };
  const social = (platform: "X" | "Telegram" | "WhatsApp") => {
    if (!data) return;
    const text = encodeURIComponent(`StakeKing Booking Code ${data.code}`);
    const url = encodeURIComponent(bookingLink);
    const destination = platform === "X" ? `https://twitter.com/intent/tweet?text=${text}&url=${url}` : platform === "Telegram" ? `https://t.me/share/url?url=${url}&text=${text}` : `https://wa.me/?text=${text}%20${url}`;
    window.open(destination, "_blank", "noopener,noreferrer");
  };
  return <>
    <Sheet open={Boolean(data)} onOpenChange={(open) => { if (!open) setData(null); }}>
      <SheetContent side="bottom" aria-describedby={undefined} className="max-h-[82dvh] overflow-y-auto border-paper-border bg-paper px-5 pb-[max(24px,env(safe-area-inset-bottom))] pt-9 text-paper-foreground sm:mx-auto sm:max-w-xl">
        <SheetTitle className="sr-only">Share booking code</SheetTitle>
        {data && <>
          <div className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] items-center gap-5 border-b border-paper-border pb-6">
            <div className="min-w-0">
              <Button variant="ghost" aria-label="Enlarge booking image" className="relative block h-32 w-full overflow-hidden rounded-none p-0" onClick={() => setZoom(true)}>
                <img src={image} alt={`Booking slip ${data.code}`} className="h-full w-full object-cover object-top" />
                <span className="absolute inset-0 grid place-items-center bg-brand-ink/30 text-primary-foreground"><ZoomIn className="h-10 w-10" /></span>
              </Button>
              <p className="mt-2 text-center text-xs text-paper-muted">{new Date(data.createdAt ?? Date.now()).toLocaleString("en-GB", { timeZone: "Africa/Accra", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
            </div>
            <div className="min-w-0">
              <p className="mb-3 text-sm font-bold">Booking Code</p>
              <div className="flex items-center gap-1">
                <strong className="text-2xl font-bold sm:text-3xl">{data.code}</strong>
                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label="Copy booking code" onClick={() => copy(data.code, "Booking code copied")}><Copy className="h-5 w-5" /></Button>
              </div>
              <Button variant="ghost" disabled={loading} className="mt-3 h-auto px-0 text-base font-bold text-primary" onClick={load}>Load Code <Ticket className="h-5 w-5" /></Button>
            </div>
          </div>
          <div className="flex justify-between gap-3 overflow-x-auto py-6">
            {[
              { label: "Copy Link", icon: Link2, action: () => copy(bookingLink, "Booking link copied"), className: "bg-secondary text-secondary-foreground" },
              { label: "X", icon: null, action: () => social("X"), className: "bg-brand-ink text-primary-foreground" },
              { label: "Telegram", icon: Send, action: () => social("Telegram"), className: "bg-chart-3 text-primary-foreground" },
              { label: "WhatsApp", icon: MessageCircle, action: () => social("WhatsApp"), className: "bg-primary text-primary-foreground" },
            ].map(({ label, icon: Icon, action, className }) => <Button key={label} variant="ghost" onClick={action} className="h-auto w-14 shrink-0 flex-col gap-2 p-0 text-xs font-normal hover:bg-transparent" aria-label={label}>
              <span className={`grid h-12 w-12 place-items-center rounded-full ${className}`}>{Icon ? <Icon className="h-6 w-6" /> : <span className="text-2xl">𝕏</span>}</span><span className="min-h-8 whitespace-normal text-center">{label}</span>
            </Button>)}
          </div>
          <Button className="h-12 w-full text-base font-bold" onClick={shareImage}><Share2 className="h-5 w-5" /> Share Image</Button>
        </>}
      </SheetContent>
    </Sheet>
    <Dialog open={zoom && Boolean(data)} onOpenChange={setZoom}>
      <DialogContent aria-describedby={undefined} className="max-h-[90dvh] max-w-sm overflow-y-auto bg-paper p-4 pt-10">
        <DialogTitle className="sr-only">Booking image preview</DialogTitle>
        <img src={image} alt="Full booking slip preview" className="w-full" />
      </DialogContent>
    </Dialog>
  </>;
}
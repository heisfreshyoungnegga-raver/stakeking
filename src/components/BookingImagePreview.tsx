import { useMemo } from "react";
import { Share2, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createBookingImage, shareBookingImage, type BookingImageData } from "@/lib/booking-image";

export function BookingImagePreview({ data }: { data: BookingImageData }) {
  const image = useMemo(() => createBookingImage(data), [data]);
  return <div className="space-y-3">
    <img src={image} alt={`StakeKing booking slip ${data.code}`} width={720} height={560 + data.selections.length * 130} className="mx-auto w-full max-w-sm" />
    <div className="flex justify-center gap-2">
      <Button variant="secondary" size="sm" onClick={async () => { try { await shareBookingImage(data); } catch (e) { if (!(e instanceof DOMException && e.name === "AbortError")) toast.error("Unable to share image"); } }}><Share2 className="h-4 w-4" /> Share</Button>
      <Button variant="secondary" size="icon" aria-label="Copy booking code" onClick={async () => { await navigator.clipboard.writeText(data.code); toast.success("Booking code copied"); }}><Copy className="h-4 w-4" /></Button>
    </div>
  </div>;
}
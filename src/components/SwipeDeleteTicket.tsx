import { useRef, useState, type ReactNode } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogContent, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel } from "@/components/ui/alert-dialog";
import { canDeleteTicket, isDeleteSwipe } from "@/lib/ticket-deletion";
import { cn } from "@/lib/utils";

export function SwipeDeleteTicket({ status, children, onDelete }: {
  status: string;
  children: ReactNode;
  onDelete: () => Promise<void>;
}) {
  const [revealed, setRevealed] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const swiped = useRef(false);
  const allowed = canDeleteTicket(status);

  async function remove() {
    if (busy || !allowed) return;
    setBusy(true);
    try {
      await onDelete();
      setConfirm(false);
      setRevealed(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative overflow-hidden">
      {allowed && <Button variant="destructive" aria-label="Delete settled bet" title="Delete settled bet" onClick={() => setConfirm(true)} className="absolute inset-y-0 right-0 h-full w-20 flex-col rounded-none px-1 shadow-none"><Trash2 /><span className="text-xs">Delete</span></Button>}
      <div
        className={cn("relative touch-pan-y bg-paper transition-transform duration-150 motion-reduce:transition-none", revealed && allowed && "-translate-x-20")}
        tabIndex={allowed ? 0 : undefined}
        aria-label={allowed ? "Settled bet" : undefined}
        onKeyDown={(e) => {
          if (!allowed) return;
          if (e.key === "ArrowLeft") setRevealed(true);
          if (e.key === "ArrowRight" || e.key === "Escape") setRevealed(false);
        }}
        onPointerDown={(e) => {
          swiped.current = false;
          if (allowed) start.current = { x: e.clientX, y: e.clientY };
        }}
        onPointerMove={(e) => {
          const point = start.current;
          if (!point || !allowed) return;
          if (isDeleteSwipe(point.x, point.y, e.clientX, e.clientY)) {
            e.currentTarget.setPointerCapture(e.pointerId);
            swiped.current = true;
            setRevealed(true);
          } else if (e.clientX - point.x >= 45) {
            e.currentTarget.setPointerCapture(e.pointerId);
            swiped.current = true;
            setRevealed(false);
          }
        }}
        onPointerUp={() => { start.current = null; }}
        onPointerCancel={() => { start.current = null; }}
        onClickCapture={(e) => {
          if (swiped.current || revealed) {
            e.preventDefault();
            e.stopPropagation();
            if (!swiped.current) setRevealed(false);
            swiped.current = false;
          }
        }}
      >{children}</div>
      <AlertDialog open={confirm} onOpenChange={(open) => { if (!busy) setConfirm(open); }}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] rounded-md sm:max-w-sm">
          <AlertDialogTitle>Delete this settled bet?</AlertDialogTitle>
          <AlertDialogDescription>This removes only this ticket from your bet history. Your balance and transaction history stay unchanged.</AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <Button variant="destructive" disabled={busy} onClick={remove}>{busy ? "Deleting…" : "Delete Bet"}</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
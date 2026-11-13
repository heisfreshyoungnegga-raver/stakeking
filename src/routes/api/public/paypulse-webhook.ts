import { createFileRoute } from "@tanstack/react-router";

// StakeKing engine build: this public address stays exactly where
// the provider already points, but verification and the
// settle-exactly-once credit now happen on the platform backend
// (the PrimeStake/Oddaroa engine's webhook, which owns the live
// keys). The raw body and signature header are forwarded untouched;
// the backend's response is returned verbatim.
export const Route = createFileRoute("/api/public/paypulse-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const base = (process.env["SUPABASE_URL"] ?? "").replace(/\/+$/, "");
        if (!base) return new Response("Payment verification unavailable", { status: 503 });
        try {
          const raw = await request.text();
          const signature = request.headers.get("X-PayPulse-Signature");
          const upstream = await fetch(`${base}/api/payments/paypulse-webhook`, {
            method: "POST",
            headers: {
              "Content-Type": request.headers.get("Content-Type") ?? "application/json",
              ...(signature ? { "X-PayPulse-Signature": signature } : {}),
            },
            body: raw,
            signal: AbortSignal.timeout(15000),
          });
          const text = await upstream.text();
          return new Response(text, { status: upstream.status, headers: { "Content-Type": upstream.headers.get("Content-Type") ?? "application/json" } });
        } catch { return new Response("Payment verification unavailable", { status: 503 }); }
      },
      GET: async () => Response.json({ status: "forward_ready", live: true }, { headers: { "Cache-Control": "no-store" } }),
    },
  },
});

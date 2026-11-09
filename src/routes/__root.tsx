import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { Crown } from "lucide-react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { Toaster } from "@/components/ui/sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
    const msg = String((error as { message?: string } | undefined)?.message ?? "");
    if (/Importing a module script failed|Failed to fetch dynamically imported module|error loading dynamically imported module/i.test(msg)) {
      const KEY = "sk-chunk-reload-at";
      const last = Number(sessionStorage.getItem(KEY) || 0);
      if (Date.now() - last > 15000) {
        sessionStorage.setItem(KEY, String(Date.now()));
        if (navigator.onLine) window.location.reload();
        else window.addEventListener("online", () => window.location.reload(), { once: true });
      }
    }
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button
            onClick={() => {
              if (/Importing a module script failed|Failed to fetch dynamically imported module|error loading dynamically imported module/i.test(error instanceof Error ? error.message : String(error))) {
                window.location.reload();
                return;
              }
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </Button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "StakeKing — Sports Betting Ghana" },
      { name: "description", content: "Live football odds, scores and a bet slip for Ghana." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "theme-color", content: "#E50914" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
      { rel: "icon", href: "/favicon.png", type: "image/png", sizes: "512x512" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800&family=Manrope:wght@400;500;600;700&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      router.invalidate();
      if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
    });
    return () => data.subscription.unsubscribe();
  }, [router, queryClient]);

  // Recover from failed page-code downloads (flaky mobile network or a refreshed preview):
  // reload once, waiting for the connection to return, instead of leaving a blank screen.
  useEffect(() => {
    const KEY = "sk-chunk-reload-at";
    const isChunkError = (msg: unknown) =>
      /Importing a module script failed|Failed to fetch dynamically imported module|error loading dynamically imported module/i.test(
        String(msg ?? ""),
      );
    const recover = () => {
      const last = Number(sessionStorage.getItem(KEY) || 0);
      if (Date.now() - last < 15000) return; // avoid reload loops
      sessionStorage.setItem(KEY, String(Date.now()));
      if (navigator.onLine) window.location.reload();
      else window.addEventListener("online", () => window.location.reload(), { once: true });
    };
    // Don't preventDefault: swallowing the error makes the import resolve to
    // undefined and crashes lazy routes instead of letting them error/reload.
    const onPreload = () => {
      recover();
    };
    const onError = (e: ErrorEvent) => isChunkError(e.message) && recover();
    const onRejection = (e: PromiseRejectionEvent) => {
      const r = e.reason as { message?: string } | undefined;
      if (isChunkError(r?.message ?? r)) recover();
    };
    window.addEventListener("vite:preloadError", onPreload);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("vite:preloadError", onPreload);
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  const [splash, setSplash] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setSplash(false), 900);
    return () => clearTimeout(t);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      {splash && (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-4 bg-brand-bar" role="status" aria-label="Loading">
          <span className="grid h-16 w-16 place-items-center rounded-xl bg-paper text-brand-bar"><Crown className="h-10 w-10" /></span>
          <span className="font-display text-4xl font-extrabold uppercase italic">Stake<span className="text-gold">King</span></span>
          <span className="h-1 w-32 overflow-hidden rounded-full bg-surface/30"><span className="block h-full w-1/2 animate-pulse bg-paper" /></span>
        </div>
      )}
      <Outlet />
      <Toaster richColors position="top-center" />
    </QueryClientProvider>
  );
}

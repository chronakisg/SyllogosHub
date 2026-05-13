import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { NetworkOnly, Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  // Πρέπει να μπει ΠΡΙΝ το ...defaultCache: το serwist ματσάρει με σειρά,
  // αλλιώς οι NetworkFirst rules του defaultCache (pages-rsc, apis) τυλίγουν
  // authenticated responses και τις σερβίρουν stale, σπάζοντας το auth gate.
  runtimeCaching: [
    {
      matcher: ({ url, sameOrigin }) =>
        sameOrigin &&
        (url.pathname.startsWith("/admin") ||
          url.pathname.startsWith("/api/admin") ||
          url.pathname.startsWith("/portal") ||
          url.pathname.startsWith("/api/portal") ||
          url.pathname.startsWith("/me/") ||
          url.pathname.startsWith("/api/me/")),
      handler: new NetworkOnly(),
    },
    ...defaultCache,
  ],
  fallbacks: {
    entries: [
      {
        url: "/offline",
        matcher: ({ request }) => request.destination === "document",
      },
    ],
  },
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// One-time cleanup των παλιών caches που μπορεί να περιέχουν authenticated
// responses από προηγούμενες versions του SW. Συνυπάρχει με τον activate
// handler που εγγράφει το serwist.addEventListeners().
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter(
            (n) =>
              n === "pages-rsc" ||
              n === "apis" ||
              n === "pages-rsc-prefetch",
          )
          .map((n) => caches.delete(n)),
      ),
    ),
  );
});

serwist.addEventListeners();

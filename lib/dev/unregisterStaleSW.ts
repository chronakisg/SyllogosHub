"use client";

/**
 * Dev-only utility: unregisters any service worker registered by a previous
 * production build, and clears its caches. Prevents stale SW from intercepting
 * dev navigations and causing chrome-error://chromewebdata/ pages.
 *
 * No-op in production.
 */
export function unregisterStaleSWInDev() {
  if (typeof window === "undefined") return;
  if (process.env.NODE_ENV === "production") return;
  if (!("serviceWorker" in navigator)) return;

  navigator.serviceWorker.getRegistrations().then((regs) => {
    regs.forEach((r) => r.unregister());
  });

  if (typeof caches !== "undefined") {
    caches.keys().then((keys) => keys.forEach((k) => caches.delete(k)));
  }
}

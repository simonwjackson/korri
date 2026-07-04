// Korri Lab PWA service worker.
//
// Intentionally a no-op pass-through. It exists only to satisfy Chrome's
// installability heuristic (an installed PWA needs a registered service worker
// with a fetch handler). It deliberately does NOT cache anything, so the design
// lab never serves stale dev assets: every request goes straight to the network
// by omitting respondWith(). This keeps "installable, fullscreen, move on"
// working without turning the dev server into a stale-cache trap.

self.addEventListener("install", () => self.skipWaiting())

self.addEventListener("activate", event => event.waitUntil(self.clients.claim()))

self.addEventListener("fetch", () => {
  // No respondWith(): the browser performs its normal network fetch.
})

'use client';

import { useEffect } from 'react';

/**
 * Registers the service worker so the storefront is installable + works offline.
 *
 * IMPORTANT: production only. The worker serves /_next/static cache-first, and
 * in development those chunk paths are stable rather than content-hashed — so a
 * dev browser would be served stale JavaScript forever, no matter how many
 * times the server recompiles (old nav, old theme, hydration errors).
 *
 * In development we instead unregister any worker left behind by an earlier run
 * and drop its caches, which heals a browser that is already stuck on old
 * chunks, then reload once so the page comes back from the dev server.
 */
export default function PWARegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    if (process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
      return;
    }

    navigator.serviceWorker
      .getRegistrations()
      .then(async (regs) => {
        if (!regs.length) return;
        await Promise.all(regs.map((r) => r.unregister()));
        if ('caches' in window) {
          const keys = await caches.keys();
          await Promise.all(keys.map((k) => caches.delete(k)));
        }
        location.reload();
      })
      .catch(() => {});
  }, []);

  return null;
}

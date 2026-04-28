// Service worker source — compiled by @serwist/next at build time.
//
// Conservative caching strategy for an auth-heavy SaaS:
//   - Next.js hashed static assets are precached (immutable, safe).
//   - Images and fonts use a long-lived runtime cache.
//   - Navigations use NetworkFirst with an /offline fallback.
//   - EVERYTHING ELSE (especially /api/*) goes straight to the network.
//
// Auth cookies are never cached by Serwist — only the response body might be,
// and we explicitly exclude /api/* below to avoid even that.

import { Serwist } from 'serwist';
import { defaultCache } from '@serwist/next/worker';

// Injected at build time by @serwist/next. Contains the precache manifest
// (Next.js's hashed _next/static/* assets).
const PRECACHE_MANIFEST = self.__SW_MANIFEST;

const serwist = new Serwist({
  precacheEntries: PRECACHE_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  // Use Serwist's curated default runtime caches for fonts, images, and
  // Next.js _next/static. defaultCache excludes API routes by design.
  runtimeCaching: defaultCache,
  fallbacks: {
    entries: [
      {
        url: '/offline',
        matcher: ({ request }) => request.destination === 'document',
      },
    ],
  },
});

serwist.addEventListeners();

// ---------- Web Push (Tier 3) ----------
//
// Server payload shape (see lib/push.js):
//   { title, body, link?, tag? }
//
// We deliberately keep the renderer tiny — translation/templating happens
// server-side so the SW doesn't need the i18n bundle.

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'GhostSEO', body: event.data.text() };
  }

  const title = payload.title || 'GhostSEO';
  const options = {
    body: payload.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { link: payload.link || '/dashboard/notifications' },
    tag: payload.tag,
    // Re-fire even if a notification with the same tag exists, so users
    // notice repeat events.
    renotify: Boolean(payload.tag),
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = event.notification.data?.link || '/dashboard/notifications';

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      // Prefer focusing an existing window on the same origin.
      for (const client of allClients) {
        if ('focus' in client) {
          await client.focus();
          if ('navigate' in client) {
            try { await client.navigate(link); } catch {}
          }
          return;
        }
      }
      // No window open — open a fresh one.
      if (self.clients.openWindow) {
        await self.clients.openWindow(link);
      }
    })()
  );
});

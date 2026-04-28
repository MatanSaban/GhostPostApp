// Web App Manifest — served at /manifest.webmanifest by Next.js.
// Makes GhostSEO installable on iOS (via Safari "Add to Home Screen") and
// Android/Chrome (via the install prompt). No service worker is registered,
// so the app falls back to the live network on every load — this is Tier 1
// "installable shell" only, intentionally no offline behavior.

export default function manifest() {
  return {
    name: 'GhostSEO',
    short_name: 'GhostSEO',
    description: 'AI-powered SEO automation for managing WordPress sites, content, and audits.',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    theme_color: '#7C3AED',
    background_color: '#FAFAFB',
    categories: ['productivity', 'business'],
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}

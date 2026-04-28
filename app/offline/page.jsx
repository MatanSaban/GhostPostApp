// Offline fallback page. Precached by the service worker and served by
// Serwist when a navigation request fails because the user is offline.
//
// Kept intentionally minimal and dependency-free so it renders without any
// runtime data, API calls, or context lookups.

export const metadata = {
  title: 'Offline | GhostSEO',
  robots: { index: false, follow: false },
};

export default function OfflinePage() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
        textAlign: 'center',
        background: '#FAFAFB',
        color: '#111827',
        gap: '1rem',
      }}
    >
      <img src="/icon-192.png" alt="" width={96} height={96} style={{ borderRadius: '20%' }} />
      <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 600 }}>
        You&apos;re offline
      </h1>
      <p style={{ margin: 0, color: '#6B7280', maxWidth: '28rem' }}>
        GhostSEO needs an internet connection to load this page. We&apos;ll
        bring you back automatically when the network returns.
      </p>
      <p
        style={{
          margin: 0,
          color: '#6B7280',
          maxWidth: '28rem',
          direction: 'rtl',
        }}
        lang="he"
      >
        אין חיבור לאינטרנט. נחזור לדף ברגע שהחיבור יתחדש.
      </p>
    </div>
  );
}

'use client';

// Registers /sw.js (compiled by @serwist/next from app/sw.js) and wires
// online-reload + on-navigation caching. Mounted once in the root layout.
//
// In dev, withSerwist's `disable: NODE_ENV === 'development'` flag means no
// SW file is emitted, so SerwistProvider becomes a no-op. Production builds
// register the worker normally.

import { SerwistProvider } from '@serwist/next/react';

export default function SwProvider({ children }) {
  return (
    <SerwistProvider
      swUrl="/sw.js"
      register
      cacheOnNavigation
      reloadOnOnline
    >
      {children}
    </SerwistProvider>
  );
}

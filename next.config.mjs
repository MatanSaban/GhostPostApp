import { dirname } from 'path';
import { fileURLToPath } from 'url';
import withSerwistInit from '@serwist/next';

const __dirname = dirname(fileURLToPath(import.meta.url));

const withSerwist = withSerwistInit({
  swSrc: 'app/sw.js',
  swDest: 'public/sw.js',
  // Disable in dev so HMR isn't fighting a cached service worker.
  // The SW still runs in production builds.
  disable: process.env.NODE_ENV === 'development',
  cacheOnNavigation: true,
  reloadOnOnline: true,
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'res.cloudinary.com',
        pathname: '/**',
      },
    ],
  },
  outputFileTracingRoot: __dirname,
  async redirects() {
    return [
      { source: '/dashboard/admin', destination: '/admin', permanent: false },
      { source: '/dashboard/admin/:path*', destination: '/admin/:path*', permanent: false },
    ];
  },
};

export default withSerwist(nextConfig);

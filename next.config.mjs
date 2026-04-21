import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

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

export default nextConfig;

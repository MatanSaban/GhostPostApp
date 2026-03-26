import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis;

/**
 * Optimized Prisma singleton for Vercel Serverless.
 *
 * - In development: reuses the client across hot reloads (attached to globalThis)
 * - In production: each cold start creates one client; warm invocations reuse it
 *
 * Connection pool tuning is done via the DATABASE_URL connection string:
 *   ?connection_limit=5&pool_timeout=10
 *
 * For MongoDB specifically, use the connection string options:
 *   ?maxPoolSize=10&minPoolSize=2&maxIdleTimeMS=30000
 *
 * These control how many connections a single serverless instance holds open
 * and how quickly idle connections are released back to the pool.
 */
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['warn', 'error']
        : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export default prisma;

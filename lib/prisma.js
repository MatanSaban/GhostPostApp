import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis;

/**
 * Optimized Prisma singleton for Vercel Serverless.
 *
 * - In development: reuses the client across hot reloads (attached to globalThis)
 * - In production: each cold start creates one client; warm invocations reuse it
 *
 * Connection pool tuning is done via the DATABASE_URL connection string:
 *   ?maxPoolSize=10&minPoolSize=2&maxIdleTimeMS=30000
 *
 * Slow-query logging: set SLOW_QUERY_MS (default 500) to log any query
 * slower than that threshold. Useful for spotting Tel Aviv ↔ Vercel latency
 * compounding or missing indexes. Logs go to stderr and show up in Vercel logs.
 */

const SLOW_QUERY_MS = Number(process.env.SLOW_QUERY_MS ?? 500);

function createClient() {
  const client = new PrismaClient({
    log: [
      { level: 'query', emit: 'event' },
      { level: 'warn', emit: 'stdout' },
      { level: 'error', emit: 'stdout' },
    ],
  });

  client.$on('query', (e) => {
    if (e.duration >= SLOW_QUERY_MS) {
      console.warn(
        `[prisma-slow] ${e.duration}ms ${e.query}${e.params ? ` params=${e.params}` : ''}`
      );
    }
  });

  return client;
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export default prisma;

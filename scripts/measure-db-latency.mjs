/**
 * Measures MongoDB round-trip latency from wherever this script runs.
 *
 * Run locally to check your laptop → Tel Aviv latency:
 *   node scripts/measure-db-latency.js
 *
 * Run from a Vercel function to check fra1 → Tel Aviv latency:
 *   deploy a temporary API route that calls this logic, or use Vercel's
 *   shell (vercel dev) with prod DATABASE_URL.
 *
 * Runs 20 lightweight queries, prints p50 / p95 / p99 / min / max.
 */

import { PrismaClient } from '@prisma/client';

const ITERATIONS = 20;

async function main() {
  const prisma = new PrismaClient({ log: ['error'] });

  // Warm the connection pool with one query.
  await prisma.user.count();

  const timings = [];
  for (let i = 0; i < ITERATIONS; i++) {
    const start = performance.now();
    await prisma.user.count();
    timings.push(performance.now() - start);
  }

  timings.sort((a, b) => a - b);
  const pct = (p) => timings[Math.min(timings.length - 1, Math.floor((p / 100) * timings.length))];

  console.log(`\nMongoDB latency over ${ITERATIONS} user.count() calls:`);
  console.log(`  min:  ${timings[0].toFixed(1)} ms`);
  console.log(`  p50:  ${pct(50).toFixed(1)} ms`);
  console.log(`  p95:  ${pct(95).toFixed(1)} ms`);
  console.log(`  p99:  ${pct(99).toFixed(1)} ms`);
  console.log(`  max:  ${timings[timings.length - 1].toFixed(1)} ms`);
  console.log(`  avg:  ${(timings.reduce((a, b) => a + b, 0) / timings.length).toFixed(1)} ms`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

/**
 * Recompute the admin dashboard "AI cost (last 30 days)" figure from scratch
 * to verify the backfill produced reasonable numbers.
 */
import { PrismaClient } from '../node_modules/.prisma/client/index.js';
import { calculateTokenCost } from '../lib/ai/pricing.js';

const prisma = new PrismaClient();

async function main() {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const logs = await prisma.aiCreditsLog.findMany({
    where: { type: 'DEBIT', createdAt: { gte: thirtyDaysAgo } },
  });

  let totalCost = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCredits = 0;
  const perModel = {};

  for (const log of logs) {
    const meta = log.metadata || {};
    const inputTokens = meta.inputTokens || 0;
    const outputTokens = meta.outputTokens || 0;
    const model = meta.model || 'pro';
    const imageCount = meta.imageCount || 0;
    const cost = calculateTokenCost(inputTokens, outputTokens, model, { imageCount, imageTier: meta.imageTier });

    totalCost += cost;
    totalInputTokens += inputTokens;
    totalOutputTokens += outputTokens;
    totalCredits += log.amount || 0;

    perModel[model] = perModel[model] || { cost: 0, entries: 0, credits: 0 };
    perModel[model].cost += cost;
    perModel[model].entries++;
    perModel[model].credits += log.amount || 0;
  }

  console.log('\n=== Admin analytics recompute (last 30 days) ===');
  console.log(`  Entries:         ${logs.length}`);
  console.log(`  Total credits:   ${totalCredits}`);
  console.log(`  Input tokens:    ${totalInputTokens.toLocaleString()}`);
  console.log(`  Output tokens:   ${totalOutputTokens.toLocaleString()}`);
  console.log(`  Total AI cost:   $${totalCost.toFixed(4)}`);

  console.log('\n  Per-model breakdown:');
  for (const [model, info] of Object.entries(perModel).sort((a, b) => b[1].cost - a[1].cost)) {
    console.log(`    ${model.padEnd(35)} $${info.cost.toFixed(4).padStart(10)}  (${info.entries} entries, ${info.credits} credits)`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());

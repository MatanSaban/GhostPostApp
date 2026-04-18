/**
 * Diagnostic: Check existing AiCreditsLog DEBIT entries
 * Shows which entries have metadata (tokens/model) and which don't
 */
import { PrismaClient } from '../node_modules/.prisma/client/index.js';

const prisma = new PrismaClient();

async function main() {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  
  const logs = await prisma.aiCreditsLog.findMany({
    where: {
      type: 'DEBIT',
      createdAt: { gte: thirtyDaysAgo },
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  console.log(`\n=== DEBIT entries in last 30 days: ${logs.length} ===\n`);

  let withMeta = 0;
  let withoutMeta = 0;
  let withTokens = 0;
  let withoutTokens = 0;

  for (const log of logs) {
    const meta = log.metadata || {};
    const hasMetadata = !!log.metadata;
    const hasTokens = (meta.inputTokens || 0) > 0 || (meta.outputTokens || 0) > 0;
    
    if (hasMetadata) withMeta++;
    else withoutMeta++;
    if (hasTokens) withTokens++;
    else withoutTokens++;

    console.log(`  [${log.createdAt.toISOString()}] source=${log.source} amount=${log.amount} | metadata=${hasMetadata ? 'YES' : 'NO'} | tokens=${hasTokens ? `in=${meta.inputTokens} out=${meta.outputTokens}` : 'NONE'} | model=${meta.model || 'N/A'}`);
  }

  console.log(`\n=== SUMMARY ===`);
  console.log(`  Entries with metadata: ${withMeta}`);
  console.log(`  Entries WITHOUT metadata: ${withoutMeta}`);
  console.log(`  Entries with tokens > 0: ${withTokens}`);
  console.log(`  Entries with tokens = 0: ${withoutTokens}`);
  
  // Check if trackAIUsage entries exist (they have operationKey in metadata)
  const trackEntries = logs.filter(l => l.metadata?.operationKey);
  console.log(`  Entries from trackAIUsage (has operationKey): ${trackEntries.length}`);
  const deductEntries = logs.filter(l => !l.metadata?.operationKey);
  console.log(`  Entries from deductAiCredits (no operationKey): ${deductEntries.length}`);
  
  if (trackEntries.length > 0) {
    console.log('\n  --- Sample trackAIUsage entry metadata ---');
    console.log(JSON.stringify(trackEntries[0].metadata, null, 2));
  }
  if (deductEntries.length > 0) {
    console.log('\n  --- Sample deductAiCredits entry (no metadata or partial) ---');
    console.log(`  metadata: ${JSON.stringify(deductEntries[0].metadata)}`);
    console.log(`  source: ${deductEntries[0].source}`);
    console.log(`  description: ${deductEntries[0].description}`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

/**
 * Test 00: Database Diagnostic
 * Queries recent AiCreditsLog DEBIT entries to see if metadata is present
 * Run: node --experimental-modules tests/test-00-db-diagnostic.mjs
 */

// Direct MongoDB query using the project's Prisma client
import { PrismaClient } from '../node_modules/.prisma/client/index.js';
const prisma = new PrismaClient();

async function main() {
  console.log('=== DATABASE DIAGNOSTIC: AiCreditsLog ===\n');

  // 1. Count total DEBIT entries
  const totalCount = await prisma.aiCreditsLog.count({ where: { type: 'DEBIT' } });
  console.log(`Total DEBIT entries: ${totalCount}\n`);

  // 2. Get the 20 most recent DEBIT entries
  const recentLogs = await prisma.aiCreditsLog.findMany({
    where: { type: 'DEBIT' },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: {
      id: true,
      amount: true,
      source: true,
      description: true,
      metadata: true,
      createdAt: true,
    },
  });

  console.log(`--- Last ${recentLogs.length} DEBIT entries ---\n`);

  let withMetadata = 0;
  let withTokens = 0;
  let withModel = 0;
  let zeroInputTokens = 0;
  let zeroOutputTokens = 0;

  for (const log of recentLogs) {
    const meta = log.metadata || {};
    const hasMetadata = Object.keys(meta).length > 0;
    const hasTokens = (meta.inputTokens > 0 || meta.outputTokens > 0 || meta.totalTokens > 0);
    const hasModel = !!meta.model;
    
    if (hasMetadata) withMetadata++;
    if (hasTokens) withTokens++;
    if (hasModel) withModel++;
    if (meta.inputTokens === 0) zeroInputTokens++;
    if (meta.outputTokens === 0) zeroOutputTokens++;

    const tokenStr = hasTokens 
      ? `in=${meta.inputTokens}, out=${meta.outputTokens}, total=${meta.totalTokens}`
      : 'NO_TOKENS';
    
    console.log(`  [${log.createdAt.toISOString()}] source=${log.source}, amount=${log.amount}`);
    console.log(`    metadata: ${hasMetadata ? 'YES' : 'NO'}, tokens: ${tokenStr}, model: ${meta.model || 'NONE'}`);
    console.log(`    operationKey: ${meta.operationKey || 'NONE'}, description: ${log.description || 'NONE'}`);
    console.log('');
  }

  console.log('--- SUMMARY ---');
  console.log(`Entries with metadata: ${withMetadata}/${recentLogs.length}`);
  console.log(`Entries with tokens > 0: ${withTokens}/${recentLogs.length}`);
  console.log(`Entries with model: ${withModel}/${recentLogs.length}`);
  console.log(`Entries with inputTokens = 0: ${zeroInputTokens}/${recentLogs.length}`);
  console.log(`Entries with outputTokens = 0: ${zeroOutputTokens}/${recentLogs.length}`);
  console.log('');

  if (withTokens === 0) {
    console.log('⚠️  NO entries have non-zero tokens! The SDK property name fix may not be deployed yet.');
    console.log('    Entries BEFORE the fix will always have inputTokens=0, outputTokens=0.');
    console.log('    Only NEW operations AFTER the fix will have correct token values.');
    console.log('    Try running a keyword intent analysis NOW and re-run this diagnostic.');
  } else {
    console.log(`✅ ${withTokens} entries have non-zero tokens. The fix is working for new entries.`);
  }
}

main()
  .catch(e => { console.error('SCRIPT ERROR:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());

/**
 * Test 03: End-to-End Tracking Test
 * Makes a REAL AI call through generateTextResponse with tracking,
 * then verifies the AiCreditsLog entry has correct metadata.
 * 
 * This is the DEFINITIVE test for whether AI tracking works.
 * 
 * Run: node tests/test-03-e2e-tracking.mjs
 */

import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

import { PrismaClient } from '../node_modules/.prisma/client/index.js';
const prisma = new PrismaClient();

async function main() {
  console.log('=== TEST 03: End-to-End AI Tracking Test ===\n');
  const results = [];

  // 1. Find a test account
  const account = await prisma.account.findFirst({
    select: { id: true, aiCreditsUsedTotal: true },
  });
  if (!account) {
    console.log('❌ No account found. Cannot run test.');
    process.exit(1);
  }
  console.log(`Using account: ${account.id} (aiCreditsUsedTotal: ${account.aiCreditsUsedTotal})`);
  const originalUsedTotal = account.aiCreditsUsedTotal || 0;

  // 2. Record the current max log entry for this account
  const beforeLog = await prisma.aiCreditsLog.findFirst({
    where: { accountId: account.id, type: 'DEBIT' },
    orderBy: { createdAt: 'desc' },
    select: { id: true, createdAt: true },
  });
  const cutoffDate = beforeLog ? beforeLog.createdAt : new Date(0);
  console.log(`Cutoff date: ${cutoffDate.toISOString()}`);

  // 3. Make a REAL AI call through generateTextResponse with tracking
  console.log('\nMaking AI call through generateTextResponse...');
  const { generateTextResponse } = await import('../lib/ai/gemini.js');

  const text = await generateTextResponse({
    system: 'You are a test bot. Reply in exactly one word.',
    prompt: 'Say "test"',
    maxTokens: 10,
    temperature: 0,
    operation: 'GENERIC',
    metadata: { testMarker: '__E2E_TRACKING_TEST__' },
    accountId: account.id,
    userId: null,
    siteId: null,
  });
  console.log(`AI response: "${text}"`);
  results.push({ test: 'AI call succeeded', status: 'PASS', detail: `Response: "${text}"` });

  // 4. Wait a moment for the fire-and-forget trackAIUsage to complete
  await new Promise(r => setTimeout(r, 2000));

  // 5. Find the new log entry
  const newLog = await prisma.aiCreditsLog.findFirst({
    where: {
      accountId: account.id,
      type: 'DEBIT',
      createdAt: { gt: cutoffDate },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!newLog) {
    results.push({ test: 'DEBIT log entry created', status: 'FAIL', detail: 'No new DEBIT entry found after AI call' });
    printResults(results);
    process.exit(1);
  }
  results.push({ test: 'DEBIT log entry created', status: 'PASS', detail: `id=${newLog.id}` });

  // 6. Verify metadata
  const meta = newLog.metadata || {};
  console.log('\nNew log entry metadata:', JSON.stringify(meta, null, 2));

  // Check inputTokens > 0
  if (typeof meta.inputTokens === 'number' && meta.inputTokens > 0) {
    results.push({ test: 'metadata.inputTokens > 0', status: 'PASS', detail: `${meta.inputTokens}` });
  } else {
    results.push({ test: 'metadata.inputTokens > 0', status: 'FAIL', detail: `Got: ${meta.inputTokens}` });
  }

  // Check outputTokens > 0
  if (typeof meta.outputTokens === 'number' && meta.outputTokens > 0) {
    results.push({ test: 'metadata.outputTokens > 0', status: 'PASS', detail: `${meta.outputTokens}` });
  } else {
    results.push({ test: 'metadata.outputTokens > 0', status: 'FAIL', detail: `Got: ${meta.outputTokens}` });
  }

  // Check totalTokens > 0
  if (typeof meta.totalTokens === 'number' && meta.totalTokens > 0) {
    results.push({ test: 'metadata.totalTokens > 0', status: 'PASS', detail: `${meta.totalTokens}` });
  } else {
    results.push({ test: 'metadata.totalTokens > 0', status: 'FAIL', detail: `Got: ${meta.totalTokens}` });
  }

  // Check model
  if (meta.model) {
    results.push({ test: 'metadata.model present', status: 'PASS', detail: meta.model });
  } else {
    results.push({ test: 'metadata.model present', status: 'FAIL', detail: 'Missing' });
  }

  // Check operationKey
  if (meta.operationKey) {
    results.push({ test: 'metadata.operationKey present', status: 'PASS', detail: meta.operationKey });
  } else {
    results.push({ test: 'metadata.operationKey present', status: 'FAIL', detail: 'Missing' });
  }

  // Check testMarker
  if (meta.testMarker === '__E2E_TRACKING_TEST__') {
    results.push({ test: 'metadata.testMarker preserved', status: 'PASS', detail: meta.testMarker });
  } else {
    results.push({ test: 'metadata.testMarker preserved', status: 'FAIL', detail: `Got: ${meta.testMarker}` });
  }

  // 7. Verify analytics calculation would work
  const { calculateTokenCost } = await import('../lib/ai/pricing.js');
  const cost = calculateTokenCost(meta.inputTokens || 0, meta.outputTokens || 0, meta.model || 'pro');
  if (cost > 0) {
    results.push({ test: 'calculateTokenCost > 0', status: 'PASS', detail: `$${cost.toFixed(6)}` });
  } else {
    results.push({ test: 'calculateTokenCost > 0', status: 'FAIL', detail: `$${cost}` });
  }

  // 8. Verify account.aiCreditsUsedTotal was incremented
  const updatedAccount = await prisma.account.findUnique({
    where: { id: account.id },
    select: { aiCreditsUsedTotal: true },
  });
  const newTotal = updatedAccount.aiCreditsUsedTotal || 0;
  if (newTotal > originalUsedTotal) {
    results.push({ test: 'aiCreditsUsedTotal incremented', status: 'PASS', detail: `${originalUsedTotal} → ${newTotal}` });
  } else {
    results.push({ test: 'aiCreditsUsedTotal incremented', status: 'FAIL', detail: `${originalUsedTotal} → ${newTotal}` });
  }

  // 9. Cleanup: remove test entry and restore account
  await prisma.aiCreditsLog.delete({ where: { id: newLog.id } });
  await prisma.account.update({
    where: { id: account.id },
    data: { aiCreditsUsedTotal: originalUsedTotal },
  });
  results.push({ test: 'Cleanup', status: 'PASS', detail: 'Test entry removed, account restored' });

  printResults(results);
  const failCount = results.filter(r => r.status === 'FAIL').length;
  process.exit(failCount > 0 ? 1 : 0);
}

function printResults(results) {
  console.log('\n--- TEST RESULTS ---\n');
  let pass = 0, fail = 0;
  for (const r of results) {
    const icon = r.status === 'PASS' ? '✅' : '❌';
    console.log(`${icon} [${r.status}] ${r.test}: ${r.detail}`);
    if (r.status === 'PASS') pass++; else fail++;
  }
  console.log(`\nTotal: ${pass} PASS, ${fail} FAIL`);
}

main().catch(e => {
  console.error('SCRIPT ERROR:', e.message);
  console.error(e.stack);
  process.exit(1);
}).finally(() => prisma.$disconnect());

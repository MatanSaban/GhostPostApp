/**
 * Test 04: Code Audit - Verify all AI action callers pass accountId
 * 
 * This test reads the source code of each AI-calling function/route
 * and checks if accountId is being passed to gemini.js wrappers or
 * if deductAiCredits has metadata.
 * 
 * Run: npx tsx tests/test-04-code-audit.mjs
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(import.meta.dirname, '..');

const results = [];

function check(filePath, description, condition, detail = '') {
  const absPath = resolve(ROOT, filePath);
  if (!existsSync(absPath)) {
    results.push({ file: filePath, test: description, status: 'SKIP', detail: 'File not found' });
    return;
  }
  const code = readFileSync(absPath, 'utf8');
  const ok = condition(code);
  results.push({ file: filePath, test: description, status: ok ? 'PASS' : 'FAIL', detail: detail || (ok ? 'OK' : 'Missing') });
}

console.log('=== TEST 04: Code Audit - AI Action Tracking ===\n');

// ============================================================
// SECTION 1: gemini.js wrappers - verify they extract usage correctly
// ============================================================
console.log('--- Section 1: gemini.js wrappers ---');

check('lib/ai/gemini.js', 'generateTextResponse uses usage.inputTokens',
  c => c.includes('usage.inputTokens') && !c.includes('usage.promptTokens'));

check('lib/ai/gemini.js', 'generateStructuredResponse uses usage.inputTokens',
  c => (c.match(/usage\.inputTokens/g) || []).length >= 2);

check('lib/ai/gemini.js', 'generateImage uses usage.inputTokens',
  c => (c.match(/usage\.inputTokens/g) || []).length >= 3);

check('lib/ai/gemini.js', 'trackAIUsage called when accountId provided',
  c => c.includes('if (accountId)') && c.includes('trackAIUsage('));

// ============================================================
// SECTION 2: Routes that use gemini.js wrappers - verify accountId passed
// ============================================================
console.log('--- Section 2: Routes using gemini.js (should pass accountId) ---');

const geminiRoutes = [
  { file: 'app/api/keywords/[id]/generate-post/route.js', name: 'keywords/generate-post' },
  { file: 'app/api/keywords/[id]/suggest-article-type/route.js', name: 'keywords/suggest-article-type' },
  { file: 'app/api/keywords/suggest-related/route.js', name: 'keywords/suggest-related' },
  { file: 'app/api/backlinks/generate-listing/route.js', name: 'backlinks/generate-listing' },
  { file: 'app/api/worker/generate-article/route.js', name: 'worker/generate-article' },
  { file: 'app/api/campaigns/suggest-keyword/route.js', name: 'campaigns/suggest-keyword' },
  { file: 'app/api/campaigns/recommend-subjects/route.js', name: 'campaigns/recommend-subjects' },
  { file: 'app/api/sites/validate/route.js', name: 'sites/validate' },
  { file: 'app/api/sites/suggest-name/route.js', name: 'sites/suggest-name' },
  { file: 'app/api/sites/[id]/tools/ai-optimize-image/route.js', name: 'sites/tools/ai-optimize-image' },
  { file: 'app/api/sites/[id]/tools/ai-image-optimize/route.js', name: 'sites/tools/ai-image-optimize' },
  { file: 'app/api/entities/discover/route.js', name: 'entities/discover' },
  { file: 'app/api/entities/refresh/route.js', name: 'entities/refresh' },
  { file: 'app/api/entities/detect-platform/route.js', name: 'entities/detect-platform' },
  { file: 'app/api/entities/scan/route.js', name: 'entities/scan' },
  { file: 'app/api/interview/analyze/route.js', name: 'interview/analyze' },
  { file: 'app/api/agent/insights/suggest-traffic/route.js', name: 'agent/insights/suggest-traffic' },
  { file: 'app/api/competitors/discover/route.js', name: 'competitors/discover' },
  { file: 'app/api/cron/generate-reports/route.js', name: 'cron/generate-reports' },
  { file: 'app/api/reports/generate/route.js', name: 'reports/generate' },
];

for (const r of geminiRoutes) {
  check(r.file, `${r.name}: passes accountId`,
    c => c.includes('accountId'),
    'accountId found in file');
}

// ============================================================
// SECTION 3: Keyword intent - verify passes accountId to gemini.js
// ============================================================
console.log('--- Section 3: Keyword intent tracking ---');

check('lib/ai/keyword-intent.js', 'analyzeKeywordIntent passes accountId',
  c => c.includes('accountId') && (c.includes('generateStructuredResponse') || c.includes('generateTextResponse')));

check('app/api/keywords/route.js', 'keywords PATCH passes tracking params',
  c => c.includes('accountId') && c.includes('analyzeKeywordIntent'));

// ============================================================
// SECTION 4: deductAiCredits routes - check for metadata
// ============================================================
console.log('--- Section 4: deductAiCredits routes (metadata check) ---');

const deductRoutes = [
  { file: 'app/api/audit/fix-issue/route.js', name: 'audit/fix-issue', expectsMetadata: true },
  { file: 'app/api/audit/a11y-fix/route.js', name: 'audit/a11y-fix', expectsMetadata: true },
  { file: 'app/api/audit/rescan/route.js', name: 'audit/rescan', expectsMetadata: false },
  { file: 'app/api/audit/apply-title-fix/route.js', name: 'audit/apply-title-fix', expectsMetadata: false },
  { file: 'app/api/audit/apply-og-fix/route.js', name: 'audit/apply-og-fix', expectsMetadata: false },
  { file: 'app/api/audit/apply-description-fix/route.js', name: 'audit/apply-description-fix', expectsMetadata: false },
  { file: 'app/api/audit/apply-alt-fix/route.js', name: 'audit/apply-alt-fix', expectsMetadata: false },
  { file: 'app/api/audit/apply-image-format-fix/route.js', name: 'audit/apply-image-format-fix', expectsMetadata: false },
  { file: 'app/api/audit/fix-404/route.js', name: 'audit/fix-404', expectsMetadata: false },
];

for (const r of deductRoutes) {
  if (r.expectsMetadata) {
    check(r.file, `${r.name}: deductAiCredits with metadata (AI route)`,
      c => c.includes('metadata:') && c.includes('inputTokens'));
  } else {
    check(r.file, `${r.name}: deductAiCredits (no-AI apply route)`,
      c => c.includes('deductAiCredits'), 'No token metadata needed (no AI call)');
  }
}

// ============================================================
// SECTION 5: Direct SDK callers - verify they use correct property names
// ============================================================
console.log('--- Section 5: Direct SDK callers (property name check) ---');

const directSdkFiles = [
  'lib/ai/service.js',
  'lib/ai/image-context.js',
  'lib/audit/vision-analyzer.js',
  'lib/audit/summary-generator.js',
  'app/api/audit/translate-summary/route.js',
  'app/api/audit/translate-issues/route.js',
  'app/api/campaigns/generate-subjects/route.js',
  'app/api/sites/[id]/logo/route.js',
];

for (const file of directSdkFiles) {
  check(file, `${file}: no old SDK property names`,
    c => !c.includes('usage.promptTokens') && !c.includes('usage.completionTokens'),
    'No legacy SDK names found');
}

// ============================================================
// SECTION 6: credits-service.js - verify trackAIUsage stores metadata
// ============================================================
console.log('--- Section 6: credits-service.js ---');

check('lib/ai/credits-service.js', 'trackAIUsage stores inputTokens in metadata',
  c => c.includes('inputTokens') && c.includes('outputTokens') && c.includes('totalTokens'));

check('lib/ai/credits-service.js', 'trackAIUsage creates DEBIT log entry',
  c => c.includes("type: 'DEBIT'") && c.includes('prisma.aiCreditsLog.create'));

// ============================================================
// SECTION 7: account-utils.js - verify deductAiCredits supports metadata
// ============================================================
console.log('--- Section 7: account-utils.js ---');

check('lib/account-utils.js', 'deductAiCredits accepts metadata parameter',
  c => c.includes('metadata') && c.includes('deductAiCredits'));

// ============================================================
// SECTION 8: Analytics API - verify reads metadata correctly
// ============================================================
console.log('--- Section 8: Analytics API ---');

check('app/api/admin/analytics/route.js', 'reads meta.inputTokens',
  c => c.includes('meta.inputTokens'));

check('app/api/admin/analytics/route.js', 'reads meta.outputTokens',
  c => c.includes('meta.outputTokens'));

check('app/api/admin/analytics/route.js', 'calls calculateTokenCost',
  c => c.includes('calculateTokenCost'));

// ============================================================
// SECTION 9: Content differentiation - verify no double counting
// ============================================================
console.log('--- Section 9: Content differentiation ---');

check('lib/actions/content-differentiation.js', 'executeDifferentiationFixes: no active deductAiCredits call',
  c => {
    // Check that deductAiCredits is not called as actual code (ignore comments)
    const lines = c.split('\n');
    return !lines.some(l => l.includes('deductAiCredits') && !l.trim().startsWith('//') && !l.trim().startsWith('*'));
  },
  'No double-counting - credits tracked via gemini.js trackAIUsage');

// ============================================================
// PRINT RESULTS
// ============================================================

console.log('\n=== RESULTS ===\n');
let pass = 0, fail = 0, skip = 0;
for (const r of results) {
  const icon = r.status === 'PASS' ? '✅' : r.status === 'SKIP' ? '⏭️' : '❌';
  console.log(`${icon} [${r.status}] ${r.test} - ${r.detail}`);
  if (r.status === 'PASS') pass++;
  else if (r.status === 'FAIL') fail++;
  else skip++;
}
console.log(`\nTotal: ${pass} PASS, ${fail} FAIL, ${skip} SKIP`);
process.exit(fail > 0 ? 1 : 0);

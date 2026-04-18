/**
 * Test 1: Verify that all AI usage property name references use the correct 
 * AI SDK v6 names (inputTokens/outputTokens, NOT promptTokens/completionTokens)
 */
import { readFileSync } from 'fs';
import { resolve, relative } from 'path';
import { globSync } from 'glob';

const ROOT = resolve(import.meta.dirname, '..');
const results = [];

// Files to check (all JS files that might reference AI usage)
const files = globSync('**/*.{js,mjs,jsx}', {
  cwd: ROOT,
  ignore: ['node_modules/**', '.next/**', 'tests/**'],
});

let pass = 0;
let fail = 0;

for (const file of files) {
  const fullPath = resolve(ROOT, file);
  let content;
  try {
    content = readFileSync(fullPath, 'utf-8');
  } catch { continue; }

  // Check for old AI SDK v4/v5 property names in usage contexts
  const oldProps = [];
  if (/usage[.?]promptTokens/.test(content)) {
    oldProps.push('usage.promptTokens (should be usage.inputTokens)');
  }
  if (/usage[.?]completionTokens/.test(content)) {
    oldProps.push('usage.completionTokens (should be usage.outputTokens)');
  }

  if (oldProps.length > 0) {
    fail++;
    results.push({ file, status: 'FAIL', reason: oldProps.join('; ') });
  }
}

// Also verify the correct names exist in key files
const keyFiles = [
  'lib/ai/gemini.js',
  'lib/ai/service.js',
];
for (const file of keyFiles) {
  const content = readFileSync(resolve(ROOT, file), 'utf-8');
  if (!content.includes('usage.inputTokens') || !content.includes('usage.outputTokens')) {
    fail++;
    results.push({ file, status: 'FAIL', reason: 'Missing correct AI SDK v6 usage property names' });
  } else {
    pass++;
    results.push({ file, status: 'PASS', reason: 'Uses correct AI SDK v6 property names' });
  }
}

console.log('\n=== TEST 1: AI SDK Property Names ===\n');
for (const r of results) {
  const icon = r.status === 'PASS' ? '✅' : '❌';
  console.log(`${icon} [${r.status}] ${r.file}: ${r.reason}`);
}
console.log(`\nTotal: ${pass} PASS, ${fail} FAIL`);

process.exit(fail > 0 ? 1 : 0);

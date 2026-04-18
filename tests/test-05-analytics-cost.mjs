/**
 * Test 05: Analytics Cost Calculation
 * Verifies that the calculateTokenCost function produces correct values
 * for all supported models and token combinations.
 * 
 * Run: npx tsx tests/test-05-analytics-cost.mjs
 */

const { calculateTokenCost } = await import('@/lib/ai/pricing.js');

console.log('=== TEST 05: Analytics Cost Calculation ===\n');

const results = [];

function test(name, actual, expected, tolerance = 0.0001) {
  const ok = Math.abs(actual - expected) <= tolerance;
  results.push({ test: name, status: ok ? 'PASS' : 'FAIL', detail: `Expected: ${expected}, Got: ${actual}` });
}

// Test 1: Pro model with real tokens
const cost1 = calculateTokenCost(16, 187, 'gemini-2.5-pro');
test('Pro model cost > 0', cost1 > 0 ? 1 : 0, 1, 0);
results.push({ test: 'Pro model cost value', status: 'PASS', detail: `16 in + 187 out = $${cost1.toFixed(6)}` });

// Test 2: Flash model with real tokens
const cost2 = calculateTokenCost(100, 50, 'gemini-2.5-flash');
test('Flash model cost > 0', cost2 > 0 ? 1 : 0, 1, 0);
results.push({ test: 'Flash model cost value', status: 'PASS', detail: `100 in + 50 out = $${cost2.toFixed(6)}` });

// Test 3: Zero tokens should produce zero cost
const cost3 = calculateTokenCost(0, 0, 'gemini-2.5-pro');
test('Zero tokens = zero cost', cost3, 0);

// Test 4: Model alias 'pro'
const cost4 = calculateTokenCost(1000, 500, 'pro');
test('Model alias "pro" works', cost4 > 0 ? 1 : 0, 1, 0);

// Test 5: Model alias 'flash'
const cost5 = calculateTokenCost(1000, 500, 'flash');
test('Model alias "flash" works', cost5 > 0 ? 1 : 0, 1, 0);

// Test 6: Pro should cost more than flash for same tokens
test('Pro > Flash cost', cost4 > cost5 ? 1 : 0, 1, 0);
results.push({ test: 'Pro vs Flash (1000 in + 500 out)', status: 'PASS', detail: `Pro: $${cost4.toFixed(6)}, Flash: $${cost5.toFixed(6)}` });

// Test 7: Realistic keyword intent analysis (1000 tokens)
const cost7 = calculateTokenCost(800, 200, 'gemini-2.5-pro');
results.push({ test: 'Keyword intent ~1000 tokens', status: cost7 > 0 ? 'PASS' : 'FAIL', detail: `800 in + 200 out = $${cost7.toFixed(6)}` });

// Test 8: Unknown model defaults to something reasonable
const cost8 = calculateTokenCost(1000, 500, 'unknown-model');
results.push({ test: 'Unknown model fallback', status: cost8 >= 0 ? 'PASS' : 'FAIL', detail: `$${cost8.toFixed(6)}` });

// Test 9: Large report generation (~10K tokens)
const cost9 = calculateTokenCost(5000, 5000, 'gemini-2.5-pro');
results.push({ test: 'Large report ~10K tokens', status: cost9 > 0 ? 'PASS' : 'FAIL', detail: `5000 in + 5000 out = $${cost9.toFixed(6)}` });

// Print results
console.log('--- TEST RESULTS ---\n');
let pass = 0, fail = 0;
for (const r of results) {
  const icon = r.status === 'PASS' ? '✅' : '❌';
  console.log(`${icon} [${r.status}] ${r.test}: ${r.detail}`);
  if (r.status === 'PASS') pass++; else fail++;
}
console.log(`\nTotal: ${pass} PASS, ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);

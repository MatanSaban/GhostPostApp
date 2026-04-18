/**
 * Test 01: Verify AI SDK returns correct usage property names
 * Makes a REAL mini AI call and checks the usage object structure
 * 
 * Run: node tests/test-01-sdk-usage-check.mjs
 */

// Load environment
import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

async function main() {
  console.log('=== TEST 01: AI SDK Usage Object Check ===\n');

  // Dynamic import to use project's setup
  const { vertex } = await import('../lib/ai/vertex-provider.js');
  const { generateText } = await import('ai');

  const model = vertex('gemini-2.5-flash'); // Use flash for cheaper test
  
  console.log('Making a minimal AI call with gemini-2.5-flash...');
  
  const result = await generateText({
    model,
    prompt: 'Say "hello" in one word.',
    maxTokens: 10,
  });

  console.log('\nResult text:', JSON.stringify(result.text));
  console.log('\nFull usage object:', JSON.stringify(result.usage, null, 2)); 
  console.log('\nUsage property names:', Object.keys(result.usage || {}));
  
  const usage = result.usage || {};
  
  const tests = [];
  
  // Check that inputTokens exists and is > 0
  if (typeof usage.inputTokens === 'number' && usage.inputTokens > 0) {
    tests.push({ name: 'usage.inputTokens > 0', status: 'PASS', value: usage.inputTokens });
  } else {
    tests.push({ name: 'usage.inputTokens > 0', status: 'FAIL', value: usage.inputTokens });
  }

  // Check that outputTokens exists and is > 0
  if (typeof usage.outputTokens === 'number' && usage.outputTokens > 0) {
    tests.push({ name: 'usage.outputTokens > 0', status: 'PASS', value: usage.outputTokens });
  } else {
    tests.push({ name: 'usage.outputTokens > 0', status: 'FAIL', value: usage.outputTokens });
  }

  // Check that totalTokens exists and is > 0
  if (typeof usage.totalTokens === 'number' && usage.totalTokens > 0) {
    tests.push({ name: 'usage.totalTokens > 0', status: 'PASS', value: usage.totalTokens });
  } else {
    tests.push({ name: 'usage.totalTokens > 0', status: 'FAIL', value: usage.totalTokens });
  }

  // Check that OLD property names don't exist
  if (usage.promptTokens === undefined) {
    tests.push({ name: 'usage.promptTokens is absent', status: 'PASS', value: 'undefined (correct)' });
  } else {
    tests.push({ name: 'usage.promptTokens is absent', status: 'FAIL', value: usage.promptTokens });
  }

  if (usage.completionTokens === undefined) {
    tests.push({ name: 'usage.completionTokens is absent', status: 'PASS', value: 'undefined (correct)' });
  } else {
    tests.push({ name: 'usage.completionTokens is absent', status: 'FAIL', value: usage.completionTokens });
  }

  console.log('\n--- TEST RESULTS ---\n');
  let pass = 0, fail = 0;
  for (const t of tests) {
    const icon = t.status === 'PASS' ? '✅' : '❌';
    console.log(`${icon} [${t.status}] ${t.name}: ${t.value}`);
    if (t.status === 'PASS') pass++; else fail++;
  }
  console.log(`\nTotal: ${pass} PASS, ${fail} FAIL`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(e => {
  console.error('SCRIPT ERROR:', e.message);
  console.error(e.stack);
  process.exit(1);
});

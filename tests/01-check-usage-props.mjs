/**
 * Diagnostic: Check what property names Vercel AI SDK uses for usage
 */
import { vertex } from '../lib/ai/vertex-provider.js';
import { generateText } from 'ai';

async function main() {
  const model = vertex('gemini-2.5-pro');
  
  const result = await generateText({
    model,
    prompt: 'Say "hello" and nothing else.',
    maxTokens: 10,
  });

  console.log('\n=== Full result.usage object ===');
  console.log(JSON.stringify(result.usage, null, 2));
  
  console.log('\n=== Property check ===');
  const usage = result.usage || {};
  console.log('usage.promptTokens:', usage.promptTokens);
  console.log('usage.completionTokens:', usage.completionTokens);
  console.log('usage.totalTokens:', usage.totalTokens);
  
  // Check all keys
  console.log('\n=== All keys on usage ===');
  console.log(Object.keys(usage));
  console.log(Object.entries(usage));
}

main()
  .catch(console.error)
  .finally(() => process.exit(0));

/**
 * Smoke test: verify gemini-3.1-pro-preview is reachable via Vertex AI (global endpoint)
 *
 * Run: node tests/test-gemini-3-1-pro.mjs
 */

import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

async function main() {
  console.log('=== Gemini 3.1 Pro Preview — Vertex smoke test ===\n');
  console.log('Location:', process.env.GOOGLE_VERTEX_LOCATION);
  console.log('Project :', process.env.GOOGLE_VERTEX_PROJECT);
  console.log('');

  const { vertex } = await import('../lib/ai/vertex-provider.js');
  const { generateText } = await import('ai');

  const MODEL_ID = 'gemini-3.1-pro-preview';
  console.log('Model       :', MODEL_ID);
  console.log('Sending a minimal prompt...\n');

  const t0 = Date.now();
  const result = await generateText({
    model: vertex(MODEL_ID),
    prompt: 'Reply with exactly one word: "pong".',
    maxTokens: 20,
  });
  const ms = Date.now() - t0;

  console.log('Response text:', JSON.stringify(result.text));
  console.log('Latency     :', ms, 'ms');
  console.log('Usage       :', JSON.stringify(result.usage));
  console.log('\nPASS — text model is callable.\n');

  console.log('=== Flash model smoke test — gemini-3-flash-preview ===\n');
  const FLASH_MODEL_ID = 'gemini-3-flash-preview';
  console.log('Model       :', FLASH_MODEL_ID);
  console.log('Sending a minimal prompt...\n');

  const fT0 = Date.now();
  const flashResult = await generateText({
    model: vertex(FLASH_MODEL_ID),
    prompt: 'Reply with exactly one word: "pong".',
    maxTokens: 20,
  });
  const fMs = Date.now() - fT0;
  console.log('Response text:', JSON.stringify(flashResult.text));
  console.log('Latency     :', fMs, 'ms');
  console.log('Usage       :', JSON.stringify(flashResult.usage));
  console.log('\nPASS — flash model is callable.\n');

  console.log('=== Image model smoke test — gemini-3-pro-image-preview ===\n');
  const IMAGE_MODEL_ID = 'gemini-3-pro-image-preview';
  console.log('Model       :', IMAGE_MODEL_ID);
  console.log('Generating a tiny image...\n');

  const iT0 = Date.now();
  const imgResult = await generateText({
    model: vertex(IMAGE_MODEL_ID),
    prompt: 'A simple red circle on a white background.',
    providerOptions: {
      google: {
        responseModalities: ['IMAGE'],
        imageConfig: { aspectRatio: '1:1' },
      },
    },
  });
  const iMs = Date.now() - iT0;

  const images = (imgResult.files || []).filter((f) => f.mediaType?.startsWith('image/'));
  console.log('Latency     :', iMs, 'ms');
  console.log('Images      :', images.length);
  if (images.length > 0) {
    console.log('First image :', images[0].mediaType, `(${images[0].base64?.length || 0} b64 chars)`);
    console.log('\nPASS — image model is callable.');
  } else {
    console.log('\nFAIL — no image returned');
    console.log('Raw files:', JSON.stringify(imgResult.files));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('\nFAIL —', err?.message || err);
  if (err?.response?.data) console.error('Response:', JSON.stringify(err.response.data, null, 2));
  if (err?.cause) console.error('Cause:', err.cause);
  process.exit(1);
});

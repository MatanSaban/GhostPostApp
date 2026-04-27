/**
 * Ai-GCoin Pricing
 *
 * Converts Vertex AI token usage into Ai-GCoins charged to the account.
 * Pricing curve targets ~3-4× our raw Vertex cost so the markup covers
 * infra + margin while staying transparent to users.
 *
 * Adjust the divisors below as real usage data accumulates.
 */

export const CREDITS_PER_INPUT_TOKENS = 250;
export const CREDITS_PER_OUTPUT_TOKENS = 30;
export const MIN_CREDITS = 2;

/**
 * Convert raw token usage into a credit charge.
 * Always returns an EVEN integer — pricing only ever uses even values so
 * half-charges (cancel fees) round cleanly. Floor of MIN_CREDITS (2).
 */
export function creditsFromUsage(usage = {}) {
  const inputTokens = Number(usage.inputTokens) || 0;
  const outputTokens = Number(usage.outputTokens) || 0;

  const fromInput = Math.ceil(inputTokens / CREDITS_PER_INPUT_TOKENS);
  const fromOutput = Math.ceil(outputTokens / CREDITS_PER_OUTPUT_TOKENS);
  const total = Math.max(MIN_CREDITS, fromInput + fromOutput);

  return roundUpToEven(total);
}

export function roundUpToEven(n) {
  const x = Math.ceil(Number(n) || 0);
  return x % 2 === 0 ? x : x + 1;
}

/**
 * Charge applied when the user opens an AI Fix preview, then cancels
 * without applying — covering the AI cost we already incurred.
 *
 * Rules:
 *   - Fixes priced at 2 credits or less → no cancel charge (too small)
 *   - Higher prices → floor(price / 4) * 2 (always even, never exceeds half)
 *
 * Examples: 2→0, 4→2, 6→2, 8→4, 10→4, 12→6
 */
export function cancelCharge(price) {
  const p = Number(price) || 0;
  if (p <= 2) return 0;
  return Math.floor(p / 4) * 2;
}

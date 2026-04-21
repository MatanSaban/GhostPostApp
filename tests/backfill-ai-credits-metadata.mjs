/**
 * Backfill aiCreditsLog.metadata for historical entries so admin analytics cost
 * calculations stop under-reporting.
 *
 * Fixes:
 *   1. Entries with model alias ("pro" / "flash" / "vision" / "image") → canonical ID
 *   2. Entries with UNKNOWN / missing model → resolved from `source` field
 *   3. Entries with tokens=0 but a real AI call happened → estimated tokens from
 *      operation config (typicalUsage) or from credits × TOKENS_PER_CREDIT
 *   4. Entries that represent apply-only product fees (no AI call) → left with
 *      tokens=0 and model cleared to `noAiCall: true` marker (cost stays $0)
 *
 * Run: node tests/backfill-ai-credits-metadata.mjs [--dry-run] [--days=90]
 */
import { PrismaClient } from '../node_modules/.prisma/client/index.js';
import { AI_OPERATIONS, TOKENS_PER_CREDIT } from '../lib/ai/credits.js';
import { AI_PRICING } from '../lib/ai/pricing.js';

const prisma = new PrismaClient();

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes('--dry-run');
const daysArg = argv.find(a => a.startsWith('--days='));
const DAYS = daysArg ? parseInt(daysArg.split('=')[1], 10) : 90;

// Sources where an actual Gemini API call was made.
// Used to estimate tokens when historical entries are missing them.
const AI_CALL_SOURCES = {
  // Audit - AI was invoked and should have tokens
  audit_vision: { model: 'gemini-2.5-pro', typicalTokens: 3500 },
  audit_summary: { model: 'gemini-2.5-pro', typicalTokens: 4000 },
  audit_translate_summary: { model: 'gemini-2.5-pro', typicalTokens: 3000 },
  audit_translate_issues: { model: 'gemini-2.5-pro', typicalTokens: 3000 },
  audit_quick_fix: { model: 'gemini-2.5-pro', typicalTokens: 2000 },
  a11y_alt_fix: { model: 'gemini-2.5-pro', typicalTokens: 1500 },
  audit_rescan: { model: 'gemini-2.5-pro', typicalTokens: 2500 },
  ai_title_suggestions: { model: 'gemini-2.5-pro', typicalTokens: 2500 },
  ai_description_suggestions: { model: 'gemini-2.5-pro', typicalTokens: 2500 },
  ai_og_suggestions: { model: 'gemini-2.5-pro', typicalTokens: 3000 },
  ai_alt_suggestions: { model: 'gemini-2.5-pro', typicalTokens: 4000 },
  ai_image_optimization: { model: 'gemini-2.5-pro', typicalTokens: 3500 },
  ai_broken_link_suggest: { model: 'gemini-2.5-pro', typicalTokens: 3500 },
};

// Apply-only sources - pure product fee, no AI call. Cost should stay $0.
const APPLY_ONLY_SOURCES = new Set([
  'ai_broken_link_fix',
  'ai_title_fix',
  'ai_og_fix',
  'ai_description_fix',
  'ai_alt_fix',
  'ai_image_format_fix',
]);

function resolveModel(rawModel, source) {
  if (rawModel && AI_PRICING[rawModel]) return rawModel; // already canonical
  const hint = AI_CALL_SOURCES[source]?.model
    || AI_OPERATIONS[source]?.model
    || (source && AI_OPERATIONS[source.toUpperCase()]?.model)
    || 'gemini-2.5-pro';
  return hint;
}

function estimateTokens(source, creditsUsed) {
  // Prefer operation config's typical usage if available
  const opKey = source?.toUpperCase?.();
  const opConfig = AI_OPERATIONS[opKey] || AI_OPERATIONS[source];
  if (opConfig?.typicalUsage) return opConfig.typicalUsage;

  const callHint = AI_CALL_SOURCES[source];
  if (callHint?.typicalTokens) return callHint.typicalTokens;

  // Last resort: derive from credits × base tokens-per-credit
  return Math.max(500, (creditsUsed || 1) * TOKENS_PER_CREDIT * 0.3);
}

async function main() {
  const since = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000);

  const logs = await prisma.aiCreditsLog.findMany({
    where: { type: 'DEBIT', createdAt: { gte: since } },
    orderBy: { createdAt: 'asc' },
  });

  console.log(`\n=== Backfill scan: ${logs.length} DEBIT entries since ${since.toISOString().slice(0, 10)} ===`);
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'LIVE (will update DB)'}\n`);

  const stats = {
    total: logs.length,
    alreadyGood: 0,
    fixedModel: 0,
    fixedTokens: 0,
    markedNoAiCall: 0,
    skippedUnknown: 0,
  };
  const sourceBreakdown = {};
  const touch = (source, bucket) => {
    if (!sourceBreakdown[source]) sourceBreakdown[source] = { alreadyGood: 0, fixed: 0, noAi: 0, credits: 0 };
    sourceBreakdown[source][bucket]++;
  };

  for (const log of logs) {
    const meta = log.metadata || {};
    const source = log.source || '';
    const rawModel = meta.model;
    const hasTokens = (meta.inputTokens || 0) > 0 || (meta.outputTokens || 0) > 0;

    // Case A: Apply-only product fee - clear the model, keep tokens=0.
    if (APPLY_ONLY_SOURCES.has(source)) {
      sourceBreakdown[source] = sourceBreakdown[source] || { alreadyGood: 0, fixed: 0, noAi: 0, credits: 0 };
      sourceBreakdown[source].credits += log.amount || 0;
      if (meta.noAiCall) { stats.alreadyGood++; touch(source, 'alreadyGood'); continue; }
      const newMeta = {
        ...meta,
        _original: meta._original || meta,
        model: null,
        noAiCall: true,
        note: 'Product fee - no Gemini call at apply time',
      };
      if (!DRY_RUN) {
        await prisma.aiCreditsLog.update({ where: { id: log.id }, data: { metadata: newMeta } });
      }
      stats.markedNoAiCall++;
      touch(source, 'noAi');
      continue;
    }

    sourceBreakdown[source] = sourceBreakdown[source] || { alreadyGood: 0, fixed: 0, noAi: 0, credits: 0 };
    sourceBreakdown[source].credits += log.amount || 0;

    // Case A2: Image model entries - ensure imageCount is set (used for billing).
    const isImageOp = source === 'GENERATE_IMAGE' || source === 'REGENERATE_CONTENT_IMAGE'
      || rawModel === 'gemini-3-pro-image-preview' || meta.operationKey === 'GENERATE_IMAGE'
      || meta.operationKey === 'REGENERATE_CONTENT_IMAGE';
    if (isImageOp && !(meta.imageCount > 0)) {
      const newMeta = {
        ...meta,
        _original: meta._original || meta,
        model: rawModel && AI_PRICING[rawModel] ? rawModel : 'gemini-3-pro-image-preview',
        imageCount: 1,
        imageTier: meta.imageTier || '4k',
        backfilled: true,
        backfillReason: 'image entry missing imageCount',
      };
      if (!DRY_RUN) {
        await prisma.aiCreditsLog.update({ where: { id: log.id }, data: { metadata: newMeta } });
      }
      stats.fixedTokens++;
      touch(source, 'fixed');
      continue;
    }

    // Case B: Has operationKey (came via trackAIUsage). If tokens > 0 and model
    // is canonical, we're done. Otherwise fix model alias.
    const isCanonical = rawModel && AI_PRICING[rawModel];
    if (hasTokens && isCanonical) { stats.alreadyGood++; touch(source, 'alreadyGood'); continue; }

    // Case C: Needs model resolution and/or token estimation.
    const model = resolveModel(rawModel, source);
    const needModelFix = model !== rawModel;
    const needTokenFix = !hasTokens;

    if (!needModelFix && !needTokenFix) { stats.alreadyGood++; touch(source, 'alreadyGood'); continue; }

    const newMeta = { ...meta, _original: meta._original || meta, model };

    if (needTokenFix) {
      const estimated = Math.round(estimateTokens(source, log.amount));
      // Split 70/30 input/output as a typical pattern for chat-style ops
      newMeta.inputTokens = Math.round(estimated * 0.7);
      newMeta.outputTokens = Math.round(estimated * 0.3);
      newMeta.totalTokens = newMeta.inputTokens + newMeta.outputTokens;
      newMeta.backfilled = true;
      newMeta.backfillReason = 'historical entry missing token counts';
    }

    if (needModelFix) stats.fixedModel++;
    if (needTokenFix) stats.fixedTokens++;
    touch(source, 'fixed');

    if (!DRY_RUN) {
      await prisma.aiCreditsLog.update({ where: { id: log.id }, data: { metadata: newMeta } });
    }
  }

  console.log('\n=== By source ===');
  const sources = Object.entries(sourceBreakdown).sort((a, b) => b[1].credits - a[1].credits);
  for (const [src, info] of sources) {
    console.log(`  ${src.padEnd(32)} credits=${String(info.credits).padEnd(6)} ok=${info.alreadyGood} fixed=${info.fixed} noAi=${info.noAi}`);
  }

  console.log('\n=== Summary ===');
  console.log(`  Total scanned:           ${stats.total}`);
  console.log(`  Already correct:         ${stats.alreadyGood}`);
  console.log(`  Model alias fixed:       ${stats.fixedModel}`);
  console.log(`  Tokens estimated:        ${stats.fixedTokens}`);
  console.log(`  Marked as no-AI-call:    ${stats.markedNoAiCall}`);
  console.log(`  Unresolved:              ${stats.skippedUnknown}`);
  if (DRY_RUN) console.log('\n⚠  DRY RUN - no changes written. Re-run without --dry-run to apply.');
  else console.log('\n✔  Backfill complete. Refresh admin analytics to see updated $ costs.');
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());

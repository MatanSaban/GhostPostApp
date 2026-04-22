import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { deductAiCredits } from '@/lib/account-utils';
import { createRedirect } from '@/lib/wp-api-client';
import { invalidateAudit } from '@/lib/cache/invalidate.js';
import { generateObject } from 'ai';
import { googleGlobal } from '@/lib/ai/vertex-provider.js';
import { GEMINI_MODEL } from '@/lib/ai/models.js';
import { z } from 'zod';

const SESSION_COOKIE = 'user_session';
const BROKEN_LINK_FIX_CREDIT_COST = 2; // 2 credits per redirect

async function getAuthenticatedUser() {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get(SESSION_COOKIE)?.value;
    if (!userId) return null;
    return prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        isSuperAdmin: true,
        accountMemberships: {
          select: { accountId: true },
        },
      },
    });
  } catch {
    return null;
  }
}

// ─── AI suggestions endpoint (no credits) ─────────────────────

const suggestionsSchema = z.object({
  suggestions: z.array(
    z.object({
      brokenUrl: z.string().describe('The broken URL that returns 404'),
      suggestedUrl: z.string().describe('The best matching active page URL to redirect to'),
      suggestedTitle: z.string().describe('The title of the suggested page'),
      confidence: z.enum(['high', 'medium', 'low']).describe('How confident the match is'),
      reason: z.string().describe('Brief explanation of why this page is the best match'),
    })
  ),
});

/**
 * POST: Generate AI redirect suggestions OR apply redirect fixes
 *
 * Body – Suggest mode: { siteId, auditId, action: 'suggest' }
 * Body – Apply mode:   { siteId, auditId, action: 'apply', fixes: [{ brokenUrl, targetUrl }] }
 *
 * Suggest: FREE (preview only)
 * Apply:   2 AI credits per redirect
 */
export async function POST(request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { siteId, auditId, action } = body;

    if (!siteId || !action) {
      return NextResponse.json(
        { error: 'siteId and action are required' },
        { status: 400 }
      );
    }

    // Verify site access
    const accountIds = user.accountMemberships.map((m) => m.accountId);
    const site = await prisma.site.findFirst({
      where: user.isSuperAdmin ? { id: siteId } : { id: siteId, accountId: { in: accountIds } },
      select: {
        id: true,
        url: true,
        name: true,
        accountId: true,
        connectionStatus: true,
        siteKey: true,
        siteSecret: true,
      },
    });
    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    if (action === 'suggest') {
      return handleSuggest(site, body, user);
    } else if (action === 'apply') {
      return handleApply(site, body, user);
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('[API/audit/fix-404] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ─── Suggest: Find best redirect targets via AI ───────────────

async function handleSuggest(site, { auditId, siteId, locale }, user) {
  // Get the audit
  const audit = await prisma.siteAudit.findFirst({
    where: { id: auditId, siteId },
  });
  if (!audit) {
    return NextResponse.json({ error: 'Audit not found' }, { status: 404 });
  }

  // Filter broken internal link issues
  const brokenLinks = (audit.issues || []).filter(
    (i) => i.message === 'audit.issues.brokenInternalLink' && i.severity !== 'passed'
  );

  if (brokenLinks.length === 0) {
    return NextResponse.json({ suggestions: [] });
  }

  // Check if site has synced entities
  const entityCount = await prisma.siteEntity.count({ where: { siteId } });
  if (entityCount === 0) {
    return NextResponse.json(
      { error: 'Site content must be synced before suggesting fixes.', code: 'NO_ENTITIES' },
      { status: 422 }
    );
  }

  // Get all published entities for context - enabled types only, otherwise
  // the AI may suggest redirecting broken URLs to pages the user has hidden.
  const entities = await prisma.siteEntity.findMany({
    where: { siteId, status: 'PUBLISHED', entityType: { isEnabled: true } },
    select: { title: true, slug: true, url: true },
    take: 500,
  });

  const entityList = entities
    .map((e, i) => `${i + 1}. "${e.title}" – ${e.url || e.slug}`)
    .join('\n');

  // Parse broken link details
  const brokenData = brokenLinks.map((issue) => {
    let parsed = {};
    try {
      parsed = JSON.parse(issue.details || '{}');
    } catch { /* ignore */ }
    return {
      brokenUrl: parsed.brokenHref || issue.url,
      anchorText: parsed.anchorText || '',
      statusCode: parsed.statusCode || 404,
      sourceUrl: issue.url,
    };
  });

  const brokenContext = brokenData
    .map(
      (b, i) =>
        `${i + 1}. Broken URL: ${b.brokenUrl}\n   Link text: "${b.anchorText}"\n   Found on: ${b.sourceUrl}\n   Status: ${b.statusCode}`
    )
    .join('\n');

  const reasonLang = locale === 'he' ? 'Hebrew' : 'English';

  const prompt = `You are an SEO expert. The website "${site.name || site.url}" has broken internal links (404 errors). For each broken link, find the most semantically relevant active page to redirect to.

Active pages on the site:
${entityList}

Broken internal links to fix:
${brokenContext}

For each broken link:
1. Analyze the broken URL path and the anchor text to understand original intent
2. Find the best matching active page from the list above
3. If no good match exists, suggest the site homepage: ${site.url}
4. Write the "reason" field in ${reasonLang}.

Return redirect suggestions for each broken link. Use the FULL URL for suggestedUrl (including the domain).`;

  const result = await generateObject({
    model: googleGlobal(GEMINI_MODEL),
    schema: suggestionsSchema,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3,
  });

  // Log AI usage for cost tracking (suggest is FREE - no credit charge, but
  // we still log the real Gemini API cost so admin analytics reflect reality).
  try {
    const usage = result.usage || {};
    await prisma.aiCreditsLog.create({
      data: {
        accountId: site.accountId,
        userId: user?.id,
        siteId,
        type: 'DEBIT',
        amount: 0,
        balance: 0,
        source: 'ai_broken_link_suggest',
        description: `AI Broken Link Suggestions: ${brokenData.length} link(s)`,
        metadata: {
          model: GEMINI_MODEL,
          inputTokens: usage.inputTokens || 0,
          outputTokens: usage.outputTokens || 0,
          totalTokens: usage.totalTokens || 0,
          freePreview: true,
        },
      },
    });
  } catch (logErr) {
    console.warn('[fix-404/suggest] Usage log failed (non-fatal):', logErr.message);
  }

  return NextResponse.json({
    suggestions: result.object.suggestions,
    totalLinks: brokenData.length,
    creditCostPerLink: BROKEN_LINK_FIX_CREDIT_COST,
    hasEntities: true,
  });
}

// ─── Apply: Create redirects via WP plugin ────────────────────

async function handleApply(site, { auditId, siteId, fixes }, user) {
  if (!fixes || !Array.isArray(fixes) || fixes.length === 0) {
    return NextResponse.json(
      { error: 'fixes array is required' },
      { status: 400 }
    );
  }

  const isPluginConnected =
    site.connectionStatus === 'CONNECTED' && !!site.siteKey;

  if (!isPluginConnected) {
    return NextResponse.json(
      { error: 'WordPress plugin is not connected', code: 'PLUGIN_NOT_CONNECTED' },
      { status: 422 }
    );
  }

  const totalCost = fixes.length * BROKEN_LINK_FIX_CREDIT_COST;

  // Deduct credits
  const deduction = await deductAiCredits(site.accountId, totalCost, {
    userId: user.id,
    siteId,
    source: 'ai_broken_link_fix',
    description: `Broken Link Fix: ${fixes.length} redirect(s)`,
    metadata: { model: GEMINI_MODEL },
  });

  if (!deduction.success) {
    const isInsufficient = deduction.error?.includes('Insufficient');
    return NextResponse.json(
      {
        error: deduction.error || 'Credit deduction failed',
        code: isInsufficient ? 'INSUFFICIENT_CREDITS' : 'CREDIT_ERROR',
        resourceKey: isInsufficient ? 'aiCredits' : undefined,
      },
      { status: isInsufficient ? 402 : 500 }
    );
  }

  // Apply each redirect
  const results = [];

  for (const fix of fixes) {
    const { brokenUrl, targetUrl } = fix;
    let created = false;
    let pushError = null;

    try {
      // Extract the path from full URLs for redirect rule
      const fromPath = new URL(brokenUrl, site.url).pathname;
      const toPath = new URL(targetUrl, site.url).pathname;

      await createRedirect(site, {
        from: fromPath,
        to: toPath,
        type: 301,
      });
      created = true;
    } catch (err) {
      pushError = err.message;
      console.warn('[fix-404] Redirect creation failed for', brokenUrl, ':', err.message);
    }

    results.push({ brokenUrl, targetUrl, created, pushError });
  }

  // ── Update audit issues in-place ────────────────────────────
  const successfulFixes = results.filter((r) => r.created);
  if (auditId && successfulFixes.length > 0) {
    try {
      const fixedUrls = new Set(successfulFixes.map((f) => f.brokenUrl));

      const buildUpdated = (audit) => {
        const updatedIssues = (audit.issues || []).map((issue) => {
          if (issue.message !== 'audit.issues.brokenInternalLink') return issue;

          let parsed = {};
          try {
            parsed = JSON.parse(issue.details || '{}');
          } catch { /* ignore */ }

          const brokenHref = parsed.brokenHref || issue.url;
          if (fixedUrls.has(brokenHref)) {
            return {
              ...issue,
              severity: 'passed',
              suggestion: null,
              details: `${issue.details} (301 redirect created)`,
            };
          }
          return issue;
        });

        return updatedIssues;
      };

      const MAX_RETRIES = 5;
      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
          const audit = await prisma.siteAudit.findUnique({
            where: { id: auditId },
            select: { issues: true },
          });
          if (!audit) break;

          const updatedIssues = buildUpdated(audit);

          await prisma.siteAudit.update({
            where: { id: auditId },
            data: { issues: updatedIssues },
          });
          invalidateAudit(siteId);
          break;
        } catch (retryErr) {
          if (retryErr.code === 'P2034' && attempt < MAX_RETRIES - 1) {
            await new Promise((r) => setTimeout(r, 200 * (attempt + 1)));
            continue;
          }
          throw retryErr;
        }
      }
    } catch (auditErr) {
      console.warn('[fix-404] Audit update failed (non-fatal):', auditErr.message);
    }
  }

  return NextResponse.json({
    success: true,
    results,
    creditsUsed: totalCost,
    remainingBalance: deduction.balance,
    creditsUpdated: { used: deduction.usedTotal },
    auditUpdated: successfulFixes.length > 0 && !!auditId,
  });
}

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { deductAiCredits } from '@/lib/account-utils';
import { updateSeoData, resolveUrl } from '@/lib/wp-api-client';
import { recalculateAuditAfterFix } from '@/lib/audit/recalculate-after-fix';
import { GEMINI_MODEL } from '@/lib/ai/models.js';

const SESSION_COOKIE = 'user_session';
const OG_FIX_CREDIT_COST = 1; // 1 credit per page

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

/**
 * POST: Apply AI-generated Open Graph tag fixes to one or more pages
 *
 * Body: { siteId, auditId?, fixes: [{ url, ogTitle, ogDescription }] }
 *
 * Cost: 1 AI Credit per page
 * Pushes og_title, og_description (and og_image if available) to the WP plugin.
 * The plugin routes to Yoast/RankMath/custom meta automatically.
 */
export async function POST(request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { siteId, auditId, fixes } = await request.json();

    if (!siteId || !fixes || !Array.isArray(fixes) || fixes.length === 0) {
      return NextResponse.json(
        { error: 'siteId and fixes array are required' },
        { status: 400 }
      );
    }

    // Verify site access
    const accountIds = user.accountMemberships.map(m => m.accountId);
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

    const totalCost = fixes.length * OG_FIX_CREDIT_COST;

    // Verify site has synced entities before charging credits
    const entityCount = await prisma.siteEntity.count({ where: { siteId } });
    if (entityCount === 0) {
      return NextResponse.json(
        {
          error: 'Site content must be synced before applying fixes. Go to Entities to sync your site.',
          code: 'NO_ENTITIES',
        },
        { status: 422 }
      );
    }

    // Deduct credits
    const deduction = await deductAiCredits(site.accountId, totalCost, {
      userId: user.id,
      siteId,
      source: 'ai_og_fix',
      description: `AI OG Fix: ${fixes.length} page(s)`,
      metadata: { model: GEMINI_MODEL },
    });

    if (!deduction.success) {
      console.warn('[ApplyOGFix] Credit deduction failed:', deduction.error, '| accountId:', site.accountId, '| cost:', totalCost);
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

    // Apply each fix
    const results = [];
    const isPluginConnected =
      site.connectionStatus === 'CONNECTED' && !!site.siteKey;

    for (const fix of fixes) {
      const { url, ogTitle, ogDescription } = fix;
      let pushed = false;
      let pushError = null;

      if (isPluginConnected) {
        try {
          // Archive/taxonomy pages have no WP post ID - skip
          const archivePatterns = [/\/category\//, /\/tag\//, /\/author\//, /\/page\/\d/];
          if (archivePatterns.some(p => p.test(url))) {
            pushError = 'Archive/taxonomy pages cannot be updated via the plugin';
            results.push({ url, ogTitle, ogDescription, pushed: false, pushError, skipped: true });
            continue;
          }

          const parsedUrl = new URL(url);
          const pathParts = decodeURIComponent(
            parsedUrl.pathname.replace(/^\/|\/$/g, '')
          );
          const slug = pathParts.split('/').pop() || '';
          const isHomepage = pathParts === '';

          const urlWithSlash = url.endsWith('/') ? url : url + '/';
          const urlWithoutSlash = url.endsWith('/') ? url.slice(0, -1) : url;

          // Try finding entity by exact URL
          let entity = await prisma.siteEntity.findFirst({
            where: { siteId, url: { in: [url, urlWithSlash, urlWithoutSlash] } },
            select: { externalId: true },
          });

          // Fallback: by slug
          if (!entity && slug) {
            entity = await prisma.siteEntity.findFirst({
              where: { siteId, slug },
              select: { externalId: true },
            });
          }

          // Homepage fallback
          if (!entity && isHomepage) {
            entity = await prisma.siteEntity.findFirst({
              where: {
                siteId,
                url: { in: [
                  parsedUrl.origin + '/',
                  parsedUrl.origin,
                  site.url,
                  site.url.endsWith('/') ? site.url.slice(0, -1) : site.url + '/',
                ] },
              },
              select: { externalId: true },
            });
          }

          // Build SEO data - only include fields that were generated
          const seoData = {};
          if (ogTitle) seoData.og_title = ogTitle;
          if (ogDescription) seoData.og_description = ogDescription;

          if (!entity?.externalId) {
            const resolved = await resolveUrl(site, url);
            if (resolved?.found && resolved.postId) {
              await updateSeoData(site, resolved.postId, seoData);
              pushed = true;
            } else {
              throw new Error(`WordPress post ID not found for "${isHomepage ? '(homepage)' : slug}" - URL: ${url}`);
            }
          } else {
            await updateSeoData(site, entity.externalId, seoData);
            pushed = true;
          }
        } catch (err) {
          pushError = err.message;
          console.warn('[ApplyOGFix] Plugin push failed for', url, ':', err.message);
        }
      }

      results.push({ url, ogTitle, ogDescription, pushed, pushError });
    }

    // Update audit issues + pageResults in-place
    const successfulFixes = results.filter(r => r.pushed && !r.pushError);
    if (auditId && successfulFixes.length > 0) {
      try {
        const fixedUrlSet = new Set(successfulFixes.map(f => f.url));

        const buildUpdated = (audit) => {
          const updatedIssues = (audit.issues || []).map(issue => {
            if (
              issue.message === 'audit.issues.missingOG' &&
              issue.url &&
              fixedUrlSet.has(issue.url)
            ) {
              return {
                ...issue,
                severity: 'passed',
                message: 'audit.issues.ogTagsGood',
                suggestion: null,
                details: 'OG tags set via AI fix',
              };
            }
            return issue;
          });

          return { updatedIssues };
        };

        const MAX_RETRIES = 5;
        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
          try {
            const audit = await prisma.siteAudit.findUnique({
              where: { id: auditId },
              select: { issues: true },
            });
            if (!audit) break;

            const { updatedIssues } = buildUpdated(audit);

            await prisma.siteAudit.update({
              where: { id: auditId },
              data: { issues: updatedIssues },
            });
            break;
          } catch (retryErr) {
            if (retryErr.code === 'P2034' && attempt < MAX_RETRIES - 1) {
              await new Promise((r) => setTimeout(r, 200 * (attempt + 1)));
              continue;
            }
            throw retryErr;
          }
        }

        // Recalculate score + regenerate summary
        recalculateAuditAfterFix(auditId, site.url).catch(err =>
          console.warn('[ApplyOGFix] Recalc failed (non-fatal):', err.message)
        );
      } catch (auditErr) {
        console.warn('[ApplyOGFix] Audit update failed (non-fatal):', auditErr.message);
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
  } catch (error) {
    console.error('[API/audit/apply-og-fix] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

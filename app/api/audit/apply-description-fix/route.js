import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { deductAiCredits } from '@/lib/account-utils';
import { updateSeoData, resolveUrl } from '@/lib/wp-api-client';
import { recalculateAuditAfterFix } from '@/lib/audit/recalculate-after-fix';

const SESSION_COOKIE = 'user_session';
const DESC_FIX_CREDIT_COST = 1; // 1 credit per page

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
 * POST: Apply an AI-generated meta description fix to one or more pages
 *
 * Body: { siteId, auditId?, fixes: [{ url, newDescription }] }
 *
 * Cost: 1 AI Credit per page
 * Pushes the new description to the WP plugin (Yoast/RankMath/custom).
 * If auditId is provided, updates the audit issues + pageResults in-place.
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

    const totalCost = fixes.length * DESC_FIX_CREDIT_COST;

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
      source: 'ai_description_fix',
      description: `AI Description Fix: ${fixes.length} page(s)`,
    });

    if (!deduction.success) {
      console.warn('[ApplyDescFix] Credit deduction failed:', deduction.error, '| accountId:', site.accountId, '| cost:', totalCost);
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
      const { url, newDescription } = fix;
      let pushed = false;
      let pushError = null;

      if (isPluginConnected) {
        try {
          // Archive/taxonomy pages have no WP post ID - skip them
          const archivePatterns = [/\/category\//, /\/tag\//, /\/author\//, /\/page\/\d/];
          if (archivePatterns.some(p => p.test(url))) {
            pushError = 'Archive/taxonomy pages cannot be updated via the plugin';
            results.push({ url, newDescription, pushed: false, pushError, skipped: true });
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

          if (!entity?.externalId) {
            const resolved = await resolveUrl(site, url);
            if (resolved?.found && resolved.postId) {
              await updateSeoData(site, resolved.postId, { description: newDescription });
              pushed = true;
            } else {
              throw new Error(`WordPress post ID not found for "${isHomepage ? '(homepage)' : slug}" - URL: ${url}`);
            }
          } else {
            await updateSeoData(site, entity.externalId, { description: newDescription });
            pushed = true;
          }
        } catch (err) {
          pushError = err.message;
          console.warn('[ApplyDescFix] Plugin push failed for', url, ':', err.message);
        }
      }

      results.push({ url, newDescription, pushed, pushError });
    }

    // Update audit issues + pageResults in-place
    const successfulFixes = results.filter(r => r.pushed && !r.pushError);
    if (auditId && successfulFixes.length > 0) {
      try {
        const fixMap = new Map(successfulFixes.map(f => [f.url, f.newDescription]));

        const buildUpdated = (audit) => {
          const updatedIssues = (audit.issues || []).map(issue => {
            if (
              (issue.message === 'audit.issues.noMetaDescription' ||
               issue.message === 'audit.issues.metaDescriptionShort') &&
              issue.url &&
              fixMap.has(issue.url)
            ) {
              const newDesc = fixMap.get(issue.url);
              if (newDesc.length >= 120 && newDesc.length <= 160) {
                return {
                  ...issue,
                  severity: 'passed',
                  message: 'audit.issues.metaDescriptionGood',
                  suggestion: null,
                  details: `${newDesc.length} chars (AI fixed)`,
                };
              } else if (newDesc.length > 160) {
                return {
                  ...issue,
                  severity: 'warning',
                  message: 'audit.issues.metaDescriptionLong',
                  suggestion: 'audit.suggestions.metaDescriptionLength',
                  details: `${newDesc.length} chars (AI fixed)`,
                };
              }
              return {
                ...issue,
                severity: 'warning',
                details: `${newDesc.length} chars (AI fixed)`,
              };
            }
            return issue;
          });

          const updatedPageResults = (audit.pageResults || []).map(pr => {
            if (fixMap.has(pr.url)) {
              return { ...pr, metaDescription: fixMap.get(pr.url) };
            }
            return pr;
          });

          return { updatedIssues, updatedPageResults };
        };

        const MAX_RETRIES = 5;
        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
          try {
            const audit = await prisma.siteAudit.findUnique({
              where: { id: auditId },
              select: { issues: true, pageResults: true },
            });
            if (!audit) break;

            const { updatedIssues, updatedPageResults } = buildUpdated(audit);

            await prisma.siteAudit.update({
              where: { id: auditId },
              data: {
                issues: updatedIssues,
                pageResults: updatedPageResults,
              },
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
          console.warn('[ApplyDescFix] Recalc failed (non-fatal):', err.message)
        );
      } catch (auditErr) {
        console.warn('[ApplyDescFix] Audit update failed (non-fatal):', auditErr.message);
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
    console.error('[API/audit/apply-description-fix] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

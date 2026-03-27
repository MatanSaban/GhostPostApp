import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { deductAiCredits } from '@/lib/account-utils';
import { makePluginRequest, getMedia } from '@/lib/wp-api-client';
import { recalculateAuditAfterFix } from '@/lib/audit/recalculate-after-fix';

const SESSION_COOKIE = 'user_session';
const IMAGE_FORMAT_FIX_CREDIT_COST = 1; // 1 credit per image

async function getAuthenticatedUser() {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get(SESSION_COOKIE)?.value;
    if (!userId) return null;
    return prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        accountMemberships: {
          select: { accountId: true },
        },
      },
    });
  } catch {
    return null;
  }
}

function normalizeUrlForCompare(url) {
  return url
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .toLowerCase();
}

function buildSearchTerms(fullFileName) {
  const base = fullFileName.replace(/\.[^.]+$/, '');
  const terms = [];
  if (base.length >= 3) terms.push(base);
  const noSize = base.replace(/-\d+x\d+$/, '');
  if (noSize !== base && noSize.length >= 3) terms.push(noSize);
  const noEdit = noSize.replace(/-e\d{10,13}$/, '');
  if (noEdit !== noSize && noEdit.length >= 3) terms.push(noEdit);
  const noTrailingNum = noEdit.replace(/-\d+$/, '');
  if (noTrailingNum !== noEdit && noTrailingNum.length >= 3) terms.push(noTrailingNum);
  return [...new Set(terms)];
}

async function resolveMediaBySearch(site, imageUrls) {
  const results = {};
  for (const imageUrl of imageUrls) {
    try {
      const urlPath = new URL(imageUrl).pathname;
      const fullFileName = urlPath.split('/').pop() || '';
      const rawTerms = buildSearchTerms(fullFileName);
      const searchTerms = rawTerms.map((t) => t.replace(/[-_]+/g, ' ').trim());

      if (searchTerms.length === 0) {
        results[imageUrl] = { found: false, attachmentId: null };
        continue;
      }

      let items = [];
      let usedTerm = '';

      for (const term of searchTerms) {
        const mediaResult = await getMedia(site, {
          search: term,
          perPage: 10,
          mimeType: 'image',
        });
        items = mediaResult?.items || [];
        usedTerm = term;
        if (items.length > 0) break;
      }

      if (items.length === 0) {
        results[imageUrl] = { found: false, attachmentId: null };
        continue;
      }

      const normalizedImageUrl = normalizeUrlForCompare(imageUrl);
      const cleanImageUrl = imageUrl.replace(/-\d+x\d+(?=\.[a-z]+$)/i, '');
      const normalizedCleanUrl = normalizeUrlForCompare(cleanImageUrl);

      let match = items.find(
        (item) => normalizeUrlForCompare(item.url) === normalizedImageUrl
      );

      if (!match) {
        match = items.find(
          (item) => normalizeUrlForCompare(item.url) === normalizedCleanUrl
        );
      }

      if (!match) {
        const srcPathClean = urlPath.replace(/-\d+x\d+(?=\.[a-z]+$)/i, '').toLowerCase();
        match = items.find((item) => {
          try {
            const itemPath = new URL(item.url).pathname.toLowerCase();
            return itemPath === srcPathClean || itemPath === urlPath.toLowerCase();
          } catch { return false; }
        });
      }

      if (!match) {
        const stripWpSuffixes = (f) =>
          f.replace(/-\d+x\d+/g, '').replace(/-e\d{10,13}/g, '').toLowerCase();
        const srcFileClean = stripWpSuffixes(fullFileName);
        match = items.find((item) => {
          try {
            const itemFile = new URL(item.url).pathname.split('/').pop() || '';
            return stripWpSuffixes(itemFile) === srcFileClean;
          } catch { return false; }
        });
      }

      if (!match && usedTerm.length >= 5 && items.length === 1) {
        match = items[0];
      }
      if (!match) {
        const termLower = usedTerm.toLowerCase();
        match = items.find((item) => {
          const itemFile = new URL(item.url).pathname.split('/').pop()?.toLowerCase() || '';
          return itemFile.includes(termLower);
        });
      }

      results[imageUrl] = match
        ? { found: true, attachmentId: match.id }
        : { found: false, attachmentId: null };
    } catch (err) {
      console.warn('[resolveMediaBySearch] Failed for', imageUrl, ':', err.message);
      results[imageUrl] = { found: false, attachmentId: null };
    }
  }
  return results;
}

/**
 * POST: Apply AI-recommended image format conversions via WordPress plugin
 *
 * Body: { siteId, auditId?, fixes: [{ imageUrl, recommendedFormat, pageUrl }] }
 *
 * Cost: 1 AI Credit per image
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

    const accountIds = user.accountMemberships.map((m) => m.accountId);
    const site = await prisma.site.findFirst({
      where: { id: siteId, accountId: { in: accountIds } },
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

    if (site.connectionStatus !== 'CONNECTED' || !site.siteKey) {
      return NextResponse.json(
        { error: 'Plugin not connected', code: 'PLUGIN_NOT_CONNECTED' },
        { status: 422 }
      );
    }

    const totalCost = fixes.length * IMAGE_FORMAT_FIX_CREDIT_COST;

    const deduction = await deductAiCredits(site.accountId, totalCost, {
      userId: user.id,
      siteId,
      source: 'ai_image_format_fix',
      description: `AI Image Format Fix: ${fixes.length} image(s)`,
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

    // Resolve image URLs to WP attachment IDs
    const imageUrls = fixes.map((f) => f.imageUrl);
    const resolveResults = await resolveMediaBySearch(site, imageUrls);

    // Build conversions array for the plugin
    const conversions = [];
    const unresolved = [];

    for (const fix of fixes) {
      const resolved = resolveResults[fix.imageUrl];
      if (resolved?.found && resolved?.attachmentId) {
        conversions.push({
          id: resolved.attachmentId,
          format: fix.recommendedFormat,
        });
      } else {
        unresolved.push({
          imageUrl: fix.imageUrl,
          error: 'Image not found in WordPress media library',
        });
      }
    }

    let pluginResults = [];
    if (conversions.length > 0) {
      try {
        // Try new multi-format endpoint first
        const pluginResponse = await makePluginRequest(
          site,
          '/media/convert-image-format',
          'POST',
          {
            conversions,
            keep_backups: true,
            flush_cache: true,
            replace_urls: true,
          }
        );
        pluginResults = pluginResponse.results || [];
      } catch (pluginErr) {
        // Fallback: if the new endpoint doesn't exist (plugin not updated),
        // use the legacy /media/convert-to-webp for WebP conversions
        const is404 = pluginErr.message?.includes('404');
        if (!is404) throw pluginErr;

        const webpIds = conversions
          .filter((c) => c.format === 'webp')
          .map((c) => c.id);
        const avifIds = conversions
          .filter((c) => c.format === 'avif')
          .map((c) => c.id);

        if (webpIds.length > 0) {
          const legacyResponse = await makePluginRequest(
            site,
            '/media/convert-to-webp',
            'POST',
            { ids: webpIds, keep_backups: true }
          );
          // Map legacy response to the same result shape
          for (const id of webpIds) {
            const failed = (legacyResponse.errors || []).find((e) => e.id === id);
            pluginResults.push({
              id,
              format: 'webp',
              success: !failed,
              error: failed?.error || null,
            });
          }
        }

        // AVIF not supported by legacy endpoint
        for (const id of avifIds) {
          pluginResults.push({
            id,
            format: 'avif',
            success: false,
            error: 'AVIF conversion requires plugin update to v1.11.0+',
          });
        }
      }
    }

    // Merge results
    const results = fixes.map((fix) => {
      const resolved = resolveResults[fix.imageUrl];
      if (!resolved?.found) {
        return {
          imageUrl: fix.imageUrl,
          format: fix.recommendedFormat,
          pushed: false,
          pushError: 'Image not found in WordPress media library',
        };
      }
      const pluginResult = pluginResults.find(
        (r) => r.id === resolved.attachmentId
      );
      return {
        imageUrl: fix.imageUrl,
        format: fix.recommendedFormat,
        pushed: pluginResult?.success ?? false,
        pushError: pluginResult?.error || null,
      };
    });

    // Update audit issues
    const successfulFixes = results.filter((r) => r.pushed);
    if (auditId && successfulFixes.length > 0) {
      try {
        const fixedImageUrls = new Set(successfulFixes.map((f) => f.imageUrl));

        // Also match WP size variants (e.g. image-300x200.jpg shares base with image.jpg)
        const stripWpSizeSuffix = (url) => url.replace(/-\d+x\d+(?=\.[a-z]+$)/i, '');
        const fixedBaseUrls = new Set(
          successfulFixes.map((f) => stripWpSizeSuffix(f.imageUrl))
        );

        const isFixedImage = (srcUrl) => {
          if (fixedImageUrls.has(srcUrl)) return true;
          // Match size variants of the same base image
          return fixedBaseUrls.has(stripWpSizeSuffix(srcUrl));
        };

        const buildUpdated = (audit) => {
          const updatedIssues = (audit.issues || []).map((issue) => {
            if (
              issue.message !== 'audit.issues.imagesNotNextGen' &&
              issue.message !== 'audit.issues.imagesTooLarge' &&
              issue.message !== 'audit.issues.imagesLargeWarning'
            ) {
              return issue;
            }

            const remaining = (issue.detailedSources || []).filter(
              (src) => !isFixedImage(src.url)
            );

            if (remaining.length === 0) {
              if (issue.message === 'audit.issues.imagesNotNextGen') {
                return {
                  ...issue,
                  severity: 'passed',
                  message: 'audit.issues.imagesNextGenGood',
                  suggestion: null,
                  detailedSources: [],
                };
              }
              return {
                ...issue,
                severity: 'passed',
                message: 'audit.issues.imagesSizeGood',
                suggestion: null,
                detailedSources: [],
              };
            }

            return {
              ...issue,
              details:
                issue.message === 'audit.issues.imagesNotNextGen'
                  ? `${remaining.length}/${issue.details?.split('/')?.pop() || remaining.length}`
                  : `${remaining.length} images`,
              detailedSources: remaining,
            };
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

        recalculateAuditAfterFix(auditId, site.url).catch((err) =>
          console.warn('[ApplyImageFormatFix] Recalc failed (non-fatal):', err.message)
        );
      } catch (auditErr) {
        console.warn(
          '[ApplyImageFormatFix] Audit update failed (non-fatal):',
          auditErr.message
        );
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
    console.error('[API/audit/apply-image-format-fix] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

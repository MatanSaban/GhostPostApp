import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { deductAiCredits } from '@/lib/account-utils';
import { updateMedia, getMedia } from '@/lib/wp-api-client';
import { recalculateAuditAfterFix } from '@/lib/audit/recalculate-after-fix';

const SESSION_COOKIE = 'user_session';
const ALT_FIX_CREDIT_COST = 1; // 1 credit per image

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
 * POST: Apply AI-generated alt text fixes to WordPress media
 *
 * Body: { siteId, auditId?, fixes: [{ imageUrl, altText, pageUrl }] }
 *
 * Cost: 1 AI Credit per image
 * Resolves image URLs to WP attachment IDs, then updates alt text via plugin.
 */

/**
 * Normalize a URL for comparison - strip protocol and www prefix.
 */
function normalizeUrlForCompare(url) {
  return url
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .toLowerCase();
}

/**
/**
 * Clean a filename for WP media search - strip extension, size suffix, and edit hash.
 * WP stores attachments by title (e.g. "unnamed-10"), but the URL may contain
 * size suffixes (-300x200) and edit hashes (-e1770978330939) that WP_Query won't match.
 * Returns an array of progressively simpler search terms to try.
 */
function buildSearchTerms(fullFileName) {
  const base = fullFileName.replace(/\.[^.]+$/, ''); // remove extension
  const terms = [];

  // 1. Full name (minus extension)
  if (base.length >= 3) terms.push(base);

  // 2. Strip WP size suffix (-300x200)
  const noSize = base.replace(/-\d+x\d+$/, '');
  if (noSize !== base && noSize.length >= 3) terms.push(noSize);

  // 3. Strip WP edit/crop hash (-e{timestamp}, 10-13 digit timestamp)
  const noEdit = noSize.replace(/-e\d{10,13}$/, '');
  if (noEdit !== noSize && noEdit.length >= 3) terms.push(noEdit);

  // 4. Strip trailing number suffix for very generic names (e.g. "unnamed-10" → "unnamed")
  const noTrailingNum = noEdit.replace(/-\d+$/, '');
  if (noTrailingNum !== noEdit && noTrailingNum.length >= 3) terms.push(noTrailingNum);

  // 5. For long/complex filenames, try shorter prefixes (first 2-3 "words" split by - or _)
  //    e.g. "ChatGPT-Image-Oct-30-2025-03_26_22-PM" → "ChatGPT-Image", "ChatGPT-Image-Oct"
  const cleanest = noEdit || noSize || base;
  const words = cleanest.split(/[-_]+/).filter(Boolean);
  if (words.length > 2) {
    const twoWords = words.slice(0, 2).join('-');
    if (twoWords.length >= 3) terms.push(twoWords);
    if (words.length > 3) {
      const threeWords = words.slice(0, 3).join('-');
      if (threeWords.length >= 3) terms.push(threeWords);
    }
  }

  // Deduplicate while keeping order
  return [...new Set(terms)];
}

/**
 * Resolve image URLs to attachment IDs by searching WP media by filename.
 * Works with any plugin version (uses GET /media?search=).
 */
async function resolveMediaBySearch(site, imageUrls) {
  const results = {};

  for (const imageUrl of imageUrls) {
    try {
      const urlPath = new URL(imageUrl).pathname;
      const fullFileName = urlPath.split('/').pop() || '';
      const rawTerms = buildSearchTerms(fullFileName);
      // WP stores attachment titles with spaces (not dashes/underscores).
      // Convert separators to spaces so WP_Query word search can match.
      const searchTerms = rawTerms.map((t) => t.replace(/[-_]+/g, ' ').trim());

      console.log('[resolveMediaBySearch]', imageUrl, '→ terms:', searchTerms);

      if (searchTerms.length === 0) {
        results[imageUrl] = { found: false, attachmentId: null };
        continue;
      }

      let items = [];
      let usedTerm = '';

      // Try each search term until we get results
      for (const term of searchTerms) {
        const mediaResult = await getMedia(site, {
          search: term,
          perPage: 10,
          mimeType: 'image',
        });
        items = mediaResult?.items || [];
        usedTerm = term;
        console.log('[resolveMediaBySearch] Search:', term, '→', items.length, 'results',
          items.length > 0 ? items.map((i) => ({ id: i.id, url: i.url?.slice(-60) })) : '');
        if (items.length > 0) break;
      }

      if (items.length === 0) {
        results[imageUrl] = { found: false, attachmentId: null };
        continue;
      }

      const normalizedImageUrl = normalizeUrlForCompare(imageUrl);
      const cleanImageUrl = imageUrl.replace(/-\d+x\d+(?=\.[a-z]+$)/i, '');
      const normalizedCleanUrl = normalizeUrlForCompare(cleanImageUrl);

      // Try exact URL match (normalized - ignore http/https, www)
      let match = items.find(
        (item) => normalizeUrlForCompare(item.url) === normalizedImageUrl
      );

      // Try matching without size suffix (original URL vs sized variant)
      if (!match) {
        match = items.find(
          (item) => normalizeUrlForCompare(item.url) === normalizedCleanUrl
        );
      }

      // Try matching by filename path (ignore domain differences)
      if (!match) {
        const srcPathClean = urlPath.replace(/-\d+x\d+(?=\.[a-z]+$)/i, '').toLowerCase();
        match = items.find((item) => {
          try {
            const itemPath = new URL(item.url).pathname.toLowerCase();
            return itemPath === srcPathClean || itemPath === urlPath.toLowerCase();
          } catch { return false; }
        });
      }

      // Try matching by filename only (most flexible - strip edit hash and size from both sides)
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

      // Last resort: if search was specific and returned only 1 result, trust it
      if (!match && usedTerm.length >= 5 && items.length === 1) {
        match = items[0];
      }
      // Also accept if the searched term appears in the item's URL
      if (!match) {
        const termLower = usedTerm.toLowerCase();
        match = items.find((item) => {
          const itemFile = new URL(item.url).pathname.split('/').pop()?.toLowerCase() || '';
          return itemFile.includes(termLower);
        });
      }

      console.log('[resolveMediaBySearch] Match for', imageUrl, ':', match ? `id=${match.id}` : 'NONE');

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

    const isPluginConnected =
      site.connectionStatus === 'CONNECTED' && !!site.siteKey;

    if (!isPluginConnected) {
      return NextResponse.json(
        { error: 'Plugin not connected', code: 'PLUGIN_NOT_CONNECTED' },
        { status: 422 }
      );
    }

    const totalCost = fixes.length * ALT_FIX_CREDIT_COST;

    // Deduct credits
    const deduction = await deductAiCredits(site.accountId, totalCost, {
      userId: user.id,
      siteId,
      source: 'ai_alt_fix',
      description: `AI Alt Text Fix: ${fixes.length} image(s)`,
    });

    if (!deduction.success) {
      console.warn(
        '[ApplyAltFix] Credit deduction failed:',
        deduction.error,
        '| accountId:',
        site.accountId,
        '| cost:',
        totalCost
      );
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

    // Resolve all image URLs to attachment IDs by searching WP media library
    const imageUrls = fixes.map((f) => f.imageUrl);
    const resolveResults = await resolveMediaBySearch(site, imageUrls);

    // Apply each fix
    const results = [];

    for (const fix of fixes) {
      const { imageUrl, altText } = fix;
      let pushed = false;
      let pushError = null;

      const resolved = resolveResults[imageUrl];
      if (!resolved?.found || !resolved?.attachmentId) {
        pushError = 'Image not found in WordPress media library (may be an external image)';
        results.push({ imageUrl, altText, pushed: false, pushError });
        continue;
      }

      try {
        await updateMedia(site, resolved.attachmentId, { alt: altText });
        pushed = true;
      } catch (err) {
        pushError = err.message;
        console.warn(
          '[ApplyAltFix] updateMedia failed for',
          imageUrl,
          ':',
          err.message
        );
      }

      results.push({ imageUrl, altText, pushed, pushError });
    }

    // Update audit issues in-place
    const successfulFixes = results.filter((r) => r.pushed && !r.pushError);
    if (auditId && successfulFixes.length > 0) {
      try {
        const fixedImageUrls = new Set(successfulFixes.map((f) => f.imageUrl));

        const buildUpdated = (audit) => {
          const updatedIssues = (audit.issues || []).map((issue) => {
            if (issue.message !== 'audit.issues.imagesNoAlt') return issue;

            // Remove fixed images from detailedSources
            const remaining = (issue.detailedSources || []).filter(
              (src) => !fixedImageUrls.has(src.url)
            );

            if (remaining.length === 0) {
              // All images on this page are fixed
              return {
                ...issue,
                severity: 'passed',
                message: 'audit.issues.allImagesHaveAlt',
                suggestion: null,
                details: 'Alt text set via AI fix',
                detailedSources: [],
              };
            }

            // Some images still missing alt - update the count
            const totalMatch = issue.details?.match(/\d+\/(\d+)/);
            const totalImages = totalMatch ? parseInt(totalMatch[1]) : remaining.length;
            return {
              ...issue,
              details: `${remaining.length}/${totalImages}`,
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

        // Recalculate score + regenerate summary
        recalculateAuditAfterFix(auditId, site.url).catch((err) =>
          console.warn('[ApplyAltFix] Recalc failed (non-fatal):', err.message)
        );
      } catch (auditErr) {
        console.warn(
          '[ApplyAltFix] Audit update failed (non-fatal):',
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
    console.error('[API/audit/apply-alt-fix] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

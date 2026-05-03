import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { updateSeoData, resolveUrl, setSearchEngineVisibility } from '@/lib/wp-api-client';
import { recalculateAuditAfterFix } from '@/lib/audit/recalculate-after-fix';
import { applyBulkUpdates } from '@/lib/audit/page-results-helper';
import { applyIssuesTransform } from '@/lib/audit/issues-helper';

const SESSION_COOKIE = 'user_session';

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
 * POST: Remove noindex/nofollow from one or more pages via the WP plugin
 *
 * Body: { siteId, auditId?, fixes: [{ url, removeNoindex?: boolean, removeNofollow?: boolean }] }
 *
 * Free operation (no Ai-GCoins).
 * Pushes the SEO change to the WP plugin if connected.
 * If auditId is provided, updates the audit issues in-place.
 */
export async function POST(request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { siteId, auditId, fixes, fixSiteWide } = await request.json();

    if (!siteId || ((!fixes || !Array.isArray(fixes) || fixes.length === 0) && !fixSiteWide)) {
      return NextResponse.json(
        { error: 'siteId and either fixes array or fixSiteWide flag are required' },
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
        { error: 'WordPress plugin is not connected' },
        { status: 422 }
      );
    }

    const results = [];
    let siteWideFixed = false;

    // ── Site-wide fix: disable "Discourage search engines" in WP settings ──
    if (fixSiteWide) {
      try {
        await setSearchEngineVisibility(site, false);
        siteWideFixed = true;
      } catch (err) {
        console.warn('[FixNoindex] Site-wide visibility fix failed:', err.message);
        return NextResponse.json(
          { error: `Failed to update WordPress search engine visibility: ${err.message}` },
          { status: 502 }
        );
      }
    }

    // ── Per-page fixes ──
    // URL patterns that are archive/taxonomy pages (no WP post ID)
    const unfixablePatterns = [/\/category\//, /\/tag\//, /\/author\//, /\/page\/\d/];
    let pluginEndpointMissing = false;

    for (const fix of (fixes || [])) {
      const { url, removeNoindex, removeNofollow } = fix;
      let pushed = false;
      let pushError = null;

      try {
        // Build SEO data to push
        const seoData = {};
        if (removeNoindex) seoData.noIndex = false;
        if (removeNofollow) seoData.noFollow = false;

        if (Object.keys(seoData).length === 0) {
          results.push({ url, pushed: false, pushError: 'No changes specified' });
          continue;
        }

        // Skip URLs that are clearly archive/taxonomy pages
        if (unfixablePatterns.some(p => p.test(url))) {
          results.push({ url, pushed: false, pushError: 'skipped', skipped: true });
          continue;
        }

        // If we already know the plugin endpoint is missing, skip API calls
        if (pluginEndpointMissing) {
          results.push({ url, pushed: false, pushError: 'Plugin update required' });
          continue;
        }

        // Try resolving the URL to a WP post ID
        const resolved = await resolveUrl(site, url);

        // Detect outdated plugin (endpoint doesn't exist)
        if (resolved?.endpointMissing) {
          pluginEndpointMissing = true;
          results.push({ url, pushed: false, pushError: 'Plugin update required' });
          continue;
        }

        if (resolved?.found && resolved.postId) {
          await updateSeoData(site, resolved.postId, seoData);
          pushed = true;
        } else {
          // Fallback: try matching by entity URL/slug
          const urlWithSlash = url.endsWith('/') ? url : url + '/';
          const urlWithoutSlash = url.endsWith('/') ? url.slice(0, -1) : url;

          const entity = await prisma.siteEntity.findFirst({
            where: { siteId, url: { in: [url, urlWithSlash, urlWithoutSlash] } },
            select: { externalId: true },
          });

          if (entity?.externalId) {
            await updateSeoData(site, entity.externalId, seoData);
            pushed = true;
          } else {
            throw new Error(`Could not resolve WordPress post ID for URL: ${url}`);
          }
        }
      } catch (err) {
        pushError = err.message;
        console.warn('[FixNoindex] Push failed for', url, ':', err.message);
      }

      results.push({ url, pushed, pushError });
    }

    // If the plugin endpoint is missing and no fixes succeeded, return actionable error
    if (pluginEndpointMissing && results.every(r => !r.pushed)) {
      return NextResponse.json({
        error: 'pluginUpdateRequired',
        message: 'The WordPress plugin needs to be updated to support per-page noindex fixes. Please update the GhostSEO plugin on the WordPress site.',
        results,
        siteWideFixed,
      }, { status: 422 });
    }

    // Update audit issues in-place
    const successfulFixes = results.filter(r => r.pushed && !r.pushError);
    const hasChanges = successfulFixes.length > 0 || siteWideFixed;
    if (auditId && hasChanges) {
      try {
        const fixedUrls = new Set(successfulFixes.map(f => f.url));
        const fixMap = new Map((fixes || []).map(f => [f.url, f]));

        const buildUpdatedIssues = (issues) => (issues || []).map(issue => {
          if (siteWideFixed && issue.message === 'audit.issues.wpSearchEngineDiscouraged') {
            return {
              ...issue,
              severity: 'passed',
              message: 'audit.issues.wpSearchEngineVisible',
              suggestion: null,
              details: 'Fixed via plugin - search engines can now index the site',
            };
          }

          if (siteWideFixed && issue.message === 'audit.issues.metaRobotsNoindex') {
            return {
              ...issue,
              severity: 'info',
              details: (issue.details || '') + ' (site-wide setting was fixed - re-run audit to verify)',
            };
          }

          if (!issue.url || !fixedUrls.has(issue.url)) return issue;
          const fix = fixMap.get(issue.url);

          if (issue.message === 'audit.issues.metaRobotsNoindex' && fix?.removeNoindex) {
            return {
              ...issue,
              severity: 'passed',
              message: 'audit.issues.metaRobotsGood',
              suggestion: null,
              details: 'noindex removed via plugin',
            };
          }
          if (issue.message === 'audit.issues.metaRobotsNofollow' && fix?.removeNofollow) {
            return {
              ...issue,
              severity: 'passed',
              message: 'audit.issues.metaRobotsGood',
              suggestion: null,
              details: 'nofollow removed via plugin',
            };
          }
          return issue;
        });

        // Issues via helper — handles dual-write under the flag.
        await applyIssuesTransform({ auditId }, buildUpdatedIssues).catch((err) => {
          console.warn('[FixNoindex] issues transform failed:', err.message);
        });

        // PageResult robotsMeta clearing for fixed URLs via dual-write helper.
        const robotsPatches = new Map();
        for (const url of fixedUrls) {
          const fix = fixMap.get(url);
          if (fix?.removeNoindex || fix?.removeNofollow) {
            robotsPatches.set(url, { robotsMeta: null });
          }
        }
        if (robotsPatches.size > 0) {
          await applyBulkUpdates({ auditId }, robotsPatches).catch((err) => {
            console.warn('[FixNoindex] pageResults dual-write failed (non-fatal):', err.message);
          });
        }

          // Recalculate score + regenerate summary with updated issues
          recalculateAuditAfterFix(auditId, site.url).catch(err =>
            console.warn('[FixNoindex] Recalc failed (non-fatal):', err.message)
          );
      } catch (auditErr) {
        console.warn('[FixNoindex] Audit update failed (non-fatal):', auditErr.message);
      }
    }

    return NextResponse.json({
      success: true,
      results,
      siteWideFixed,
      auditUpdated: hasChanges && !!auditId,
    });
  } catch (error) {
    console.error('[API/audit/fix-noindex] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

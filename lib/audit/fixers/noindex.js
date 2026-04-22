/**
 * Noindex / Search-engine Visibility Fix Handler
 *
 * Issues handled:
 *   - audit.issues.metaRobotsNoindex          (per-page <meta robots noindex>)
 *   - audit.issues.metaRobotsNofollow         (per-page <meta robots nofollow>)
 *   - audit.issues.wpSearchEngineDiscouraged  (site-wide WP Settings → Reading flag)
 *
 * No AI — purely toggles flags via the WP plugin.
 *
 * WP-auto apply:
 *   - Per-page issues: updateSeoData(post, { noIndex/noFollow: false })
 *   - Site-wide: setSearchEngineVisibility(site, false)
 *
 * Manual:
 *   - Per-page: wpAdminStep telling the user where to flip the toggle
 *     (Yoast/Rank Math/native), with a fallback `instructions` block for
 *     non-WordPress sites.
 *   - Site-wide: wpAdminStep for Settings → Reading.
 */

import { updateSeoData, setSearchEngineVisibility, resolveUrl } from '@/lib/wp-api-client';
import { wpAdminStep as wpAdminStepOutput, instructions as instructionsOutput } from '@/lib/audit/fix-manual-output';
import prisma from '@/lib/prisma';
import { isArchiveUrl, shortPath, resolvePostIdFromUrl, updateAuditWithRetry } from './_shared';

const PER_PAGE_ISSUES = new Set([
  'audit.issues.metaRobotsNoindex',
  'audit.issues.metaRobotsNofollow',
]);

export async function preview({ site, payload = {}, wpAuto }) {
  const { auditId, issueType, urls: requestedUrls } = payload;
  const audit = auditId ? await prisma.siteAudit.findUnique({
    where: { id: auditId },
    select: { issues: true },
  }) : null;

  // Site-wide: WP Settings → Reading checkbox.
  if (issueType === 'audit.issues.wpSearchEngineDiscouraged') {
    if (wpAuto) return { suggestions: [{ siteWide: true }], manualOutputs: null, usage: null };
    return {
      manualOutputs: [wpAdminStepOutput({
        title: 'Enable search engine visibility',
        why: 'WordPress\'s "Discourage search engines" setting blocks Google and Bing from indexing your entire site.',
        instructions: 'Open WP admin and uncheck the discourage flag — without this no other SEO fix matters.',
        steps: [
          { text: 'Log in to WP admin → Settings → Reading.' },
          { text: 'Find the "Search engine visibility" section.' },
          { text: 'UNCHECK the box "Discourage search engines from indexing this site".' },
          { text: 'Click Save Changes.' },
        ],
      })],
      usage: null,
    };
  }

  // Per-page: noindex / nofollow.
  const issues = (audit?.issues || []).filter((i) => i.message === issueType);
  const issueUrls = [...new Set(issues.map((i) => i.url).filter(Boolean))];
  const targetUrls = (Array.isArray(requestedUrls) && requestedUrls.length ? requestedUrls : issueUrls)
    .filter((u) => !isArchiveUrl(u));

  if (targetUrls.length === 0) {
    return wpAuto ? { suggestions: [], usage: null } : { manualOutputs: [], usage: null };
  }

  if (wpAuto) {
    return {
      suggestions: targetUrls.map((url) => ({
        url,
        removeNoindex: issueType === 'audit.issues.metaRobotsNoindex',
        removeNofollow: issueType === 'audit.issues.metaRobotsNofollow',
      })),
      usage: null,
    };
  }

  const flag = issueType === 'audit.issues.metaRobotsNoindex' ? 'noindex' : 'nofollow';
  const manualOutputs = targetUrls.map((url) => wpAdminStepOutput({
    title: `Remove ${flag} from ${shortPath(url)}`,
    why: `${flag === 'noindex'
      ? 'noindex tells Google not to show this page in search results — usually unintentional and a major traffic blocker.'
      : 'nofollow tells search engines not to pass any link equity through this page\'s links.'}`,
    instructions: `Edit the page in your CMS and remove the ${flag} flag.`,
    steps: [
      { text: `Open [${shortPath(url)}](${url}) in your CMS editor.` },
      { text: 'Look for the SEO panel (Yoast SEO, Rank Math, or your theme\'s built-in SEO box).' },
      { text: `Find the "Robots Meta" or "Advanced" section.`, note: 'In Yoast it\'s under the "Advanced" tab; in Rank Math under "Advanced" → "Robots Meta".' },
      { text: `Uncheck "${flag}" (or set "Allow search engines to show this page" / "Allow this page to follow links").` },
      { text: 'Save the page.' },
      { text: 'Re-run the audit to verify.', note: 'The fix may take a few minutes to reflect after caching clears.' },
    ],
  }));

  return { manualOutputs, usage: null };
}

export async function apply({ site, payload = {}, audit }) {
  const fixes = Array.isArray(payload.fixes) ? payload.fixes : [];
  const fixSiteWide = !!payload.fixSiteWide;

  const results = [];
  let siteWideFixed = false;

  if (fixSiteWide) {
    try {
      await setSearchEngineVisibility(site, false);
      siteWideFixed = true;
      results.push({ siteWide: true, pushed: true });
    } catch (e) {
      results.push({ siteWide: true, pushed: false, pushError: e.message });
    }
  }

  for (const fix of fixes) {
    const { url, removeNoindex, removeNofollow } = fix;
    if (!url) {
      results.push({ url, pushed: false, pushError: 'missing url' });
      continue;
    }
    if (isArchiveUrl(url)) {
      results.push({ url, pushed: false, pushError: 'archive/taxonomy pages cannot be updated', skipped: true });
      continue;
    }

    const seoData = {};
    if (removeNoindex) seoData.noIndex = false;
    if (removeNofollow) seoData.noFollow = false;
    if (Object.keys(seoData).length === 0) {
      results.push({ url, pushed: false, pushError: 'no flags to remove' });
      continue;
    }

    try {
      const postId = await resolvePostIdFromUrl(site, url);
      if (!postId) {
        // Last-ditch: ask plugin directly for endpointMissing detection.
        const resolved = await resolveUrl(site, url);
        if (resolved?.endpointMissing) {
          results.push({ url, pushed: false, pushError: 'Plugin update required' });
          continue;
        }
        throw new Error(`Could not resolve WordPress post ID for ${url}`);
      }
      await updateSeoData(site, postId, seoData);
      results.push({ url, pushed: true });
    } catch (e) {
      results.push({ url, pushed: false, pushError: e.message });
    }
  }

  const successful = results.filter((r) => r.pushed && r.url);
  const auditUpdated = (audit?.id && (successful.length > 0 || siteWideFixed))
    ? await applyNoindexAuditUpdate(audit.id, successful, fixes, siteWideFixed, site.id)
    : false;

  return { results, auditUpdated };
}

async function applyNoindexAuditUpdate(auditId, successful, fixes, siteWideFixed, siteId) {
  const fixedUrls = new Set(successful.map((f) => f.url));
  const fixMap = new Map((fixes || []).map((f) => [f.url, f]));

  return updateAuditWithRetry(auditId, (a) => {
    const updatedIssues = (a.issues || []).map((issue) => {
      if (siteWideFixed && issue.message === 'audit.issues.wpSearchEngineDiscouraged') {
        return {
          ...issue, severity: 'passed', message: 'audit.issues.wpSearchEngineVisible',
          suggestion: null, details: 'Site-wide visibility re-enabled via plugin',
        };
      }
      if (siteWideFixed && issue.message === 'audit.issues.metaRobotsNoindex') {
        return {
          ...issue, severity: 'info',
          details: (issue.details || '') + ' (site-wide setting was fixed - re-run audit to verify)',
        };
      }
      if (!issue.url || !fixedUrls.has(issue.url)) return issue;
      const fix = fixMap.get(issue.url);
      if (issue.message === 'audit.issues.metaRobotsNoindex' && fix?.removeNoindex) {
        return { ...issue, severity: 'passed', message: 'audit.issues.metaRobotsGood',
                 suggestion: null, details: 'noindex removed via plugin' };
      }
      if (issue.message === 'audit.issues.metaRobotsNofollow' && fix?.removeNofollow) {
        return { ...issue, severity: 'passed', message: 'audit.issues.metaRobotsGood',
                 suggestion: null, details: 'nofollow removed via plugin' };
      }
      return issue;
    });

    const updatedPageResults = (a.pageResults || []).map((pr) => {
      if (!fixedUrls.has(pr.url)) return pr;
      const fix = fixMap.get(pr.url);
      if (fix?.removeNoindex || fix?.removeNofollow) return { ...pr, robotsMeta: null };
      return pr;
    });

    return { issues: updatedIssues, pageResults: updatedPageResults };
  }, { invalidateSiteId: siteId, fields: ['issues', 'pageResults'] });
}

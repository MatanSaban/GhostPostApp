/**
 * Canonical Tag Fix Handler
 *
 * Issue handled: audit.issues.noCanonical
 *
 * Per-page snippet output. We could in principle push a `canonical` value
 * via the WP plugin's SEO endpoint (Yoast/Rank Math support a per-post
 * canonical override), but in practice a missing canonical usually means
 * the theme isn't rendering one at all - fixing that is a header.php /
 * theme-template change, not a per-post field.
 *
 * Apply is a no-op. The user pastes the rel=canonical tag (or installs an
 * SEO plugin that emits one automatically).
 */

import { snippet as snippetOutput } from '@/lib/audit/fix-manual-output';
import prisma from '@/lib/prisma';
import { shortPath } from './_shared';

export async function preview({ payload = {}, wpAuto: _wpAuto }) {
  const { auditId, urls: requestedUrls } = payload;
  const audit = auditId ? await prisma.siteAudit.findUnique({
    where: { id: auditId },
    select: { issues: true },
  }) : null;

  const issues = (audit?.issues || []).filter((i) => i.message === 'audit.issues.noCanonical');
  const issueUrls = [...new Set(issues.map((i) => i.url).filter(Boolean))];
  const targetUrls = (Array.isArray(requestedUrls) && requestedUrls.length ? requestedUrls : issueUrls);

  if (targetUrls.length === 0) {
    return { manualOutputs: [], usage: null };
  }

  const manualOutputs = targetUrls.map((url) => snippetOutput({
    title: `Canonical tag for ${shortPath(url)}`,
    why: 'A canonical tag tells search engines which URL is the "real" one when multiple URLs serve similar content (e.g. with/without trailing slash, with tracking params). Missing canonicals can cause duplicate-content dilution.',
    instructions: `Paste this inside the \`<head>\` of [${shortPath(url)}](${url}). Easiest fix sitewide: install **Yoast SEO** or **Rank Math** - both emit canonicals automatically based on the permalink. If you want to keep things manual, your theme's \`header.php\` should output \`<link rel="canonical" href="<?php the_permalink(); ?>" />\` for single posts.`,
    language: 'html',
    code: `<link rel="canonical" href="${url}" />`,
    where: 'inside <head>',
  }));

  return { manualOutputs, usage: null };
}

export async function apply({ payload = {} }) {
  const fixes = Array.isArray(payload.fixes) ? payload.fixes : [];
  return {
    results: fixes.map((f) => ({
      ...f,
      pushed: false,
      pushError: 'Canonical tags are best handled by an SEO plugin (Yoast/Rank Math) or in your theme template.',
    })),
    auditUpdated: false,
  };
}

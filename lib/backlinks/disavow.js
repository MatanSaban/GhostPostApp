/**
 * Helpers for the disavow flow.
 *
 * The relationship between DisavowEntry and Backlink.isDisavowed is
 * derived: an entry "covers" any backlink whose referringDomain matches
 * (DOMAIN scope) or whose referringUrl matches (URL scope). On any change
 * to the entry list, `recomputeIsDisavowedForSite` recomputes the boolean
 * across all rows for the site so deletes don't leave stale state when
 * multiple entries overlap.
 */

import prisma from '@/lib/prisma';

/** Build the prisma `where` for backlinks matching one entry. */
export function entryMatchWhere(siteId, scope, value) {
  if (scope === 'DOMAIN') {
    return { siteId, referringDomain: value };
  }
  if (scope === 'URL') {
    return { siteId, referringUrl: value };
  }
  throw new Error(`Unknown scope: ${scope}`);
}

/**
 * Recompute `isDisavowed` for every backlink belonging to a site. Single
 * source of truth: aggregate the current entry list, then flip each row to
 * match. Cheap because we touch one site at a time.
 */
export async function recomputeIsDisavowedForSite(siteId) {
  const entries = await prisma.disavowEntry.findMany({
    where: { siteId },
    select: { scope: true, value: true },
  });

  const domainSet = new Set(entries.filter(e => e.scope === 'DOMAIN').map(e => e.value));
  const urlSet = new Set(entries.filter(e => e.scope === 'URL').map(e => e.value));

  // Two scoped updates beat a per-row branching loop on MongoDB.
  const orClauses = [];
  if (domainSet.size > 0) orClauses.push({ referringDomain: { in: Array.from(domainSet) } });
  if (urlSet.size > 0) orClauses.push({ referringUrl: { in: Array.from(urlSet) } });

  if (orClauses.length === 0) {
    // No entries left: clear all flags for this site in one go.
    await prisma.backlink.updateMany({
      where: { siteId, isDisavowed: true },
      data: { isDisavowed: false },
    });
    return;
  }

  await prisma.$transaction([
    prisma.backlink.updateMany({
      where: { siteId, OR: orClauses },
      data: { isDisavowed: true },
    }),
    prisma.backlink.updateMany({
      where: { siteId, isDisavowed: true, NOT: { OR: orClauses } },
      data: { isDisavowed: false },
    }),
  ]);
}

/**
 * Render the disavow.txt body in Google's expected format.
 * Domain entries are emitted as `domain:<value>`; URL entries as the bare URL.
 * https://support.google.com/webmasters/answer/2648487
 */
export function renderDisavowTxt({ siteUrl, entries }) {
  const generatedAt = new Date().toISOString().slice(0, 10);
  const lines = [
    `# Disavow file for ${siteUrl} - generated ${generatedAt}`,
    '# See: https://search.google.com/search-console/disavow-links',
  ];

  const domains = entries.filter(e => e.scope === 'DOMAIN');
  const urls = entries.filter(e => e.scope === 'URL');

  if (domains.length > 0) {
    lines.push('');
    for (const e of domains) {
      if (e.reason) lines.push(`# ${e.reason.replaceAll('\n', ' ')}`);
      lines.push(`domain:${e.value}`);
    }
  }

  if (urls.length > 0) {
    lines.push('');
    for (const e of urls) {
      if (e.reason) lines.push(`# ${e.reason.replaceAll('\n', ' ')}`);
      lines.push(e.value);
    }
  }

  return lines.join('\n') + '\n';
}

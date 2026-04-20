/**
 * Central tag builders for Vercel Data Cache (`unstable_cache`) + `revalidateTag`.
 *
 * Hierarchy (broad → narrow):
 *
 *   account:{accountId}                  ← nukes everything for the account
 *     site:{siteId}                      ← nukes everything for the site
 *       site:{siteId}:metadata
 *       site:{siteId}:audit
 *       site:{siteId}:keywords
 *       site:{siteId}:competitors
 *       site:{siteId}:agent-insights
 *       site:{siteId}:ai-traffic
 *
 * Rules:
 *   1. Every cached entry lists its narrow tag AND every broader ancestor tag.
 *      This lets a broad `revalidateTag('account:X')` cascade downward.
 *   2. Tag strings are produced only by this module — never hand-typed in routes.
 *   3. Cache keys (the 2nd arg to `unstable_cache`) must include the scoping IDs
 *      as discrete array elements; tags are for invalidation only.
 */

export const tagFor = {
  account: (accountId) => `account:${accountId}`,
  site: (siteId) => `site:${siteId}`,
  siteMetadata: (siteId) => `site:${siteId}:metadata`,
  siteAudit: (siteId) => `site:${siteId}:audit`,
  siteKeywords: (siteId) => `site:${siteId}:keywords`,
  siteCompetitors: (siteId) => `site:${siteId}:competitors`,
  siteAgentInsights: (siteId) => `site:${siteId}:agent-insights`,
  siteAiTraffic: (siteId) => `site:${siteId}:ai-traffic`,
};

/**
 * Build the full tag list for a cached entry — narrow tag first, then every
 * broader ancestor. Callers pass this directly to `unstable_cache`'s `tags`.
 */
export function tagsFor(kind, { siteId, accountId }) {
  const tags = [];

  switch (kind) {
    case 'siteMetadata':
      if (!siteId || !accountId) throw new Error('tagsFor(siteMetadata) requires siteId + accountId');
      tags.push(tagFor.siteMetadata(siteId), tagFor.site(siteId), tagFor.account(accountId));
      break;
    case 'siteAudit':
      if (!siteId || !accountId) throw new Error('tagsFor(siteAudit) requires siteId + accountId');
      tags.push(tagFor.siteAudit(siteId), tagFor.site(siteId), tagFor.account(accountId));
      break;
    case 'siteKeywords':
      if (!siteId || !accountId) throw new Error('tagsFor(siteKeywords) requires siteId + accountId');
      tags.push(tagFor.siteKeywords(siteId), tagFor.site(siteId), tagFor.account(accountId));
      break;
    case 'siteCompetitors':
      if (!siteId || !accountId) throw new Error('tagsFor(siteCompetitors) requires siteId + accountId');
      tags.push(tagFor.siteCompetitors(siteId), tagFor.site(siteId), tagFor.account(accountId));
      break;
    case 'siteAgentInsights':
      if (!siteId || !accountId) throw new Error('tagsFor(siteAgentInsights) requires siteId + accountId');
      tags.push(tagFor.siteAgentInsights(siteId), tagFor.site(siteId), tagFor.account(accountId));
      break;
    case 'siteAiTraffic':
      if (!siteId || !accountId) throw new Error('tagsFor(siteAiTraffic) requires siteId + accountId');
      tags.push(tagFor.siteAiTraffic(siteId), tagFor.site(siteId), tagFor.account(accountId));
      break;
    default:
      throw new Error(`tagsFor: unknown kind "${kind}"`);
  }

  return tags;
}

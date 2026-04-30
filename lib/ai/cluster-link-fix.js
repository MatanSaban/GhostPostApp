/**
 * Cluster Link-Gap Fix
 *
 * Generates a surgical AI edit that inserts a single internal link from a source
 * page to a target page. Returns a {searchText, replaceText} pair so the caller
 * can apply the change with a verbatim string replace — safer than asking AI
 * for the full updated HTML.
 *
 * Used by POST /api/clusters/[id]/health/fix-link-gap, which then pushes the
 * change to WordPress via the plugin.
 */

import { z } from 'zod';
import { generateStructuredResponse } from '@/lib/ai/gemini';

const LinkGapFixSchema = z.object({
  searchText: z
    .string()
    .min(20)
    .describe(
      'A short distinct passage from the source content that will be modified. Must appear VERBATIM in the source HTML — same whitespace, same tags, same characters.',
    ),
  replaceText: z
    .string()
    .min(20)
    .describe(
      'searchText with a single <a href="..."> tag inserted naturally inline. Must equal searchText with ONLY the new <a> tag added — no other edits.',
    ),
  anchor: z.string().describe('The anchor text used inside the <a> tag (2–6 natural words).'),
  rationale: z.string().optional().describe('Brief reason this insertion point fits.'),
});

const SOURCE_CHARS = 8000;

// Anchor-text guidance varies by gap type — see Phase 4 plan.
// PARENT links should use the pillar's main keyword (strong signal).
// ANCESTOR links use a soft contextual phrase (we don't want every leaf to
// over-anchor on the root keyword and dilute the parent relationship).
// BRAND links use the brand name or homepage keyword (it's a brand mention).
// SIBLING / unspecified falls back to natural phrasing tied to the target.
const ANCHOR_GUIDANCE = {
  PARENT:
    'Use the target page\'s focus keyword (or a close variant) as the anchor — this is the strongest pillar signal.',
  ANCESTOR:
    'Use a soft, contextual phrase that references the broader topic. Avoid the exact root keyword if it would feel forced — natural reads beat keyword-stuffing for ancestor links.',
  BRAND:
    'Use the brand name or homepage focus keyword as the anchor. This is a brand mention, not a topical link.',
  SIBLING:
    'Use the target page\'s title or a related natural phrase. This is a "see also" cross-link.',
};

/**
 * Ask the model for a {searchText, replaceText} pair that adds an internal
 * link from a source page to a target page.
 *
 * @param {Object} params
 * @param {'PARENT'|'ANCESTOR'|'BRAND'|'SIBLING'} [params.gapType] - When provided,
 *   tunes the anchor-text guidance the model receives. Falls back to neutral
 *   "see also" phrasing when omitted.
 * @returns {Promise<{ searchText, replaceText, anchor, rationale? } | null>}
 */
export async function generateLinkGapFix({
  sourceTitle,
  sourceContent,
  targetTitle,
  targetUrl,
  targetKeyword,
  gapType = null,
  accountId,
  userId,
  siteId,
}) {
  if (!sourceContent || !targetUrl || !targetTitle) return null;
  // Trim aggressively — model doesn't need 50KB of HTML to find a sentence.
  const trimmed = sourceContent.slice(0, SOURCE_CHARS);
  const anchorGuidance = ANCHOR_GUIDANCE[gapType] || ANCHOR_GUIDANCE.SIBLING;

  return generateStructuredResponse({
    system:
      'You are an SEO content editor. You add internal links between related pages with light-touch, natural insertions. You never restructure or paraphrase the source — your edits are surgical.',
    prompt: `Source page title: "${sourceTitle}"
Source content (HTML, possibly truncated):
${trimmed}

Target page title: "${targetTitle}"
Target page URL: ${targetUrl}
${targetKeyword ? `Target focus keyword: "${targetKeyword}"\n` : ''}${gapType ? `Link relationship: ${gapType}\n` : ''}

Find ONE good place in the source content to add an internal link to the target page. Return:

- searchText: a short, distinct passage from the source — copied VERBATIM (same whitespace, same characters, same tags). Pick something that is unlikely to appear twice in the document. 30–200 characters is ideal.
- replaceText: searchText with EXACTLY ONE <a href="${targetUrl}">{anchor}</a> tag added inline at a natural spot. No other changes. Same whitespace and surrounding text.
- anchor: the anchor text used inside the <a> tag — 2 to 6 natural English/Hebrew words that fit in context. Never "click here" or "read more". ${anchorGuidance}
- rationale: one short sentence on why this insertion point fits.

Hard constraints:
- searchText must appear EXACTLY in the source content as given. If you cannot find a verbatim 30+ character passage, return your best attempt anyway — the caller will validate.
- replaceText must equal searchText with only the <a href="${targetUrl}">{anchor}</a> tag inserted. No other edits, no paraphrasing.
- Do not duplicate links: if the source already links to ${targetUrl}, pick a passage in a DIFFERENT section.
- Anchor text must be relevant to the target page's topic.`,
    schema: LinkGapFixSchema,
    operation: 'CLUSTER_LINK_FIX',
    accountId,
    userId,
    siteId,
    metadata: { context: 'cluster-link-gap-fix', targetUrl, gapType },
  });
}

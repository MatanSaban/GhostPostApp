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

/**
 * Ask the model for a {searchText, replaceText} pair that adds an internal
 * link from a source page to a target page.
 *
 * @returns {Promise<{ searchText, replaceText, anchor, rationale? } | null>}
 */
export async function generateLinkGapFix({
  sourceTitle,
  sourceContent,
  targetTitle,
  targetUrl,
  targetKeyword,
  accountId,
  userId,
  siteId,
}) {
  if (!sourceContent || !targetUrl || !targetTitle) return null;
  // Trim aggressively — model doesn't need 50KB of HTML to find a sentence.
  const trimmed = sourceContent.slice(0, SOURCE_CHARS);

  return generateStructuredResponse({
    system:
      'You are an SEO content editor. You add internal links between related pages with light-touch, natural insertions. You never restructure or paraphrase the source — your edits are surgical.',
    prompt: `Source page title: "${sourceTitle}"
Source content (HTML, possibly truncated):
${trimmed}

Target page title: "${targetTitle}"
Target page URL: ${targetUrl}
${targetKeyword ? `Target focus keyword: "${targetKeyword}"\n` : ''}

Find ONE good place in the source content to add an internal link to the target page. Return:

- searchText: a short, distinct passage from the source — copied VERBATIM (same whitespace, same characters, same tags). Pick something that is unlikely to appear twice in the document. 30–200 characters is ideal.
- replaceText: searchText with EXACTLY ONE <a href="${targetUrl}">{anchor}</a> tag added inline at a natural spot. No other changes. Same whitespace and surrounding text.
- anchor: the anchor text used inside the <a> tag — 2 to 6 natural English/Hebrew words that fit in context. Never "click here" or "read more".
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
    metadata: { context: 'cluster-link-gap-fix', targetUrl },
  });
}

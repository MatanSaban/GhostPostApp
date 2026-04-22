/**
 * Shopify entity sync orchestrator
 *
 * Mirrors the WordPress `syncAllEntities(site, onProgress)` shape so the
 * /api/entities/populate route can call it without branching. Walks all
 * supported post types (page, product, article) page-by-page and collects
 * everything into a single result, plus menus + taxonomies.
 */

import { getPostTypes, getPosts } from './content';
import { getMenus } from './menus';
import { getTaxonomies, getTaxonomyTerms } from './taxonomy';
import { getSiteInfo } from './shop-info';

const PER_PAGE = 100;
const MAX_PAGES = 50; // safety cap

async function fetchAllForType(site, postType) {
  const items = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const res = await getPosts(site, postType.slug, page, PER_PAGE);
    if (!res?.items?.length) break;
    items.push(...res.items);
    if (res.items.length < PER_PAGE) break;
    if (res.pages && page >= res.pages) break;
  }
  return items;
}

export async function syncAllEntities(site, onProgress = null) {
  const result = {
    postTypes: [],
    entities: [],
    menus: [],
    taxonomies: [],
    errors: [],
  };

  try {
    if (onProgress) onProgress('Fetching shop info...', 5);
    try {
      result.siteInfo = await getSiteInfo(site);
    } catch (e) {
      result.errors.push({ type: 'site_info', error: e.message });
    }

    const postTypes = await getPostTypes(site);
    result.postTypes = postTypes;

    const totalTypes = postTypes.length || 1;
    let processed = 0;
    for (const postType of postTypes) {
      const pct = 10 + Math.floor((processed / totalTypes) * 60);
      if (onProgress) onProgress(`Syncing ${postType.name}...`, pct);
      try {
        const items = await fetchAllForType(site, postType);
        // Tag with post type for downstream consumers that flatten.
        for (const it of items) it.postType = postType.slug;
        result.entities.push(...items);
      } catch (error) {
        result.errors.push({
          type: 'post_type',
          slug: postType.slug,
          error: error.message,
        });
      }
      processed += 1;
    }

    if (onProgress) onProgress('Syncing menus...', 75);
    try {
      const menus = await getMenus(site);
      result.menus = menus.items || [];
    } catch (error) {
      result.errors.push({ type: 'menus', error: error.message });
    }

    if (onProgress) onProgress('Syncing taxonomies...', 85);
    try {
      const taxonomies = await getTaxonomies(site);
      result.taxonomies = taxonomies;
      // Optionally pull terms for each — keep it light: top page only.
      for (const tax of taxonomies) {
        try {
          const terms = await getTaxonomyTerms(site, tax.slug, 1, PER_PAGE);
          tax.terms = terms.items || [];
        } catch (err) {
          tax.terms = [];
          result.errors.push({ type: 'tax_terms', slug: tax.slug, error: err.message });
        }
      }
    } catch (error) {
      result.errors.push({ type: 'taxonomies', error: error.message });
    }

    if (onProgress) onProgress('Sync complete!', 100);
  } catch (error) {
    result.errors.push({ type: 'general', error: error.message });
  }

  return result;
}

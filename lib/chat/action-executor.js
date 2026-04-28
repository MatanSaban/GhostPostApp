/**
 * Chat Action Executor
 * 
 * Executes approved chat actions against WordPress sites and the platform.
 * Captures rollback snapshots before every write operation.
 * 
 * Flow: snapshot original → execute write → record result
 */

import prisma from '@/lib/prisma';
import * as wpApi from '@/lib/wp-api-client';
import { BOT_FETCH_HEADERS } from '@/lib/bot-identity';
import { runSiteAudit } from '@/lib/audit/site-auditor';
import { runSiteAnalysis } from '@/lib/agent-analysis';
import { batchGetSearchVolume, isGoogleAdsConfigured, getLanguageId } from '@/lib/google-ads';
import { scrapeCompetitorPage, extractDomain, getFaviconUrl } from '@/lib/competitor-scraper';
import { invalidateCompetitors } from '@/lib/cache/invalidate.js';
import { enforceCompetitorCapacity } from '@/lib/account-limits';
import { resolveLocatorWithAI } from './element-locator-ai';
import { generateImage } from '@/lib/ai/gemini';

// ─── Read-Only Tool Handlers ─────────────────────────────────────────

/**
 * Execute a read-only (analysis) tool immediately.
 * These don't require approval and return results directly.
 */
export async function executeReadOnlyTool(toolName, args, { site, siteId, accountId }) {
  switch (toolName) {
    case 'analyze_page': {
      const targetUrl = args.url || site?.url;
      if (!targetUrl) return { error: 'No URL provided and no site URL available' };

      // For WordPress sites - try via plugin API first for post metadata,
      // but always fetch live HTML for accurate heading analysis
      const isWordPress = site?.platform?.toLowerCase() === 'wordpress' && site?.siteKey;
      let wpPostData = null;
      if (isWordPress) {
        try {
          const post = await resolveAndGetPost(site, targetUrl);
          if (post) wpPostData = formatPostAnalysis(post);
        } catch (e) {
          // WP API failed - fall through to HTTP fetch
        }
      }

      // Always fetch live HTML for accurate heading/page analysis
      const liveAnalysis = await fetchAndAnalyzePage(targetUrl);

      // If we have WP post data, merge it with live analysis
      // Live HTML headings are authoritative (they reflect theme + builder output)
      if (wpPostData && !liveAnalysis.error) {
        return {
          ...wpPostData,
          // Override headings with live page data (WP API only sees post_content, not theme H1s)
          headings: liveAnalysis.headings,
          h1Count: liveAnalysis.h1Count,
          // Merge additional live-page-only fields
          metaDescription: liveAnalysis.metaDescription || wpPostData.seo?.description,
          metaDescriptionLength: liveAnalysis.metaDescriptionLength,
          canonical: liveAnalysis.canonical,
          robots: liveAnalysis.robots,
          og: liveAnalysis.og,
          structuredData: liveAnalysis.structuredData,
          hreflangs: liveAnalysis.hreflangs,
          hasViewport: liveAnalysis.hasViewport,
          totalImages: liveAnalysis.totalImages,
          totalInternalLinks: liveAnalysis.totalInternalLinks,
          totalExternalLinks: liveAnalysis.totalExternalLinks,
          externalLinks: liveAnalysis.externalLinks,
        };
      }

      // WP data available but live fetch failed - return WP data with caveat
      if (wpPostData) {
        return { ...wpPostData, _note: 'Headings extracted from post content only; live page fetch failed so theme-injected headings may be missing.' };
      }

      return liveAnalysis;
    }

    case 'request_element_placement': {
      // Signal to the UI (via the assistant message stream) that the live preview
      // panel should open and the inspector should be enabled. The UI reads the
      // awaiting_placement + pagePath fields from the tool result and opens the
      // iframe; the model must then stop and wait for the user's reply.
      const pagePath = args.pagePath || '/';
      return {
        awaiting_placement: true,
        elementType: args.elementType || 'element',
        pagePath,
        guidance: args.guidance || 'Click where you want the element placed in the preview, or describe the location in words. Both work.',
        _ui_action: 'open_preview_for_placement',
      };
    }

    case 'get_site_audit_results': {
      const device = args.device || 'desktop';
      const audit = await prisma.siteAudit.findFirst({
        where: { siteId, deviceType: device, status: 'COMPLETED' },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, score: true, categoryScores: true, deviceType: true,
          createdAt: true, summary: true,
          issues: { take: 20 },
        },
      });
      if (!audit) return { message: 'No completed audit found. Suggest running a new site audit.', link: `/dashboard/site-audit?siteId=${siteId}` };
      return {
        ...audit,
        link: `/dashboard/site-audit?siteId=${siteId}`,
        issueCount: audit.issues?.length || 0,
      };
    }

    case 'get_agent_insights': {
      const where = { siteId };
      if (args.category) where.category = args.category;
      if (args.status) where.status = args.status;
      const insights = await prisma.agentInsight.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: args.limit || 10,
        select: {
          id: true, category: true, type: true, priority: true, status: true,
          titleKey: true, descriptionKey: true, data: true, actionType: true,
          createdAt: true,
        },
      });
      return {
        insights,
        totalCount: await prisma.agentInsight.count({ where }),
        link: `/dashboard/agent?siteId=${siteId}`,
      };
    }

    case 'get_keywords': {
      const gscCache = await prisma.gscKeywordCache.findFirst({
        where: { siteId },
        orderBy: { fetchedAt: 'desc' },
      });
      if (!gscCache?.data) return { message: 'No keyword data available. Google Search Console may not be connected.', link: `/dashboard/strategy/keywords?siteId=${siteId}` };
      let keywords = Array.isArray(gscCache.data) ? gscCache.data : [];
      if (args.query) {
        const q = args.query.toLowerCase();
        keywords = keywords.filter(k => k.query?.toLowerCase().includes(q));
      }
      if (args.sortBy) {
        keywords.sort((a, b) => (b[args.sortBy] || 0) - (a[args.sortBy] || 0));
      }
      return {
        keywords: keywords.slice(0, args.limit || 20),
        totalCount: keywords.length,
        link: `/dashboard/strategy/keywords?siteId=${siteId}`,
      };
    }

    case 'get_content_entities': {
      // Only surface entities whose type is currently enabled - disabled types must be
      // invisible to chat tooling, matching the Entities page selection.
      const entityWhere = { siteId, entityType: { isEnabled: true } };
      if (args.type) {
        const et = await prisma.siteEntityType.findFirst({ where: { siteId, slug: args.type } });
        if (et) entityWhere.entityTypeId = et.id;
      }
      if (args.query) {
        entityWhere.OR = [
          { title: { contains: args.query, mode: 'insensitive' } },
          { url: { contains: args.query, mode: 'insensitive' } },
        ];
      }
      const entities = await prisma.siteEntity.findMany({
        where: entityWhere,
        orderBy: { updatedAt: 'desc' },
        take: args.limit || 20,
        select: {
          id: true, title: true, url: true, externalId: true, status: true,
          entityType: { select: { name: true, slug: true } },
        },
      });
      return {
        entities,
        totalCount: await prisma.siteEntity.count({ where: entityWhere }),
        link: `/dashboard/entities?siteId=${siteId}`,
      };
    }

    case 'get_competitors': {
      const competitors = await prisma.competitor.findMany({
        where: { siteId },
        take: args.limit || 10,
        select: { id: true, name: true, url: true, domain: true, wordCount: true, h1Count: true, lastScannedAt: true, aiSummary: true },
      });
      return {
        competitors,
        link: `/dashboard/strategy/competitors?siteId=${siteId}`,
      };
    }

    case 'get_backlinks': {
      const filter = args.filter || 'available';
      const limit = args.limit || 10;
      if (filter === 'myListings') {
        const listings = await prisma.backlinkListing.findMany({
          where: { publisherAccountId: accountId, isActive: true },
          take: limit,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true, domain: true, title: true, price: true, currency: true,
            domainAuthority: true, domainRating: true, monthlyTraffic: true,
            status: true, soldCount: true, category: true,
          },
        });
        return { listings, filter, link: `/dashboard/backlinks?tab=my-listings` };
      }
      if (filter === 'purchased') {
        const purchases = await prisma.backlinkPurchase.findMany({
          where: { buyerAccountId: accountId },
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: {
            listing: {
              select: { domain: true, title: true, domainAuthority: true, category: true },
            },
          },
        });
        return { purchases, filter, link: `/dashboard/backlinks?tab=purchased` };
      }
      // available (marketplace)
      const where = { status: 'ACTIVE', isActive: true };
      if (args.minDA) where.domainAuthority = { gte: args.minDA };
      if (args.maxPrice) where.price = { lte: args.maxPrice };
      if (args.category) where.category = { contains: args.category, mode: 'insensitive' };
      const listings = await prisma.backlinkListing.findMany({
        where,
        take: limit,
        orderBy: { domainAuthority: 'desc' },
        select: {
          id: true, domain: true, websiteName: true, title: true, description: true,
          price: true, currency: true, domainAuthority: true, domainRating: true,
          monthlyTraffic: true, category: true, linkType: true, language: true,
        },
      });
      return { listings, filter, link: `/dashboard/backlinks` };
    }

    // WordPress read-only tools
    case 'wp_get_site_info':
      return await wpApi.getSiteInfo(site);

    case 'wp_get_post': {
      if (args.url) {
        return await resolveAndGetPost(site, args.url);
      }
      const postType = args.postType || 'posts';
      return await wpApi.getPost(site, postType, args.postId);
    }

    case 'wp_search_posts': {
      const postType = args.postType || 'posts';
      const result = await wpApi.getPosts(site, postType, 1, args.limit || 10);
      // Filter by query (WP API may not support search param via our client)
      if (args.query && result?.data) {
        const q = args.query.toLowerCase();
        result.data = result.data.filter(p =>
          p.title?.rendered?.toLowerCase().includes(q) ||
          p.slug?.toLowerCase().includes(q)
        );
      }
      return result;
    }

    case 'wp_get_seo_data':
      return await wpApi.getSeoData(site, args.postId);

    case 'wp_get_redirects':
      return await wpApi.getRedirects(site);

    case 'wp_get_menus':
      return await wpApi.getMenus(site);

    case 'wp_get_media':
      return await wpApi.getMedia(site, { perPage: args.limit || 20 });

    case 'wp_get_taxonomies':
      return await wpApi.getTaxonomies(site);

    case 'wp_list_terms':
      return await wpApi.listTerms(site, args.taxonomy, { search: args.search, limit: args.limit });

    case 'wp_list_comments':
      return await wpApi.listComments(site, { status: args.status, postId: args.postId, limit: args.limit });

    case 'wp_get_options':
      return await wpApi.getOptions(site);

    case 'get_element_structure': {
      if (!args.postId) return { error: 'postId is required' };
      try {
        return await wpApi.getElementStructure(site, args.postId);
      } catch (err) {
        return { error: `Failed to fetch element structure: ${err.message}` };
      }
    }

    default:
      return { error: `Unknown read-only tool: ${toolName}` };
  }
}

// ─── Write Tool Execution (with rollback snapshots) ──────────────────

/**
 * Execute a single write action from an approved ChatAction.
 * Captures the original state before modifying, for rollback.
 * 
 * @returns {{ success: boolean, result: any, rollback: object }}
 */
export async function executeWriteAction(action, { site, siteId, accountId, userId }) {
  const { tool, args } = action;
  let originalValue = null;
  let result = null;

  switch (tool) {
    case 'wp_create_post': {
      const postType = args.postType || 'posts';
      const data = {
        title: args.title,
        content: args.content || '',
        excerpt: args.excerpt || '',
        status: args.status || 'draft',
      };
      if (args.slug) data.slug = args.slug;
      if (args.date) data.date = args.date;
      if (args.categories) data.categories = args.categories;
      if (args.tags) data.tags = args.tags;

      // If a featured image URL was provided, upload it first and pass the
      // resulting media ID through as `featured_image` so wp_insert_post +
      // set_post_thumbnail happen in one round-trip on the plugin side.
      if (args.featured_image_url) {
        try {
          const uploaded = await wpApi.uploadMediaFromUrl(site, args.featured_image_url, {
            title: args.title,
            alt: args.title,
          });
          if (uploaded?.id) data.featured_image = uploaded.id;
        } catch (mediaErr) {
          console.warn('[wp_create_post] Featured image upload failed:', mediaErr.message);
        }
      }

      const created = await wpApi.createPost(site, postType, data);
      result = created;
      originalValue = { created: true, postId: created?.id, postType };

      // Route SEO meta to Yoast/RankMath in a second step - the plugin's
      // create_item doesn't touch SEO plugins. Swallow errors so a failed
      // SEO write doesn't mark the whole post-create as failed.
      if (created?.id && args.seo && (args.seo.title || args.seo.description || args.seo.focus_keyword)) {
        try {
          await wpApi.updateSeoData(site, created.id, {
            title: args.seo.title,
            description: args.seo.description,
            focusKeyword: args.seo.focus_keyword,
          });
        } catch (seoErr) {
          console.warn('[wp_create_post] SEO meta write failed:', seoErr.message);
        }
      }
      break;
    }

    case 'wp_update_post': {
      // Snapshot current state
      const postType = args.postType || 'posts';
      const current = await wpApi.getPost(site, postType, args.postId);
      originalValue = {
        title: current?.title?.rendered || current?.title,
        content: current?.content?.rendered || current?.content,
        slug: current?.slug,
        status: current?.status,
        excerpt: current?.excerpt?.rendered || current?.excerpt,
      };
      // Execute update
      result = await wpApi.updatePost(site, postType, args.postId, args.data);

      // Verify H1 operations were actually applied by checking the WP API response
      if (args.data?.add_h1 && !result?.h1_update?.added?.length) {
        throw new Error(`H1 addition was not confirmed by the WordPress plugin. The page builder data may not be compatible, or the plugin may need an update.`);
      }
      // Catch the case where the plugin wrote the H1 into raw post_content on an
      // Elementor page - Elementor renders from _elementor_data, so the live page
      // will not show that H1 even though wp_update_post returned success. Force
      // the model to switch to manipulate_element with a widget_id locator.
      if (
        args.data?.add_h1
        && result?.h1_update?.fallback_invisible === true
      ) {
        throw new Error(
          `H1 was written to raw post_content but this page is built with Elementor - Elementor renders from _elementor_data and will not display H1s added to post_content. Retry with the manipulate_element tool using locator.kind="widget_id" and the Elementor id of the container you want to insert before (call get_element_structure first if you don't have an id).`
        );
      }
      if (args.data?.old_h1 && args.data?.new_h1 && !result?.h1_update?.updated?.length) {
        const found = result?.h1_update?.found_h1s;
        const hint = Array.isArray(found) && found.length > 0
          ? ` The plugin found these H1s on the page: ${found.map(h => `"${h}"`).join(', ')}. Retry with one of those as old_h1, or use manipulate_element with locator.kind="widget_id" for precise targeting.`
          : ` No H1 was detected on the page. If the H1 should exist, use add_h1 to insert one; if the page renders the post title as its H1, update the title field directly instead.`;
        throw new Error(`H1 replacement was not confirmed by the WordPress plugin. The existing H1 text "${args.data.old_h1}" did not match.${hint}`);
      }
      break;
    }

    case 'manipulate_element': {
      if (!args.postId) throw new Error('postId is required for manipulate_element');
      // Plugin rejects insert without a valid position. Default to 'before'
      // (the most common "add X near selected" intent) when the AI omits it.
      const VALID_INSERT_POSITIONS = ['before', 'after', 'inside_start', 'inside_end'];
      let position = args.position;
      if (args.operation === 'insert' && !VALID_INSERT_POSITIONS.includes(position)) {
        position = 'before';
      }
      // The plugin contract uses `target: { kind, value, tag, position }` -
      // the AI tool schema exposes a friendlier `locator: { kind, value, tag,
      // text, selector }` + separate top-level `position`. Remap here so the
      // AI doesn't need to know plugin internals and the plugin still sees
      // its expected shape (otherwise the plugin 400s with "insert requires
      // position …" because it reads $spec['target']['position']).
      const locator = args.locator || {};
      const target = { kind: locator.kind || '' };
      if (locator.kind === 'tag_text') {
        if (locator.tag) target.tag = locator.tag;
        target.value = locator.text != null ? String(locator.text) : (locator.value != null ? String(locator.value) : '');
      } else if (locator.kind === 'all_of_tag') {
        if (locator.tag) target.tag = locator.tag;
      } else if (locator.kind === 'selector') {
        target.value = locator.selector != null ? String(locator.selector) : (locator.value != null ? String(locator.value) : '');
      } else {
        if (locator.value != null) target.value = String(locator.value);
        if (locator.tag) target.tag = locator.tag;
      }
      if (position) target.position = position;

      // Plugin reads the new element payload from `spec.element` for BOTH
      // insert and update. The AI schema suggests a separate `mutation` field
      // for update - merge it into `element` so the update actually lands.
      let element = args.element;
      if (args.operation === 'update' && args.mutation && !element) {
        element = args.mutation;
      }

      const spec = {
        operation: args.operation,
        target,
        element,
      };
      if (args.dry_run) spec.dry_run = args.dry_run;

      let response;
      try {
        response = await wpApi.manipulateElement(site, args.postId, spec);
      } catch (err) {
        throw new Error(`Plugin rejected manipulate_element: ${err.message}`);
      }

      // Plugin couldn't match the locator → try an AI-assisted fallback using
      // the candidates list the plugin returns in diagnostic mode. The plugin
      // shape is { applied: false, reason: 'no_target_matched', candidates: [...] }.
      const locatorFailed = response && response.applied === false && response.reason === 'no_target_matched';
      if (locatorFailed && Array.isArray(response.candidates) && response.candidates.length) {
        const intent = buildLocatorIntent(spec);
        const pick = await resolveLocatorWithAI({
          intent,
          candidates: response.candidates,
          postTitle: response.post_title,
          accountId,
          userId,
          siteId,
        });
        if (pick?.widget_id) {
          const retryTarget = { kind: 'widget_id', value: pick.widget_id };
          if (spec.target?.position) retryTarget.position = spec.target.position;
          const retrySpec = { ...spec, target: retryTarget };
          try {
            response = await wpApi.manipulateElement(site, args.postId, retrySpec);
            if (response) response._ai_locator = { picked: pick.widget_id, confidence: pick.confidence, reason: pick.reason };
          } catch (err) {
            throw new Error(`Plugin rejected retried manipulate_element: ${err.message}`);
          }
        } else {
          throw new Error(`Could not locate the target element. ${pick?.reason || 'No candidate matched the description.'}`);
        }
      }

      if (!response) {
        throw new Error('manipulate_element returned no response');
      }
      if (response.applied === false) {
        throw new Error(`manipulate_element could not be applied: ${response.reason || 'unknown reason'}${response.hint ? ` (${response.hint})` : ''}`);
      }

      originalValue = response.rollback || null;
      result = response;

      // Flush caches for this post so the live page reflects the change immediately.
      try {
        await wpApi.clearCache(site, { postIds: [parseInt(args.postId, 10)] });
      } catch (cacheErr) {
        console.warn('[manipulate_element] Cache clear failed:', cacheErr.message);
      }
      break;
    }

    case 'wp_update_seo': {
      const currentSeo = await wpApi.getSeoData(site, args.postId);
      originalValue = currentSeo;
      result = await wpApi.updateSeoData(site, args.postId, args.seoData);
      break;
    }

    case 'wp_update_acf': {
      const currentAcf = await wpApi.getAcfFields(site, args.postId);
      originalValue = currentAcf;
      result = await wpApi.updateAcfFields(site, args.postId, args.fields);
      break;
    }

    case 'wp_create_redirect': {
      result = await wpApi.createRedirect(site, {
        source_url: args.sourceUrl,
        target_url: args.targetUrl,
        type: parseInt(args.type || '301'),
      });
      originalValue = { created: true, redirectId: result?.id };
      break;
    }

    case 'wp_delete_redirect': {
      // Snapshot redirect before deleting
      const redirects = await wpApi.getRedirects(site);
      originalValue = redirects?.find?.(r => String(r.id) === String(args.redirectId)) || null;
      result = await wpApi.deleteRedirect(site, args.redirectId);
      break;
    }

    case 'wp_add_code_snippet': {
      // Code snippets are added via the plugin endpoint which dispatches to
      // Code Snippets plugin → WPCode → mu-plugin drop-in (in that order).
      result = await wpApi.makePluginRequest(site, '/code-snippets', 'POST', {
        name: args.title,
        title: args.title,
        code: args.code,
        type: args.type,
        scope: args.scope || 'everywhere',
        description: args.description || '',
        active: true,
      });
      originalValue = { created: true, snippetId: result?.snippetId || result?.id, backend: result?.backend };
      break;
    }

    case 'wp_add_menu_item': {
      result = await wpApi.addMenuItem(site, args.menuId, {
        title: args.title,
        url: args.url || '',
        type: args.type || 'custom',
        object: args.object || '',
        objectId: args.objectId || 0,
        parentId: args.parentId || 0,
        position: args.position || 0,
        target: args.target || '',
        classes: args.classes || '',
      });
      originalValue = { created: true, itemId: result?.itemId, menuId: args.menuId };
      break;
    }

    case 'wp_update_menu_item': {
      // Snapshot the item first so rollback can restore it
      try {
        const menus = await wpApi.getMenus(site);
        if (Array.isArray(menus)) {
          for (const m of menus) {
            const items = m.items || m.menu_items || [];
            const hit = items.find?.(i => String(i.id || i.ID) === String(args.itemId));
            if (hit) {
              originalValue = {
                title: hit.title,
                url: hit.url,
                type: hit.type,
                object: hit.object,
                objectId: hit.object_id || hit.objectId,
                parentId: hit.menu_item_parent || hit.parentId,
                position: hit.menu_order || hit.position,
                target: hit.target,
                classes: Array.isArray(hit.classes) ? hit.classes.join(' ') : hit.classes,
              };
              break;
            }
          }
        }
      } catch {}

      result = await wpApi.updateMenuItem(site, args.itemId, {
        title: args.title,
        url: args.url,
        type: args.type,
        object: args.object,
        objectId: args.objectId,
        parentId: args.parentId,
        position: args.position,
        target: args.target,
        classes: args.classes,
      });
      break;
    }

    case 'wp_delete_menu_item': {
      // Snapshot the item so rollback can re-create it
      try {
        const menus = await wpApi.getMenus(site);
        if (Array.isArray(menus)) {
          for (const m of menus) {
            const items = m.items || m.menu_items || [];
            const hit = items.find?.(i => String(i.id || i.ID) === String(args.itemId));
            if (hit) {
              originalValue = {
                menuId: m.id || m.term_id,
                title: hit.title,
                url: hit.url,
                type: hit.type,
                object: hit.object,
                objectId: hit.object_id || hit.objectId,
                parentId: hit.menu_item_parent || hit.parentId,
                position: hit.menu_order || hit.position,
                target: hit.target,
                classes: Array.isArray(hit.classes) ? hit.classes.join(' ') : hit.classes,
              };
              break;
            }
          }
        }
      } catch {}

      result = await wpApi.deleteMenuItem(site, args.itemId);
      break;
    }

    case 'wp_delete_post': {
      const postType = args.postType || 'posts';
      // Snapshot the post so rollback can restore it (for trash rollback, we can
      // untrash; for force delete, we can re-create from the snapshot).
      try {
        const current = await wpApi.getPost(site, postType, args.postId);
        if (current) {
          originalValue = {
            postId: args.postId,
            postType,
            force: !!args.force,
            snapshot: {
              title: current?.title?.rendered || current?.title,
              content: current?.content?.rendered || current?.content,
              slug: current?.slug,
              status: current?.status,
              excerpt: current?.excerpt?.rendered || current?.excerpt,
            },
          };
        }
      } catch {}

      // Plugin's delete endpoint supports ?force=1 via query param
      const endpoint = postType === 'posts' || postType === 'post'
        ? `/posts/${args.postId}${args.force ? '?force=1' : ''}`
        : postType === 'pages' || postType === 'page'
          ? `/pages/${args.postId}${args.force ? '?force=1' : ''}`
          : `/cpt/${postType}/${args.postId}${args.force ? '?force=1' : ''}`;
      result = await wpApi.makePluginRequest(site, endpoint, 'DELETE');
      break;
    }

    case 'wp_list_terms': {
      result = await wpApi.listTerms(site, args.taxonomy, { search: args.search, limit: args.limit });
      break;
    }

    case 'wp_create_term': {
      result = await wpApi.createTerm(site, args.taxonomy, {
        name: args.name,
        slug: args.slug,
        description: args.description,
        parent: args.parent,
      });
      originalValue = { created: true, termId: result?.termId, taxonomy: args.taxonomy };
      break;
    }

    case 'wp_update_term': {
      // Snapshot so we can restore original name/slug/description
      try {
        const list = await wpApi.listTerms(site, args.taxonomy);
        const hit = Array.isArray(list) ? list.find(t => String(t.id) === String(args.termId)) : null;
        if (hit) {
          originalValue = {
            name: hit.name, slug: hit.slug, description: hit.description, parent: hit.parent,
          };
        }
      } catch {}
      result = await wpApi.updateTerm(site, args.taxonomy, args.termId, {
        name: args.name, slug: args.slug, description: args.description, parent: args.parent,
      });
      break;
    }

    case 'wp_delete_term': {
      try {
        const list = await wpApi.listTerms(site, args.taxonomy);
        const hit = Array.isArray(list) ? list.find(t => String(t.id) === String(args.termId)) : null;
        if (hit) {
          originalValue = {
            taxonomy: args.taxonomy,
            name: hit.name, slug: hit.slug, description: hit.description, parent: hit.parent,
          };
        }
      } catch {}
      result = await wpApi.deleteTerm(site, args.taxonomy, args.termId);
      break;
    }

    case 'wp_list_comments': {
      result = await wpApi.listComments(site, { status: args.status, postId: args.postId, limit: args.limit });
      break;
    }

    case 'wp_moderate_comment': {
      // Snapshot so we can restore prior status / content
      try {
        const list = await wpApi.listComments(site, {});
        const hit = Array.isArray(list) ? list.find(c => String(c.id) === String(args.commentId)) : null;
        if (hit) {
          originalValue = {
            status: hit.approved === '1' || hit.approved === 1 || hit.approved === 'approved' ? 'approve' : (hit.approved === 'spam' ? 'spam' : (hit.approved === 'trash' ? 'trash' : 'hold')),
            content: hit.content,
            author: hit.author,
            authorEmail: hit.authorEmail,
          };
        }
      } catch {}
      result = await wpApi.updateComment(site, args.commentId, {
        status: args.status,
        content: args.content,
        author: args.author,
        authorEmail: args.authorEmail,
      });
      break;
    }

    case 'wp_reply_comment': {
      result = await wpApi.replyComment(site, {
        postId: args.postId,
        parentId: args.parentId || 0,
        content: args.content,
      });
      originalValue = { created: true, commentId: result?.commentId };
      break;
    }

    case 'wp_delete_comment': {
      try {
        const list = await wpApi.listComments(site, {});
        const hit = Array.isArray(list) ? list.find(c => String(c.id) === String(args.commentId)) : null;
        if (hit) {
          originalValue = {
            force: !!args.force,
            snapshot: hit,
          };
        }
      } catch {}
      result = await wpApi.deleteComment(site, args.commentId, !!args.force);
      break;
    }

    case 'wp_get_options': {
      result = await wpApi.getOptions(site);
      break;
    }

    case 'wp_update_options': {
      // Snapshot current values for every key we're about to change
      try {
        const before = await wpApi.getOptions(site);
        originalValue = {};
        for (const k of Object.keys(args)) {
          if (before && Object.prototype.hasOwnProperty.call(before, k)) {
            originalValue[k] = before[k];
          }
        }
      } catch {}
      result = await wpApi.updateOptions(site, args);
      break;
    }

    case 'wp_self_update_plugin': {
      result = await wpApi.selfUpdatePlugin(site);
      // No rollback - downgrading a plugin is generally unsafe and not supported
      originalValue = { note: 'plugin self-update has no rollback' };
      break;
    }

    case 'wp_rest_api': {
      // Generic REST passthrough. No auto-rollback - the AI must propose an
      // inverse call explicitly (e.g. create -> delete) when rolling back
      // matters. We still record the call for debugging.
      result = await wpApi.wpRestPassthrough(site, {
        method: args.method || 'GET',
        path: args.path,
        params: args.params || {},
        headers: args.headers || {},
      });
      originalValue = {
        method: args.method || 'GET',
        path: args.path,
        note: 'passthrough - manual rollback required if this was a write',
      };
      break;
    }

    case 'wp_bulk_update_posts': {
      const results = [];
      const rollbacks = [];
      for (const update of args.updates) {
        const postType = update.postType || 'posts';
        const current = await wpApi.getPost(site, postType, update.postId);
        rollbacks.push({
          postId: update.postId,
          postType,
          original: {
            title: current?.title?.rendered || current?.title,
            content: current?.content?.rendered || current?.content,
            slug: current?.slug,
            status: current?.status,
          },
        });
        const updateResult = await wpApi.updatePost(site, postType, update.postId, update.data);
        results.push({ postId: update.postId, success: true, result: updateResult });
      }
      result = results;
      originalValue = rollbacks;
      break;
    }

    case 'wp_search_replace_links': {
      // No easy snapshot - record the operation for informational rollback
      originalValue = { oldUrl: args.oldUrl, newUrl: args.newUrl };
      result = await wpApi.searchReplaceLinks(site, args.oldUrl, args.newUrl);
      break;
    }

    case 'wp_upload_media': {
      result = await wpApi.uploadMediaFromUrl(site, args.url, {
        title: args.title,
        alt: args.alt,
      });
      originalValue = { created: true, mediaId: result?.id };
      break;
    }

    case 'wp_update_media': {
      const currentMedia = await wpApi.getMediaItem(site, args.mediaId);
      originalValue = currentMedia;
      result = await wpApi.updateMedia(site, args.mediaId, args.data);
      break;
    }

    case 'generate_image': {
      const aspectRatio = args.aspectRatio || '16:9';
      const uploadToWp = args.uploadToWp !== false;
      const promptText = String(args.prompt || '').trim();
      if (!promptText) throw new Error('generate_image requires a prompt');

      const refImages = Array.isArray(args.referenceImages)
        ? args.referenceImages.filter(r => r && r.base64).slice(0, 2)
        : [];

      const images = await generateImage({
        prompt: promptText,
        aspectRatio,
        n: 1,
        referenceImages: refImages,
        operation: 'GENERATE_IMAGE',
        accountId,
        userId,
        siteId,
        metadata: { source: 'chat', siteId, referenceCount: refImages.length },
      });

      const img = images[0];
      if (!img?.base64) throw new Error('Image generation returned no data');

      if (!uploadToWp) {
        result = {
          generated: true,
          mimeType: img.mimeType,
          base64Length: img.base64.length,
          aspectRatio,
        };
        originalValue = { generated: true, uploaded: false };
        break;
      }

      const ext = (img.mimeType || 'image/png').split('/')[1].split('+')[0] || 'png';
      const safeTitle = (args.title || promptText).slice(0, 60).replace(/[^\w\u0590-\u05FF\s-]/g, '').trim() || 'generated-image';
      const filename = `${safeTitle.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}.${ext}`;

      const uploaded = await wpApi.uploadMediaFromBase64(site, img.base64, filename, {
        title: args.title || promptText.slice(0, 80),
        alt: args.alt || promptText.slice(0, 120),
        caption: '',
        postId: args.setAsFeaturedFor,
      });

      const mediaId = uploaded?.id || uploaded?.data?.id || uploaded?.mediaId;
      let featuredAssignment = null;

      if (mediaId && args.setAsFeaturedFor) {
        const targetType = args.setAsFeaturedPostType || 'posts';
        try {
          const before = await wpApi.getPost(site, targetType, args.setAsFeaturedFor);
          const previousFeatured = before?.featuredImageId ?? before?.featured_image_id ?? 0;
          const updateRes = await wpApi.updatePost(site, targetType, args.setAsFeaturedFor, { featured_image: mediaId });
          const after = await wpApi.getPost(site, targetType, args.setAsFeaturedFor);
          const verifiedId = after?.featuredImageId ?? after?.featured_image_id ?? 0;
          if (Number(verifiedId) !== Number(mediaId)) {
            throw new Error(`Featured image verify failed: expected ${mediaId}, got ${verifiedId}`);
          }
          featuredAssignment = {
            postId: args.setAsFeaturedFor,
            postType: targetType,
            previousFeatured,
            newFeatured: mediaId,
          };
        } catch (featErr) {
          console.warn('[generate_image] Featured image assignment failed:', featErr.message);
          featuredAssignment = { error: featErr.message, postId: args.setAsFeaturedFor };
        }
      }

      result = {
        mediaId,
        url: uploaded?.source_url || uploaded?.url || uploaded?.guid?.rendered || uploaded?.guid,
        title: uploaded?.title?.rendered || uploaded?.title || args.title || promptText.slice(0, 80),
        alt: args.alt || promptText.slice(0, 120),
        mimeType: img.mimeType,
        aspectRatio,
        featuredAssignment,
      };
      originalValue = {
        generated: true,
        uploaded: true,
        mediaId,
        featuredAssignment,
      };
      break;
    }

    case 'wp_set_featured_image': {
      const targetType = args.postType || 'posts';
      const before = await wpApi.getPost(site, targetType, args.postId);
      const previousFeatured = before?.featuredImageId ?? before?.featured_image_id ?? 0;
      originalValue = { postId: args.postId, postType: targetType, previousFeatured };
      const desiredId = Number(args.mediaId) || 0;
      result = await wpApi.updatePost(site, targetType, args.postId, {
        featured_image: desiredId,
      });
      const after = await wpApi.getPost(site, targetType, args.postId);
      const verifiedId = Number(after?.featuredImageId ?? after?.featured_image_id ?? 0);
      if (verifiedId !== desiredId) {
        throw new Error(`Featured image verify failed: expected ${desiredId}, got ${verifiedId}`);
      }
      result = { ...result, verifiedFeaturedImageId: verifiedId };
      break;
    }

    case 'wp_insert_image_in_content': {
      const targetType = args.postType || 'posts';
      const current = await wpApi.getPost(site, targetType, args.postId);
      const originalContent = current?.content?.rendered ?? current?.content ?? '';
      originalValue = {
        postId: args.postId,
        postType: targetType,
        content: originalContent,
      };

      let imgUrl = args.imageUrl;
      if (!imgUrl && args.mediaId) {
        try {
          const media = await wpApi.getMediaItem(site, args.mediaId);
          imgUrl = media?.source_url || media?.guid?.rendered || media?.guid;
        } catch (err) {
          throw new Error(`Could not resolve mediaId ${args.mediaId} to a URL: ${err.message}`);
        }
      }
      if (!imgUrl) throw new Error('wp_insert_image_in_content requires either mediaId or imageUrl');

      const align = args.align || 'none';
      const altAttr = (args.alt || '').replace(/"/g, '&quot;');
      const figureClasses = ['wp-block-image', `align${align}`];
      if (args.mediaId) figureClasses.push(`size-large`);
      const captionHtml = args.caption ? `<figcaption>${args.caption}</figcaption>` : '';
      const dataAttr = args.mediaId ? ` data-id="${args.mediaId}"` : '';
      const figure = `\n<figure class="${figureClasses.join(' ')}"${dataAttr}><img src="${imgUrl}" alt="${altAttr}"${args.mediaId ? ` class="wp-image-${args.mediaId}"` : ''}/>${captionHtml}</figure>\n`;

      let newContent = originalContent;
      const position = args.position || 'end';
      if (position === 'start') {
        newContent = figure + originalContent;
      } else if (position === 'end') {
        newContent = originalContent + figure;
      } else if (position === 'before_text' || position === 'after_text') {
        if (!args.anchorText) throw new Error(`anchorText is required when position is ${position}`);
        const idx = originalContent.indexOf(args.anchorText);
        if (idx === -1) throw new Error(`anchorText not found in post content: "${args.anchorText.slice(0, 60)}"`);
        if (position === 'before_text') {
          newContent = originalContent.slice(0, idx) + figure + originalContent.slice(idx);
        } else {
          const end = idx + args.anchorText.length;
          newContent = originalContent.slice(0, end) + figure + originalContent.slice(end);
        }
      }

      result = await wpApi.updatePost(site, targetType, args.postId, { content: newContent });
      break;
    }

    case 'run_site_audit': {
      // Create audit records
      const desktopAudit = await prisma.siteAudit.create({
        data: { siteId, url: site.url, deviceType: 'desktop', status: 'PENDING' },
      });
      const mobileAudit = await prisma.siteAudit.create({
        data: { siteId, url: site.url, deviceType: 'mobile', status: 'PENDING' },
      });
      const auditOptions = { maxPages: args.maxPages, userId };
      // Fire and forget
      runSiteAudit(desktopAudit.id, site.url, siteId, 'desktop', auditOptions).catch(e =>
        console.error('[ChatAction] Desktop audit error:', e.message)
      );
      runSiteAudit(mobileAudit.id, site.url, siteId, 'mobile', auditOptions).catch(e =>
        console.error('[ChatAction] Mobile audit error:', e.message)
      );
      result = {
        message: 'Site audit started (desktop + mobile)',
        desktopAuditId: desktopAudit.id,
        mobileAuditId: mobileAudit.id,
        link: `/dashboard/site-audit?siteId=${siteId}`,
      };
      originalValue = { auditIds: [desktopAudit.id, mobileAudit.id] };
      break;
    }

    case 'run_agent_scan': {
      const run = await prisma.agentRun.create({
        data: { siteId, accountId, source: 'manual', status: 'RUNNING' },
      });
      runSiteAnalysis(siteId, accountId, 'manual', run.id, userId).catch(e =>
        console.error('[ChatAction] Agent scan error:', e.message)
      );
      result = {
        message: 'AI agent scan started',
        runId: run.id,
        link: `/dashboard/agent?siteId=${siteId}`,
      };
      originalValue = { runId: run.id };
      break;
    }

    case 'research_keywords': {
      if (!isGoogleAdsConfigured()) {
        throw new Error('Google Ads API is not configured for this platform - keyword research is unavailable.');
      }
      const kws = Array.isArray(args.keywords) ? args.keywords.slice(0, 20) : [];
      if (!kws.length) throw new Error('No keywords provided');
      const geo = args.geo || site?.targetLocations?.[0] || 'IL';
      const langId = getLanguageId(site?.contentLanguage?.toLowerCase()) || '1000';
      const freshData = await batchGetSearchVolume(kws, geo, langId);
      const results = {};
      if (freshData?.size) {
        for (const [kw, data] of freshData) {
          await prisma.keywordVolumeCache.upsert({
            where: { keyword_geo_language: { keyword: kw, geo, language: langId } },
            create: {
              keyword: kw, geo, language: langId,
              avgMonthlySearches: data.avgMonthlySearches,
              competition: data.competition,
              competitionIndex: data.competitionIndex,
              lowTopOfPageBidMicros: data.lowTopOfPageBidMicros,
              highTopOfPageBidMicros: data.highTopOfPageBidMicros,
              fetchedAt: new Date(),
            },
            update: {
              avgMonthlySearches: data.avgMonthlySearches,
              competition: data.competition,
              competitionIndex: data.competitionIndex,
              lowTopOfPageBidMicros: data.lowTopOfPageBidMicros,
              highTopOfPageBidMicros: data.highTopOfPageBidMicros,
              fetchedAt: new Date(),
            },
          });
          results[kw] = {
            avgMonthlySearches: data.avgMonthlySearches,
            competition: data.competition,
            competitionIndex: data.competitionIndex,
          };
        }
      }
      for (const kw of kws) {
        if (!(kw in results)) results[kw] = null;
      }
      result = {
        message: `Researched ${kws.length} keyword(s) for ${geo}`,
        geo,
        results,
        link: `/dashboard/strategy/keywords?siteId=${siteId}`,
      };
      originalValue = { keywords: kws };
      break;
    }

    case 'add_competitor': {
      const url = args.url;
      if (!url) throw new Error('Competitor URL is required');
      const domain = extractDomain(url);
      const existing = await prisma.competitor.findFirst({ where: { siteId, url } });
      if (existing) {
        throw new Error(`Competitor ${domain} is already tracked for this site.`);
      }
      // Enforce the plan's maxCompetitors limit - same rule as the UI's
      // /api/competitors POST. Without this, chat-initiated adds bypass it.
      const capCheck = await enforceCompetitorCapacity(accountId, siteId, 1);
      if (!capCheck.allowed) {
        throw new Error(
          `Competitor limit reached (${capCheck.usage?.used || 0}/${capCheck.usage?.limit}). Upgrade your plan to add more.`,
        );
      }
      const competitor = await prisma.competitor.create({
        data: {
          siteId,
          url,
          domain,
          name: args.name || domain,
          favicon: getFaviconUrl(domain),
          source: 'MANUAL',
          isActive: true,
        },
      });
      invalidateCompetitors(siteId);
      result = {
        message: `Added competitor ${domain}`,
        competitorId: competitor.id,
        competitor,
        link: `/dashboard/strategy/competitors?siteId=${siteId}`,
      };
      originalValue = { competitorId: competitor.id };
      break;
    }

    case 'scan_competitor_page': {
      const url = args.url;
      if (!url) throw new Error('URL is required to scan');
      const scrape = await scrapeCompetitorPage(url);
      result = {
        message: `Scanned ${extractDomain(url)}`,
        url,
        scrape,
        link: `/dashboard/strategy/competitors?siteId=${siteId}`,
      };
      originalValue = { url };
      break;
    }

    case 'create_content_campaign': {
      if (!args.name || !args.startDate || !args.endDate || !args.postsCount) {
        throw new Error('Missing required campaign fields: name, startDate, endDate, postsCount');
      }
      const campaign = await prisma.campaign.create({
        data: {
          siteId,
          name: args.name,
          color: '#6366f1',
          startDate: new Date(args.startDate),
          endDate: new Date(args.endDate),
          publishDays: args.publishDays || [],
          publishTimeMode: 'random',
          postsCount: args.postsCount,
          articleTypes: [],
          contentSettings: {},
          subjects: args.subjects || [],
          keywordIds: [],
          pillarPageUrl: args.pillarPageUrl || null,
          mainKeyword: args.mainKeyword || null,
          textPrompt: '',
          imagePrompt: '',
          status: 'DRAFT',
        },
      });
      result = {
        message: `Created DRAFT campaign "${campaign.name}"`,
        campaignId: campaign.id,
        campaign,
        link: `/dashboard/strategy/content-planner?campaignId=${campaign.id}`,
      };
      originalValue = { campaignId: campaign.id };
      break;
    }

    case 'create_backlink_listing': {
      if (!args.title || typeof args.price !== 'number') {
        throw new Error('Missing required backlink listing fields: title, price');
      }
      const domain = site?.url ? extractDomain(site.url) : null;
      if (!domain) throw new Error('Cannot create backlink listing without a site URL');
      const listing = await prisma.backlinkListing.create({
        data: {
          publisherType: 'USER',
          publisherAccountId: accountId,
          publisherSiteId: siteId,
          domain,
          websiteName: site?.name || domain,
          title: args.title,
          description: args.description || null,
          category: args.category || null,
          linkType: args.linkType || 'DOFOLLOW',
          price: args.price,
          currency: 'USD',
          status: 'ACTIVE',
          isActive: true,
        },
      });
      result = {
        message: `Created backlink listing "${listing.title}"`,
        listingId: listing.id,
        listing,
        link: `/dashboard/backlinks?tab=my-listings`,
      };
      originalValue = { listingId: listing.id };
      break;
    }

    default:
      throw new Error(`Unknown write tool: ${tool}`);
  }

  return {
    success: true,
    result,
    rollback: {
      tool,
      args,
      originalValue,
      executedAt: new Date().toISOString(),
    },
  };
}

// ─── Localization for action completion messages ──────────────────────

const ACTION_STRINGS = {
  EN: {
    actionCompleted: 'Action Completed',
    actionFailed: 'Action Failed',
    done: '✅ Done',
    failed: '❌ Failed',
    error: 'Error',
    rollbackHint: 'You can rollback these changes if needed.',
    rollbackPartialHint: 'You can rollback the completed steps.',
    completedXofY: 'Completed {done} of {total} steps before failure.',
    verifiedOk: '✅ **Verified:** The H1 heading "{h1}" is now visible on the live page.',
    verifiedWrongH1: '⚠️ **Verification:** The live page shows H1: "{found}" - but the expected text "{expected}" was not found. The page cache may still be updating. Try refreshing the page in a few minutes, or check if a caching plugin needs to be cleared.',
    verifiedNoH1: '⚠️ **Verification:** No H1 heading was detected on the live page yet. This could be due to page caching. Try clearing your site cache or wait a few minutes, then check again.',
    verifyError: '⚠️ Could not auto-verify the live page: {error}',
  },
  HE: {
    actionCompleted: 'הפעולה הושלמה',
    actionFailed: 'הפעולה נכשלה',
    done: '✅ בוצע',
    failed: '❌ נכשל',
    error: 'שגיאה',
    rollbackHint: 'ניתן לבטל את השינויים במידת הצורך.',
    rollbackPartialHint: 'ניתן לבטל את הצעדים שהושלמו.',
    completedXofY: 'הושלמו {done} מתוך {total} צעדים לפני הכשלון.',
    verifiedOk: '✅ **אומת:** כותרת H1 "{h1}" מופיעה כעת בדף החי.',
    verifiedWrongH1: '⚠️ **אימות:** הדף החי מציג H1: "{found}" - אבל הטקסט הצפוי "{expected}" לא נמצא. ייתכן שמטמון הדף עדיין מתעדכן. נסו לרענן את הדף בעוד מספר דקות, או בדקו אם יש צורך לנקות תוסף מטמון.',
    verifiedNoH1: '⚠️ **אימות:** לא זוהתה כותרת H1 בדף החי עדיין. ייתכן שזה בגלל מטמון הדף. נסו לנקות את המטמון של האתר או המתינו מספר דקות ובדקו שוב.',
    verifyError: '⚠️ לא ניתן לאמת אוטומטית את הדף החי: {error}',
  },
};

function getActionStrings(lang) {
  return ACTION_STRINGS[lang] || ACTION_STRINGS.EN;
}

/**
 * Detect the conversation language by checking recent user messages,
 * falling back to the account's defaultLanguage setting.
 */
async function detectConversationLanguage(conversationId, accountId) {
  try {
    // Check the last few user messages for Hebrew characters
    const recentMessages = await prisma.chatMessage.findMany({
      where: { conversationId, role: 'USER' },
      orderBy: { createdAt: 'desc' },
      take: 3,
      select: { content: true },
    });

    const text = recentMessages.map(m => m.content).join(' ');
    // Hebrew Unicode range: \u0590-\u05FF
    const hebrewCharCount = (text.match(/[\u0590-\u05FF]/g) || []).length;
    if (hebrewCharCount > 5) return 'HE';

    // Fallback to account default
    if (accountId) {
      const account = await prisma.account.findUnique({
        where: { id: accountId },
        select: { defaultLanguage: true },
      });
      if (account?.defaultLanguage) return account.defaultLanguage;
    }
  } catch {
    // Non-fatal - fall back to English
  }
  return 'EN';
}

/**
 * Execute all actions in an approved ChatAction record.
 * Updates the ChatAction status throughout the process.
 */
export async function executeChatAction(chatActionId) {
  const chatAction = await prisma.chatAction.findUnique({
    where: { id: chatActionId },
    include: {
      conversation: { include: { site: true } },
    },
  });

  if (!chatAction || chatAction.status !== 'APPROVED') {
    throw new Error('ChatAction not found or not approved');
  }

  const site = chatAction.conversation.site;
  const context = {
    site,
    siteId: chatAction.siteId,
    accountId: chatAction.accountId,
    userId: chatAction.userId,
  };

  // Detect conversation language for localized messages
  const lang = await detectConversationLanguage(chatAction.conversationId, chatAction.accountId);
  const t = getActionStrings(lang);

  // Mark as executing
  await prisma.chatAction.update({
    where: { id: chatActionId },
    data: { status: 'EXECUTING' },
  });

  const results = [];
  const rollbackData = [];

  try {
    for (const action of chatAction.actions) {
      const outcome = await executeWriteAction(action, context);
      results.push({
        tool: action.tool,
        description: action.description,
        success: outcome.success,
        result: outcome.result,
      });
      rollbackData.push(outcome.rollback);
    }

    // Mark completed
    await prisma.chatAction.update({
      where: { id: chatActionId },
      data: {
        status: 'COMPLETED',
        executedAt: new Date(),
        result: results,
        rollbackData,
      },
    });

    // Save assistant message with execution results + verification prompt
    const summary = results.map((r, i) =>
      `${i + 1}. **${r.description}** - ${r.success ? t.done : t.failed}`
    ).join('\n');

    // Auto-verify: for actions that modified pages, fetch the live page and check
    let verificationNote = '';
    const pageActions = chatAction.actions.filter(a =>
      a.tool === 'wp_update_post' && (a.args?.data?.add_h1 || a.args?.data?.old_h1)
    );

    // manipulate_element verification. The plugin (v3.1.9+) now does its own
    // render-and-scan before returning applied:true. For older plugins - or
    // as a second opinion against CDN/edge caches - we redo the live fetch
    // and text-match on the platform side too. Only checks insert/update
    // positive-text cases; deletes are handled by the plugin.
    const manipulateActions = chatAction.actions
      .map((a, i) => ({ action: a, result: results[i]?.result }))
      .filter(({ action }) =>
        action.tool === 'manipulate_element' &&
        (action.args?.operation === 'insert' || action.args?.operation === 'update') &&
        (action.args?.element?.text || action.args?.mutation?.text)
      );

    if (manipulateActions.length > 0 && site?.url) {
      try {
        const me = manipulateActions[0];
        const postId = me.action.args.postId;
        const needle = String(me.action.args.element?.text || me.action.args.mutation?.text || '').trim();
        // If the plugin already render-verified, skip the redundant fetch.
        const alreadyVerified = me.result?.render_verified === true;

        if (!alreadyVerified && needle && postId) {
          let targetUrl = me.result?.url || site.url;
          if (!me.result?.url) {
            try {
              const postData = await wpApi.getPost(site, me.action.args.postType || 'pages', postId);
              if (postData?.link) targetUrl = postData.link;
            } catch { /* fallback to site.url */ }
          }
          try {
            await wpApi.clearCache(site, { postIds: [parseInt(postId, 10)] });
          } catch (cacheErr) {
            console.warn('[ChatAction] Cache clear failed:', cacheErr.message);
          }
          const needleLower = needle.toLowerCase();
          let found = false;
          for (const waitMs of [1500, 2500, 4000]) {
            await new Promise(resolve => setTimeout(resolve, waitMs));
            const bustedUrl = targetUrl + (targetUrl.includes('?') ? '&' : '?') + 'gp_cb=' + Date.now();
            try {
              const res = await fetch(bustedUrl, { headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' } });
              if (res.ok) {
                const body = await res.text();
                if (body.toLowerCase().includes(needleLower)) { found = true; break; }
              }
            } catch { /* retry */ }
          }
          if (!found) {
            verificationNote += `\n\n⚠️ The plugin reported success but the text "${needle.slice(0, 60)}" is not visible on the live page yet. This can happen when a CDN or page cache hasn't flushed. Try reloading the preview; if it stays missing, the change may not actually be rendering - check the builder mode and theme overrides.`;
          }
        }
      } catch (verifyErr) {
        console.warn('[ChatAction] manipulate_element verification failed:', verifyErr.message);
      }
    }

    if (pageActions.length > 0 && site?.url) {
      try {
        // Resolve the URL for the modified page
        const firstPageAction = pageActions[0];
        const postType = firstPageAction.args.postType || 'posts';
        const postId = firstPageAction.args.postId;
        let targetUrl = site.url; // default to homepage

        try {
          const postData = await wpApi.getPost(site, postType, postId);
          if (postData?.link) targetUrl = postData.link;
        } catch { /* use site.url as fallback */ }

        // Flush site and page cache so the live fetch reflects the just-saved change
        try {
          await wpApi.clearCache(site, postId ? { postIds: [postId] } : {});
        } catch (cacheErr) {
          console.warn('[ChatAction] Cache clear failed:', cacheErr.message);
        }

        // Verify with retries - CDN / opcode caches may still lag after a flush
        const expectedH1 = firstPageAction.args.data.add_h1 || firstPageAction.args.data.new_h1;
        const expectedNorm = (expectedH1 || '').toLowerCase().trim();
        let liveAnalysis = null;
        let h1sSeen = [];
        let h1Found = false;
        const attempts = [1500, 2500, 4000];
        for (const waitMs of attempts) {
          await new Promise(resolve => setTimeout(resolve, waitMs));
          // Cache-bust the fetch itself
          const bustedUrl = targetUrl + (targetUrl.includes('?') ? '&' : '?') + 'gp_cb=' + Date.now();
          liveAnalysis = await fetchAndAnalyzePage(bustedUrl);
          if (liveAnalysis && !liveAnalysis.error) {
            h1sSeen = liveAnalysis.headings?.h1 || [];
            h1Found = h1sSeen.some(h => h.toLowerCase().includes(expectedNorm));
            if (h1Found) break;
          }
        }

        if (liveAnalysis && !liveAnalysis.error) {
          if (h1Found) {
            verificationNote = `\n\n${t.verifiedOk.replace('{h1}', expectedH1)}`;
          } else if (h1sSeen.length > 0) {
            verificationNote = `\n\n${t.verifiedWrongH1.replace('{found}', h1sSeen[0]).replace('{expected}', expectedH1)}`;
          } else {
            verificationNote = `\n\n${t.verifiedNoH1}`;
          }
        }
      } catch (verifyErr) {
        verificationNote = `\n\n${t.verifyError.replace('{error}', verifyErr.message)}`;
      }
    }

    await prisma.chatMessage.create({
      data: {
        conversationId: chatAction.conversationId,
        role: 'ASSISTANT',
        content: `### ${t.actionCompleted}\n\n${summary}${verificationNote}\n\n> ${t.rollbackHint}`,
      },
    });

    return { success: true, results };
  } catch (err) {
    // Mark failed, but keep whatever rollback data we collected
    await prisma.chatAction.update({
      where: { id: chatActionId },
      data: {
        status: 'FAILED',
        error: err.message,
        result: results,
        rollbackData,
      },
    });

    await prisma.chatMessage.create({
      data: {
        conversationId: chatAction.conversationId,
        role: 'ASSISTANT',
        content: `### ${t.actionFailed}\n\n❌ ${t.error}: ${err.message}\n\n${t.completedXofY.replace('{done}', results.length).replace('{total}', chatAction.actions.length)}\n\n> ${t.rollbackPartialHint}`,
      },
    });

    throw err;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────

async function resolveAndGetPost(site, url) {
  try {
    const resolved = await wpApi.resolveUrl(site, url);
    if (resolved?.postId) {
      const postType = resolved.postType || 'posts';
      return await wpApi.getPost(site, postType, resolved.postId);
    }
  } catch (e) {
    // fallback - try as page
  }
  return null;
}

function formatPostAnalysis(post) {
  if (!post) return { error: 'Post not found' };

  const content = post.content?.rendered || post.content || '';

  // Extract headings
  const h1s = [...content.matchAll(/<h1[^>]*>(.*?)<\/h1>/gi)].map(m => m[1].replace(/<[^>]+>/g, ''));
  const h2s = [...content.matchAll(/<h2[^>]*>(.*?)<\/h2>/gi)].map(m => m[1].replace(/<[^>]+>/g, ''));
  const h3s = [...content.matchAll(/<h3[^>]*>(.*?)<\/h3>/gi)].map(m => m[1].replace(/<[^>]+>/g, ''));

  // Extract images
  const images = [...content.matchAll(/<img[^>]+>/gi)].map(img => {
    const src = img[0].match(/src="([^"]+)"/)?.[1];
    const alt = img[0].match(/alt="([^"]*?)"/)?.[1];
    return { src, alt, hasAlt: !!alt };
  });

  // Extract internal links
  const links = [...content.matchAll(/<a[^>]+href="([^"]+)"[^>]*>(.*?)<\/a>/gi)].map(m => ({
    href: m[1],
    text: m[2].replace(/<[^>]+>/g, ''),
  }));

  // Word count
  const textContent = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const wordCount = textContent.split(' ').filter(Boolean).length;

  return {
    id: post.id,
    postType: post.type === 'page' ? 'pages' : 'posts',
    title: post.title?.rendered || post.title,
    slug: post.slug,
    status: post.status,
    url: post.link || post.permalink,
    wordCount,
    headings: { h1: h1s, h2: h2s, h3: h3s },
    h1Count: h1s.length,
    images: images.slice(0, 20),
    imagesWithoutAlt: images.filter(i => !i.hasAlt).length,
    internalLinks: links.slice(0, 30),
    seo: post.yoast_head_json || post.rank_math || post.seo || null,
    excerpt: post.excerpt?.rendered || post.excerpt,
  };
}

/**
 * Fetch a page via HTTP and analyze the full HTML (works for any site).
 * Parses the rendered page for headings, meta tags, images, links, etc.
 */
async function fetchAndAnalyzePage(url) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const res = await fetch(url, {
      headers: BOT_FETCH_HEADERS,
      signal: controller.signal,
      redirect: 'follow',
    });
    clearTimeout(timeout);

    if (!res.ok) return { error: `Failed to fetch page: HTTP ${res.status}` };

    const html = await res.text();
    return analyzeHtml(html, url);
  } catch (e) {
    return { error: `Failed to fetch page: ${e.message}` };
  }
}

/**
 * Analyze raw HTML for SEO-relevant data.
 */
function analyzeHtml(html, url) {
  // Extract <title>
  const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/is);
  const title = titleMatch ? titleMatch[1].replace(/\s+/g, ' ').trim() : null;

  // Extract meta description
  const metaDescMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["'](.*?)["'][^>]*>/is)
    || html.match(/<meta[^>]+content=["'](.*?)["'][^>]+name=["']description["'][^>]*>/is);
  const metaDescription = metaDescMatch ? metaDescMatch[1].trim() : null;

  // Extract canonical
  const canonicalMatch = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["'](.*?)["'][^>]*>/is);
  const canonical = canonicalMatch ? canonicalMatch[1] : null;

  // Extract robots meta
  const robotsMatch = html.match(/<meta[^>]+name=["']robots["'][^>]+content=["'](.*?)["'][^>]*>/is);
  const robots = robotsMatch ? robotsMatch[1] : null;

  // Extract OG tags
  const ogTitle = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["'](.*?)["'][^>]*>/is)?.[1];
  const ogDesc = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["'](.*?)["'][^>]*>/is)?.[1];
  const ogImage = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["'](.*?)["'][^>]*>/is)?.[1];

  // Get just the body content for content analysis
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const body = bodyMatch ? bodyMatch[1] : html;

  // Extract headings from full page HTML (catches theme H1s outside content area)
  const h1s = [...html.matchAll(/<h1[^>]*>(.*?)<\/h1>/gis)].map(m => m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()).filter(Boolean);
  const h2s = [...html.matchAll(/<h2[^>]*>(.*?)<\/h2>/gis)].map(m => m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()).filter(Boolean);
  const h3s = [...html.matchAll(/<h3[^>]*>(.*?)<\/h3>/gis)].map(m => m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()).filter(Boolean);

  // Extract images
  const images = [...body.matchAll(/<img[^>]+>/gi)].map(img => {
    const src = img[0].match(/src=["']([^"']+)["']/)?.[1];
    const alt = img[0].match(/alt=["'](.*?)["']/)?.[1];
    return { src, alt, hasAlt: !!alt && alt.trim().length > 0 };
  });

  // Extract links
  const links = [...body.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gis)].map(m => ({
    href: m[1],
    text: m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(),
  }));

  // Separate internal vs external links
  let urlHost;
  try { urlHost = new URL(url).hostname; } catch { urlHost = null; }
  const internalLinks = urlHost ? links.filter(l => {
    try { return new URL(l.href, url).hostname === urlHost; } catch { return false; }
  }) : links;
  const externalLinks = urlHost ? links.filter(l => {
    try { return new URL(l.href, url).hostname !== urlHost; } catch { return false; }
  }) : [];

  // Word count from body text
  const textContent = body.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const wordCount = textContent.split(' ').filter(Boolean).length;

  // Detect structured data
  const jsonLdBlocks = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
    .map(m => { try { return JSON.parse(m[1]); } catch { return null; } })
    .filter(Boolean);

  // Detect hreflang
  const hreflangs = [...html.matchAll(/<link[^>]+rel=["']alternate["'][^>]+hreflang=["'](.*?)["'][^>]+href=["'](.*?)["'][^>]*>/gi)]
    .map(m => ({ lang: m[1], href: m[2] }));

  // Detect viewport meta (mobile-friendly)
  const hasViewport = /<meta[^>]+name=["']viewport["']/i.test(html);

  return {
    url,
    title,
    metaDescription,
    metaDescriptionLength: metaDescription?.length || 0,
    canonical,
    robots,
    og: { title: ogTitle, description: ogDesc, image: ogImage },
    headings: { h1: h1s, h2: h2s, h3: h3s },
    h1Count: h1s.length,
    wordCount,
    images: images.slice(0, 20),
    totalImages: images.length,
    imagesWithoutAlt: images.filter(i => !i.hasAlt).length,
    internalLinks: internalLinks.slice(0, 30),
    totalInternalLinks: internalLinks.length,
    externalLinks: externalLinks.slice(0, 15),
    totalExternalLinks: externalLinks.length,
    structuredData: jsonLdBlocks.length > 0 ? jsonLdBlocks : null,
    hreflangs: hreflangs.length > 0 ? hreflangs : null,
    hasViewport,
  };
}

// ─── manipulate_element helpers ──────────────────────────────────────

/**
 * Turn a manipulate_element spec into a plain-English intent string that the
 * AI locator fallback can reason about. Includes the operation, the chosen
 * locator (kind + fields), and - for insertion - enough of the target element
 * for the model to infer what the user actually wanted.
 */
function buildLocatorIntent(spec) {
  const parts = [];
  if (spec.operation) parts.push(`Operation: ${spec.operation}.`);
  const t = spec.target || {};
  if (t.kind === 'widget_id' && t.value) parts.push(`Intended target widget id: ${t.value}.`);
  if (t.kind === 'text_match' && t.value) parts.push(`Element containing text: "${t.value}".`);
  if (t.kind === 'tag_text') parts.push(`Element of tag ${t.tag || '?'} containing text "${t.value || ''}".`);
  if (t.kind === 'selector' && t.value) parts.push(`CSS selector: ${t.value}.`);
  if (t.kind === 'all_of_tag' && t.tag) parts.push(`All elements of tag ${t.tag}.`);
  if (t.position) parts.push(`Position relative to target: ${t.position}.`);
  if (spec.element) {
    const e = spec.element;
    if (e.tag) parts.push(`New element tag: ${e.tag}.`);
    if (e.text) parts.push(`New element text: "${String(e.text).slice(0, 120)}".`);
  }
  return parts.join(' ') || 'Locate the element that best matches the spec.';
}

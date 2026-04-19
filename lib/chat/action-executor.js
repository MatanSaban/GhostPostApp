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
import { runSiteAudit } from '@/lib/audit/site-auditor';
import { runSiteAnalysis } from '@/lib/agent-analysis';

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

      // For WordPress sites — try via plugin API first for post metadata,
      // but always fetch live HTML for accurate heading analysis
      const isWordPress = site?.platform?.toLowerCase() === 'wordpress' && site?.siteKey;
      let wpPostData = null;
      if (isWordPress) {
        try {
          const post = await resolveAndGetPost(site, targetUrl);
          if (post) wpPostData = formatPostAnalysis(post);
        } catch (e) {
          // WP API failed — fall through to HTTP fetch
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

      // WP data available but live fetch failed — return WP data with caveat
      if (wpPostData) {
        return { ...wpPostData, _note: 'Headings extracted from post content only; live page fetch failed so theme-injected headings may be missing.' };
      }

      return liveAnalysis;
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
      const entityWhere = { siteId };
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
        select: { id: true, name: true, url: true, metrics: true, lastAnalyzedAt: true },
      });
      return {
        competitors,
        link: `/dashboard/strategy/competitors?siteId=${siteId}`,
      };
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
      if (args.data?.old_h1 && args.data?.new_h1 && !result?.h1_update?.updated?.length) {
        throw new Error(`H1 replacement was not confirmed by the WordPress plugin. The existing H1 text "${args.data.old_h1}" may not match what's on the page.`);
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
      // Code snippets are added via a custom WP endpoint or functions.php
      result = await wpApi.makePluginRequest(site, '/code-snippets', 'POST', {
        title: args.title,
        code: args.code,
        type: args.type,
        scope: args.scope || 'global',
        description: args.description || '',
        active: true,
      });
      originalValue = { created: true, snippetId: result?.id };
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
      // No easy snapshot — record the operation for informational rollback
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
    verifiedWrongH1: '⚠️ **Verification:** The live page shows H1: "{found}" — but the expected text "{expected}" was not found. The page cache may still be updating. Try refreshing the page in a few minutes, or check if a caching plugin needs to be cleared.',
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
    verifiedWrongH1: '⚠️ **אימות:** הדף החי מציג H1: "{found}" — אבל הטקסט הצפוי "{expected}" לא נמצא. ייתכן שמטמון הדף עדיין מתעדכן. נסו לרענן את הדף בעוד מספר דקות, או בדקו אם יש צורך לנקות תוסף מטמון.',
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
    // Non-fatal — fall back to English
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
      `${i + 1}. **${r.description}** — ${r.success ? t.done : t.failed}`
    ).join('\n');

    // Auto-verify: for actions that modified pages, fetch the live page and check
    let verificationNote = '';
    const pageActions = chatAction.actions.filter(a =>
      a.tool === 'wp_update_post' && (a.args?.data?.add_h1 || a.args?.data?.old_h1)
    );

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

        // Wait briefly for caches to clear, then fetch the live page
        await new Promise(resolve => setTimeout(resolve, 2000));
        const liveAnalysis = await fetchAndAnalyzePage(targetUrl);

        if (liveAnalysis && !liveAnalysis.error) {
          const expectedH1 = firstPageAction.args.data.add_h1 || firstPageAction.args.data.new_h1;
          const h1s = liveAnalysis.headings?.h1 || [];
          const h1Found = h1s.some(h => h.toLowerCase().includes(expectedH1.toLowerCase()));

          if (h1Found) {
            verificationNote = `\n\n${t.verifiedOk.replace('{h1}', expectedH1)}`;
          } else if (h1s.length > 0) {
            verificationNote = `\n\n${t.verifiedWrongH1.replace('{found}', h1s[0]).replace('{expected}', expectedH1)}`;
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
    // fallback — try as page
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
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; GhostPostBot/1.0)',
        'Accept': 'text/html',
      },
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

/**
 * Content Differentiation Engine
 * 
 * Asynchronous AI-powered content cannibalization resolver.
 * Uses a Database-driven Background Job approach to avoid Vercel serverless timeouts.
 * 
 * Architecture:
 * 1. Alpha Page Algorithm — Identifies the strongest page (will not be altered)
 * 2. 3-Layer Anti-Cannibalization Safety Net — Pre-check, Negative Prompting, Validation Loop
 * 3. Surgical Diff Generation — H1 diffs, paragraph diffs, internal link injection
 * 
 * Flow:
 *   startDifferentiationJob() → creates BackgroundJob (PENDING) → fires async processDifferentiationJob()
 *   processDifferentiationJob() → Step 1: Alpha Page → Step 2: AI Safety Net → Step 3: Format Results
 */

import { z } from 'zod';
import prisma from '../prisma.js';
import { generateStructuredResponse, MODELS } from '../ai/gemini.js';
import { refreshAccessToken, fetchGSCPageMetrics } from '../google-integration.js';

// ═══ CONSTANTS ═══════════════════════════════════════════════════════════════

const MAX_AI_RETRIES = 2;
const OVERLAP_THRESHOLD = 0.5; // 50% word overlap = too similar
const CREDITS_PER_PAGE = 25; // AI credits cost per supporting page differentiated

// ═══ SCHEMAS ═════════════════════════════════════════════════════════════════

const DifferentiationOutputSchema = z.object({
  newFocusIntent: z.string().describe('New unique search intent for this page (e.g., "How to choose a Web Developer")'),
  newH1: z.string().describe('New H1 heading that reflects the new focus intent'),
  contentDiffs: z.array(z.object({
    oldParagraph: z.string().describe('Original paragraph text (first 200 chars if long)'),
    newParagraph: z.string().describe('Rewritten paragraph with new focus intent'),
  })).describe('Surgical content changes - only paragraphs that need refocusing'),
  internalLinkSentence: z.string().describe('A natural sentence to append at the bottom linking to the Alpha page'),
});

// ═══ ALPHA PAGE ALGORITHM ════════════════════════════════════════════════════

/**
 * Identify the "King" page among the provided pages.
 * Priority hierarchy:
 * 1. Highest GSC Clicks
 * 2. Highest GA4 Traffic  
 * 3. Most Internal Links (from menu/entity data)
 * 4. Longest Content
 */
function selectAlphaPage(pages, gscData = {}, gaData = {}) {
  const scored = pages.map(page => {
    const gsc = gscData[page.id] || {};
    const ga = gaData[page.id] || {};

    return {
      page,
      gscClicks: gsc.clicks || 0,
      gaTraffic: ga.sessions || ga.pageviews || 0,
      internalLinks: (page.metadata?.internalLinksCount) || 0,
      contentLength: (page.content || '').length,
    };
  });

  // Sort by hierarchy: GSC clicks → GA traffic → internal links → content length
  scored.sort((a, b) => {
    if (a.gscClicks !== b.gscClicks) return b.gscClicks - a.gscClicks;
    if (a.gaTraffic !== b.gaTraffic) return b.gaTraffic - a.gaTraffic;
    if (a.internalLinks !== b.internalLinks) return b.internalLinks - a.internalLinks;
    return b.contentLength - a.contentLength;
  });

  return scored[0].page;
}

// ═══ SAFETY NET HELPERS ═════════════════════════════════════════════════════

/**
 * Layer 1: Pre-Check — Ensure the new focus intent doesn't match existing content
 */
async function preCheckIntent(newIntent, siteId, excludePageIds = []) {
  const normalizedIntent = newIntent.toLowerCase().trim();

  const matchingEntities = await prisma.siteEntity.findMany({
    where: {
      siteId,
      id: { notIn: excludePageIds },
      OR: [
        { title: { contains: normalizedIntent, mode: 'insensitive' } },
        { slug: { contains: normalizedIntent.replace(/\s+/g, '-'), mode: 'insensitive' } },
      ],
    },
    select: { id: true, title: true, slug: true },
    take: 5,
  });

  return matchingEntities.length === 0;
}

/**
 * Calculate word overlap ratio between two strings
 */
function calculateOverlap(textA, textB) {
  const wordsA = new Set(textA.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  const wordsB = new Set(textB.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let overlap = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) overlap++;
  }
  return overlap / Math.max(wordsA.size, wordsB.size);
}

/**
 * Layer 3: Validation — Check that the new H1 doesn't heavily overlap with the blacklist
 */
function validateNoOverlap(newH1, blacklist) {
  for (const existing of blacklist) {
    if (calculateOverlap(newH1, existing) > OVERLAP_THRESHOLD) {
      return false;
    }
  }
  return true;
}

// ═══ AI DIFFERENTIATION GENERATION ══════════════════════════════════════════

/**
 * Build the blacklist of existing intents/titles on the site
 */
async function buildBlacklist(siteId, excludePageIds = []) {
  const entities = await prisma.siteEntity.findMany({
    where: {
      siteId,
      id: { notIn: excludePageIds },
      status: 'PUBLISHED',
    },
    select: { title: true },
    take: 200,
  });
  return entities.map(e => e.title);
}

/**
 * Generate differentiation for a single supporting page
 * Implements the 3-Layer Safety Net
 */
async function generatePageDifferentiation(
  supportingPage,
  alphaPage,
  blacklist,
  siteId,
  allPageIds,
  siteLanguage = 'en',
  accountId = null,
  userId = null
) {
  const blacklistText = blacklist.slice(0, 50).join('\n- ');

  const systemPrompt = `You are an Elite SEO Strategist specializing in content cannibalization resolution.
Your task is to DIFFERENTIATE a supporting page so it no longer competes with the Alpha (strongest) page.

CRITICAL RULES:
- The supporting page must get a COMPLETELY NEW search intent that is DISTINCT from the Alpha page.
- The new intent should be a RELATED but DIFFERENT angle (e.g., if Alpha targets "Web Development", the supporting page could target "How to Choose a Web Developer" or "Web Development Costs in 2025").
- Generate surgical content diffs — only modify paragraphs that need refocusing. Do NOT rewrite the entire page.
- The internal link sentence must feel natural and link to the Alpha page.
- Language: ${siteLanguage}

DO NOT use these search intents as they already exist on the site:
- ${blacklistText}`;

  const userPrompt = `ALPHA PAGE (do not alter this — others will link to it):
Title: ${alphaPage.title}
URL: ${alphaPage.url || alphaPage.slug}
H1: ${alphaPage.title}

SUPPORTING PAGE TO DIFFERENTIATE:
Title: ${supportingPage.title}
URL: ${supportingPage.url || supportingPage.slug}
Current H1: ${supportingPage.title}
Content (first 3000 chars):
${(supportingPage.content || '').substring(0, 3000)}

Generate a new unique focus intent and surgical content changes for the supporting page.`;

  let lastResult = null;
  let attempts = 0;

  while (attempts <= MAX_AI_RETRIES) {
    attempts++;

    const result = await generateStructuredResponse({
      system: systemPrompt,
      prompt: userPrompt + (attempts > 1 ? `\n\nPREVIOUS ATTEMPT WAS REJECTED because the new H1 overlapped with existing content. Generate a MORE DISTINCT intent this time. Attempt ${attempts}/${MAX_AI_RETRIES + 1}.` : ''),
      schema: DifferentiationOutputSchema,
      temperature: 0.7 + (attempts * 0.1), // Increase creativity on retries
      operation: 'CONTENT_DIFFERENTIATION',
      metadata: { pageId: supportingPage.id, attempt: attempts },
      modelOverride: MODELS.PRO_PREVIEW,
      accountId,
      siteId,
      userId,
    });

    lastResult = result;

    // Layer 1: Pre-Check — verify intent doesn't match existing content
    const intentIsUnique = await preCheckIntent(result.newFocusIntent, siteId, allPageIds);
    if (!intentIsUnique && attempts <= MAX_AI_RETRIES) {
      console.log(`[Differentiation] Layer 1 failed for page ${supportingPage.id}, retrying...`);
      continue;
    }

    // Layer 3: Validation — check H1 doesn't overlap with blacklist
    if (!validateNoOverlap(result.newH1, blacklist) && attempts <= MAX_AI_RETRIES) {
      console.log(`[Differentiation] Layer 3 failed for page ${supportingPage.id}, retrying...`);
      continue;
    }

    // All checks passed (or max retries reached)
    break;
  }

  return lastResult;
}

// ═══ UPDATE JOB PROGRESS ════════════════════════════════════════════════════

async function updateJobProgress(jobId, progress, message, extra = {}) {
  try {
    await prisma.backgroundJob.update({
      where: { id: jobId },
      data: { progress, message, ...extra },
    });
  } catch (err) {
    console.error(`[BackgroundJob] Failed to update progress for ${jobId}:`, err.message);
  }
}

// ═══ MAIN BACKGROUND TASK ═══════════════════════════════════════════════════

/**
 * Process the content differentiation job asynchronously.
 * Updates the BackgroundJob record at each step.
 */
async function processDifferentiationJob(jobId) {
  try {
    // Load the job
    const job = await prisma.backgroundJob.findUnique({ where: { id: jobId } });
    if (!job || job.status !== 'PROCESSING') return;

    const { pageIds, siteId, siteLanguage } = job.inputData || {};
    if (!pageIds?.length || !siteId) {
      await updateJobProgress(jobId, 0, 'Invalid input data', {
        status: 'FAILED',
        error: 'Missing pageIds or siteId in inputData',
      });
      return;
    }

    // ─── Step 1: Alpha Page Algorithm (Progress: 10%) ───────────────────
    await updateJobProgress(jobId, 5, 'Analyzing pages to identify the strongest content...');

    const pages = await prisma.siteEntity.findMany({
      where: { id: { in: pageIds }, siteId },
      select: {
        id: true,
        title: true,
        slug: true,
        url: true,
        content: true,
        metadata: true,
        seoData: true,
        externalId: true,
      },
    });

    if (pages.length < 2) {
      await updateJobProgress(jobId, 0, 'Need at least 2 pages to differentiate', {
        status: 'FAILED',
        error: 'Insufficient pages — need at least 2',
      });
      return;
    }

    // Fetch GSC/GA data if available (gracefully degrade to content-length fallback)
    let gscData = {};
    let gaData = {};
    try {
      const googleIntegration = await prisma.googleIntegration.findFirst({
        where: { siteId },
        select: {
          id: true,
          accessToken: true,
          refreshToken: true,
          tokenExpiresAt: true,
          gscConnected: true,
          gscSiteUrl: true,
        },
      });
      if (googleIntegration?.gscConnected && googleIntegration?.gscSiteUrl) {
        // Get a valid access token (refresh if needed)
        let accessToken = googleIntegration.accessToken;
        if (googleIntegration.tokenExpiresAt && new Date(googleIntegration.tokenExpiresAt) <= new Date(Date.now() + 5 * 60 * 1000)) {
          if (googleIntegration.refreshToken) {
            try {
              const result = await refreshAccessToken(googleIntegration.refreshToken);
              accessToken = result.access_token;
              const newExpiry = new Date(Date.now() + (result.expires_in - 60) * 1000);
              await prisma.googleIntegration.update({
                where: { id: googleIntegration.id },
                data: { accessToken: result.access_token, tokenExpiresAt: newExpiry },
              });
            } catch { accessToken = null; }
          } else {
            accessToken = null;
          }
        }
        if (accessToken) {
          const metrics = await Promise.all(
            pages.map(async (page) => {
              const pageUrl = page.url || page.slug;
              try {
                const m = await fetchGSCPageMetrics(accessToken, googleIntegration.gscSiteUrl, pageUrl, 30);
                return { pageId: page.id, clicks: m?.clicks || 0, impressions: m?.impressions || 0 };
              } catch { return null; }
            })
          );
          for (const m of metrics) {
            if (m) gscData[m.pageId] = { clicks: m.clicks, impressions: m.impressions };
          }
        }
      }
    } catch {
      // GSC/GA data not available — fallback to content-length ranking
    }

    const alphaPage = selectAlphaPage(pages, gscData, gaData);
    const supportingPages = pages.filter(p => p.id !== alphaPage.id);

    await updateJobProgress(jobId, 10, `Alpha page identified: "${alphaPage.title}". Processing ${supportingPages.length} supporting pages...`);

    // ─── Step 2: 3-Layer Safety Net & AI Generation (Progress: 30% → 80%) ──
    const allPageIds = pages.map(p => p.id);
    const blacklist = await buildBlacklist(siteId, allPageIds);

    await updateJobProgress(jobId, 30, 'Generating differentiation strategies with AI safety net...');

    const pageDiffs = [];
    const progressPerPage = 50 / supportingPages.length; // Distribute 30→80 across pages

    for (let i = 0; i < supportingPages.length; i++) {
      const sp = supportingPages[i];
      const currentProgress = Math.round(30 + (i * progressPerPage));

      await updateJobProgress(jobId, currentProgress, `Differentiating: "${sp.title}" (${i + 1}/${supportingPages.length})...`);

      try {
        const diff = await generatePageDifferentiation(
          sp, alphaPage, blacklist, siteId, allPageIds, siteLanguage || 'en', job.accountId, job.userId
        );

        pageDiffs.push({
          pageId: sp.id,
          externalId: sp.externalId,
          title: sp.title,
          url: sp.url || sp.slug,
          slug: sp.slug,
          oldH1: sp.title,
          newH1: diff.newH1,
          newFocusIntent: diff.newFocusIntent,
          contentDiffs: diff.contentDiffs || [],
          internalLinkSentence: diff.internalLinkSentence,
        });

        // Add new H1 to blacklist to prevent subsequent pages from overlapping
        blacklist.push(diff.newH1);
        blacklist.push(diff.newFocusIntent);
      } catch (aiError) {
        console.error(`[Differentiation] AI failed for page ${sp.id}:`, aiError.message);
        pageDiffs.push({
          pageId: sp.id,
          externalId: sp.externalId,
          title: sp.title,
          url: sp.url || sp.slug,
          slug: sp.slug,
          error: aiError.message,
        });
      }
    }

    // ─── Step 3: Format resultData (Progress: 100%) ─────────────────────
    await updateJobProgress(jobId, 90, 'Formatting differentiation strategy...');

    const successfulDiffs = pageDiffs.filter(d => !d.error);
    const totalCredits = successfulDiffs.length * CREDITS_PER_PAGE;

    const resultData = {
      alphaPage: {
        id: alphaPage.id,
        externalId: alphaPage.externalId,
        title: alphaPage.title,
        url: alphaPage.url || alphaPage.slug,
        slug: alphaPage.slug,
        isAlpha: true,
        gscClicks: gscData[alphaPage.id]?.clicks || 0,
      },
      supportingPages: pageDiffs,
      summary: {
        totalPages: pages.length,
        successfulDiffs: successfulDiffs.length,
        failedDiffs: pageDiffs.length - successfulDiffs.length,
        estimatedCredits: totalCredits,
      },
    };

    await prisma.backgroundJob.update({
      where: { id: jobId },
      data: {
        status: 'COMPLETED',
        progress: 100,
        message: `Strategy ready: ${successfulDiffs.length} pages differentiated`,
        resultData,
      },
    });

    console.log(`[Differentiation] Job ${jobId} completed: ${successfulDiffs.length}/${pageDiffs.length} pages differentiated`);
  } catch (error) {
    console.error(`[Differentiation] Job ${jobId} failed:`, error);
    await updateJobProgress(jobId, 0, null, {
      status: 'FAILED',
      error: error.message || 'Unexpected error during differentiation',
    });
  }
}

// ═══ PUBLIC API ══════════════════════════════════════════════════════════════

/**
 * Start a content differentiation background job.
 * Creates the BackgroundJob record, returns the jobId immediately,
 * then fires the async processing without blocking the response.
 * 
 * @param {Object} params
 * @param {string[]} params.pageIds - SiteEntity IDs to differentiate
 * @param {string} params.siteId - Site ID
 * @param {string} params.userId - User who triggered
 * @param {string} params.accountId - Account ID
 * @param {string} [params.siteLanguage] - Site language for AI prompts
 * @returns {Promise<{jobId: string}>}
 */
export async function startDifferentiationJob({ pageIds, siteId, userId, accountId, siteLanguage }) {
  // Create the job record
  const job = await prisma.backgroundJob.create({
    data: {
      userId,
      accountId,
      siteId,
      type: 'CONTENT_DIFFERENTIATION',
      status: 'PROCESSING',
      progress: 0,
      message: 'Initializing content differentiation...',
      inputData: { pageIds, siteId, siteLanguage },
    },
  });

  // Fire async processing (non-blocking — the promise runs in the background)
  // In Vercel, this leverages the event loop before the function freezes.
  // For long jobs, the cron/webhook pattern ensures completion.
  processDifferentiationJob(job.id).catch(err => {
    console.error(`[Differentiation] Background task error for job ${job.id}:`, err);
    prisma.backgroundJob.update({
      where: { id: job.id },
      data: { status: 'FAILED', error: err.message },
    }).catch(() => {});
  });

  return { jobId: job.id };
}

/**
 * Execute approved differentiation fixes.
 * Deducts AI credits, updates local SiteEntity records,
 * and pushes changes to WordPress if connected.
 * 
 * @param {Object} params
 * @param {string} params.jobId - BackgroundJob ID
 * @param {string} params.userId - User executing
 * @param {string} params.accountId - Account for credit deduction
 * @param {string} params.siteId - Site ID
 * @returns {Promise<{success: boolean, actions: Array}>}
 */
export async function executeDifferentiationFixes({ jobId, userId, accountId, siteId }) {
  const job = await prisma.backgroundJob.findUnique({ where: { id: jobId } });
  if (!job || job.status !== 'COMPLETED') {
    throw new Error('Job not found or not completed');
  }
  if (job.accountId !== accountId) {
    throw new Error('Unauthorized — job belongs to a different account');
  }

  const { alphaPage, supportingPages, summary } = job.resultData || {};
  if (!alphaPage || !supportingPages?.length) {
    throw new Error('No differentiation data found in job results');
  }

  const successfulPages = supportingPages.filter(p => !p.error);
  if (successfulPages.length === 0) {
    throw new Error('No successfully differentiated pages to execute');
  }

  const totalCredits = summary?.estimatedCredits || successfulPages.length * CREDITS_PER_PAGE;

  // Credits already tracked via trackAIUsage inside generateStructuredResponse during generation phase.
  // No separate deductAiCredits call needed here to avoid double-counting.

  const actions = [];

  // Update local SiteEntity records
  for (const page of successfulPages) {
    try {
      // Update the entity title (H1)
      const updateData = {};
      if (page.newH1) {
        updateData.title = page.newH1;
      }

      // Fetch existing content to apply diffs
      const existingEntity = await prisma.siteEntity.findUnique({
        where: { id: page.pageId },
        select: { content: true, entityTypeId: true },
      });

      let updatedContent = existingEntity?.content || '';
      let contentChanged = false;

      // Apply content diffs (paragraph replacements)
      if (page.contentDiffs?.length > 0) {
        for (const diff of page.contentDiffs) {
          if (diff.oldParagraph && diff.newParagraph) {
            if (updatedContent.includes(diff.oldParagraph)) {
              updatedContent = updatedContent.replace(diff.oldParagraph, diff.newParagraph);
              contentChanged = true;
            } else {
              // Fuzzy match: try trimmed version
              const trimmedOld = diff.oldParagraph.trim();
              if (trimmedOld && updatedContent.includes(trimmedOld)) {
                updatedContent = updatedContent.replace(trimmedOld, diff.newParagraph.trim());
                contentChanged = true;
              }
            }
          }
        }
      }

      // Append internal link sentence
      if (page.internalLinkSentence) {
        const alphaUrl = alphaPage.url || `/${alphaPage.slug}`;
        const linkHtml = `<p>${page.internalLinkSentence.replace(
          alphaPage.title,
          `<a href="${alphaUrl}">${alphaPage.title}</a>`
        )}</p>`;
        updatedContent += `\n${linkHtml}`;
        contentChanged = true;
      }

      if (contentChanged) {
        updateData.content = updatedContent;
      }

      if (Object.keys(updateData).length > 0) {
        await prisma.siteEntity.update({
          where: { id: page.pageId },
          data: updateData,
        });
      }

      actions.push({
        type: 'entity_updated',
        status: 'success',
        pageId: page.pageId,
        title: page.newH1 || page.title,
        entityTypeId: existingEntity?.entityTypeId,
      });
    } catch (err) {
      actions.push({
        type: 'entity_updated',
        status: 'failed',
        pageId: page.pageId,
        error: err.message,
      });
    }
  }

  // Push to WordPress if plugin is connected
  try {
    const site = await prisma.site.findUnique({
      where: { id: siteId },
      select: {
        id: true,
        url: true,
        siteKey: true,
        siteSecret: true,
        connectionStatus: true,
      },
    });

    if (site?.connectionStatus === 'CONNECTED' && site.siteKey && site.siteSecret) {
      const { updatePost, updateSeoData } = await import('../wp-api-client.js');

      // Build a map of entityTypeId → postType slug for correct WP endpoint
      const entityTypeIds = [...new Set(
        actions.filter(a => a.entityTypeId).map(a => a.entityTypeId)
      )];
      const entityTypeMap = {};
      if (entityTypeIds.length > 0) {
        const types = await prisma.siteEntityType.findMany({
          where: { id: { in: entityTypeIds } },
          select: { id: true, slug: true },
        });
        for (const t of types) entityTypeMap[t.id] = t.slug;
      }

      for (const page of successfulPages) {
        if (!page.externalId) continue;

        // Determine WP post type from entity type
        const entityAction = actions.find(a => a.pageId === page.pageId && a.entityTypeId);
        const postTypeSlug = entityTypeMap[entityAction?.entityTypeId] || 'post';
        // Normalize: "posts" → "post", "pages" → "page", otherwise use as-is (CPT)
        const postType = postTypeSlug.replace(/s$/, '');

        try {
          // Update post content and title in WordPress
          const wpUpdateData = {};
          if (page.newH1) wpUpdateData.title = page.newH1;

          // Send old_h1/new_h1 so the plugin can update H1 in Elementor/shortcodes/builders
          if (page.newH1 && page.oldH1) {
            wpUpdateData.old_h1 = page.oldH1;
            wpUpdateData.new_h1 = page.newH1;
          }

          // Read the already-updated content from DB
          const entity = await prisma.siteEntity.findUnique({
            where: { id: page.pageId },
            select: { content: true },
          });

          if (entity?.content) {
            wpUpdateData.content = entity.content;
          }

          if (Object.keys(wpUpdateData).length > 0) {
            await updatePost(site, postType, page.externalId, wpUpdateData);
            actions.push({
              type: 'wp_content_updated',
              status: 'success',
              pageId: page.pageId,
              externalId: page.externalId,
            });
          }

          // Update SEO data if focus keyword changed
          if (page.newFocusIntent) {
            await updateSeoData(site, page.externalId, {
              focus_keyword: page.newFocusIntent,
            });
            actions.push({
              type: 'wp_seo_updated',
              status: 'success',
              pageId: page.pageId,
              focusKeyword: page.newFocusIntent,
            });
          }
        } catch (wpErr) {
          actions.push({
            type: 'wp_update_failed',
            status: 'failed',
            pageId: page.pageId,
            error: wpErr.message,
          });
        }
      }
    }
  } catch (wpError) {
    console.error('[Differentiation] WordPress push error:', wpError.message);
    actions.push({
      type: 'wp_push_error',
      status: 'failed',
      error: wpError.message,
    });
  }

  // Update job with execution results
  await prisma.backgroundJob.update({
    where: { id: jobId },
    data: {
      status: 'COMPLETED',
      message: `Executed: ${actions.filter(a => a.status === 'success').length} successful actions`,
      resultData: {
        ...job.resultData,
        executionResult: {
          actions,
          executedAt: new Date().toISOString(),
          executedBy: userId,
          creditsDeducted: totalCredits,
        },
      },
    },
  });

  return { success: true, actions, creditsDeducted: totalCredits };
}

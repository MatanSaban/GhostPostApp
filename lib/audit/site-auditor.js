/**
 * Site Audit Engine v2 - Hybrid Audit Orchestrator
 *
 * Coordinates all audit modules into a single pipeline:
 *
 * Phase 1 - Smart Discovery:  DB entities → WP API → Sitemap → Crawl
 * Phase 2 - Per-Page Scan:    Playwright (DOM + screenshots + errors) or Fetch + Cheerio
 * Phase 3 - Performance:      Google PageSpeed Insights API (CWV)
 * Phase 4 - AI Vision:        Gemini 3.1 Pro Vision (desktop + mobile screenshots)
 * Phase 5 - Scoring:          Weighted deduction across technical / performance / visual
 *
 * Concurrency is capped at 3 pages in parallel via pLimit().
 * Playwright is optional - gracefully falls back to fetch + cheerio.
 * PSI is called for the top 3 pages only (API rate limits).
 * AI Vision analyzes homepage screenshots only.
 */

import prisma from '@/lib/prisma';
import { BOT_FETCH_HEADERS } from '@/lib/bot-identity';
import { discoverUrls } from './url-discovery.js';
import { createBrowserScanner, scanPage } from './playwright-scanner.js';
import { getPageSpeedInsights } from './pagespeed-client.js';
import { analyzeVisualIssues } from './vision-analyzer.js';
import { analyzeHtml, checkRobotsAndSitemap } from './html-analyzer.js';
import { getSearchEngineVisibility } from '@/lib/wp-api-client.js';
import { calculateAuditScore } from './scoring.js';
import { generateAuditSummary, translateAuditSummary } from './summary-generator.js';
import { notifyAccountMembers } from '@/lib/notifications';
import { syncWidgetData } from '@/lib/widget-sync';
import { invalidateAudit } from '@/lib/cache/invalidate.js';
import {
  resolveAuditFolder,
  uploadPageScreenshot,
  uploadSegmentedScreenshots,
  uploadFilmstripFrames,
} from './cloudinary-screenshots.js';

// ─── Configuration ────────────────────────────────────────────

const DEFAULT_MAX_PAGES = 500;
const CONCURRENCY = 3;
const PSI_CONCURRENCY = 2; // PSI is slow - run 2 at a time to avoid rate limits

// ─── Utility: Retry Prisma writes on transient errors ───────

async function dbWrite(fn, retries = 3) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const isTransient =
        err?.code === 'P2010' ||
        err?.code === 'P2034' ||
        err?.message?.includes('forcibly closed') ||
        err?.message?.includes('ECONNRESET') ||
        err?.message?.includes('write conflict') ||
        err?.message?.includes('deadlock');
      if (isTransient && attempt <= retries) {
        const delay = attempt * 500;
        console.warn(`[SiteAudit] DB write error (attempt ${attempt}/${retries}) - retrying in ${delay}ms…`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
}

// ─── Utility: Simple Concurrency Limiter ────────────────────

function pLimit(concurrency) {
  let active = 0;
  const queue = [];

  function next() {
    if (active >= concurrency || queue.length === 0) return;
    active++;
    const { fn, resolve, reject } = queue.shift();
    fn()
      .then(resolve, reject)
      .finally(() => {
        active--;
        next();
      });
  }

  return function limit(fn) {
    return new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject });
      next();
    });
  };
}

// ─── Utility: Normalize URL ─────────────────────────────────

function normalizeUrl(url) {
  if (!url) return '';
  if (!url.startsWith('http')) url = 'https://' + url;
  return url.replace(/\/+$/, '');
}

// ─── Main Entry Point ───────────────────────────────────────

/**
 * Run a comprehensive site audit
 *
 * @param {string} auditId - SiteAudit record ID
 * @param {string} siteUrl - Website URL
 * @param {string} siteId  - Site record ID (for DB lookups)
 * @param {string} [deviceType] - "desktop" | "mobile" - run audit for specific device only
 * @param {Object} [options] - Audit options
 * @param {number} [options.maxPages] - Maximum pages to scan (capped by plan, default: DEFAULT_MAX_PAGES)
 * @param {string[]} [options.urls] - Explicit URLs to audit (skip discovery if provided)
 */
export async function runSiteAudit(auditId, siteUrl, siteId, deviceType, options = {}) {
  const maxPages = options.maxPages || DEFAULT_MAX_PAGES;
  const url = normalizeUrl(siteUrl);

  try {
    // ── Mark as RUNNING ──────────────────────────────────
    await dbWrite(() =>
      prisma.siteAudit.update({
        where: { id: auditId },
        data: { status: 'RUNNING', startedAt: new Date() },
      })
    );

    // ══════════════════════════════════════════════════════
    // PHASE 1: SMART URL DISCOVERY
    // ══════════════════════════════════════════════════════

    const site = await prisma.site.findUnique({
      where: { id: siteId },
      select: { id: true, url: true, name: true, accountId: true, connectionStatus: true, siteKey: true, siteSecret: true, platform: true, contentLanguage: true },
    });

    let urls, method, hasSitemap;

    if (options.urls?.length) {
      // Explicit URLs provided (e.g. from entity selector) - skip discovery
      urls = options.urls.slice(0, maxPages);
      method = 'explicit';
      hasSitemap = true;
      console.log(`[SiteAudit] Using ${urls.length} explicit URLs for audit ${auditId}`);
    } else {
      ({ urls, method, hasSitemap } = await discoverUrls(site, { maxUrls: maxPages }));
      console.log(
        `[SiteAudit] Discovered ${urls.length} URLs via "${method}" for audit ${auditId} (sitemap: ${hasSitemap})`
      );
    }

    // Abort only if discovery returned zero URLs across every strategy.
    // A missing sitemap on its own is a quality issue, not a fatal one - sites
    // discovered via the plugin / WP REST / crawl paths should still be audited.
    if (!urls || urls.length === 0) {
      console.log(`[SiteAudit] No URLs discovered - aborting audit ${auditId} (no charge)`);

      await dbWrite(() =>
        prisma.siteAudit.update({
          where: { id: auditId },
          data: {
            status: 'FAILED',
            completedAt: new Date(),
            score: 0,
            pagesScanned: 0,
            discoveryMethod: method,
            progress: {
              currentStep: 1,
              totalSteps: 1,
              percentage: 100,
              labelKey: 'siteAudit.progress.complete',
              failureReason: 'NO_URLS',
            },
            issues: [{
              type: 'technical',
              severity: 'error',
              message: 'audit.issues.noUrlsDiscovered',
              url: url,
              suggestion: 'audit.suggestions.addSitemap',
              source: 'system',
            }],
          },
        })
      );
      invalidateAudit(siteId);

      // Chat follow-up on the no-URLs failure path too.
      if (options.chatConversationId) {
        postAuditChatFollowUp(options.chatConversationId, {
          siteId,
          success: false,
          error: 'No URLs discovered for this site (sitemap, plugin, and crawl all returned empty).',
        }).catch(() => {});
      }

      // FAILED audits are excluded from the billing count in account-limits.js
      return; // Stop - nothing further to scan
    }

    const pagesToScan = urls.slice(0, maxPages);

    await dbWrite(() =>
      prisma.siteAudit.update({
        where: { id: auditId },
        data: {
          pagesFound: urls.length,
          discoveryMethod: method,
          progress: {
            currentStep: 0,
            totalSteps: pagesToScan.length + 3,
            labelKey: 'siteAudit.progress.discoveredPages',
            labelParams: { count: urls.length },
            percentage: 0,
          },
        },
      })
    );

    // Track all issues
    const allIssues = [];

    // If discovery succeeded via a non-sitemap path, the audit still proceeds
    // but we surface the missing sitemap as a warning - it's an SEO best
    // practice that helps crawlers, even when not strictly required.
    if (!hasSitemap) {
      allIssues.push({
        type: 'technical',
        severity: 'warning',
        message: 'audit.issues.noSitemap',
        url: site.url,
        suggestion: 'audit.suggestions.addSitemap',
        source: 'system',
      });
    }

    // ══════════════════════════════════════════════════════
    // PHASE 2: LAUNCH HEADLESS BROWSER (optional)
    // ══════════════════════════════════════════════════════

    let scanner = null;
    try {
      scanner = await createBrowserScanner();
      console.log('[SiteAudit] Playwright browser launched successfully');
    } catch (err) {
      console.warn(
        '[SiteAudit] Playwright unavailable - using fetch-only mode:',
        err.message
      );
    }

    // ══════════════════════════════════════════════════════
    // PHASE 3: SCAN PAGES IN PARALLEL (max 3 concurrent)
    // ══════════════════════════════════════════════════════

    const limit = pLimit(CONCURRENCY);
    // PSI is rate-limited and slow. Wrap calls in a dedicated limiter so PSI
    // can't saturate Google's quota even if many pages run it.
    const psiLimit = pLimit(PSI_CONCURRENCY);
    const pageResults = [];
    const pageScreenshots = {}; // url -> { desktop?: Buffer, mobile?: Buffer }
    const pageSegmentedScreenshots = {}; // url -> { desktop?: Buffer[], mobile?: Buffer[] }
    const pageFilmstrips = {}; // url -> { desktop?: [{stage, buffer}], mobile?: [{stage, buffer}] }
    const visionPages = []; // { url, desktop: Buffer, mobile: Buffer } - for AI Vision
    const allInternalLinks = []; // { sourceUrl, href, anchorText } - for broken link detection
    let homepageScreenshots = null;
    let scannedCount = 0;
    const totalSteps = pagesToScan.length + 3; // +3 for discovery, vision, scoring

    const scanTasks = pagesToScan.map((pageUrl, index) =>
      limit(async () => {
        const isHomepage = index === 0;

        try {
          const result = await scanSinglePage(
            pageUrl,
            scanner,
            isHomepage,
            index < 3,
            deviceType,
            psiLimit
          );
          allIssues.push(...result.issues);
          pageResults.push(result.pageResult);

          // Collect internal links for cross-page broken link detection
          if (result.internalLinks?.length) {
            for (const link of result.internalLinks) {
              allInternalLinks.push({ sourceUrl: pageUrl, ...link });
            }
          }
          // Keep raw Buffers - they'll be uploaded to Cloudinary later
          if (result.screenshots) {
            pageScreenshots[pageUrl] = {
              desktop: result.screenshots.desktop || null,
              mobile: result.screenshots.mobile || null,
            };

            // Collect for AI Vision analysis (all pages)
            visionPages.push({
              url: pageUrl,
              desktop: result.screenshots.desktop || null,
              mobile: result.screenshots.mobile || null,
            });

            if (isHomepage) {
              homepageScreenshots = result.screenshots;
            }
          }

          // Keep raw Buffer arrays
          if (result.segmentedScreenshots) {
            pageSegmentedScreenshots[pageUrl] = {
              desktop: result.segmentedScreenshots.desktop || null,
              mobile: result.segmentedScreenshots.mobile || null,
            };
          }

          // Keep raw filmstrip buffers
          if (result.filmstrip) {
            pageFilmstrips[pageUrl] = {
              desktop: result.filmstrip.desktop || null,
              mobile: result.filmstrip.mobile || null,
            };
          }
        } catch (err) {
          console.warn(
            `[SiteAudit] Page scan failed for ${pageUrl}:`,
            err.message
          );
          allIssues.push({
            type: 'technical',
            severity: 'error',
            message: 'audit.issues.pageLoadFailed',
            url: pageUrl,
            suggestion: 'audit.suggestions.checkUrl',
            source: 'system',
          });
        }

        scannedCount++;

        // Progress update every page (granular)
        const currentStep = 1 + scannedCount; // step 1 = discovery
        const percentage = Math.round((currentStep / totalSteps) * 100);
        const pathName = (() => {
          try {
            const u = new URL(pageUrl);
            return u.hostname.replace(/^www\./, '') + decodeURIComponent(u.pathname);
          } catch { return pageUrl; }
        })();

        await prisma.siteAudit
          .update({
            where: { id: auditId },
            data: {
              pagesScanned: scannedCount,
              progress: {
                currentStep,
                totalSteps,
                labelKey: 'siteAudit.progress.scanningPage',
                labelParams: { current: scannedCount, total: pagesToScan.length, page: pathName },
                percentage: Math.min(85, percentage),
              },
            },
          })
          .catch(() => {}); // Non-critical
      })
    );

    await Promise.allSettled(scanTasks);

    // ── Broken Internal Link Detection ──────────────────
    // Cross-reference internal links against scanned pages to find 404s
    if (allInternalLinks.length > 0) {
      try {
        const scannedUrlMap = new Map(); // normalised URL → statusCode
        for (const pr of pageResults) {
          if (pr.url && pr.statusCode) {
            scannedUrlMap.set(normalizeUrl(pr.url), pr.statusCode);
          }
        }

        // Deduplicate internal links by href (keep first occurrence per source page)
        const uniqueLinks = new Map(); // normalised href → { sourceUrl, href, anchorText }[]
        for (const link of allInternalLinks) {
          const norm = normalizeUrl(link.href);
          if (!uniqueLinks.has(norm)) uniqueLinks.set(norm, []);
          uniqueLinks.get(norm).push(link);
        }

        // Check unscanned links with HEAD requests (max 20 to avoid slowdown)
        const uncheckedLinks = [...uniqueLinks.keys()].filter(norm => !scannedUrlMap.has(norm));
        const linksToCheck = uncheckedLinks.slice(0, 20);

        const headResults = await Promise.allSettled(
          linksToCheck.map(async (normUrl) => {
            const original = uniqueLinks.get(normUrl)?.[0]?.href || normUrl;
            try {
              const controller = new AbortController();
              const timeoutId = setTimeout(() => controller.abort(), 8000);
              const res = await fetch(original, {
                method: 'HEAD',
                signal: controller.signal,
                headers: BOT_FETCH_HEADERS,
                redirect: 'follow',
              });
              clearTimeout(timeoutId);
              scannedUrlMap.set(normUrl, res.status);
            } catch {
              // Treat fetch failures as broken
              scannedUrlMap.set(normUrl, 0);
            }
          })
        );

        // Generate broken link issues
        for (const [normHref, linkInstances] of uniqueLinks) {
          const status = scannedUrlMap.get(normHref);
          if (status && (status === 404 || status === 410)) {
            // Group by source page
            const bySourcePage = new Map();
            for (const inst of linkInstances) {
              if (!bySourcePage.has(inst.sourceUrl)) bySourcePage.set(inst.sourceUrl, []);
              bySourcePage.get(inst.sourceUrl).push(inst);
            }

            for (const [sourceUrl, instances] of bySourcePage) {
              allIssues.push({
                type: 'technical',
                severity: 'error',
                message: 'audit.issues.brokenInternalLink',
                url: sourceUrl,
                suggestion: 'audit.suggestions.fixBrokenInternalLink',
                source: 'playwright',
                details: JSON.stringify({
                  brokenHref: instances[0].href,
                  anchorText: instances[0].anchorText || '',
                  statusCode: status,
                }),
                detailedSources: instances.map(i => ({
                  href: i.href,
                  anchorText: i.anchorText,
                  statusCode: status,
                })),
              });
            }
          }
        }
      } catch (err) {
        console.warn('[SiteAudit] Broken internal link detection failed:', err.message);
      }
    }

    // ── Duplicate Titles / Meta Descriptions (cross-page) ──
    // Requires >=2 pages scanned. We group by normalized string and flag any
    // duplicates on every affected page so the issue shows up with a clear
    // per-URL drill-down.
    if (pageResults.length > 1) {
      const norm = (s) => (s || '').trim().toLowerCase().replace(/\s+/g, ' ');

      const titleMap = new Map();   // normTitle → [url]
      const descMap = new Map();    // normDesc → [url]
      for (const pr of pageResults) {
        const t = norm(pr.title);
        if (t) {
          if (!titleMap.has(t)) titleMap.set(t, []);
          titleMap.get(t).push(pr.url);
        }
        const d = norm(pr.metaDescription);
        if (d) {
          if (!descMap.has(d)) descMap.set(d, []);
          descMap.get(d).push(pr.url);
        }
      }

      for (const [, urls] of titleMap) {
        if (urls.length > 1) {
          for (const pageUrl of urls) {
            allIssues.push({
              type: 'technical',
              severity: 'warning',
              message: 'audit.issues.duplicateTitle',
              url: pageUrl,
              suggestion: 'audit.suggestions.uniqueTitle',
              source: 'system',
              details: `${urls.length} pages share this title`,
              detailedSources: urls.filter((u) => u !== pageUrl).slice(0, 10),
            });
          }
        }
      }

      for (const [, urls] of descMap) {
        if (urls.length > 1) {
          for (const pageUrl of urls) {
            allIssues.push({
              type: 'technical',
              severity: 'warning',
              message: 'audit.issues.duplicateMetaDescription',
              url: pageUrl,
              suggestion: 'audit.suggestions.uniqueMetaDescription',
              source: 'system',
              details: `${urls.length} pages share this description`,
              detailedSources: urls.filter((u) => u !== pageUrl).slice(0, 10),
            });
          }
        }
      }
    }

    // ── Robots & Sitemap (site-wide, not per-page) ──────
    const baseUrl = new URL(url).origin;
    const robotsSitemapIssues = await checkRobotsAndSitemap(baseUrl);
    allIssues.push(...robotsSitemapIssues);

    // ── WordPress: Check site-wide "Discourage search engines" setting ──
    const isPluginConnected = site?.connectionStatus === 'CONNECTED' && !!site?.siteKey;
    if (isPluginConnected) {
      try {
        const visibility = await getSearchEngineVisibility(site);
        if (visibility?.discouraged) {
          allIssues.push({
            type: 'technical',
            severity: 'error',
            message: 'audit.issues.wpSearchEngineDiscouraged',
            url: baseUrl,
            suggestion: 'audit.suggestions.fixWpSearchVisibility',
            source: 'html',
          });
        } else {
          allIssues.push({
            type: 'technical',
            severity: 'passed',
            message: 'audit.issues.wpSearchEngineVisible',
            url: baseUrl,
            source: 'html',
          });
        }
      } catch (err) {
        console.warn('[SiteAudit] Could not check WP search engine visibility:', err.message);
      }
    }

    // ══════════════════════════════════════════════════════
    // PHASE 4: AI VISUAL ANALYSIS (all scanned pages with screenshots)
    // ══════════════════════════════════════════════════════

    // Convert homepage screenshots to base64 for storage (backward compat)
    let screenshotsData = null;
    if (
      homepageScreenshots &&
      (homepageScreenshots.desktop || homepageScreenshots.mobile)
    ) {
      screenshotsData = {};
      if (homepageScreenshots.desktop) {
        console.log(`[SiteAudit] Desktop screenshot captured: ${Math.round(homepageScreenshots.desktop.length / 1024)}KB`);
      }
      if (homepageScreenshots.mobile) {
        console.log(`[SiteAudit] Mobile screenshot captured: ${Math.round(homepageScreenshots.mobile.length / 1024)}KB`);
      }
    }

    if (visionPages.length > 0) {
      try {
        console.log(`[SiteAudit] Running AI Visual Analysis on ${visionPages.length} pages...`);
        await prisma.siteAudit.update({
          where: { id: auditId },
          data: {
            progress: {
              currentStep: pagesToScan.length + 2,
              totalSteps: pagesToScan.length + 3,
              labelKey: 'siteAudit.progress.aiVisualAnalysis',
              percentage: 88,
            },
          },
        }).catch(() => {});
        const visualIssues = await analyzeVisualIssues(visionPages, url, { accountId: site.accountId, siteId, userId: options.userId });
        allIssues.push(...visualIssues);
        console.log(
          `[SiteAudit] AI found ${visualIssues.length} visual issues across ${visionPages.length} pages`
        );
      } catch (err) {
        console.warn('[SiteAudit] AI Vision analysis failed:', err.message);
      }
    } else {
      console.log('[SiteAudit] No screenshots captured - skipping AI Vision analysis');
    }

    // ══════════════════════════════════════════════════════
    // PHASE 5: SCORING & SAVE
    // ══════════════════════════════════════════════════════

    const { score, categoryScores } = calculateAuditScore(allIssues);
    const deduped = deduplicateIssues(allIssues);

    // ── Upload all screenshots to Cloudinary ────────────
    const cloudFolder = await resolveAuditFolder(auditId, siteId, url);
    console.log(`[SiteAudit] Uploading screenshots to Cloudinary folder: ${cloudFolder}`);

    // Upload homepage screenshots
    if (homepageScreenshots) {
      const [dUrl, mUrl] = await Promise.all([
        uploadPageScreenshot(homepageScreenshots.desktop, cloudFolder, url, 'desktop'),
        uploadPageScreenshot(homepageScreenshots.mobile, cloudFolder, url, 'mobile'),
      ]);
      screenshotsData = { desktop: dUrl, mobile: mUrl };
    }

    // Upload per-page screenshots to Cloudinary (all pages - no limit needed)
    const enrichedPageResults = await Promise.all(
      pageResults.map(async (pr) => {
        const ss   = pageScreenshots[pr.url];
        const seg  = pageSegmentedScreenshots[pr.url];
        const film = pageFilmstrips[pr.url];

        // Upload all media for this page in parallel - non-fatal per item
        const safeUpload = (fn) => fn.catch(err => {
          console.warn(`[SiteAudit] Screenshot upload failed for ${pr.url}:`, err.message);
          return null;
        });

        const [ssDesktop, ssMobile, segDesktop, segMobile, filmDesktop, filmMobile] =
          await Promise.all([
            safeUpload(uploadPageScreenshot(ss?.desktop, cloudFolder, pr.url, 'desktop')),
            safeUpload(uploadPageScreenshot(ss?.mobile, cloudFolder, pr.url, 'mobile')),
            safeUpload(uploadSegmentedScreenshots(seg?.desktop, cloudFolder, pr.url, 'desktop')),
            safeUpload(uploadSegmentedScreenshots(seg?.mobile, cloudFolder, pr.url, 'mobile')),
            safeUpload(uploadFilmstripFrames(film?.desktop, cloudFolder, pr.url, 'desktop')),
            safeUpload(uploadFilmstripFrames(film?.mobile, cloudFolder, pr.url, 'mobile')),
          ]);

        return {
          url: pr.url || '',
          statusCode: pr.statusCode || null,
          title: pr.title || null,
          metaDescription: pr.metaDescription || null,
          ttfb: pr.ttfb || null,
          performanceScore: pr.performanceScore || null,
          lcp: pr.lcp || null,
          cls: pr.cls || null,
          inp: pr.inp || null,
          jsErrors: (pr.jsErrors || []).map(e => typeof e === 'string' ? e : (e.text || JSON.stringify(e))),
          brokenResources: (pr.brokenResources || []).map(r => typeof r === 'string' ? r : JSON.stringify(r)),
          issueCount: pr.issueCount || 0,
          screenshotDesktop: ssDesktop || null,
          screenshotMobile: ssMobile || null,
          screenshotsDesktop: segDesktop || [],
          screenshotsMobile: segMobile || [],
          filmstripDesktop: filmDesktop || null,
          filmstripMobile: filmMobile || null,
        };
      })
    );

    console.log(
      `[SiteAudit] Uploaded screenshots for ${enrichedPageResults.length} pages to Cloudinary`
    );

    // ══════════════════════════════════════════════════════
    // PHASE 6: AI SUMMARY GENERATION (before COMPLETED write)
    // ══════════════════════════════════════════════════════

    let summary = null;
    const summaryTranslations = {};
    try {
      console.log('[SiteAudit] Generating AI summary...');
      summary = await generateAuditSummary(
        deduped,
        score,
        categoryScores,
        url,
        enrichedPageResults.length,
        { accountId: site.accountId, siteId, userId: options.userId }
      );
      if (summary) {
        console.log(`[SiteAudit] AI summary generated (${summary.length} chars)`);
        summaryTranslations.en = summary;

        // Pre-cache the initiating user's locale so they don't pay a translation
        // wait on first view. English users get the canonical summary directly.
        const userLocale = options.userLocale;
        if (userLocale && userLocale !== 'en') {
          try {
            const translated = await translateAuditSummary(summary, userLocale, {
              accountId: site.accountId,
              siteId,
              userId: options.userId,
              siteUrl: url,
            });
            if (translated) {
              summaryTranslations[userLocale] = translated;
              console.log(`[SiteAudit] Pre-cached summary translation (${userLocale})`);
            }
          } catch (err) {
            console.warn(`[SiteAudit] Pre-cache translation failed (${userLocale}):`, err.message);
          }
        }
      }
    } catch (err) {
      console.warn('[SiteAudit] AI summary generation failed:', err.message);
    }

    await dbWrite(() =>
      prisma.siteAudit.update({
        where: { id: auditId },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          score,
          categoryScores,
          deviceType: deviceType || null,
          pagesScanned: enrichedPageResults.length,
        progress: {
          currentStep: pagesToScan.length + 3,
          totalSteps: pagesToScan.length + 3,
          labelKey: 'siteAudit.progress.complete',
          percentage: 100,
        },
        issues: deduped.map((i) => {
          // Strip base64 element screenshots from accessibility details
          // to prevent exceeding MongoDB's 16MB document limit
          let details = i.details || null;
          if (i.type === 'accessibility' && typeof details === 'string') {
            try {
              const parsed = JSON.parse(details);
              if (parsed.nodes?.length) {
                parsed.nodes = parsed.nodes.map(({ elementScreenshot, ...rest }) => rest);
                details = JSON.stringify(parsed);
              }
            } catch { /* keep original */ }
          }

          // Defensive size caps: bound each field so a pathological page
          // (thousands of broken images, huge AI output, etc.) can't blow
          // past Mongo's 16MB per-document ceiling. The trimmed forms still
          // convey the signal; the raw data lives in the original scan pass
          // logs if needed for debugging.
          const MAX_TEXT = 2000;
          const MAX_SUGGESTION = 1000;
          const MAX_MESSAGE = 500;
          const MAX_SOURCES = 30;
          const trim = (s, n) => (typeof s === 'string' && s.length > n ? s.slice(0, n - 1) + '…' : s);

          return {
            type: i.type || 'technical',
            severity: i.severity || 'warning',
            message: trim(i.message || '', MAX_MESSAGE),
            url: i.url || null,
            suggestion: trim(i.suggestion || null, MAX_SUGGESTION),
            source: i.source || null,
            details: typeof details === 'string' ? trim(details, MAX_TEXT) : details,
            detailedSources: Array.isArray(i.detailedSources)
              ? i.detailedSources.slice(0, MAX_SOURCES)
              : (i.detailedSources || null),
            device: i.device || null,
            boundingBox: i.boundingBox || null,
          };
        }),
        screenshots: screenshotsData,
        pageResults: enrichedPageResults,
        ...(summary ? { summary, summaryTranslations } : {}),
      },
    })
    );
    invalidateAudit(siteId);

    // Cleanup
    if (scanner?.browser) {
      await scanner.browser.close().catch(() => {});
    }

    console.log(
      `[SiteAudit] ✓ Audit ${auditId} complete: score=${score}, pages=${enrichedPageResults.length}, issues=${deduped.length}`
    );
    // ── Notify account members ──────────────────────────
    notifyAccountMembers(site.accountId, {
      type: 'audit_complete',
      title: 'notifications.auditComplete.title',
      message: 'notifications.auditComplete.message',
      link: '/dashboard/technical-seo/site-audit',
      data: {
        auditId,
        siteId,
        siteName: site.name || site.url,
        score,
        deviceType: deviceType || null,
      },
    }).catch(() => {}); // fire-and-forget

    // ── Chat follow-up: when this audit was kicked off from the AI chat,
    // post a "audit finished" message back into the conversation so the
    // user sees the result without polling. Only the desktop run carries
    // the chatConversationId so they only get one message even though we
    // run desktop + mobile in parallel.
    if (options.chatConversationId) {
      postAuditChatFollowUp(options.chatConversationId, {
        siteId,
        success: true,
        score,
        pagesScanned: enrichedPageResults.length,
      }).catch(() => {});
    }

    // ── Push updated widget data to WordPress plugin ────
    syncWidgetData(siteId).catch(() => {}); // fire-and-forget
  } catch (error) {
    console.error(`[SiteAudit] Fatal error for audit ${auditId}:`, error);

    try {
      await dbWrite(() =>
        prisma.siteAudit.update({
          where: { id: auditId },
          data: {
            status: 'FAILED',
            completedAt: new Date(),
            score: 0,
            issues: [
              {
                type: 'technical',
                severity: 'error',
                message: 'audit.issues.auditFailed',
                suggestion: error.message?.slice(0, 300) || 'Unknown error',
                source: 'system',
              },
            ],
          },
        })
      );
      invalidateAudit(siteId);
    } catch {
      /* last resort - nothing we can do */
    }

    // Same chat follow-up on failure - the user is otherwise left waiting
    // for a result that will never arrive.
    if (options.chatConversationId) {
      postAuditChatFollowUp(options.chatConversationId, {
        siteId,
        success: false,
        error: error?.message,
      }).catch(() => {});
    }
  }
}

// ─── Single Page Scanner ────────────────────────────────────

export async function scanSinglePage(pageUrl, scanner, isHomepage, runPsi, deviceType, psiLimit) {
  // When the caller didn't pass a limiter (older call sites), still gate PSI
  // through a no-op wrapper so the rest of the code can call it uniformly.
  const psiRun = psiLimit ? (fn) => psiLimit(fn) : (fn) => fn();
  const issues = [];
  const pageResult = {
    url: pageUrl,
    jsErrors: [],
    brokenResources: [],
  };

  let html = '';
  let headers = {};

  // ── A. Playwright Scan (if available) ─────────────────

  if (scanner) {
    try {
      const pwResult = await scanPage(scanner, pageUrl, {
        captureScreenshots: true,
        deviceType,
        runAccessibility: true,
      });

      html = pwResult.html || '';
      pageResult.title = pwResult.dom?.title;
      pageResult.metaDescription = pwResult.dom?.metaDescription;
      pageResult.robotsMeta = pwResult.dom?.robotsMeta || null;
      pageResult.statusCode = pwResult.statusCode;
      pageResult.ttfb = pwResult.ttfb;
      pageResult.jsErrors = pwResult.jsErrors || [];
      pageResult.brokenResources = pwResult.brokenResources || [];
      issues.push(...(pwResult.issues || []));

      // Accessibility issues from Axe
      if (pwResult.accessibilityIssues?.length) {
        issues.push(...pwResult.accessibilityIssues);
      }

      // Run HTML analysis on rendered content. Pass the full response headers
      // (not just x-robots-tag) so security / cache / compression checks run.
      if (html) {
        const pwHeaders = pwResult.responseHeaders && Object.keys(pwResult.responseHeaders).length > 0
          ? pwResult.responseHeaders
          : (pwResult.xRobotsTag ? { 'x-robots-tag': pwResult.xRobotsTag } : {});
        const htmlIssues = analyzeHtml(html, pageUrl, pwHeaders, pwResult.ttfb, pwResult.dom, pwResult.imageResources);
        issues.push(...htmlIssues);
      }

      // PSI if requested (gated through shared concurrency limiter).
      // The PSI strategy tracks the audit's deviceType so a desktop audit
      // gets Lighthouse desktop scores (not mobile, which was the previous
      // default and produced misleading performance numbers).
      if (runPsi) {
        const psiStrategy = deviceType === 'desktop' ? 'desktop' : 'mobile';
        const psi = await psiRun(() => safePsi(pageUrl, psiStrategy));
        if (psi) {
          pageResult.performanceScore = psi.score;
          pageResult.lcp = psi.lcp;
          pageResult.cls = psi.cls;
          pageResult.inp = psi.inp;
          issues.push(...(psi.issues || []));
        }
      }

      pageResult.issueCount = issues.length;
      return {
        issues,
        pageResult,
        screenshots: pwResult.screenshots || null,
        segmentedScreenshots: pwResult.segmentedScreenshots || null,
        filmstrip: pwResult.filmstrip || null,
        internalLinks: pwResult.internalLinks || [],
      };
    } catch (err) {
      console.warn(
        `[SiteAudit] Playwright failed for ${pageUrl}, falling back to fetch:`,
        err.message
      );
      // Fall through to fetch-based scan
    }
  }

  // ── B. Fetch-Based Scan (fallback or primary) ─────────

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    const start = Date.now();

    const response = await fetch(pageUrl, {
      signal: controller.signal,
      headers: BOT_FETCH_HEADERS,
      redirect: 'follow',
    });
    clearTimeout(timeoutId);

    const ttfb = Date.now() - start;
    pageResult.ttfb = ttfb;
    pageResult.statusCode = response.status;
    headers = Object.fromEntries(response.headers.entries());

    html = await response.text();
    const htmlIssues = analyzeHtml(html, pageUrl, headers, ttfb);
    issues.push(...htmlIssues);

    // Extract basic meta from HTML
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    pageResult.title = titleMatch ? titleMatch[1].trim() : null;
    const descMatch = html.match(
      /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*?)["']/i
    );
    pageResult.metaDescription = descMatch ? descMatch[1].trim() : null;
  } catch (err) {
    issues.push({
      type: 'technical',
      severity: 'error',
      message: 'audit.issues.siteUnreachable',
      url: pageUrl,
      suggestion: 'audit.suggestions.checkUrl',
      source: 'fetch',
    });
  }

  // ── C. PageSpeed Insights (if requested) ──────────────

  if (runPsi) {
    const psiStrategy = deviceType === 'desktop' ? 'desktop' : 'mobile';
    const psi = await psiRun(() => safePsi(pageUrl, psiStrategy));
    if (psi) {
      pageResult.performanceScore = psi.score;
      pageResult.lcp = psi.lcp;
      pageResult.cls = psi.cls;
      pageResult.inp = psi.inp;
      issues.push(...(psi.issues || []));
    }
  }

  pageResult.issueCount = issues.length;
  return { issues, pageResult, screenshots: null, segmentedScreenshots: null, filmstrip: null, internalLinks: [] };
}

// ─── Helpers ────────────────────────────────────────────────

async function safePsi(pageUrl, strategy = 'mobile') {
  try {
    return await getPageSpeedInsights(pageUrl, strategy);
  } catch (err) {
    console.warn(`[SiteAudit] PSI (${strategy}) failed for ${pageUrl}:`, err.message);
    return null;
  }
}

/**
 * Deduplicate issues by message + url combination
 */
function deduplicateIssues(issues) {
  const seen = new Map();
  const result = [];

  for (const issue of issues) {
    const key = `${issue.message}::${issue.url || 'global'}`;
    if (!seen.has(key)) {
      seen.set(key, true);
      result.push(issue);
    }
  }

  return result;
}

// ════════════════════════════════════════════════════════════════════════════
// CHUNKED EXECUTION PIPELINE (new path — see plan in chat history)
// ════════════════════════════════════════════════════════════════════════════
//
// Splits the audit into three resumable stages so it works on any page count:
//
//   1. runDiscovery        — sitemap/WP/crawl, populate pendingUrls.
//   2. processChunk × N    — drain N URLs at a time, scan + upload + persist,
//                            free buffers. Repeat until pendingUrls empty.
//   3. runFinalization     — cross-page analysis, vision, scoring, summary.
//
// Each stage:
//   • Reads its full state from the DB at start (no in-memory state across
//     invocations).
//   • Writes progress + heartbeat regularly so the watchdog can tell life
//     from a dead worker (5-min `updatedAt` gap = dead).
//   • Is safe to call again if the previous invocation died mid-run. Per-page
//     work is committed at chunk-end; partial work is lost but pendingUrls
//     still holds the unstarted URLs and the watchdog re-fires.
//
// All three are exported individually so the route layer can drive them via
// internal fetch (POST /api/audit → discovery+first chunk; /continue → next
// chunk; /finalize → finalization).

const DEFAULT_CHUNK_SIZE = parseInt(process.env.AUDIT_CHUNK_SIZE || '30', 10);

/**
 * Stage 1 — Discovery. Marks audit RUNNING, runs URL discovery, populates
 * pendingUrls + pagesFound + discoveryMethod, advances phase to 'scanning'.
 *
 * Returns:
 *   { ok: true,  empty: false } — ready for processChunk
 *   { ok: true,  empty: true  } — no URLs found, audit already marked FAILED
 *   { ok: false, error }       — fatal error during discovery
 */
export async function runDiscovery(auditId, siteUrl, siteId, deviceType, options = {}) {
  const url = normalizeUrl(siteUrl);
  const maxPages = options.maxPages || DEFAULT_MAX_PAGES;

  try {
    await dbWrite(() =>
      prisma.siteAudit.update({
        where: { id: auditId },
        data: {
          status: 'RUNNING',
          phase: 'discovery',
          startedAt: new Date(),
          progress: {
            currentStep: 0,
            totalSteps: 1,
            labelKey: 'siteAudit.progress.discovering',
            percentage: 0,
          },
        },
      })
    );

    const site = await prisma.site.findUnique({
      where: { id: siteId },
      select: { id: true, url: true, name: true, accountId: true, connectionStatus: true, siteKey: true, siteSecret: true, platform: true, contentLanguage: true },
    });

    let urls, method, hasSitemap;
    if (options.urls?.length) {
      urls = options.urls.slice(0, maxPages);
      method = 'explicit';
      hasSitemap = true;
    } else {
      ({ urls, method, hasSitemap } = await discoverUrls(site, { maxUrls: maxPages }));
    }

    if (!urls || urls.length === 0) {
      await dbWrite(() =>
        prisma.siteAudit.update({
          where: { id: auditId },
          data: {
            status: 'FAILED',
            phase: 'completed',
            completedAt: new Date(),
            score: 0,
            pagesScanned: 0,
            discoveryMethod: method,
            progress: {
              currentStep: 1, totalSteps: 1, percentage: 100,
              labelKey: 'siteAudit.progress.complete',
              failureReason: 'NO_URLS',
            },
            issues: [{
              type: 'technical', severity: 'error',
              message: 'audit.issues.noUrlsDiscovered',
              url, suggestion: 'audit.suggestions.addSitemap', source: 'system',
            }],
          },
        })
      );
      invalidateAudit(siteId);
      return { ok: true, empty: true };
    }

    const pagesToScan = urls.slice(0, maxPages);

    // Site-wide checks happen at finalization, but we record sitemap status
    // up-front so it's visible early.
    const siteWideIssues = [];
    if (!hasSitemap && method !== 'explicit') {
      siteWideIssues.push({
        type: 'technical', severity: 'warning',
        message: 'audit.issues.noSitemap',
        url, suggestion: 'audit.suggestions.addSitemap', source: 'system',
      });
    }

    await dbWrite(() =>
      prisma.siteAudit.update({
        where: { id: auditId },
        data: {
          phase: 'scanning',
          pendingUrls: pagesToScan,
          pagesFound: urls.length,
          pagesScanned: 0,
          discoveryMethod: method,
          deviceType: deviceType || null,
          issues: siteWideIssues,
          progress: {
            currentStep: 1,
            totalSteps: pagesToScan.length + 3,
            labelKey: 'siteAudit.progress.discoveredPages',
            labelParams: { count: urls.length },
            percentage: 0,
          },
        },
      })
    );

    return { ok: true, empty: false, totalPages: pagesToScan.length };
  } catch (error) {
    console.error(`[SiteAudit/chunked] runDiscovery error for ${auditId}:`, error);
    await dbWrite(() =>
      prisma.siteAudit.update({
        where: { id: auditId },
        data: {
          status: 'FAILED',
          phase: 'completed',
          completedAt: new Date(),
          progress: { failureReason: 'DISCOVERY_FAILED', percentage: 100 },
        },
      })
    ).catch(() => {});
    return { ok: false, error: error.message };
  }
}

/**
 * Stage 2 — Process one chunk. Reads state, drains up-to chunkSize URLs,
 * scans them, uploads screenshots inline, appends issues + pageResults to
 * the audit, removes processed URLs from the queue, frees buffers.
 *
 * Per-page screenshots are uploaded to Cloudinary as soon as their scan
 * finishes so the in-memory buffer can be released immediately. Memory
 * peak per chunk: ~CONCURRENCY × 3MB (active scans) + JSON pageResults.
 *
 * Returns:
 *   { ok: true,  hasMore: true|false }  — chunk processed; caller should
 *                                          fire continue (more) or finalize.
 *   { ok: false, reason }                — caller shouldn't continue.
 */
export async function processChunk(auditId, options = {}) {
  const chunkSize = options.chunkSize || DEFAULT_CHUNK_SIZE;

  // Snapshot state. We re-read pendingUrls atomically before the dequeue
  // commit so two overlapping invocations can detect each other.
  const audit = await prisma.siteAudit.findUnique({
    where: { id: auditId },
    select: {
      id: true, siteId: true, status: true, phase: true,
      pendingUrls: true, pagesFound: true, pagesScanned: true,
      deviceType: true,
    },
  });
  if (!audit) return { ok: false, reason: 'audit-not-found' };
  if (audit.status !== 'RUNNING') return { ok: false, reason: `bad-status:${audit.status}` };
  if (audit.phase !== 'scanning') return { ok: false, reason: `bad-phase:${audit.phase}` };

  const pending = audit.pendingUrls || [];
  if (pending.length === 0) {
    return { ok: true, hasMore: false };
  }

  const batch = pending.slice(0, chunkSize);
  const remainingAfter = pending.slice(chunkSize);

  // Resolve site once for cloudinary folder + accountId for vision-cost
  const site = await prisma.site.findUnique({
    where: { id: audit.siteId },
    select: { id: true, url: true, accountId: true },
  });
  if (!site) return { ok: false, reason: 'site-not-found' };

  // Browser is per-chunk — kept alive only for the duration of the chunk's
  // scans, then closed. This prevents the long-running browser leak that
  // would otherwise haunt the legacy single-shot path on big sites.
  let scanner = null;
  try {
    try {
      scanner = await createBrowserScanner();
    } catch (err) {
      console.warn('[SiteAudit/chunked] Playwright unavailable:', err.message);
    }

    const cloudFolder = await resolveAuditFolder(auditId, audit.siteId, site.url);

    // ── Scan + upload + persist per page in parallel ───────────────────
    const limit = pLimit(CONCURRENCY);
    const psiLimit = pLimit(PSI_CONCURRENCY);

    // Issues + pageResults from this chunk only — appended to audit at end.
    const chunkIssues = [];
    const chunkPageResults = [];

    // Track first-page-of-audit for PSI gating: only run PSI for the first 3
    // pages of the WHOLE audit, not each chunk.
    const baseScanned = audit.pagesScanned || 0;

    let scannedInChunk = 0;
    const scanTasks = batch.map((pageUrl, idx) =>
      limit(async () => {
        const globalIndex = baseScanned + idx;
        const isHomepage = globalIndex === 0;
        const runPsi = globalIndex < 3;

        try {
          const result = await scanSinglePage(
            pageUrl, scanner, isHomepage, runPsi, audit.deviceType, psiLimit
          );

          // Upload screenshots inline so we can drop the buffers immediately.
          const ss = result.screenshots || {};
          const seg = result.segmentedScreenshots || {};
          const film = result.filmstrip || {};
          const safeUpload = (p) => p.catch(() => null);
          const [ssDesktop, ssMobile, segDesktop, segMobile, filmDesktop, filmMobile] =
            await Promise.all([
              safeUpload(uploadPageScreenshot(ss.desktop, cloudFolder, pageUrl, 'desktop')),
              safeUpload(uploadPageScreenshot(ss.mobile, cloudFolder, pageUrl, 'mobile')),
              safeUpload(uploadSegmentedScreenshots(seg.desktop, cloudFolder, pageUrl, 'desktop')),
              safeUpload(uploadSegmentedScreenshots(seg.mobile, cloudFolder, pageUrl, 'mobile')),
              safeUpload(uploadFilmstripFrames(film.desktop, cloudFolder, pageUrl, 'desktop')),
              safeUpload(uploadFilmstripFrames(film.mobile, cloudFolder, pageUrl, 'mobile')),
            ]);

          chunkIssues.push(...(result.issues || []));
          chunkPageResults.push({
            url: pageUrl,
            statusCode: result.pageResult?.statusCode || null,
            title: result.pageResult?.title || null,
            metaDescription: result.pageResult?.metaDescription || null,
            ttfb: result.pageResult?.ttfb || null,
            performanceScore: result.pageResult?.performanceScore || null,
            lcp: result.pageResult?.lcp || null,
            cls: result.pageResult?.cls || null,
            inp: result.pageResult?.inp || null,
            jsErrors: (result.pageResult?.jsErrors || []).map(e => typeof e === 'string' ? e : (e.text || JSON.stringify(e))),
            brokenResources: (result.pageResult?.brokenResources || []).map(r => typeof r === 'string' ? r : JSON.stringify(r)),
            issueCount: (result.issues || []).length,
            screenshotDesktop: ssDesktop || null,
            screenshotMobile: ssMobile || null,
            screenshotsDesktop: segDesktop || [],
            screenshotsMobile: segMobile || [],
            filmstripDesktop: filmDesktop || null,
            filmstripMobile: filmMobile || null,
          });
        } catch (err) {
          console.warn(`[SiteAudit/chunked] Page scan failed for ${pageUrl}:`, err.message);
          chunkIssues.push({
            type: 'technical', severity: 'error',
            message: 'audit.issues.pageLoadFailed',
            url: pageUrl, suggestion: 'audit.suggestions.checkUrl', source: 'system',
          });
        }

        scannedInChunk++;

        // Per-page heartbeat so the watchdog and UI see the chunk is alive.
        // Cheap update — only progress, no big arrays.
        const totalScanned = baseScanned + scannedInChunk;
        const totalPages = (audit.pagesFound || batch.length);
        const percentage = Math.min(85, Math.round((totalScanned / totalPages) * 85));
        const pathName = (() => {
          try {
            const u = new URL(pageUrl);
            return u.hostname.replace(/^www\./, '') + decodeURIComponent(u.pathname);
          } catch { return pageUrl; }
        })();
        prisma.siteAudit.update({
          where: { id: auditId },
          data: {
            pagesScanned: totalScanned,
            progress: {
              currentStep: totalScanned + 1,
              totalSteps: totalPages + 3,
              labelKey: 'siteAudit.progress.scanningPage',
              labelParams: { current: totalScanned, total: totalPages, page: pathName },
              percentage,
            },
          },
        }).catch(() => {});
      })
    );
    await Promise.allSettled(scanTasks);

    // ── Commit chunk: append issues + pageResults, drain queue ─────────
    // Read-modify-write; dbWrite handles transient retries. If a concurrent
    // writer (rescan/recheck/fix) raced us, the retry will re-read.
    await dbWrite(async () => {
      const fresh = await prisma.siteAudit.findUnique({
        where: { id: auditId },
        select: { issues: true, pageResults: true, pendingUrls: true },
      });
      const newIssues = [...(fresh.issues || []), ...chunkIssues];
      const newPageResults = [...(fresh.pageResults || []), ...chunkPageResults];
      // Drop the URLs we processed from the queue (idempotent: filter out
      // anything in `batch` even if the queue was already advanced).
      const batchSet = new Set(batch);
      const newPending = (fresh.pendingUrls || []).filter((u) => !batchSet.has(u));
      await prisma.siteAudit.update({
        where: { id: auditId },
        data: {
          issues: newIssues,
          pageResults: newPageResults,
          pendingUrls: newPending,
        },
      });
    });

    return { ok: true, hasMore: remainingAfter.length > 0, processed: batch.length };
  } catch (error) {
    console.error(`[SiteAudit/chunked] processChunk error for ${auditId}:`, error);
    return { ok: false, reason: error.message };
  } finally {
    if (scanner?.browser) {
      await scanner.browser.close().catch(() => {});
    }
  }
}

/**
 * Stage 3 — Finalization. Runs cross-page analysis (broken links cross-ref,
 * duplicate titles/descriptions, robots/sitemap, WP visibility), AI Vision,
 * scoring, summary, then marks COMPLETED. All in-memory state is rebuilt
 * from the DB; each piece is bounded by audit size.
 *
 * Returns:
 *   { ok: true }              — audit marked COMPLETED
 *   { ok: false, reason }     — finalization failed; audit may be left in
 *                                'finalizing' for the watchdog to retry
 */
export async function runFinalization(auditId, options = {}) {
  let audit;
  try {
    await dbWrite(() =>
      prisma.siteAudit.update({
        where: { id: auditId },
        data: { phase: 'finalizing' },
      })
    );

    audit = await prisma.siteAudit.findUnique({
      where: { id: auditId },
      select: {
        id: true, siteId: true, deviceType: true, issues: true, pageResults: true, pagesScanned: true,
      },
    });
    if (!audit) return { ok: false, reason: 'audit-not-found' };

    const site = await prisma.site.findUnique({
      where: { id: audit.siteId },
      select: { id: true, url: true, name: true, accountId: true, connectionStatus: true, siteKey: true },
    });
    if (!site) return { ok: false, reason: 'site-not-found' };

    const url = normalizeUrl(site.url);
    const allIssues = [...(audit.issues || [])];
    const pageResults = audit.pageResults || [];

    // ── Duplicate Titles / Meta Descriptions (cross-page) ────────────
    if (pageResults.length > 1) {
      const norm = (s) => (s || '').trim().toLowerCase().replace(/\s+/g, ' ');
      const titleMap = new Map();
      const descMap = new Map();
      for (const pr of pageResults) {
        const t = norm(pr.title);
        if (t) {
          if (!titleMap.has(t)) titleMap.set(t, []);
          titleMap.get(t).push(pr.url);
        }
        const d = norm(pr.metaDescription);
        if (d) {
          if (!descMap.has(d)) descMap.set(d, []);
          descMap.get(d).push(pr.url);
        }
      }
      for (const [, urls] of titleMap) {
        if (urls.length > 1) {
          for (const pageUrl of urls) {
            allIssues.push({
              type: 'technical', severity: 'warning',
              message: 'audit.issues.duplicateTitle',
              url: pageUrl, suggestion: 'audit.suggestions.uniqueTitle', source: 'system',
              details: `${urls.length} pages share this title`,
              detailedSources: urls.filter((u) => u !== pageUrl).slice(0, 10),
            });
          }
        }
      }
      for (const [, urls] of descMap) {
        if (urls.length > 1) {
          for (const pageUrl of urls) {
            allIssues.push({
              type: 'technical', severity: 'warning',
              message: 'audit.issues.duplicateMetaDescription',
              url: pageUrl, suggestion: 'audit.suggestions.uniqueMetaDescription', source: 'system',
              details: `${urls.length} pages share this description`,
              detailedSources: urls.filter((u) => u !== pageUrl).slice(0, 10),
            });
          }
        }
      }
    }

    // ── Robots & Sitemap (site-wide) ─────────────────────────────────
    try {
      const baseUrl = new URL(url).origin;
      const robotsSitemapIssues = await checkRobotsAndSitemap(baseUrl);
      allIssues.push(...robotsSitemapIssues);
    } catch (err) {
      console.warn('[SiteAudit/chunked] Robots/sitemap check failed:', err.message);
    }

    // ── WordPress: check site-wide "Discourage search engines" ────────
    if (site.connectionStatus === 'CONNECTED' && site.siteKey) {
      try {
        const visibility = await getSearchEngineVisibility(site);
        if (visibility?.discouraged) {
          allIssues.push({
            type: 'technical', severity: 'error',
            message: 'audit.issues.wpSearchEngineDiscouraged',
            url: new URL(url).origin,
            suggestion: 'audit.suggestions.fixWpSearchVisibility', source: 'html',
          });
        } else {
          allIssues.push({
            type: 'technical', severity: 'passed',
            message: 'audit.issues.wpSearchEngineVisible',
            url: new URL(url).origin, source: 'html',
          });
        }
      } catch (err) {
        console.warn('[SiteAudit/chunked] WP visibility check failed:', err.message);
      }
    }

    // ── AI Vision (operates on Cloudinary URLs from pageResults) ──────
    // Build a vision-pages list from pageResults that have screenshot URLs.
    // Vision-analyzer is updated to accept either Buffer (legacy) or URL (new).
    const visionPages = pageResults
      .filter((pr) => pr.screenshotDesktop || pr.screenshotMobile)
      .map((pr) => ({
        url: pr.url,
        desktop: pr.screenshotDesktop || null,
        mobile: pr.screenshotMobile || null,
      }));

    if (visionPages.length > 0) {
      await dbWrite(() =>
        prisma.siteAudit.update({
          where: { id: auditId },
          data: {
            progress: {
              labelKey: 'siteAudit.progress.aiVisualAnalysis',
              percentage: 88,
            },
          },
        })
      ).catch(() => {});
      try {
        const visualIssues = await analyzeVisualIssues(
          visionPages, url,
          { accountId: site.accountId, siteId: audit.siteId, userId: options.userId }
        );
        allIssues.push(...visualIssues);
      } catch (err) {
        console.warn('[SiteAudit/chunked] AI Vision failed:', err.message);
      }
    }

    // ── Scoring ──────────────────────────────────────────────────────
    const { score, categoryScores } = calculateAuditScore(allIssues);
    const deduped = deduplicateIssues(allIssues);

    // ── Homepage screenshots field (legacy compat: top-level `screenshots`) ──
    const homepageRow = pageResults[0];
    const screenshotsData = homepageRow
      ? { desktop: homepageRow.screenshotDesktop || null, mobile: homepageRow.screenshotMobile || null }
      : null;

    // ── Summary ──────────────────────────────────────────────────────
    let summary = null;
    const summaryTranslations = {};
    try {
      summary = await generateAuditSummary(
        deduped, score, categoryScores, url, pageResults.length,
        { accountId: site.accountId, siteId: audit.siteId, userId: options.userId }
      );
      if (summary) {
        summaryTranslations.en = summary;
        if (options.userLocale && options.userLocale !== 'en') {
          try {
            const translated = await translateAuditSummary(summary, options.userLocale, {
              accountId: site.accountId, siteId: audit.siteId, userId: options.userId, siteUrl: url,
            });
            if (translated) summaryTranslations[options.userLocale] = translated;
          } catch (err) {
            console.warn('[SiteAudit/chunked] Pre-cache translation failed:', err.message);
          }
        }
      }
    } catch (err) {
      console.warn('[SiteAudit/chunked] Summary generation failed:', err.message);
    }

    // Same defensive trimming as the legacy path so a giant page can't blow
    // the 16MB document ceiling.
    const MAX_TEXT = 2000, MAX_SUGGESTION = 1000, MAX_MESSAGE = 500, MAX_SOURCES = 30;
    const trim = (s, n) => (typeof s === 'string' && s.length > n ? s.slice(0, n - 1) + '…' : s);
    const trimmedIssues = deduped.map((i) => {
      let details = i.details || null;
      if (i.type === 'accessibility' && typeof details === 'string') {
        try {
          const parsed = JSON.parse(details);
          if (parsed.nodes?.length) {
            parsed.nodes = parsed.nodes.map(({ elementScreenshot, ...rest }) => rest);
            details = JSON.stringify(parsed);
          }
        } catch { /* keep original */ }
      }
      return {
        type: i.type || 'technical',
        severity: i.severity || 'warning',
        message: trim(i.message || '', MAX_MESSAGE),
        url: i.url || null,
        suggestion: trim(i.suggestion || null, MAX_SUGGESTION),
        source: i.source || null,
        details: typeof details === 'string' ? trim(details, MAX_TEXT) : details,
        detailedSources: Array.isArray(i.detailedSources)
          ? i.detailedSources.slice(0, MAX_SOURCES)
          : (i.detailedSources || null),
        device: i.device || null,
        boundingBox: i.boundingBox || null,
      };
    });

    await dbWrite(() =>
      prisma.siteAudit.update({
        where: { id: auditId },
        data: {
          status: 'COMPLETED',
          phase: 'completed',
          completedAt: new Date(),
          score, categoryScores,
          pagesScanned: pageResults.length,
          progress: {
            currentStep: pageResults.length + 3,
            totalSteps: pageResults.length + 3,
            labelKey: 'siteAudit.progress.complete',
            percentage: 100,
          },
          issues: trimmedIssues,
          screenshots: screenshotsData,
          ...(summary ? { summary, summaryTranslations } : {}),
          // pendingUrls left as-is (should be empty by now); cleared explicitly:
          pendingUrls: [],
        },
      })
    );
    invalidateAudit(audit.siteId);

    // ── Notify, sync widget, post chat follow-up (fire-and-forget) ────
    notifyAccountMembers(site.accountId, {
      type: 'audit_complete',
      title: 'notifications.auditComplete.title',
      message: 'notifications.auditComplete.message',
      link: '/dashboard/technical-seo/site-audit',
      data: { auditId, siteId: audit.siteId, siteName: site.name || site.url, score, deviceType: audit.deviceType || null },
    }).catch(() => {});
    if (options.chatConversationId) {
      postAuditChatFollowUp(options.chatConversationId, {
        siteId: audit.siteId, success: true, score, pagesScanned: pageResults.length,
      }).catch(() => {});
    }
    syncWidgetData(audit.siteId).catch(() => {});

    return { ok: true, score, pages: pageResults.length, issues: trimmedIssues.length };
  } catch (error) {
    console.error(`[SiteAudit/chunked] runFinalization error for ${auditId}:`, error);
    // Leave phase='finalizing' so the watchdog can retry. Only the legacy
    // single-shot path marks FAILED on uncaught errors here; in chunked mode
    // we'd rather try once more than throw away ~25 minutes of scan work.
    return { ok: false, reason: error.message };
  }
}

/**
 * Post a follow-up assistant message into a chat conversation when a long-
 * running audit run finishes. Best-effort - if the conversation was deleted
 * or the message write fails we just swallow it (the user will still see the
 * audit on the audit dashboard). Touches the conversation's updatedAt so the
 * unread-count + sidebar ordering pick it up.
 *
 * Language matches the conversation's recent user messages (Hebrew if the
 * user typed Hebrew, English otherwise).
 */
export async function postAuditChatFollowUp(conversationId, { siteId, success, score, pagesScanned, error }) {
  if (!conversationId) return;
  try {
    // Detect language from recent user messages.
    const recent = await prisma.chatMessage.findMany({
      where: { conversationId, role: 'USER' },
      orderBy: { createdAt: 'desc' },
      take: 3,
      select: { content: true },
    });
    const text = recent.map((m) => m.content).join(' ');
    const isHe = (text.match(/[֐-׿]/g) || []).length > 5;

    const link = `/dashboard/site-audit?siteId=${siteId}`;
    let content;
    if (success) {
      content = isHe
        ? `### ✅ סריקת האתר הסתיימה\n\nציון: **${score}/100** על פני **${pagesScanned}** דפים.\n\nלחץ על [דו"ח הסריקה המלא](${link}) כדי לראות את כל הבעיות וההמלצות. תרצה שאתחיל לתקן את הבעיות הכי קריטיות?`
        : `### ✅ Site audit finished\n\nScore: **${score}/100** across **${pagesScanned}** page(s).\n\nOpen the [full audit report](${link}) to review the issues. Want me to start fixing the most critical ones?`;
    } else {
      const errMsg = error ? String(error).slice(0, 240) : (isHe ? 'שגיאה לא ידועה' : 'Unknown error');
      content = isHe
        ? `### ❌ סריקת האתר נכשלה\n\nשגיאה: ${errMsg}\n\nלחץ על [עמוד הסריקה](${link}) או בקש ממני להריץ סריקה חדשה.`
        : `### ❌ Site audit failed\n\nError: ${errMsg}\n\nOpen the [audit page](${link}) or ask me to run a new audit.`;
    }

    await prisma.chatMessage.create({
      data: { conversationId, role: 'ASSISTANT', content },
    });
    // Bump updatedAt so the conversation jumps to the top of the sidebar
    // and the unread-count re-computation surfaces the new message.
    await prisma.chatConversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });
  } catch (err) {
    console.warn('[SiteAudit] postAuditChatFollowUp failed:', err.message);
  }
}

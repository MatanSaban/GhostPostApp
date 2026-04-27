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
    // A missing sitemap on its own is a quality issue, not a fatal one — sites
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
            currentStep: 1,
            totalSteps: pagesToScan.length + 3,
            labelKey: 'siteAudit.progress.discoveredPages',
            labelParams: { count: urls.length },
            percentage: 5,
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
                headers: { 'User-Agent': 'GhostSEO-SiteAuditor/2.0' },
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
  }
}

// ─── Single Page Scanner ────────────────────────────────────

async function scanSinglePage(pageUrl, scanner, isHomepage, runPsi, deviceType, psiLimit) {
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
      headers: { 'User-Agent': 'GhostSEO-SiteAuditor/2.0' },
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

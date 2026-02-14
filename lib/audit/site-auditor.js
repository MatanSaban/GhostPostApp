/**
 * Site Audit Engine v2 — Hybrid Audit Orchestrator
 *
 * Coordinates all audit modules into a single pipeline:
 *
 * Phase 1 — Smart Discovery:  DB entities → WP API → Sitemap → Crawl
 * Phase 2 — Per-Page Scan:    Playwright (DOM + screenshots + errors) or Fetch + Cheerio
 * Phase 3 — Performance:      Google PageSpeed Insights API (CWV)
 * Phase 4 — AI Vision:        Gemini 2.0 Flash Vision (desktop + mobile screenshots)
 * Phase 5 — Scoring:          Weighted deduction across technical / performance / visual
 *
 * Concurrency is capped at 3 pages in parallel via pLimit().
 * Playwright is optional — gracefully falls back to fetch + cheerio.
 * PSI is called for the top 3 pages only (API rate limits).
 * AI Vision analyzes homepage screenshots only.
 */

import prisma from '@/lib/prisma';
import { discoverUrls } from './url-discovery.js';
import { createBrowserScanner, scanPage } from './playwright-scanner.js';
import { getPageSpeedInsights } from './pagespeed-client.js';
import { analyzeVisualIssues } from './vision-analyzer.js';
import { analyzeHtml, checkRobotsAndSitemap } from './html-analyzer.js';
import { calculateAuditScore } from './scoring.js';
import { generateAuditSummary } from './summary-generator.js';
import { notifyAccountMembers } from '@/lib/notifications';
import {
  resolveAuditFolder,
  uploadPageScreenshot,
  uploadSegmentedScreenshots,
  uploadFilmstripFrames,
} from './cloudinary-screenshots.js';

// ─── Configuration ────────────────────────────────────────────

const MAX_PAGES = 50;
const CONCURRENCY = 3;
const PSI_CONCURRENCY = 2; // PSI is slow — run 2 at a time to avoid rate limits

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
 * @param {string} [deviceType] - "desktop" | "mobile" — run audit for specific device only
 */
export async function runSiteAudit(auditId, siteUrl, siteId, deviceType) {
  const url = normalizeUrl(siteUrl);

  try {
    // ── Mark as RUNNING ──────────────────────────────────
    await prisma.siteAudit.update({
      where: { id: auditId },
      data: { status: 'RUNNING', startedAt: new Date() },
    });

    // ══════════════════════════════════════════════════════
    // PHASE 1: SMART URL DISCOVERY
    // ══════════════════════════════════════════════════════

    const site = await prisma.site.findUnique({
      where: { id: siteId },
      select: { id: true, url: true, name: true, accountId: true, connectionStatus: true },
    });

    const { urls, method, hasSitemap } = await discoverUrls(site);

    console.log(
      `[SiteAudit] Discovered ${urls.length} URLs via "${method}" for audit ${auditId} (sitemap: ${hasSitemap})`
    );

    // ── No sitemap → abort audit, don't charge ──────────
    if (!hasSitemap) {
      console.log(`[SiteAudit] No sitemap found — aborting audit ${auditId} (no charge)`);

      await prisma.siteAudit.update({
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
            failureReason: 'NO_SITEMAP',
          },
          issues: [{
            type: 'technical',
            severity: 'error',
            message: 'audit.issues.noSitemap',
            url: url,
            suggestion: 'audit.suggestions.addSitemap',
            source: 'system',
          }],
        },
      });

      // FAILED audits are excluded from the billing count in account-limits.js
      return; // Stop — nothing further to scan
    }

    const pagesToScan = urls.slice(0, MAX_PAGES);

    await prisma.siteAudit.update({
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
    });

    // Track all issues
    const allIssues = [];

    // ══════════════════════════════════════════════════════
    // PHASE 2: LAUNCH HEADLESS BROWSER (optional)
    // ══════════════════════════════════════════════════════

    let scanner = null;
    try {
      scanner = await createBrowserScanner();
      console.log('[SiteAudit] Playwright browser launched successfully');
    } catch (err) {
      console.warn(
        '[SiteAudit] Playwright unavailable — using fetch-only mode:',
        err.message
      );
    }

    // ══════════════════════════════════════════════════════
    // PHASE 3: SCAN PAGES IN PARALLEL (max 3 concurrent)
    // ══════════════════════════════════════════════════════

    const limit = pLimit(CONCURRENCY);
    const pageResults = [];
    const pageScreenshots = {}; // url -> { desktop?: Buffer, mobile?: Buffer }
    const pageSegmentedScreenshots = {}; // url -> { desktop?: Buffer[], mobile?: Buffer[] }
    const pageFilmstrips = {}; // url -> { desktop?: [{stage, buffer}], mobile?: [{stage, buffer}] }
    const visionPages = []; // { url, desktop: Buffer, mobile: Buffer } — for AI Vision
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
            true,
            deviceType
          );
          allIssues.push(...result.issues);
          pageResults.push(result.pageResult);

          // Keep raw Buffers — they'll be uploaded to Cloudinary later
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

    // ── Robots & Sitemap (site-wide, not per-page) ──────
    const baseUrl = new URL(url).origin;
    const robotsSitemapIssues = await checkRobotsAndSitemap(baseUrl);
    allIssues.push(...robotsSitemapIssues);

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
        const visualIssues = await analyzeVisualIssues(visionPages, url);
        allIssues.push(...visualIssues);
        console.log(
          `[SiteAudit] AI found ${visualIssues.length} visual issues across ${visionPages.length} pages`
        );
      } catch (err) {
        console.warn('[SiteAudit] AI Vision analysis failed:', err.message);
      }
    } else {
      console.log('[SiteAudit] No screenshots captured — skipping AI Vision analysis');
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

    // Upload per-page screenshots to Cloudinary (all pages — no limit needed)
    const enrichedPageResults = await Promise.all(
      pageResults.map(async (pr) => {
        const ss   = pageScreenshots[pr.url];
        const seg  = pageSegmentedScreenshots[pr.url];
        const film = pageFilmstrips[pr.url];

        // Upload all media for this page in parallel
        const [ssDesktop, ssMobile, segDesktop, segMobile, filmDesktop, filmMobile] =
          await Promise.all([
            uploadPageScreenshot(ss?.desktop, cloudFolder, pr.url, 'desktop'),
            uploadPageScreenshot(ss?.mobile, cloudFolder, pr.url, 'mobile'),
            uploadSegmentedScreenshots(seg?.desktop, cloudFolder, pr.url, 'desktop'),
            uploadSegmentedScreenshots(seg?.mobile, cloudFolder, pr.url, 'mobile'),
            uploadFilmstripFrames(film?.desktop, cloudFolder, pr.url, 'desktop'),
            uploadFilmstripFrames(film?.mobile, cloudFolder, pr.url, 'mobile'),
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

    await prisma.siteAudit.update({
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
        issues: deduped.map((i) => ({
          type: i.type || 'technical',
          severity: i.severity || 'warning',
          message: i.message || '',
          url: i.url || null,
          suggestion: i.suggestion || null,
          source: i.source || null,
          details: i.details || null,
          detailedSources: i.detailedSources || null,
          device: i.device || null,
          boundingBox: i.boundingBox || null,
        })),
        screenshots: screenshotsData,
        pageResults: enrichedPageResults,
      },
    });

    // ══════════════════════════════════════════════════════
    // PHASE 6: AI SUMMARY GENERATION
    // ══════════════════════════════════════════════════════

    try {
      console.log('[SiteAudit] Generating AI summary...');
      const summary = await generateAuditSummary(deduped, score, categoryScores, url, enrichedPageResults.length);
      if (summary) {
        await prisma.siteAudit.update({
          where: { id: auditId },
          data: {
            summary,
            summaryTranslations: { en: summary },
          },
        });
        console.log(`[SiteAudit] AI summary saved (${summary.length} chars)`);
      }
    } catch (err) {
      console.warn('[SiteAudit] AI summary generation failed:', err.message);
    }

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
  } catch (error) {
    console.error(`[SiteAudit] Fatal error for audit ${auditId}:`, error);

    try {
      await prisma.siteAudit.update({
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
      });
    } catch {
      /* last resort — nothing we can do */
    }
  }
}

// ─── Single Page Scanner ────────────────────────────────────

async function scanSinglePage(pageUrl, scanner, isHomepage, runPsi, deviceType) {
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
      pageResult.statusCode = pwResult.statusCode;
      pageResult.ttfb = pwResult.ttfb;
      pageResult.jsErrors = pwResult.jsErrors || [];
      pageResult.brokenResources = pwResult.brokenResources || [];
      issues.push(...(pwResult.issues || []));

      // Accessibility issues from Axe
      if (pwResult.accessibilityIssues?.length) {
        issues.push(...pwResult.accessibilityIssues);
      }

      // Run HTML analysis on rendered content
      if (html) {
        const htmlIssues = analyzeHtml(html, pageUrl, {}, pwResult.ttfb);
        issues.push(...htmlIssues);
      }

      // PSI if requested
      if (runPsi) {
        const psi = await safePsi(pageUrl);
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
      headers: { 'User-Agent': 'GhostPost-SiteAuditor/2.0' },
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
    const psi = await safePsi(pageUrl);
    if (psi) {
      pageResult.performanceScore = psi.score;
      pageResult.lcp = psi.lcp;
      pageResult.cls = psi.cls;
      pageResult.inp = psi.inp;
      issues.push(...(psi.issues || []));
    }
  }

  pageResult.issueCount = issues.length;
  return { issues, pageResult, screenshots: null, segmentedScreenshots: null, filmstrip: null };
}

// ─── Helpers ────────────────────────────────────────────────

async function safePsi(pageUrl) {
  try {
    return await getPageSpeedInsights(pageUrl);
  } catch (err) {
    console.warn(`[SiteAudit] PSI failed for ${pageUrl}:`, err.message);
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

/**
 * Playwright Scanner - Headless Browser Engine
 *
 * Uses playwright-core + @sparticuz/chromium-min for serverless (Vercel).
 * Gracefully throws if Playwright is not available, allowing the
 * orchestrator to fall back to fetch + cheerio.
 *
 * Per-page capabilities:
 * - Desktop (1920×1080) & Mobile (375×812) full-page screenshots
 * - Segmented viewport-height captures (like Google PageSpeed scroll captures)
 * - Filmstrip: 3 captures at domcontentloaded / networkidle / fullyLoaded stages
 * - Rendered DOM extraction (title, meta, headings)
 * - JavaScript console error capture (with full text & stack trace)
 * - Network 4xx/5xx error capture
 * - Detailed source collection for issue "Why" (script URLs, image lists, etc.)
 */

const DESKTOP_VIEWPORT = { width: 1920, height: 1080 };
const MOBILE_VIEWPORT = { width: 375, height: 812 };
const DESKTOP_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const MOBILE_USER_AGENT =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const PAGE_TIMEOUT = 25000;
const MAX_SEGMENTS = 8; // Maximum number of viewport-height segments per device

/**
 * Create a browser scanner instance.
 *
 * Tries (in order):
 * 1. playwright-core + @sparticuz/chromium-min (Vercel serverless)
 * 2. playwright-core + system chromium (local dev)
 *
 * Throws if Playwright is not installed.
 * @returns {{ browser: Browser }}
 */
export async function createBrowserScanner() {
  let browser;

  // Dynamic import - only loaded if installed
  const pw = await import('playwright-core');

  try {
    // Serverless: @sparticuz/chromium-min provides a small Chromium binary
    const chromium = await import('@sparticuz/chromium-min');
    const chromiumMod = chromium.default || chromium;

    const executablePath = await chromiumMod.executablePath(
      process.env.CHROMIUM_PACK_URL ||
        'https://github.com/nicopa/nicopa/releases/download/v127.0.0/chromium-v127.0.0-pack.tar'
    );

    browser = await pw.chromium.launch({
      args: chromiumMod.args || [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--single-process',
      ],
      executablePath,
      headless: true,
    });
  } catch {
    // Local dev: use system-installed Chromium
    browser = await pw.chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
  }

  return { browser };
}

/**
 * Scan a single page with the headless browser
 *
 * @param {{ browser: Browser }} scanner
 * @param {string} url - Page URL to scan
 * @param {{ captureScreenshots?: boolean, deviceType?: string }} options
 *   deviceType: "desktop" | "mobile" | undefined (both)
 * @returns {{
 *   html: string,
 *   dom: { title, metaDescription, h1s, canonical, lang },
 *   statusCode: number,
 *   ttfb: number,
 *   jsErrors: Array<{ text: string, stackTrace?: string }>,
 *   brokenResources: string[],
 *   issues: AuditIssue[],
 *   screenshots: { desktop?: Buffer, mobile?: Buffer } | null,
 *   segmentedScreenshots: { desktop?: Buffer[], mobile?: Buffer[] } | null,
 *   filmstrip: { desktop?: Array<{stage: string, buffer: Buffer}>, mobile?: Array<{stage: string, buffer: Buffer}> } | null,
 *   detailedSources: { scripts: string[], images: Array<{url: string, fileName: string, hasAlt: boolean, hasSrcset: boolean, hasLazy: boolean}> }
 * }}
 */
export async function scanPage(scanner, url, options = {}) {
  const { captureScreenshots = true, deviceType, runAccessibility = false } = options;
  const { browser } = scanner;

  const jsErrors = [];
  const brokenResources = [];
  const issues = [];
  let accessibilityIssues = [];
  let html = '';
  let dom = {};
  let statusCode = 0;
  let ttfb = 0;
  let xRobotsTag = '';
  let responseHeaders = {};
  const screenshots = {};
  const segmentedScreenshots = {};
  const filmstrip = {};
  const detailedSources = { scripts: [], images: [] };
  const imageResources = new Map(); // url -> { size, contentType }
  let redirectChain = []; // Array of { url, status } for each hop in the redirect chain
  const internalLinks = []; // Array of { href, anchorText } extracted from <a> tags

  const shouldScanDesktop = !deviceType || deviceType === 'desktop';
  const shouldScanMobile = !deviceType || deviceType === 'mobile';

  // ── Desktop Scan ─────────────────────────────────────────

  if (shouldScanDesktop) {
    const context = await browser.newContext({
      viewport: DESKTOP_VIEWPORT,
      userAgent: DESKTOP_USER_AGENT,
      bypassCSP: true,
      ignoreHTTPSErrors: true,
    });
    const page = await context.newPage();

    try {
      // Listen for console errors (capture full text + stack trace)
      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          const location = msg.location();
          const stackInfo = location?.url ? `\n  at ${location.url}:${location.lineNumber}:${location.columnNumber}` : '';
          jsErrors.push({
            text: msg.text().slice(0, 500),
            stackTrace: stackInfo || undefined,
          });
        }
      });

      // Listen for network failures + track image resource sizes
      page.on('response', (response) => {
        const status = response.status();
        if (status >= 400) {
          brokenResources.push(`${status} ${response.url().slice(0, 300)}`);
        }
        // Track image resource sizes
        if (status >= 200 && status < 300) {
          const ct = (response.headers()['content-type'] || '').toLowerCase();
          if (ct.startsWith('image/')) {
            const size = parseInt(response.headers()['content-length'] || '0', 10);
            if (size > 0) {
              imageResources.set(response.url(), { size, contentType: ct });
            }
          }
        }
      });

      // Navigate - Filmstrip stage 1: domcontentloaded
      const startTime = Date.now();
      const response = await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: PAGE_TIMEOUT,
      });
      // navigateTime is "time to DOMContentLoaded" - kept as a fallback only.
      // Real TTFB comes from PerformanceNavigationTiming below, which measures
      // server response time (the actual signal users care about for SEO).
      const navigateTime = Date.now() - startTime;
      statusCode = response?.status() || 0;
      try {
        const navEntry = await page.evaluate(() => {
          const e = performance.getEntriesByType('navigation')[0];
          return e ? { responseStart: e.responseStart, requestStart: e.requestStart } : null;
        });
        ttfb = navEntry && navEntry.responseStart > 0
          ? Math.max(0, Math.round(navEntry.responseStart - navEntry.requestStart))
          : navigateTime;
      } catch {
        ttfb = navigateTime;
      }

      // ── Track redirect chain ────────────────────────────
      if (response) {
        try {
          const chain = [];
          let req = response.request();
          // Walk backwards through the redirect chain
          while (req.redirectedFrom()) {
            req = req.redirectedFrom();
            const redirectResp = await req.response().catch(() => null);
            chain.unshift({
              url: req.url().slice(0, 500),
              status: redirectResp?.status() || 0,
            });
          }
          if (chain.length > 0) {
            // Add the final destination
            chain.push({ url: response.url().slice(0, 500), status: response.status() });
            redirectChain = chain;
          }
        } catch { /* non-critical */ }
      }

      // Filmstrip capture: domcontentloaded
      if (captureScreenshots) {
        try {
          const dcl = await page.screenshot({ type: 'jpeg', quality: 50 });
          filmstrip.desktop = filmstrip.desktop || [];
          filmstrip.desktop.push({ stage: 'domcontentloaded', buffer: dcl });
        } catch { /* non-critical */ }
      }

      // Wait for network idle - Filmstrip stage 2
      await page.waitForLoadState('networkidle').catch(() => {});

      if (captureScreenshots) {
        try {
          const ni = await page.screenshot({ type: 'jpeg', quality: 50 });
          filmstrip.desktop = filmstrip.desktop || [];
          filmstrip.desktop.push({ stage: 'networkidle', buffer: ni });
        } catch { /* non-critical */ }
      }

      // Wait extra for fully loaded - Filmstrip stage 3
      await page.waitForTimeout(1000);

      if (captureScreenshots) {
        try {
          const fl = await page.screenshot({ type: 'jpeg', quality: 50 });
          filmstrip.desktop = filmstrip.desktop || [];
          filmstrip.desktop.push({ stage: 'fullyLoaded', buffer: fl });
        } catch { /* non-critical */ }
      }

      // Extract DOM data
      dom = await page.evaluate(() => {
        const title = document.title || '';
        const metaEl = document.querySelector('meta[name="description"]');
        const metaDescription = metaEl ? metaEl.content : '';
        const h1s = [...document.querySelectorAll('h1')].map((el) => el.textContent?.trim());
        const h2Count = document.querySelectorAll('h2').length;
        const canonicalEl = document.querySelector('link[rel="canonical"]');
        const canonical = canonicalEl ? canonicalEl.href : '';
        const lang = document.documentElement.lang || '';
        const robotsEl = document.querySelector('meta[name="robots"]');
        const robotsMeta = robotsEl ? robotsEl.content : '';
        return { title, metaDescription, h1s, h2Count, canonical, lang, robotsMeta };
      });

      // Capture full response headers - needed for security/cache/compression
      // checks in html-analyzer (it gates whole categories on having headers).
      // Headers from Playwright are already lowercased keys.
      responseHeaders = response?.headers() || {};
      xRobotsTag = responseHeaders['x-robots-tag'] || '';

      // Get rendered HTML
      html = await page.content();

      // ── Collect detailed source data ──────────────────────
      try {
        const sourceData = await page.evaluate(() => {
          const scripts = [...document.querySelectorAll('script[src]')].map(
            (s) => s.getAttribute('src')
          ).filter(Boolean);

          const images = [...document.querySelectorAll('img')].map((img) => ({
            url: img.src || img.getAttribute('data-src') || '',
            fileName: (img.src || '').split('/').pop()?.split('?')[0] || '',
            hasAlt: !!(img.alt && img.alt.trim()),
            hasSrcset: !!img.srcset,
            hasLazy: img.loading === 'lazy',
            width: img.naturalWidth || img.width || 0,
            height: img.naturalHeight || img.height || 0,
          }));

          return { scripts, images };
        });
        detailedSources.scripts = sourceData.scripts;
        detailedSources.images = sourceData.images;
      } catch { /* non-critical */ }

      // ── Extract internal links for broken link detection ──
      try {
        const pageOrigin = new URL(url).origin;
        const links = await page.evaluate((origin) => {
          return [...document.querySelectorAll('a[href]')]
            .map((a) => ({
              href: a.href,
              anchorText: (a.textContent || '').trim().slice(0, 200),
            }))
            .filter((l) => {
              try {
                const u = new URL(l.href);
                return u.origin === origin && u.protocol.startsWith('http');
              } catch { return false; }
            });
        }, pageOrigin);
        internalLinks.push(...links);
      } catch { /* non-critical */ }

      // Desktop screenshot - full page + segmented
      if (captureScreenshots) {
        try {
          screenshots.desktop = await page.screenshot({
            fullPage: true,
            type: 'jpeg',
            quality: 60,
          });
        } catch {
          /* screenshot failed */
        }

        // Segmented screenshots (viewport-height captures)
        try {
          segmentedScreenshots.desktop = await captureSegmentedScreenshots(
            page,
            DESKTOP_VIEWPORT
          );
        } catch {
          /* segmented capture non-critical */
        }
      }

      // ── Accessibility Analysis (Axe-core on live page) ─────
      if (runAccessibility) {
        try {
          // Scroll back to top for consistent axe analysis
          await page.evaluate(() => window.scrollTo(0, 0));
          await page.waitForTimeout(200);

          const { analyzeAccessibility } = await import('./accessibility-analyzer.js');
          accessibilityIssues = await analyzeAccessibility(page, url);
        } catch (err) {
          console.warn(`[A11y] Accessibility scan failed for ${url}:`, err.message);
        }
      }
    } catch (err) {
      issues.push({
        type: 'technical',
        severity: 'error',
        message: 'audit.issues.pageLoadFailed',
        url,
        suggestion: err.message?.slice(0, 200),
        source: 'playwright',
      });
    } finally {
      await page.close();
      await context.close();
    }
  }

  // ── Mobile Scan (separate context for proper user agent) ──

  if (shouldScanMobile && captureScreenshots) {
    const mobileCtx = await browser.newContext({
      viewport: MOBILE_VIEWPORT,
      userAgent: MOBILE_USER_AGENT,
      isMobile: true,
      hasTouch: true,
      bypassCSP: true,
      ignoreHTTPSErrors: true,
    });
    const mobilePage = await mobileCtx.newPage();

    try {
      // If desktop was skipped, also capture DOM/HTML from mobile
      if (!shouldScanDesktop) {
        mobilePage.on('console', (msg) => {
          if (msg.type() === 'error') {
            const location = msg.location();
            const stackInfo = location?.url ? `\n  at ${location.url}:${location.lineNumber}:${location.columnNumber}` : '';
            jsErrors.push({
              text: msg.text().slice(0, 500),
              stackTrace: stackInfo || undefined,
            });
          }
        });
        mobilePage.on('response', (response) => {
          const status = response.status();
          if (status >= 400) {
            brokenResources.push(`${status} ${response.url().slice(0, 300)}`);
          }
        });

        const startTime = Date.now();
        const response = await mobilePage.goto(url, {
          waitUntil: 'domcontentloaded',
          timeout: PAGE_TIMEOUT,
        });
        const navigateTime = Date.now() - startTime;
        statusCode = response?.status() || 0;
        try {
          const navEntry = await mobilePage.evaluate(() => {
            const e = performance.getEntriesByType('navigation')[0];
            return e ? { responseStart: e.responseStart, requestStart: e.requestStart } : null;
          });
          ttfb = navEntry && navEntry.responseStart > 0
            ? Math.max(0, Math.round(navEntry.responseStart - navEntry.requestStart))
            : navigateTime;
        } catch {
          ttfb = navigateTime;
        }

        // Filmstrip: domcontentloaded
        if (captureScreenshots) {
          try {
            const dcl = await mobilePage.screenshot({ type: 'jpeg', quality: 50 });
            filmstrip.mobile = filmstrip.mobile || [];
            filmstrip.mobile.push({ stage: 'domcontentloaded', buffer: dcl });
          } catch { /* non-critical */ }
        }

        await mobilePage.waitForLoadState('networkidle').catch(() => {});

        // Filmstrip: networkidle
        if (captureScreenshots) {
          try {
            const ni = await mobilePage.screenshot({ type: 'jpeg', quality: 50 });
            filmstrip.mobile = filmstrip.mobile || [];
            filmstrip.mobile.push({ stage: 'networkidle', buffer: ni });
          } catch { /* non-critical */ }
        }

        await mobilePage.waitForTimeout(1000);

        // Filmstrip: fullyLoaded
        if (captureScreenshots) {
          try {
            const fl = await mobilePage.screenshot({ type: 'jpeg', quality: 50 });
            filmstrip.mobile = filmstrip.mobile || [];
            filmstrip.mobile.push({ stage: 'fullyLoaded', buffer: fl });
          } catch { /* non-critical */ }
        }

        dom = await mobilePage.evaluate(() => {
          const title = document.title || '';
          const metaEl = document.querySelector('meta[name="description"]');
          const metaDescription = metaEl ? metaEl.content : '';
          const h1s = [...document.querySelectorAll('h1')].map((el) => el.textContent?.trim());
          const h2Count = document.querySelectorAll('h2').length;
          const canonicalEl = document.querySelector('link[rel="canonical"]');
          const canonical = canonicalEl ? canonicalEl.href : '';
          const lang = document.documentElement.lang || '';
          const robotsEl = document.querySelector('meta[name="robots"]');
          const robotsMeta = robotsEl ? robotsEl.content : '';
          return { title, metaDescription, h1s, h2Count, canonical, lang, robotsMeta };
        });

        html = await mobilePage.content();
      } else {
        await mobilePage.goto(url, {
          waitUntil: 'domcontentloaded',
          timeout: PAGE_TIMEOUT,
        });

        // Filmstrip for mobile (when desktop already scanned)
        if (captureScreenshots) {
          try {
            const dcl = await mobilePage.screenshot({ type: 'jpeg', quality: 50 });
            filmstrip.mobile = filmstrip.mobile || [];
            filmstrip.mobile.push({ stage: 'domcontentloaded', buffer: dcl });
          } catch { /* non-critical */ }
        }

        await mobilePage.waitForLoadState('networkidle').catch(() => {});

        if (captureScreenshots) {
          try {
            const ni = await mobilePage.screenshot({ type: 'jpeg', quality: 50 });
            filmstrip.mobile = filmstrip.mobile || [];
            filmstrip.mobile.push({ stage: 'networkidle', buffer: ni });
          } catch { /* non-critical */ }
        }

        await mobilePage.waitForTimeout(1000);

        if (captureScreenshots) {
          try {
            const fl = await mobilePage.screenshot({ type: 'jpeg', quality: 50 });
            filmstrip.mobile = filmstrip.mobile || [];
            filmstrip.mobile.push({ stage: 'fullyLoaded', buffer: fl });
          } catch { /* non-critical */ }
        }
      }

      screenshots.mobile = await mobilePage.screenshot({
        fullPage: true,
        type: 'jpeg',
        quality: 60,
      });

      // Segmented screenshots for mobile
      try {
        segmentedScreenshots.mobile = await captureSegmentedScreenshots(
          mobilePage,
          MOBILE_VIEWPORT
        );
      } catch {
        /* segmented capture non-critical */
      }

      // ── Accessibility Analysis for mobile ─────────────────
      if (runAccessibility) {
        try {
          await mobilePage.evaluate(() => window.scrollTo(0, 0));
          await mobilePage.waitForTimeout(200);

          const { analyzeAccessibility } = await import('./accessibility-analyzer.js');
          const mobileA11yIssues = await analyzeAccessibility(mobilePage, url);
          if (mobileA11yIssues.length) {
            // If desktop already ran, avoid duplicating passed rules
            if (shouldScanDesktop && accessibilityIssues.length) {
              // Only add mobile-specific violations (non-passed) that aren't already found
              const existingMessages = new Set(accessibilityIssues.map(i => i.message));
              for (const issue of mobileA11yIssues) {
                if (issue.severity !== 'passed' && !existingMessages.has(issue.message)) {
                  issue.device = 'mobile';
                  accessibilityIssues.push(issue);
                }
              }
            } else {
              // Mobile-only audit: use all results
              accessibilityIssues = mobileA11yIssues;
            }
          }
        } catch (err) {
          console.warn(`[A11y] Mobile accessibility scan failed for ${url}:`, err.message);
        }
      }
    } catch {
      /* mobile screenshot failed - non-critical */
    } finally {
      await mobilePage.close();
      await mobileCtx.close();
    }
  }

  // ── Generate issues from Playwright data ──────────────────

  if (jsErrors.length > 0) {
    issues.push({
      type: 'technical',
      severity: 'warning',
      message: 'audit.issues.jsConsoleErrors',
      url,
      suggestion: 'audit.suggestions.fixJsErrors',
      source: 'playwright',
      details: `${jsErrors.length} errors`,
      detailedSources: jsErrors.map(e => ({
        text: e.text,
        stackTrace: e.stackTrace || null,
      })),
    });
  }

  const broken4xx = brokenResources.filter((r) => r.startsWith('4'));
  const broken5xx = brokenResources.filter((r) => r.startsWith('5'));

  if (broken4xx.length > 0) {
    issues.push({
      type: 'technical',
      severity: 'warning',
      message: 'audit.issues.brokenResources',
      url,
      suggestion: 'audit.suggestions.fixBrokenResources',
      source: 'playwright',
      details: `${broken4xx.length} resources`,
      detailedSources: broken4xx.map(r => ({ resource: r })),
    });
  }

  if (broken5xx.length > 0) {
    issues.push({
      type: 'technical',
      severity: 'error',
      message: 'audit.issues.serverErrors',
      url,
      suggestion: 'audit.suggestions.fixServerErrors',
      source: 'playwright',
      details: `${broken5xx.length} server errors`,
      detailedSources: broken5xx.map(r => ({ resource: r })),
    });
  }

  // ── Redirect Chain / Loop Detection ─────────────────────
  if (redirectChain.length >= 2) {
    // Check for loops: same URL appears twice in the chain
    const urlsSeen = new Set();
    let isLoop = false;
    for (const hop of redirectChain) {
      if (urlsSeen.has(hop.url)) { isLoop = true; break; }
      urlsSeen.add(hop.url);
    }

    if (isLoop) {
      issues.push({
        type: 'technical',
        severity: 'error',
        message: 'audit.issues.redirectLoop',
        url,
        suggestion: 'audit.suggestions.fixRedirectLoop',
        source: 'playwright',
        details: `${redirectChain.length} hops`,
        detailedSources: redirectChain,
      });
    } else if (redirectChain.length > 2) {
      // Chain of 3+ hops (origin → intermediate → ... → final) = a real redirect chain
      issues.push({
        type: 'technical',
        severity: 'warning',
        message: 'audit.issues.redirectChain',
        url,
        suggestion: 'audit.suggestions.fixRedirectChain',
        source: 'playwright',
        details: `${redirectChain.length} hops`,
        detailedSources: redirectChain,
      });
    }
  }

  return {
    html,
    dom,
    statusCode,
    ttfb,
    jsErrors,
    brokenResources,
    redirectChain,
    internalLinks,
    issues,
    accessibilityIssues,
    xRobotsTag,
    responseHeaders,
    screenshots: captureScreenshots
      ? screenshots
      : null,
    segmentedScreenshots: captureScreenshots
      ? segmentedScreenshots
      : null,
    filmstrip: captureScreenshots ? filmstrip : null,
    detailedSources,
    imageResources: Object.fromEntries(imageResources),
  };
}

// ─── Segmented Screenshot Capture ───────────────────────────

/**
 * Capture viewport-height segments of a page (like Google PageSpeed scroll captures).
 * Scrolls through the page capturing one viewport-height screenshot per segment.
 *
 * @param {Page} page - Playwright page object (already loaded)
 * @param {{ width: number, height: number }} viewport - Viewport dimensions
 * @returns {Buffer[]} Array of JPEG buffers, one per segment
 */
async function captureSegmentedScreenshots(page, viewport) {
  const segments = [];

  const totalHeight = await page.evaluate(() => document.body.scrollHeight);
  const viewportHeight = viewport.height;
  const numSegments = Math.min(MAX_SEGMENTS, Math.ceil(totalHeight / viewportHeight));

  for (let i = 0; i < numSegments; i++) {
    const scrollY = i * viewportHeight;

    await page.evaluate((y) => window.scrollTo(0, y), scrollY);
    await page.waitForTimeout(300); // Let rendering settle

    const segment = await page.screenshot({
      type: 'jpeg',
      quality: 55,
      clip: {
        x: 0,
        y: scrollY,
        width: viewport.width,
        height: Math.min(viewportHeight, totalHeight - scrollY),
      },
    });
    segments.push(segment);
  }

  // Reset scroll position
  await page.evaluate(() => window.scrollTo(0, 0));

  return segments;
}

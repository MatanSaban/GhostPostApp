/**
 * Accessibility Analyzer — Axe-core + Playwright Evidence Collector
 *
 * Runs axe-core via @axe-core/playwright on a live Playwright page and
 * collects rich evidence for every violation:
 *
 * 1. Code Snippet — the exact HTML of the violating element
 * 2. Visual Proof — an element-level screenshot with a red border injected
 * 3. Metadata     — image src/URL for alt-text issues, color codes for contrast
 *
 * Each violation is mapped to an AuditIssue with type: "accessibility".
 */

const AXE_IMPACT_TO_SEVERITY = {
  critical: 'error',
  serious: 'error',
  moderate: 'warning',
  minor: 'info',
};

const MAX_ELEMENT_SCREENSHOTS = 30; // Cap to avoid huge payloads
const ELEMENT_SCREENSHOT_PADDING = 8; // px padding around element

/**
 * Run Axe accessibility analysis on an already-loaded Playwright page.
 *
 * @param {import('playwright-core').Page} page — Playwright page (loaded, networkidle)
 * @param {string} pageUrl — URL for issue attribution
 * @param {{ maxScreenshots?: number }} options
 * @returns {Promise<Array<AuditIssue>>}
 */
export async function analyzeAccessibility(page, pageUrl, options = {}) {
  const maxScreenshots = options.maxScreenshots ?? MAX_ELEMENT_SCREENSHOTS;
  const issues = [];

  // Inject axe-core source manually to avoid @axe-core/playwright's CJS "exports" bug
  let axeSource;
  try {
    const axeMod = await import('axe-core');
    axeSource = axeMod.source || axeMod.default?.source;
    if (!axeSource) {
      throw new Error('axe-core .source property not found');
    }
  } catch (err) {
    console.warn('[A11y] axe-core not available:', err.message);
    return issues;
  }

  // Run axe-core
  let axeResults;
  try {
    // Inject axe-core with CJS shim wrapper into the page
    // eslint-disable-next-line @next/next/no-assign-module-variable
    await page.evaluate((src) => {
      const _exports = {};
      const _mod = { exports: _exports };
      (new Function('exports', 'module', src))(_exports, _mod);
      // axe should now be on window.axe
      if (!window.axe && _mod.exports) window.axe = _mod.exports;
    }, axeSource);

    axeResults = await page.evaluate(() => {
      return window.axe.run(document, {
        runOnly: {
          type: 'tag',
          values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'],
        },
      });
    });
  } catch (err) {
    console.warn('[A11y] Axe analysis failed:', err.message);
    return issues;
  }

  if (!axeResults?.violations?.length) {
    console.log(`[A11y] No violations found on ${pageUrl}`);
    return issues;
  }

  console.log(`[A11y] Found ${axeResults.violations.length} rules violated on ${pageUrl}`);

  let screenshotsTaken = 0;

  for (const violation of axeResults.violations) {
    // Build per-node evidence
    const nodes = [];

    for (const node of violation.nodes) {
      const selector = getBestSelector(node);
      const codeSnippet = node.html || '';
      let elementScreenshot = null;
      let metadata = {};

      // ── Extract metadata based on issue type ──────────────

      // Image alt-text issues
      if (
        violation.id === 'image-alt' ||
        violation.id === 'input-image-alt' ||
        violation.id === 'area-alt'
      ) {
        metadata = await extractImageMetadata(page, selector).catch(() => ({}));
      }

      // Color contrast issues
      if (violation.id === 'color-contrast') {
        metadata = extractContrastMetadata(node);
      }

      // ── Take element screenshot with red border ───────────

      if (screenshotsTaken < maxScreenshots && selector) {
        try {
          elementScreenshot = await captureElementScreenshot(page, selector);
          if (elementScreenshot) screenshotsTaken++;
        } catch {
          // Element might be invisible or detached — skip
        }
      }

      nodes.push({
        selector,
        codeSnippet,
        elementScreenshot, // base64 JPEG or null
        metadata,
        failureSummary: node.failureSummary || '',
      });
    }

    // Create one AuditIssue per Axe rule (with nodes array in details)
    issues.push({
      type: 'accessibility',
      severity: AXE_IMPACT_TO_SEVERITY[violation.impact] || 'warning',
      message: `a11y.${violation.id}`,
      url: pageUrl,
      suggestion: violation.help || '',
      source: 'axe',
      details: JSON.stringify({
        ruleId: violation.id,
        impact: violation.impact,
        description: violation.description,
        helpUrl: violation.helpUrl,
        tags: violation.tags || [],
        nodeCount: nodes.length,
        nodes,
      }),
    });
  }

  console.log(
    `[A11y] Produced ${issues.length} accessibility issues, ${screenshotsTaken} element screenshots`
  );

  return issues;
}

// ─── Helpers ────────────────────────────────────────────────

/**
 * Pick the best CSS selector from an Axe node.
 * Prefer the CSS target array (most reliable for Playwright).
 */
function getBestSelector(node) {
  // node.target is an array of CSS selectors (or iframe paths)
  if (node.target?.length) {
    // Flatten iframe paths — take the last element (deepest frame)
    const last = node.target[node.target.length - 1];
    if (Array.isArray(last)) return last[last.length - 1];
    return last;
  }
  return null;
}

/**
 * Capture a screenshot of a specific element with a red highlight border.
 * Returns a base64 JPEG string, or null if the element is invisible.
 */
async function captureElementScreenshot(page, selector) {
  // Check if element exists and is visible
  const handle = await page.$(selector);
  if (!handle) return null;

  const box = await handle.boundingBox();
  if (!box || box.width === 0 || box.height === 0) return null;

  // Inject a temporary red border for visual proof
  const highlightId = `__gp_a11y_highlight_${Date.now()}`;
  await page.evaluate(
    ({ sel, hid }) => {
      const el = document.querySelector(sel);
      if (el) {
        el.dataset.gpHighlight = hid;
        el.style.setProperty('outline', '3px solid red', 'important');
        el.style.setProperty('outline-offset', '2px', 'important');
      }
    },
    { sel: selector, hid: highlightId }
  );

  // Small delay for the paint
  await page.waitForTimeout(100);

  let buffer;
  try {
    buffer = await handle.screenshot({
      type: 'jpeg',
      quality: 70,
    });
  } catch {
    // Fallback: clip-based screenshot from the page
    try {
      const pad = ELEMENT_SCREENSHOT_PADDING;
      buffer = await page.screenshot({
        type: 'jpeg',
        quality: 70,
        clip: {
          x: Math.max(0, box.x - pad),
          y: Math.max(0, box.y - pad),
          width: box.width + pad * 2,
          height: Math.min(box.height + pad * 2, 800), // cap height
        },
      });
    } catch {
      buffer = null;
    }
  }

  // Remove the highlight
  await page.evaluate(
    ({ sel }) => {
      const el = document.querySelector(sel);
      if (el) {
        el.style.removeProperty('outline');
        el.style.removeProperty('outline-offset');
        delete el.dataset.gpHighlight;
      }
    },
    { sel: selector }
  ).catch(() => {});

  if (!buffer) return null;
  return buffer.toString('base64');
}

/**
 * Extract image-related metadata for alt-text issues.
 */
async function extractImageMetadata(page, selector) {
  if (!selector) return {};
  try {
    return await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return {};
      const src = el.src || el.getAttribute('data-src') || '';
      const fileName = src.split('/').pop()?.split('?')[0] || '';
      return {
        imageSrc: src,
        imageFileName: fileName,
        imageAlt: el.alt || null,
        imageWidth: el.naturalWidth || el.width || 0,
        imageHeight: el.naturalHeight || el.height || 0,
      };
    }, selector);
  } catch {
    return {};
  }
}

/**
 * Extract color contrast metadata from Axe node data.
 */
function extractContrastMetadata(node) {
  const meta = {};
  // Axe provides contrast data in node.any[].data
  for (const check of [...(node.any || []), ...(node.all || [])]) {
    if (check.data) {
      if (check.data.fgColor) meta.fgColor = check.data.fgColor;
      if (check.data.bgColor) meta.bgColor = check.data.bgColor;
      if (check.data.contrastRatio) meta.contrastRatio = parseFloat(check.data.contrastRatio.toFixed(2));
      if (check.data.expectedContrastRatio) meta.expectedRatio = check.data.expectedContrastRatio;
      if (check.data.fontSize) meta.fontSize = check.data.fontSize;
      if (check.data.fontWeight) meta.fontWeight = check.data.fontWeight;
    }
  }
  return meta;
}

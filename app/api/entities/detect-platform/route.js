import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { generateTextResponse } from '@/lib/ai/gemini';
import { trackAIUsage } from '@/lib/ai/credits-service';
import { enforceCredits } from '@/lib/account-limits';

const SESSION_COOKIE = 'user_session';

/**
 * Detect platform from HTML content using multiple methods
 */
async function detectPlatformFromHTML(html, siteUrl) {
  const detectionResults = {
    platform: null,
    confidence: 0,
    signals: [],
  };

  // WordPress signals
  const wpSignals = [
    { pattern: /wp-content/i, weight: 3, name: 'wp-content path' },
    { pattern: /wp-includes/i, weight: 3, name: 'wp-includes path' },
    { pattern: /wp-json/i, weight: 2, name: 'wp-json API' },
    { pattern: /<meta[^>]*generator[^>]*WordPress/i, weight: 5, name: 'WordPress generator meta' },
    { pattern: /wordpress\.org/i, weight: 2, name: 'wordpress.org reference' },
    { pattern: /class="[^"]*wp-/i, weight: 2, name: 'wp- CSS classes' },
    { pattern: /id="[^"]*wp-/i, weight: 1, name: 'wp- element IDs' },
  ];

  // Wix signals
  const wixSignals = [
    { pattern: /wix\.com/i, weight: 4, name: 'wix.com reference' },
    { pattern: /wixstatic\.com/i, weight: 5, name: 'wixstatic.com assets' },
    { pattern: /X-Wix-/i, weight: 3, name: 'X-Wix header reference' },
    { pattern: /_wix_/i, weight: 3, name: '_wix_ identifier' },
  ];

  // Shopify signals
  const shopifySignals = [
    { pattern: /cdn\.shopify\.com/i, weight: 5, name: 'Shopify CDN' },
    { pattern: /shopify\.com/i, weight: 3, name: 'shopify.com reference' },
    { pattern: /<meta[^>]*generator[^>]*Shopify/i, weight: 5, name: 'Shopify generator meta' },
    { pattern: /Shopify\.theme/i, weight: 4, name: 'Shopify.theme JS' },
  ];

  // Squarespace signals
  const squarespaceSignals = [
    { pattern: /squarespace\.com/i, weight: 4, name: 'squarespace.com reference' },
    { pattern: /static\.squarespace\.com/i, weight: 5, name: 'Squarespace static assets' },
    { pattern: /<meta[^>]*generator[^>]*Squarespace/i, weight: 5, name: 'Squarespace generator meta' },
  ];

  // Webflow signals
  const webflowSignals = [
    { pattern: /webflow\.com/i, weight: 4, name: 'webflow.com reference' },
    { pattern: /assets\.website-files\.com/i, weight: 5, name: 'Webflow assets CDN' },
    { pattern: /<meta[^>]*generator[^>]*Webflow/i, weight: 5, name: 'Webflow generator meta' },
    { pattern: /data-wf-/i, weight: 3, name: 'Webflow data attributes' },
  ];

  // Ghost signals
  const ghostSignals = [
    { pattern: /<meta[^>]*generator[^>]*Ghost/i, weight: 5, name: 'Ghost generator meta' },
    { pattern: /ghost\.org/i, weight: 3, name: 'ghost.org reference' },
    { pattern: /ghost-/i, weight: 2, name: 'ghost- identifier' },
  ];

  const platformChecks = [
    { name: 'wordpress', signals: wpSignals },
    { name: 'wix', signals: wixSignals },
    { name: 'shopify', signals: shopifySignals },
    { name: 'squarespace', signals: squarespaceSignals },
    { name: 'webflow', signals: webflowSignals },
    { name: 'ghost', signals: ghostSignals },
  ];

  let maxScore = 0;
  let detectedPlatform = null;

  for (const check of platformChecks) {
    let score = 0;
    const matchedSignals = [];

    for (const signal of check.signals) {
      if (signal.pattern.test(html)) {
        score += signal.weight;
        matchedSignals.push(signal.name);
      }
    }

    if (score > maxScore) {
      maxScore = score;
      detectedPlatform = check.name;
      detectionResults.signals = matchedSignals;
    }
  }

  if (maxScore >= 5) {
    detectionResults.platform = detectedPlatform;
    detectionResults.confidence = Math.min(maxScore / 10, 1);
  }

  return detectionResults;
}

/**
 * Use AI to detect platform when HTML analysis is inconclusive
 */
async function detectPlatformWithAI(html, siteUrl) {
  try {
    // Extract relevant snippets for AI analysis
    const head = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i)?.[1] || '';
    const scripts = html.match(/<script[^>]*src=["']([^"']+)["']/gi)?.join('\n') || '';
    const styles = html.match(/<link[^>]*href=["']([^"']+)["']/gi)?.join('\n') || '';
    const generator = html.match(/<meta[^>]*generator[^>]*content=["']([^"']+)["']/i)?.[1] || '';

    const prompt = `Analyze this website data and determine the CMS/platform used.

URL: ${siteUrl}
Generator Meta: ${generator}

Script Sources (sample):
${scripts.slice(0, 1000)}

Style Sources (sample):
${styles.slice(0, 500)}

Return ONLY one of these platform names (lowercase, no explanation):
- wordpress
- wix
- shopify
- squarespace
- webflow
- ghost
- drupal
- joomla
- magento
- prestashop
- custom

If you cannot determine the platform with high confidence, return "custom".`;

    const response = await generateTextResponse({
      system: 'You are an expert at identifying website platforms and CMS systems. Return only the platform name, nothing else.',
      prompt,
      maxTokens: 20,
      temperature: 0.1,
    });

    const platform = response.trim().toLowerCase();
    const validPlatforms = ['wordpress', 'wix', 'shopify', 'squarespace', 'webflow', 'ghost', 'drupal', 'joomla', 'magento', 'prestashop', 'custom'];
    
    return validPlatforms.includes(platform) ? platform : 'custom';
  } catch (error) {
    console.error('AI platform detection error:', error);
    return null;
  }
}

/**
 * POST /api/entities/detect-platform
 * Detects the platform (WordPress, Wix, Shopify, etc.) of a site
 */
export async function POST(request) {
  try {
    // Check authentication
    const cookieStore = await cookies();
    const userId = cookieStore.get(SESSION_COOKIE)?.value;

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { siteId } = await request.json();

    if (!siteId) {
      return NextResponse.json({ error: 'Site ID is required' }, { status: 400 });
    }

    // Get user's accounts
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        accountMemberships: {
          select: { accountId: true },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const accountIds = user.accountMemberships.map(m => m.accountId);

    // Get the site and verify access
    const site = await prisma.site.findFirst({
      where: { 
        id: siteId,
        accountId: { in: accountIds },
      },
    });

    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    if (!site.url) {
      return NextResponse.json({ error: 'Site URL is not configured' }, { status: 400 });
    }

    // ── Enforce AI credit limit ──────────────────────────────
    const creditCheck = await enforceCredits(site.accountId, 2); // DETECT_PLATFORM = 2 credits
    if (!creditCheck.allowed) {
      return NextResponse.json(creditCheck, { status: 402 });
    }

    const siteUrl = site.url.replace(/\/$/, ''); // Remove trailing slash
    let platform = null;
    let detected = false;
    let confidence = 0;
    let usedAI = false;

    // First, try WordPress REST API directly (fastest for WP)
    try {
      const wpResponse = await fetch(`${siteUrl}/wp-json/wp/v2`, {
        method: 'HEAD',
        headers: { 'User-Agent': 'GhostPost-Platform/1.0' },
        signal: AbortSignal.timeout(5000),
      });

      if (wpResponse.ok || wpResponse.status === 401) {
        platform = 'wordpress';
        detected = true;
        confidence = 1;
      }
    } catch (e) {
      // Not WordPress API, continue with HTML analysis
    }

    // If not detected via API, fetch and analyze HTML
    if (!platform) {
      try {
        const htmlResponse = await fetch(siteUrl, {
          headers: { 'User-Agent': 'GhostPost-Platform/1.0' },
          signal: AbortSignal.timeout(10000),
        });

        if (htmlResponse.ok) {
          const html = await htmlResponse.text();
          
          // Try HTML pattern detection first
          const htmlDetection = await detectPlatformFromHTML(html, siteUrl);
          
          if (htmlDetection.platform && htmlDetection.confidence >= 0.5) {
            platform = htmlDetection.platform;
            detected = true;
            confidence = htmlDetection.confidence;
          } else {
            // Fall back to AI detection
            const aiPlatform = await detectPlatformWithAI(html, siteUrl);
            usedAI = true;
            if (aiPlatform && aiPlatform !== 'custom') {
              platform = aiPlatform;
              detected = true;
              confidence = 0.7; // AI detection confidence
            }
          }
        }
      } catch (e) {
        console.error('HTML fetch error:', e);
      }
    }

    // Default to custom if nothing detected
    if (!platform) {
      platform = 'custom';
      detected = false;
    }

    // Update the site with the detected platform
    await prisma.site.update({
      where: { id: siteId },
      data: { platform },
    });

    // Track AI usage if AI detection was used
    if (usedAI) {
      await trackAIUsage({
        accountId: site.accountId,
        userId,
        siteId: site.id,
        operation: 'DETECT_PLATFORM',
        description: `AI platform detection for ${site.url}`,
        metadata: { platform, confidence },
      });
    }

    return NextResponse.json({ 
      platform, 
      detected,
      confidence,
    });
  } catch (error) {
    console.error('Platform detection error:', error);
    return NextResponse.json(
      { error: 'Failed to detect platform' },
      { status: 500 }
    );
  }
}

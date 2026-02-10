import { NextResponse } from 'next/server';
import { generateTextResponse } from '@/lib/ai/gemini';

/**
 * Use AI to extract the business/website name from HTML content
 */
async function extractSiteNameWithAI(html, hostname) {
  try {
    // Extract relevant text from HTML for AI analysis
    const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() || '';
    const h1 = html.match(/<h1[^>]*>([^<]+)<\/h1>/i)?.[1]?.trim() || '';
    const ogSiteName = html.match(/<meta[^>]*property=["']og:site_name["'][^>]*content=["']([^"']+)["']/i)?.[1]?.trim() || '';
    const ogTitle = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)?.[1]?.trim() || '';
    const metaDescription = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i)?.[1]?.trim() || '';
    
    // Extract logo alt text if available
    const logoAlt = html.match(/<img[^>]*(?:class|id)=["'][^"']*logo[^"']*["'][^>]*alt=["']([^"']+)["']/i)?.[1]?.trim() || '';
    
    // Extract footer copyright text
    const copyright = html.match(/(?:©|copyright)[^<]*?(\d{4})?[^<]*?([A-Za-z\u0590-\u05FF\s]+)/i)?.[2]?.trim() || '';

    const prompt = `Analyze the following website data and determine the actual business or website name. Return ONLY the name, nothing else.

URL/Domain: ${hostname}
Page Title: ${title}
H1 Heading: ${h1}
OG Site Name: ${ogSiteName}
OG Title: ${ogTitle}
Meta Description: ${metaDescription}
Logo Alt Text: ${logoAlt}
Copyright Text: ${copyright}

Rules:
- Return the clean business/brand name without taglines, descriptions, or page indicators
- Remove common suffixes like "- Home", "| Official Site", "- Welcome"
- If it's a Hebrew site, return the Hebrew name
- If multiple names are found, prefer the most specific brand/business name
- Do not include generic words like "Home", "Welcome", "Official"
- Return just the name, no explanations`;

    const extractedName = await generateTextResponse({
      system: 'You are an expert at identifying business names from website data. You always respond with just the name, nothing else.',
      prompt,
      maxTokens: 50,
      temperature: 0.1,
    });
    
    // Validate the extracted name is reasonable
    if (extractedName && extractedName.length > 0 && extractedName.length < 100) {
      return extractedName.trim();
    }
    
    return null;
  } catch (error) {
    console.error('AI name extraction error:', error);
    return null;
  }
}

/**
 * Fallback: Extract site name from HTML without AI
 */
function extractSiteNameFallback(html, hostname) {
  // Try og:site_name first (most reliable)
  const ogSiteName = html.match(/<meta[^>]*property=["']og:site_name["'][^>]*content=["']([^"']+)["']/i)?.[1]?.trim();
  if (ogSiteName) return ogSiteName;

  // Try title tag
  const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim();
  if (title) {
    // Remove common suffixes
    return title.split(/[|–—\-:]/)[0].trim();
  }

  // Fallback to hostname
  return hostname.replace(/^www\./, '');
}

/**
 * Detect platform from HTML content and hostname
 */
function detectPlatformFromHTML(html, hostname) {
  // Shopify detection
  if (
    html.includes('cdn.shopify.com') ||
    html.includes('Shopify.theme') ||
    html.includes('shopify-section') ||
    html.includes('myshopify.com') ||
    hostname.includes('.myshopify.com')
  ) {
    return 'shopify';
  }

  // Wix detection
  if (
    html.includes('wix.com') ||
    html.includes('static.wixstatic.com') ||
    html.includes('_wix_browser_sess') ||
    hostname.includes('.wixsite.com')
  ) {
    return 'wix';
  }

  // Squarespace detection
  if (
    html.includes('squarespace.com') ||
    html.includes('static1.squarespace.com') ||
    html.includes('squarespace-cdn.com') ||
    hostname.includes('.squarespace.com')
  ) {
    return 'squarespace';
  }

  // Webflow detection
  if (
    html.includes('webflow.com') ||
    html.includes('assets.website-files.com') ||
    html.includes('w-webflow-badge') ||
    hostname.includes('.webflow.io')
  ) {
    return 'webflow';
  }

  // WordPress detection (fallback - check HTML if API failed)
  if (
    html.includes('wp-content') ||
    html.includes('wp-includes') ||
    html.includes('wordpress') ||
    html.includes('wp-json')
  ) {
    return 'wordpress';
  }

  // Drupal detection
  if (
    html.includes('Drupal.settings') ||
    html.includes('/sites/default/files') ||
    html.includes('drupal.js')
  ) {
    return 'drupal';
  }

  // Joomla detection
  if (
    html.includes('/media/jui/') ||
    html.includes('Joomla!') ||
    html.includes('/components/com_')
  ) {
    return 'joomla';
  }

  // Next.js detection
  if (
    html.includes('_next/static') ||
    html.includes('__NEXT_DATA__')
  ) {
    return 'custom';
  }

  // React/Vue/Angular detection (likely custom)
  if (
    html.includes('react') ||
    html.includes('__NUXT__') ||
    html.includes('ng-version')
  ) {
    return 'custom';
  }

  // If no platform detected, mark as custom
  return 'custom';
}

/**
 * POST /api/sites/validate
 * Validates a website URL is accessible and detects its platform
 */
export async function POST(request) {
  try {
    const { url } = await request.json();

    if (!url) {
      return NextResponse.json({ valid: false, error: 'URL is required' }, { status: 400 });
    }

    // Normalize URL
    let normalizedUrl = url.trim();
    if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
      normalizedUrl = 'https://' + normalizedUrl;
    }

    // Remove trailing slash
    normalizedUrl = normalizedUrl.replace(/\/$/, '');

    // Validate URL format
    let parsedUrl;
    try {
      parsedUrl = new URL(normalizedUrl);
    } catch (e) {
      return NextResponse.json({ valid: false, error: 'Invalid URL format' });
    }

    // Try to fetch the website
    let response;
    try {
      response = await fetch(normalizedUrl, {
        method: 'HEAD',
        headers: {
          'User-Agent': 'GhostPost-Platform/1.0',
        },
        signal: AbortSignal.timeout(10000), // 10 second timeout
      });
    } catch (fetchError) {
      // Try GET if HEAD fails
      try {
        response = await fetch(normalizedUrl, {
          method: 'GET',
          headers: {
            'User-Agent': 'GhostPost-Platform/1.0',
          },
          signal: AbortSignal.timeout(10000),
        });
      } catch (e) {
        return NextResponse.json({ 
          valid: false, 
          error: 'Website is not accessible. Please check the URL and try again.' 
        });
      }
    }

    if (!response.ok && response.status !== 401 && response.status !== 403) {
      return NextResponse.json({ 
        valid: false, 
        error: `Website returned status ${response.status}` 
      });
    }

    // Detect platform
    let platform = null;
    const hostname = parsedUrl.hostname.replace(/^www\./, '');

    // Fetch HTML content first (we'll need it for platform detection and name extraction)
    let html = '';
    try {
      const htmlResponse = await fetch(normalizedUrl, {
        headers: { 'User-Agent': 'GhostPost-Platform/1.0' },
        signal: AbortSignal.timeout(10000),
      });
      
      if (htmlResponse.ok) {
        html = await htmlResponse.text();
      }
    } catch (e) {
      console.error('HTML fetch error:', e);
    }

    // Try to detect WordPress via REST API
    try {
      const wpCheck = await fetch(`${normalizedUrl}/wp-json/wp/v2`, {
        method: 'HEAD',
        headers: { 'User-Agent': 'GhostPost-Platform/1.0' },
        signal: AbortSignal.timeout(5000),
      });
      
      if (wpCheck.ok || wpCheck.status === 401) {
        platform = 'wordpress';
      }
    } catch (e) {
      // Not WordPress via API
    }

    // If not detected via API, check HTML for platform indicators
    if (!platform && html) {
      platform = detectPlatformFromHTML(html, hostname);
    }

    // Extract site name
    let siteName = hostname;
    if (html) {
      // Try AI extraction first
      const aiExtractedName = await extractSiteNameWithAI(html, hostname);
      if (aiExtractedName) {
        siteName = aiExtractedName;
      } else {
        // Fallback to regex extraction
        siteName = extractSiteNameFallback(html, hostname);
      }
    }

    return NextResponse.json({
      valid: true,
      url: normalizedUrl,
      siteName,
      platform,
    });
  } catch (error) {
    console.error('URL validation error:', error);
    return NextResponse.json(
      { valid: false, error: 'Validation failed. Please try again.' },
      { status: 500 }
    );
  }
}

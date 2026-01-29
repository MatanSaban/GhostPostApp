/**
 * Detect Platform Handler
 * 
 * Auto-detects the CMS/platform of a website.
 */

/**
 * Normalize URL
 */
function normalizeUrl(url) {
  if (!url) return null;
  let normalized = url.trim();
  if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
    normalized = 'https://' + normalized;
  }
  return normalized;
}

/**
 * Platform detection patterns
 */
const platformPatterns = [
  {
    name: 'wordpress',
    patterns: [
      /wp-content/i,
      /wp-includes/i,
      /wordpress/i,
      /<meta name="generator" content="WordPress/i,
    ],
    technologies: ['PHP', 'MySQL']
  },
  {
    name: 'shopify',
    patterns: [
      /cdn\.shopify\.com/i,
      /shopify/i,
      /<meta name="shopify-/i,
    ],
    technologies: ['Ruby', 'Liquid']
  },
  {
    name: 'wix',
    patterns: [
      /wix\.com/i,
      /wixstatic\.com/i,
      /_wix_/i,
    ],
    technologies: ['JavaScript', 'Corvid']
  },
  {
    name: 'squarespace',
    patterns: [
      /squarespace\.com/i,
      /static1\.squarespace\.com/i,
    ],
    technologies: ['JavaScript', 'JSON-T']
  },
  {
    name: 'webflow',
    patterns: [
      /webflow\.com/i,
      /assets\.website-files\.com/i,
      /<meta content="Webflow"/i,
    ],
    technologies: ['JavaScript', 'CSS']
  },
  {
    name: 'drupal',
    patterns: [
      /Drupal/i,
      /sites\/all\/themes/i,
      /sites\/default\/files/i,
    ],
    technologies: ['PHP', 'MySQL']
  },
  {
    name: 'joomla',
    patterns: [
      /Joomla/i,
      /media\/jui/i,
      /\/templates\//i,
    ],
    technologies: ['PHP', 'MySQL']
  },
  {
    name: 'magento',
    patterns: [
      /Magento/i,
      /mage\/cookies/i,
      /skin\/frontend/i,
    ],
    technologies: ['PHP', 'MySQL']
  },
  {
    name: 'ghost',
    patterns: [
      /ghost/i,
      /<meta name="generator" content="Ghost/i,
    ],
    technologies: ['Node.js', 'MySQL']
  },
  {
    name: 'next.js',
    patterns: [
      /_next\//i,
      /__NEXT_DATA__/i,
    ],
    technologies: ['Node.js', 'React']
  },
  {
    name: 'gatsby',
    patterns: [
      /gatsby/i,
      /___gatsby/i,
    ],
    technologies: ['Node.js', 'React', 'GraphQL']
  },
];

export async function detectPlatform(params, context) {
  const { url } = params;
  
  const normalizedUrl = normalizeUrl(url);
  if (!normalizedUrl) {
    return {
      success: false,
      error: 'Invalid URL provided'
    };
  }
  
  try {
    // Fetch the page
    const response = await fetch(normalizedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; GhostPostBot/1.0; +https://ghostpost.io)',
        'Accept': 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(10000)
    });
    
    if (!response.ok) {
      return {
        success: false,
        error: `Failed to fetch website: ${response.status}`
      };
    }
    
    const html = await response.text();
    const headers = Object.fromEntries(response.headers.entries());
    
    // Check each platform
    let detectedPlatform = null;
    let maxMatches = 0;
    let detectedTechnologies = [];
    
    for (const platform of platformPatterns) {
      let matches = 0;
      for (const pattern of platform.patterns) {
        if (pattern.test(html)) {
          matches++;
        }
      }
      
      if (matches > maxMatches) {
        maxMatches = matches;
        detectedPlatform = platform.name;
        detectedTechnologies = platform.technologies;
      }
    }
    
    // Check server header for additional hints
    const server = headers['x-powered-by'] || headers['server'] || '';
    if (server.toLowerCase().includes('php')) {
      detectedTechnologies = [...new Set([...detectedTechnologies, 'PHP'])];
    }
    if (server.toLowerCase().includes('nginx')) {
      detectedTechnologies = [...new Set([...detectedTechnologies, 'Nginx'])];
    }
    if (server.toLowerCase().includes('apache')) {
      detectedTechnologies = [...new Set([...detectedTechnologies, 'Apache'])];
    }
    
    // Calculate confidence
    const confidence = detectedPlatform 
      ? Math.min(0.95, 0.5 + (maxMatches * 0.15))
      : 0;
    
    const result = {
      success: true,
      platform: detectedPlatform || 'unknown',
      confidence,
      technologies: detectedTechnologies,
      serverInfo: server || null
    };

    // Store in interview external data
    if (context.interview && context.prisma) {
      const existingData = context.interview.externalData || {};
      await context.prisma.userInterview.update({
        where: { id: context.interview.id },
        data: {
          externalData: {
            ...existingData,
            platformData: result,
            platformDetectedAt: new Date().toISOString(),
          }
        }
      });
    }

    return result;
    
  } catch (error) {
    console.error('Detect platform error:', error);
    return {
      success: false,
      error: error.message || 'Failed to detect platform'
    };
  }
}

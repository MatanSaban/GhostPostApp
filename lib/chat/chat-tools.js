/**
 * Chat Bot Tool Definitions
 * 
 * Defines all tools the chat bot can use, organized into:
 * - WordPress tools (content CRUD, SEO, code snippets)
 * - Platform tools (audit, agent scan, insights, keywords)
 * - Analysis tools (read-only, no approval needed)
 * 
 * Uses raw JSON Schema for parameters (required by Vertex AI / Gemini provider).
 * Tools that modify data are flagged in APPROVAL_REQUIRED_TOOLS.
 */

import { jsonSchema } from 'ai';

// ─── Tool Metadata ───────────────────────────────────────────────────

export const TOOL_CATEGORIES = {
  WORDPRESS: 'wordpress',
  PLATFORM: 'platform',
  ANALYSIS: 'analysis',
};

/**
 * Tools that require user approval before execution.
 * Read-only / analysis tools execute immediately.
 */
export const APPROVAL_REQUIRED_TOOLS = new Set([
  'wp_update_post',
  'wp_update_seo',
  'wp_create_redirect',
  'wp_update_acf',
  'wp_add_code_snippet',
  'wp_bulk_update_posts',
  'wp_delete_redirect',
  'wp_upload_media',
  'wp_update_media',
  'wp_search_replace_links',
  'run_site_audit',
  'run_agent_scan',
]);

// ─── Tool Definitions ────────────────────────────────────────────────

export function getChatTools({ isWordPress = false }) {
  const tools = {};

  // ── Analysis Tools (always available, no approval) ───────────────

  tools.analyze_page = {
    description: 'Fetch and analyze a page from the website. Returns headings (H1/H2/H3), meta tags (title, description, canonical, robots, OG), images with alt text status, internal/external links, word count, structured data, and more. If no URL is provided, analyzes the site homepage. Works for any site — uses the WordPress plugin API when available, otherwise fetches the live page HTML directly. USE THIS TOOL whenever the user asks about page content, headings, structure, SEO elements, or any on-page data.',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The URL of the page to analyze. If omitted, analyzes the site homepage.' },
      },
    }),
  };

  tools.get_site_audit_results = {
    description: 'Get the latest site audit results including score, issues found, and recommendations. Returns audit score, category scores (technical, performance, visual), and top issues with severity. Include a link to the full audit page.',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        device: { type: 'string', enum: ['desktop', 'mobile'], description: 'Device type to get audit for. Defaults to desktop.' },
      },
    }),
  };

  tools.get_agent_insights = {
    description: 'Get AI agent insights and recommendations for the site. Returns categorized insights (content, traffic, keywords, competitors, technical) with priority levels. Shows the same data as the AI Agent Activity section in the dashboard.',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        category: { type: 'string', enum: ['CONTENT', 'TRAFFIC', 'KEYWORDS', 'COMPETITORS', 'TECHNICAL'], description: 'Filter by category' },
        status: { type: 'string', enum: ['PENDING', 'APPROVED', 'EXECUTED', 'RESOLVED'], description: 'Filter by status' },
        limit: { type: 'number', description: 'Max results to return. Default 10.' },
      },
    }),
  };

  tools.get_keywords = {
    description: 'Get keyword rankings and data for the site from Google Search Console. Returns keywords with position, clicks, impressions, and CTR.',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Filter keywords containing this text' },
        limit: { type: 'number', description: 'Max results. Default 20.' },
        sortBy: { type: 'string', enum: ['clicks', 'impressions', 'position', 'ctr'], description: 'Sort by metric. Default: clicks.' },
      },
    }),
  };

  tools.get_content_entities = {
    description: 'Get content entities (pages, posts, products) synced from the website. Returns URLs, titles, types, and SEO status.',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        type: { type: 'string', description: 'Filter by post type (post, page, product, etc.)' },
        query: { type: 'string', description: 'Search by title or URL' },
        limit: { type: 'number', description: 'Max results. Default 20.' },
      },
    }),
  };

  tools.get_competitors = {
    description: 'Get competitor data and analysis for the site.',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max results. Default 10.' },
      },
    }),
  };

  // ── Platform Action Tools (available for all sites) ──────────────

  tools.run_site_audit = {
    description: 'Trigger a new site audit that scans all pages for SEO issues, performance problems, and technical errors. This runs in the background and may take a few minutes. Returns audit IDs and a link to the audit page.',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        maxPages: { type: 'number', description: 'Max pages to scan. Default uses plan limit.' },
      },
    }),
  };

  tools.run_agent_scan = {
    description: 'Trigger an AI agent analysis scan that checks the site for content issues, traffic anomalies, keyword opportunities, and technical problems. Generates actionable insights. Returns a link to the agent insights page.',
    inputSchema: jsonSchema({ type: 'object', properties: {} }),
  };

  // ── WordPress Tools (only for WP sites) ──────────────────────────

  if (isWordPress) {
    tools.wp_get_site_info = {
      description: 'Get WordPress site information including WP version, active plugins, theme, language/locale, post types, and detected SEO plugins (Yoast/RankMath). Use this to understand the site setup before making changes.',
      inputSchema: jsonSchema({ type: 'object', properties: {} }),
    };

    tools.wp_get_post = {
      description: 'Fetch a specific post or page from WordPress by its ID or URL. Returns the full content (HTML), title, slug, status, excerpt, featured image, SEO meta data (Yoast/RankMath), and ACF fields if available.',
      inputSchema: jsonSchema({
        type: 'object',
        properties: {
          postId: { type: 'string', description: 'WordPress post ID' },
          url: { type: 'string', description: 'Page URL to resolve to a post' },
          postType: { type: 'string', enum: ['posts', 'pages'], description: 'Post type. Default: posts.' },
        },
      }),
    };

    tools.wp_search_posts = {
      description: 'Search WordPress posts and pages by keyword. Returns matching posts with titles, URLs, types, and status.',
      inputSchema: jsonSchema({
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search term to find in post titles and content' },
          postType: { type: 'string', enum: ['posts', 'pages'], description: 'Filter by post type' },
          limit: { type: 'number', description: 'Max results. Default 10.' },
        },
        required: ['query'],
      }),
    };

    tools.wp_get_seo_data = {
      description: 'Get SEO meta data for a specific post (Yoast or RankMath). Returns SEO title, meta description, focus keyword, canonical URL, robots settings, and Open Graph data.',
      inputSchema: jsonSchema({
        type: 'object',
        properties: {
          postId: { type: 'string', description: 'WordPress post ID' },
        },
        required: ['postId'],
      }),
    };

    tools.wp_update_post = {
      description: 'Update a WordPress post or page. Can change title, content (HTML), slug, status, excerpt, or featured image. Supports adding/replacing H1 headings even on Elementor and other page builder sites. IMPORTANT: Always fetch the current post first to understand its structure. Consider the site language and installed plugins.',
      inputSchema: jsonSchema({
        type: 'object',
        properties: {
          postId: { type: 'string', description: 'WordPress post ID to update' },
          postType: { type: 'string', enum: ['posts', 'pages'], description: 'Post type. Default: posts.' },
          data: {
            type: 'object',
            description: 'Fields to update',
            properties: {
              title: { type: 'string', description: 'New post title' },
              content: { type: 'string', description: 'New HTML content (full or partial replacement)' },
              slug: { type: 'string', description: 'New URL slug' },
              status: { type: 'string', enum: ['publish', 'draft', 'pending', 'private'], description: 'Post status' },
              excerpt: { type: 'string', description: 'Post excerpt' },
              add_h1: { type: 'string', description: 'Add a new H1 heading to a page that has none. Works with Elementor, Beaver Builder, and raw HTML. Pass the H1 text (without HTML tags).' },
              old_h1: { type: 'string', description: 'Current H1 text to replace (use with new_h1). Works with page builders.' },
              new_h1: { type: 'string', description: 'New H1 text to replace old_h1 with. Works with page builders.' },
            },
          },
        },
        required: ['postId', 'data'],
      }),
    };

    tools.wp_update_seo = {
      description: 'Update SEO meta data for a WordPress post via Yoast or RankMath. Can change SEO title, meta description, focus keyword, canonical URL, and robots settings.',
      inputSchema: jsonSchema({
        type: 'object',
        properties: {
          postId: { type: 'string', description: 'WordPress post ID' },
          seoData: {
            type: 'object',
            description: 'SEO fields to update',
            properties: {
              title: { type: 'string', description: 'SEO title (50-60 chars)' },
              description: { type: 'string', description: 'Meta description (140-160 chars)' },
              focusKeyword: { type: 'string', description: 'Focus keyword' },
              canonical: { type: 'string', description: 'Canonical URL' },
              robots: {
                type: 'object',
                description: 'Robots directives',
                properties: {
                  noindex: { type: 'boolean' },
                  nofollow: { type: 'boolean' },
                },
              },
            },
          },
        },
        required: ['postId', 'seoData'],
      }),
    };

    tools.wp_update_acf = {
      description: 'Update Advanced Custom Fields (ACF) data for a WordPress post. Only works if ACF plugin is installed.',
      inputSchema: jsonSchema({
        type: 'object',
        properties: {
          postId: { type: 'string', description: 'WordPress post ID' },
          fields: { type: 'object', description: 'ACF field key-value pairs to update' },
        },
        required: ['postId', 'fields'],
      }),
    };

    tools.wp_create_redirect = {
      description: 'Create a URL redirect (301 or 302) on the WordPress site.',
      inputSchema: jsonSchema({
        type: 'object',
        properties: {
          sourceUrl: { type: 'string', description: 'Source URL path (e.g., /old-page)' },
          targetUrl: { type: 'string', description: 'Target URL (e.g., /new-page or full URL)' },
          type: { type: 'string', enum: ['301', '302'], description: 'Redirect type. Default: 301.' },
        },
        required: ['sourceUrl', 'targetUrl'],
      }),
    };

    tools.wp_delete_redirect = {
      description: 'Delete an existing redirect on the WordPress site.',
      inputSchema: jsonSchema({
        type: 'object',
        properties: {
          redirectId: { type: 'string', description: 'Redirect ID to delete' },
        },
        required: ['redirectId'],
      }),
    };

    tools.wp_get_redirects = {
      description: 'List all redirects configured on the WordPress site.',
      inputSchema: jsonSchema({ type: 'object', properties: {} }),
    };

    tools.wp_add_code_snippet = {
      description: 'Add a PHP/JS/CSS code snippet to WordPress via the Code Snippets plugin or theme functions.php. Use this for custom functionality that requires code changes. The code should be safe, well-commented, and consider the site language.',
      inputSchema: jsonSchema({
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Human-readable title for the snippet' },
          code: { type: 'string', description: 'The code to add (PHP, JS, or CSS)' },
          type: { type: 'string', enum: ['php', 'js', 'css'], description: 'Code language type' },
          scope: { type: 'string', enum: ['global', 'admin', 'frontend'], description: 'Where to load the code. Default: global.' },
          description: { type: 'string', description: 'Description of what the snippet does' },
        },
        required: ['title', 'code', 'type'],
      }),
    };

    tools.wp_bulk_update_posts = {
      description: 'Update multiple WordPress posts at once. Useful for bulk operations like fixing all H1 tags across posts, updating SEO meta on multiple pages, etc. Creates a detailed plan for each change.',
      inputSchema: jsonSchema({
        type: 'object',
        properties: {
          updates: {
            type: 'array',
            description: 'Array of post updates to perform',
            items: {
              type: 'object',
              properties: {
                postId: { type: 'string', description: 'WordPress post ID' },
                postType: { type: 'string', enum: ['posts', 'pages'], description: 'Post type' },
                data: { type: 'object', description: 'Fields to update on this post' },
                description: { type: 'string', description: 'What this specific update does' },
              },
              required: ['postId', 'data', 'description'],
            },
          },
        },
        required: ['updates'],
      }),
    };

    tools.wp_get_menus = {
      description: 'Get WordPress navigation menus and their items.',
      inputSchema: jsonSchema({ type: 'object', properties: {} }),
    };

    tools.wp_search_replace_links = {
      description: 'Find and replace URLs/links across all WordPress content. Useful for fixing broken links or updating URLs site-wide.',
      inputSchema: jsonSchema({
        type: 'object',
        properties: {
          oldUrl: { type: 'string', description: 'The URL to find' },
          newUrl: { type: 'string', description: 'The URL to replace it with' },
        },
        required: ['oldUrl', 'newUrl'],
      }),
    };

    tools.wp_upload_media = {
      description: 'Upload a media file to WordPress from a URL.',
      inputSchema: jsonSchema({
        type: 'object',
        properties: {
          url: { type: 'string', description: 'URL of the image/file to upload' },
          title: { type: 'string', description: 'Media title' },
          alt: { type: 'string', description: 'Alt text for the image' },
        },
        required: ['url'],
      }),
    };

    tools.wp_get_media = {
      description: 'List media files in WordPress library.',
      inputSchema: jsonSchema({
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Max results. Default 20.' },
        },
      }),
    };

    tools.wp_get_taxonomies = {
      description: 'Get all taxonomies (categories, tags, custom) and their terms from WordPress.',
      inputSchema: jsonSchema({ type: 'object', properties: {} }),
    };
  }

  return tools;
}

/**
 * Check if a tool requires user approval before execution
 */
export function toolRequiresApproval(toolName) {
  return APPROVAL_REQUIRED_TOOLS.has(toolName);
}

/**
 * Get the tool category
 */
export function getToolCategory(toolName) {
  if (toolName.startsWith('wp_')) return TOOL_CATEGORIES.WORDPRESS;
  if (['run_site_audit', 'run_agent_scan'].includes(toolName)) return TOOL_CATEGORIES.PLATFORM;
  return TOOL_CATEGORIES.ANALYSIS;
}

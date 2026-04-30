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
  'wp_create_post',
  'wp_update_post',
  'manipulate_element',
  'wp_update_seo',
  'wp_create_redirect',
  'wp_update_acf',
  'wp_add_code_snippet',
  'wp_bulk_update_posts',
  'wp_delete_redirect',
  'wp_add_menu_item',
  'wp_update_menu_item',
  'wp_delete_menu_item',
  'wp_delete_post',
  'wp_create_term',
  'wp_update_term',
  'wp_delete_term',
  'wp_moderate_comment',
  'wp_reply_comment',
  'wp_delete_comment',
  'wp_update_options',
  'wp_self_update_plugin',
  'wp_rest_api',
  'wp_upload_media',
  'wp_update_media',
  'wp_set_featured_image',
  'wp_insert_image_in_content',
  'generate_image',
  'wp_search_replace_links',
  'run_site_audit',
  'run_agent_scan',
  'research_keywords',
  'add_competitor',
  'scan_competitor_page',
  'create_content_campaign',
  'create_backlink_listing',
]);

// ─── Tool Definitions ────────────────────────────────────────────────

export function getChatTools({ isWordPress = false }) {
  const tools = {};

  // ── Analysis Tools (always available, no approval) ───────────────

  tools.analyze_page = {
    description: 'Fetch and analyze a page from the website. Returns headings (H1/H2/H3), meta tags (title, description, canonical, robots, OG), images with alt text status, internal/external links, word count, structured data, and more. If no URL is provided, analyzes the site homepage. Works for any site - uses the WordPress plugin API when available, otherwise fetches the live page HTML directly. USE THIS TOOL whenever the user asks about page content, headings, structure, SEO elements, or any on-page data.',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The URL of the page to analyze. If omitted, analyzes the site homepage.' },
      },
    }),
  };

  tools.request_element_placement = {
    description: 'Open the live preview panel in the chat and ask the user to pick WHERE a new element (e.g. an H1) should be placed. The user may click an element in the iframe inspector OR describe the location in words (or both). MUST be used before calling wp_update_post with add_h1. The tool returns immediately with an awaiting_placement flag - it does NOT wait for the user. After calling it, STOP and wait for the user\'s next message, which will include either the selected element context or a textual description. Then call wp_update_post with add_h1 and pass the resulting anchor text as insert_before_text.',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        elementType: { type: 'string', description: 'What is being placed (e.g. "H1 heading", "paragraph", "image"). Shown in the UI banner.' },
        pagePath: { type: 'string', description: 'Path on the site to open in preview, e.g. "/" or "/about". Default "/".' },
        guidance: { type: 'string', description: 'Short sentence shown to the user explaining what they should click or describe.' },
      },
      required: ['elementType'],
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

  tools.web_search = {
    description: 'Search the public web (Google-class results) for ANY topic - company info, brand assets, competitive intel, news, documentation. Returns up to 10 results with title, URL, and a snippet. Read-only, no approval required, free for the user. USE THIS WHENEVER:\n  - The user mentions a company / brand / product / person you don\'t already have URLs for ("logo of ACME", "what does company X do", "find article about Y").\n  - You need a reference URL before fetch_url can extract content from it.\n  - You need to discover competitor pages, news mentions, or industry trends.\n\nProvider chain: Tavily → SerpAPI → Google CSE → DuckDuckGo (whichever is configured / first to return results). If the chain returns 0 results, tell the user clearly so they can refine the query or paste the URL themselves - never invent URLs.',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Natural-language search query (English or any language). Be specific - "{company} official website logo png" beats "{company} logo".' },
        limit: { type: 'number', description: 'Max results to return. Default 5, max 10.' },
      },
      required: ['query'],
    }),
  };

  tools.fetch_url = {
    description: 'Fetch any public URL and parse it for SEO + image-discovery metadata. Returns:\n  - title, description, canonical, og:title/description/image\n  - favicons[] (URL + sizes + type)\n  - logos[] (ranked best-guess company-logo candidates - prioritised by SVG/PNG, "logo" in src/alt/class, header presence)\n  - images[] (up to 30 <img> tags with src + alt)\n  - If the URL itself is an image (image/* content-type), returns { asImage: true, url, contentType, bytes } instead.\n\nPrimary use cases:\n  1. Finding a company logo to use as a reference image for generate_image (chain: web_search → fetch_url → pick logos[0].url → pass to generate_image.referenceImages).\n  2. Pulling structured info from a competitor page or article without leaving the chat.\n  3. Verifying that a URL the user pasted is reachable + understanding its content.\n\nIf logos[] is empty after fetching the company\'s homepage, tell the user "I couldn\'t find a logo automatically - paste a logo URL or attach the image to the chat and I\'ll use that." Never fabricate an image URL.',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The full URL to fetch (must include https://).' },
        extractImages: { type: 'boolean', description: 'Whether to extract <img> tags + logo candidates. Default true. Set false for a cheap title/description-only fetch.' },
      },
      required: ['url'],
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

  tools.research_keywords = {
    description: 'Research search volume, competition, and cost-per-click for a list of keywords via Google Ads. Results are cached for 30 days. Use this when the user wants to evaluate keywords they are considering targeting, or when suggesting new keywords they might rank for. Requires Google Ads API to be configured.',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        keywords: { type: 'array', items: { type: 'string' }, description: 'Keywords to research (1-20 terms)' },
        geo: { type: 'string', description: 'Target country code (e.g. "IL", "US"). Defaults to the site location.' },
      },
      required: ['keywords'],
    }),
  };

  tools.get_backlinks = {
    description: 'List backlink marketplace listings the user can purchase or listings they already own. Filter by "available" (marketplace), "purchased" (bought by the user), or "myListings" (sites the user is selling backlinks on). Read-only.',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        filter: { type: 'string', enum: ['available', 'purchased', 'myListings'], description: 'Which set of backlinks to list. Default: available.' },
        minDA: { type: 'number', description: 'Minimum domain authority' },
        maxPrice: { type: 'number', description: 'Maximum price (USD)' },
        category: { type: 'string', description: 'Filter by niche/category' },
        limit: { type: 'number', description: 'Max results. Default 10.' },
      },
    }),
  };

  tools.add_competitor = {
    description: 'Add a new competitor to track for this site. Pass the competitor\'s homepage or key page URL. Automatically extracts the domain and fetches the favicon. Use this when the user says "I want to compete against example.com" or similar.',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Competitor URL (full URL with protocol)' },
        name: { type: 'string', description: 'Optional display name for the competitor' },
      },
      required: ['url'],
    }),
  };

  tools.scan_competitor_page = {
    description: 'Scrape a competitor page to extract structure (headings, word count, title, meta description, link counts). Use this for quick competitive analysis of a specific URL. Does NOT store the result as a competitor record (use add_competitor for that).',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Competitor page URL to scan' },
      },
      required: ['url'],
    }),
  };

  tools.create_content_campaign = {
    description: 'Create a DRAFT content planning campaign. The campaign organizes a batch of scheduled content around a main keyword or topic cluster over a date range. The user can refine and activate it from the Content Planner dashboard afterward. All fields except name/startDate/endDate/postsCount are optional.',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Campaign name' },
        startDate: { type: 'string', description: 'Start date (ISO 8601: YYYY-MM-DD)' },
        endDate: { type: 'string', description: 'End date (ISO 8601: YYYY-MM-DD)' },
        postsCount: { type: 'number', description: 'Number of posts to schedule' },
        mainKeyword: { type: 'string', description: 'Main keyword / topic cluster' },
        publishDays: { type: 'array', items: { type: 'string', enum: ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] }, description: 'Days of the week to publish on' },
        subjects: { type: 'array', items: { type: 'string' }, description: 'Initial subject ideas' },
        pillarPageUrl: { type: 'string', description: 'Optional pillar page URL for topic cluster' },
      },
      required: ['name', 'startDate', 'endDate', 'postsCount'],
    }),
  };

  tools.create_backlink_listing = {
    description: 'Create a new backlink listing so this user can sell backlinks from their site. Only usable if the user wants to monetize their site through the backlink marketplace.',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Short title for the listing' },
        description: { type: 'string', description: 'Detailed description of the listing' },
        price: { type: 'number', description: 'Price in USD' },
        category: { type: 'string', description: 'Niche / category (e.g. "Technology", "Health")' },
        linkType: { type: 'string', enum: ['DOFOLLOW', 'NOFOLLOW'], description: 'Link type. Default DOFOLLOW.' },
      },
      required: ['title', 'price'],
    }),
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

    tools.wp_create_post = {
      description: 'Create a BRAND NEW WordPress post or page from scratch. Use this when the user asks to "publish a post", "create an article", "add a new page", etc. Returns the new post ID and edit URL. The post is created with origin=gp-platform so it can be rolled back cleanly. Prefer status="draft" unless the user explicitly said "publish" / "release live" / "go live" - then use "publish". Pass `featured_image_url` (a URL to any public image) to auto-upload it to the WP media library and set it as the featured image in one shot - no separate upload step needed. You can also pass SEO meta via `seo.title` / `seo.description` / `seo.focus_keyword` and the plugin routes them to Yoast/RankMath automatically. For a long article, pass the full body as `content` in HTML (headings, paragraphs, lists, links, strong/em). Categories and tags accept either IDs (numbers) or slugs/names (strings) - the plugin will create missing tags on demand. Always show the user the edit URL and the public URL after creation so they can review.',
      inputSchema: jsonSchema({
        type: 'object',
        properties: {
          postType: { type: 'string', enum: ['posts', 'pages'], description: 'Post type. Default: posts.' },
          title: { type: 'string', description: 'Post title. Preserve the user\'s exact wording verbatim including embedded quotes, punctuation and Hebrew/RTL characters.' },
          content: { type: 'string', description: 'HTML body of the post. Use semantic HTML: <h2>/<h3> for section headings (do NOT put an <h1> here - the post title is already the H1), <p> for paragraphs, <ul>/<ol>/<li> for lists, <a href> for links, <strong>/<em> for emphasis. Avoid inline styles - the theme handles styling. Include internal and external links where they add value.' },
          excerpt: { type: 'string', description: 'Short post excerpt (1-2 sentences). Used in listing pages and search results.' },
          slug: { type: 'string', description: 'URL slug (optional - WordPress auto-generates from the title if omitted). Use lowercase hyphen-separated ASCII/transliterated form.' },
          status: { type: 'string', enum: ['draft', 'publish', 'pending', 'private', 'future'], description: 'Post status. Default: draft. Use "publish" only when user explicitly asks to go live. "future" requires a date.' },
          date: { type: 'string', description: 'Publish date in ISO 8601 (YYYY-MM-DDTHH:MM:SS). Only used with status="future".' },
          featured_image_url: { type: 'string', description: 'Public URL of an image to upload as the featured image. The plugin downloads, uploads to WP media library, and assigns as thumbnail in one step.' },
          categories: { type: 'array', items: { type: 'string' }, description: 'Category names, slugs, or numeric IDs. Missing categories are created.' },
          tags: { type: 'array', items: { type: 'string' }, description: 'Tag names, slugs, or numeric IDs. Missing tags are created.' },
          seo: {
            type: 'object',
            description: 'SEO meta to set on the new post (routed to Yoast or RankMath depending on which is active).',
            properties: {
              title: { type: 'string', description: 'SEO title (50-60 chars).' },
              description: { type: 'string', description: 'Meta description (140-160 chars).' },
              focus_keyword: { type: 'string', description: 'Focus keyword.' },
            },
          },
        },
        required: ['title'],
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
              add_h1: { type: 'string', description: 'Add a new H1 heading to a page that has none. Works with Elementor, Beaver Builder, and raw HTML. Pass the H1 text (without HTML tags). BEFORE calling this, you MUST first call request_element_placement to let the user pick where the H1 goes.' },
              insert_before_text: { type: 'string', description: 'Optional placement hint when using add_h1. The plugin will insert the new H1 immediately BEFORE the first existing element that contains this text (case-insensitive match against widget settings / module text). Use the selected element text returned from request_element_placement, or a short unique phrase the user described.' },
              old_h1: { type: 'string', description: 'Current H1 text to replace (use with new_h1). Works with page builders.' },
              new_h1: { type: 'string', description: 'New H1 text to replace old_h1 with. Works with page builders.' },
            },
          },
        },
        required: ['postId', 'data'],
      }),
    };

    tools.manipulate_element = {
      description: 'General-purpose element manipulator for WordPress posts/pages across Elementor, Beaver Builder, and raw HTML. Prefer this tool over wp_update_post/add_h1 whenever the user asks to add, update, or remove ANY on-page element (heading, paragraph, button, image, list item, etc.). The plugin handles builder-specific JSON so you only describe WHAT to change and WHERE. You must pick a locator that identifies the target (or the anchor for an insertion). Locator strategy by builder (call get_element_structure first to read the `builder` field): elementor → prefer `widget_id` from the structure; beaver_builder → prefer `widget_id` (BB node id); html → prefer `selector` (#id or tag+nth) or `tag_text`. Theme Builder note: if get_element_structure returns a non-empty `theme_templates[]`, the target page is rendered (wholly or partly) by Elementor Pro templates - you can still pass `postId` as the user-facing page ID and any `widget_id` from the page OR from theme_templates[].structure; the plugin auto-routes writes to the correct template and verifies against the page URL. The response will include `written_to_post_id` (the actual post that was mutated) and `rendered_via_template:true` when that routing happened - surface that in your reply so the user understands the change may affect other pages sharing that template. Design inheritance (Elementor inserts only): the plugin automatically clones design tokens (typography, colors, alignment, spacing, advanced styling) from the nearest existing widget of the same type - first the anchor itself if it matches, then siblings, then ancestors, then a whole-tree fallback. So an inserted H1 picks up the existing H1/H2 design on the page without you having to specify it. You only need to pass `element.settings` if you want to OVERRIDE that inheritance with specific design choices. Keep text short - avoid pasting entire page content. Returns applied:true only when the plugin has re-fetched the live page and confirmed the change is actually rendered. If applied:false with reason `render_mismatch`, the save landed in the DB but the page does not render it - report the failure to the user (with the `hint` and `url`) instead of retrying blindly. Always fetch element structure first via get_element_structure when uncertain.',
      inputSchema: jsonSchema({
        type: 'object',
        properties: {
          postId: { type: 'string', description: 'WordPress post ID to modify.' },
          operation: { type: 'string', enum: ['insert', 'update', 'delete'], description: 'insert = add a new element relative to a locator; update = change an existing element; delete = remove an element.' },
          locator: {
            type: 'object',
            description: 'How to find the target element (or anchor for insertion).',
            properties: {
              kind: { type: 'string', enum: ['widget_id', 'text_match', 'tag_text', 'selector', 'all_of_tag'], description: 'widget_id = exact Elementor/BB node id; text_match = first element whose text contains value (case-insensitive); tag_text = first element whose tag equals tag AND text contains text; selector = CSS selector (raw HTML only); all_of_tag = every element with a given tag (for bulk delete/update).' },
              value: { type: 'string', description: 'Value for widget_id / text_match.' },
              tag: { type: 'string', description: 'Tag name for tag_text / all_of_tag (e.g. h1, p, img).' },
              text: { type: 'string', description: 'Text fragment for tag_text.' },
              selector: { type: 'string', description: 'CSS selector for selector kind.' },
            },
            required: ['kind'],
          },
          position: { type: 'string', enum: ['before', 'after', 'inside_start', 'inside_end', 'replace'], description: 'REQUIRED when operation="insert". Position of the NEW element RELATIVE to the located anchor. Map user language strictly:\n• "before" → the new element becomes a SIBLING that appears ABOVE / BEFORE / ON TOP OF the anchor. Hebrew: מעל / לפני / מעליו / מעליה / למעלה. English: above, before, on top of, over, higher than.\n• "after" → sibling BELOW / AFTER the anchor. Hebrew: מתחת / אחרי / מתחתיו / למטה. English: below, after, beneath, under.\n• "inside_start" → the new element becomes the FIRST CHILD INSIDE the anchor. Only when user says "inside this at the top", "as the first child", "בתוך בהתחלה", "בראש של…" (meaning the inside top of).\n• "inside_end" → the new element becomes the LAST CHILD INSIDE the anchor. Only when user says "inside this at the end", "as the last child", "בתוך בסוף", "בסוף של… (מבפנים)".\n• "replace" → replace the anchor entirely.\n\nCRITICAL: "above X" / "מעל X" / "לפני X" / "כאן" referring to a selected area ALWAYS means position="before", NEVER "inside_start". Putting it inside_start makes it a CHILD of the selected area, not a sibling above it - that is almost never what the user asked for.\n\nIf the user asks to "wrap the new element in a container" or "add a container with X inside", still use position="before"/"after" relative to the anchor - the new wrapping container is the element you insert; you do NOT use inside_start just because the user mentioned "inside a container".' },
          element: {
            type: 'object',
            description: 'Definition of the element to insert (required for operation=insert).',
            properties: {
              tag: { type: 'string', description: 'HTML tag (h1, h2, p, img, a, button, etc.).' },
              text: { type: 'string', description: 'Text content for the element. CRITICAL: pass the user\'s exact wording VERBATIM - preserve all embedded quotes (including nested " " or \' \'), punctuation, emojis, spacing and Hebrew/RTL characters. Never strip or normalize quotation marks even when the user\'s message has nested quotes (e.g. `DGBLOG - "בלוג הדיגיטל שלך"` must be passed with both inner quotes intact, not flattened to `DGBLOG - בלוג הדיגיטל שלך`). If the user wraps a phrase in quotes, those quotes are part of the title, not delimiters.' },
              html: { type: 'string', description: 'Raw inner HTML (overrides text).' },
              widget_type: { type: 'string', description: 'Elementor widget type override (e.g. heading, text-editor, button). Inferred from tag when omitted.' },
              settings: { type: 'object', description: 'Builder-specific settings overrides (Elementor widget settings / BB module settings).' },
              attributes: { type: 'object', description: 'HTML attributes (class, id, href, src, alt, etc.) for raw HTML inserts.' },
            },
          },
          mutation: {
            type: 'object',
            description: 'Fields to change on the located element (required for operation=update).',
            properties: {
              text: { type: 'string', description: 'New text content. CRITICAL: pass the user\'s exact wording VERBATIM - preserve embedded quotes (including nested " " or \' \'), punctuation, emojis, and Hebrew/RTL characters. Never strip or normalize quotation marks.' },
              html: { type: 'string', description: 'New inner HTML.' },
              tag: { type: 'string', description: 'New tag name (e.g. change h2 to h1).' },
              attributes: { type: 'object', description: 'HTML attribute overrides (raw HTML only).' },
              settings: { type: 'object', description: 'Builder-specific settings overrides.' },
            },
          },
          dry_run: { type: 'boolean', description: 'If true, the plugin returns what WOULD change without writing. Useful when you are not sure the locator matches.' },
        },
        required: ['postId', 'operation'],
      }),
    };

    tools.get_element_structure = {
      description: 'Return a compact structural summary of a WordPress post/page: its `builder` (elementor | beaver_builder | html), a depth-ordered list of elements (widget id, type, tag, first ~80 chars of text), plus `theme_templates[]` - any Elementor Pro Theme Builder templates that actually render on this page (Single/Header/Footer/Loop/Archive). Each template entry includes its own `template_id`, `template_type`, and `structure`. When `theme_templates` is non-empty the visible widget IDs on the page often come from a template rather than the page itself - still pass the page\'s `postId` to manipulate_element; the plugin auto-routes widget_id writes to the correct template. Use `builder` to choose the right locator for manipulate_element (see that tool\'s description). Call this BEFORE manipulate_element whenever the user\'s description is ambiguous or you don\'t know the builder. Fast, read-only, no approval.',
      inputSchema: jsonSchema({
        type: 'object',
        properties: {
          postId: { type: 'string', description: 'WordPress post ID.' },
        },
        required: ['postId'],
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
      description: 'Add a PHP/JS/CSS/HTML code snippet to WordPress. The plugin auto-dispatches to the Code Snippets plugin if installed, otherwise WPCode, otherwise an mu-plugin drop-in - so this works on every site that has the GhostSEO plugin connected. Reversible via rollback (deletes the snippet from whichever backend it landed in). The code should be safe, well-commented, and consider the site language.',
      inputSchema: jsonSchema({
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Human-readable title for the snippet' },
          code: { type: 'string', description: 'The code to add (PHP, JS, CSS, or HTML)' },
          type: { type: 'string', enum: ['php', 'js', 'css', 'html'], description: 'Code language type. Use "html" for raw header/footer markup snippets.' },
          scope: { type: 'string', enum: ['global', 'admin', 'frontend', 'header', 'footer'], description: 'Where to load the code. "global" runs everywhere, "admin" only in /wp-admin, "frontend" only on the public site, "header"/"footer" anchor HTML snippets in wp_head / wp_footer. Default: global.' },
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
      description: 'Get WordPress navigation menus and their items. ALWAYS call this BEFORE wp_add_menu_item / wp_update_menu_item / wp_delete_menu_item so you have the correct menuId and itemIds.',
      inputSchema: jsonSchema({ type: 'object', properties: {} }),
    };

    tools.wp_add_menu_item = {
      description: 'Add a new item to an existing WordPress nav menu. Requires a menuId from wp_get_menus. For linking to a post/page, set type="post_type", object="post"|"page", and objectId=the WP post ID. For a custom URL, set type="custom" and pass url.',
      inputSchema: jsonSchema({
        type: 'object',
        properties: {
          menuId: { type: 'number', description: 'The ID of the menu to add to (from wp_get_menus).' },
          title: { type: 'string', description: 'The visible label for the menu item.' },
          url: { type: 'string', description: 'Custom URL. Only used when type="custom".' },
          type: { type: 'string', enum: ['custom', 'post_type', 'taxonomy'], description: 'Link type. Default: custom.' },
          object: { type: 'string', description: 'For type="post_type": "post" or "page" or a CPT slug. For type="taxonomy": "category" or "post_tag".' },
          objectId: { type: 'number', description: 'The ID of the post/page/term this item points to (for post_type or taxonomy).' },
          parentId: { type: 'number', description: 'Parent menu item ID for sub-menus. 0 or omit for top-level.' },
          position: { type: 'number', description: 'Sort order. Lower appears first.' },
          target: { type: 'string', enum: ['', '_blank'], description: 'Open in new tab if "_blank".' },
          classes: { type: 'string', description: 'Extra CSS classes.' },
        },
        required: ['menuId', 'title'],
      }),
    };

    tools.wp_update_menu_item = {
      description: 'Update an existing WordPress nav menu item (rename it, change its URL, change its order, change its parent). Requires an itemId from wp_get_menus.',
      inputSchema: jsonSchema({
        type: 'object',
        properties: {
          itemId: { type: 'number', description: 'The menu item ID (from wp_get_menus -> items[].id or ID).' },
          title: { type: 'string' },
          url: { type: 'string' },
          type: { type: 'string', enum: ['custom', 'post_type', 'taxonomy'] },
          object: { type: 'string' },
          objectId: { type: 'number' },
          parentId: { type: 'number' },
          position: { type: 'number' },
          target: { type: 'string', enum: ['', '_blank'] },
          classes: { type: 'string' },
        },
        required: ['itemId'],
      }),
    };

    tools.wp_delete_menu_item = {
      description: 'Delete a WordPress nav menu item. Requires an itemId from wp_get_menus. Does NOT delete the linked post/page - only removes the menu entry.',
      inputSchema: jsonSchema({
        type: 'object',
        properties: {
          itemId: { type: 'number', description: 'The menu item ID to delete.' },
        },
        required: ['itemId'],
      }),
    };

    tools.wp_delete_post = {
      description: 'Delete (move to trash, or permanently delete) a WordPress post, page, or custom post type entry. Default is soft-delete (trash) which is reversible by rollback. Use force=true only when the user explicitly asks to "permanently delete" or "remove forever". ALWAYS confirm the exact post in the action description so the user sees what will disappear.',
      inputSchema: jsonSchema({
        type: 'object',
        properties: {
          postId: { type: 'string', description: 'The WP post ID.' },
          postType: { type: 'string', description: 'posts | pages | <cpt-slug>. Default: posts.' },
          force: { type: 'boolean', description: 'If true, skip trash and permanently delete. Default: false (trash).' },
        },
        required: ['postId'],
      }),
    };

    tools.wp_list_terms = {
      description: 'List categories, tags, or any custom taxonomy terms on the site. Use taxonomy="category" for blog categories, "post_tag" for tags, or any custom taxonomy slug (e.g. "product_cat" for WooCommerce). Returns id/name/slug/count so you can pick the right one for wp_create_post or wp_update_post.',
      inputSchema: jsonSchema({
        type: 'object',
        properties: {
          taxonomy: { type: 'string', description: 'Taxonomy slug: "category", "post_tag", "product_cat", etc.' },
          search: { type: 'string', description: 'Optional search filter on name.' },
          limit: { type: 'number', description: 'Max results. Default: 200.' },
        },
        required: ['taxonomy'],
      }),
    };

    tools.wp_create_term = {
      description: 'Create a new category, tag, or custom taxonomy term. Use this when a post needs a category/tag that does not yet exist on the site. Returns the new term ID so you can assign it immediately.',
      inputSchema: jsonSchema({
        type: 'object',
        properties: {
          taxonomy: { type: 'string', description: '"category", "post_tag", or a custom taxonomy slug.' },
          name: { type: 'string', description: 'Human-readable term name (preserve user\'s exact wording incl. Hebrew/RTL).' },
          slug: { type: 'string', description: 'URL slug. Optional - WP auto-generates if omitted.' },
          description: { type: 'string', description: 'Optional term description (shown on archive pages).' },
          parent: { type: 'number', description: 'Parent term ID for hierarchical taxonomies (e.g. subcategory).' },
        },
        required: ['taxonomy', 'name'],
      }),
    };

    tools.wp_update_term = {
      description: 'Rename, re-slug, or re-describe an existing taxonomy term (category / tag / custom).',
      inputSchema: jsonSchema({
        type: 'object',
        properties: {
          taxonomy: { type: 'string' },
          termId: { type: 'number' },
          name: { type: 'string' },
          slug: { type: 'string' },
          description: { type: 'string' },
          parent: { type: 'number' },
        },
        required: ['taxonomy', 'termId'],
      }),
    };

    tools.wp_delete_term = {
      description: 'Delete a taxonomy term (category / tag / custom). Posts assigned to it are re-assigned to the default category (for "category") or just un-tagged. Irreversible via rollback once the parent re-creates the term - warn the user.',
      inputSchema: jsonSchema({
        type: 'object',
        properties: {
          taxonomy: { type: 'string' },
          termId: { type: 'number' },
        },
        required: ['taxonomy', 'termId'],
      }),
    };

    tools.wp_list_comments = {
      description: 'List comments on the site - all, pending moderation, spam, or on a specific post. Use this before moderating to see what\'s awaiting approval. Returns id, postId, author, email, content, date, approved status.',
      inputSchema: jsonSchema({
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['all', 'approve', 'hold', 'spam', 'trash'], description: '"hold" = pending moderation. Default: all.' },
          postId: { type: 'number', description: 'Only comments on this post.' },
          limit: { type: 'number', description: 'Max results. Default: 50.' },
        },
      }),
    };

    tools.wp_moderate_comment = {
      description: 'Change a comment\'s moderation status: approve, hold (pending), spam, or trash. Also usable to edit the comment content/author. Use wp_list_comments first to see what needs moderating.',
      inputSchema: jsonSchema({
        type: 'object',
        properties: {
          commentId: { type: 'number' },
          status: { type: 'string', enum: ['approve', 'hold', 'spam', 'trash'], description: 'New moderation status.' },
          content: { type: 'string', description: 'Optional: edit the comment body.' },
          author: { type: 'string', description: 'Optional: edit the author display name.' },
          authorEmail: { type: 'string', description: 'Optional: edit the author email.' },
        },
        required: ['commentId'],
      }),
    };

    tools.wp_reply_comment = {
      description: 'Post a reply to a comment (or a new top-level comment if parentId is 0). The reply is posted as the site administrator and auto-approved. Use this when the user wants to respond to a visitor comment.',
      inputSchema: jsonSchema({
        type: 'object',
        properties: {
          postId: { type: 'number', description: 'The post the comment lives on.' },
          parentId: { type: 'number', description: 'The comment ID to reply to. 0 or omit for a new top-level comment.' },
          content: { type: 'string', description: 'Reply body (HTML allowed, sanitized server-side).' },
        },
        required: ['postId', 'content'],
      }),
    };

    tools.wp_delete_comment = {
      description: 'Delete a comment. Default trashes it (reversible); pass force=true to permanently remove.',
      inputSchema: jsonSchema({
        type: 'object',
        properties: {
          commentId: { type: 'number' },
          force: { type: 'boolean', description: 'True = permanent delete. Default: false (trash).' },
        },
        required: ['commentId'],
      }),
    };

    tools.wp_get_options = {
      description: 'Read common WordPress site settings: site title (blogname), tagline (blogdescription), admin email, timezone, date/time format, permalink structure, homepage config (show_on_front / page_on_front / page_for_posts), posts-per-page, comments defaults, search-engine visibility (blog_public), image sizes, registration settings, default user role. Use this BEFORE wp_update_options so you know the current values.',
      inputSchema: jsonSchema({ type: 'object', properties: {} }),
    };

    tools.wp_update_options = {
      description: 'Update WordPress site settings (whitelisted: site title, tagline, timezone, date/time formats, permalink structure, homepage config, posts-per-page, comment defaults, image sizes, registration, default role, etc.). Always call wp_get_options first and show the user the before/after. Permalink structure changes flush rewrite rules automatically.',
      inputSchema: jsonSchema({
        type: 'object',
        description: 'Any whitelisted option key -> new value. Unknown keys are rejected with an error (they are NOT silently ignored).',
        properties: {
          blogname: { type: 'string' },
          blogdescription: { type: 'string' },
          admin_email: { type: 'string' },
          timezone_string: { type: 'string', description: 'IANA zone, e.g. "Asia/Jerusalem".' },
          date_format: { type: 'string' },
          time_format: { type: 'string' },
          start_of_week: { type: 'number' },
          permalink_structure: { type: 'string', description: 'e.g. "/%postname%/" for clean URLs.' },
          show_on_front: { type: 'string', enum: ['posts', 'page'] },
          page_on_front: { type: 'number' },
          page_for_posts: { type: 'number' },
          posts_per_page: { type: 'number' },
          default_comment_status: { type: 'string', enum: ['open', 'closed'] },
          default_ping_status: { type: 'string', enum: ['open', 'closed'] },
          blog_public: { type: 'number', description: '1 = let search engines index, 0 = discourage.' },
          users_can_register: { type: 'number' },
          default_role: { type: 'string' },
        },
      }),
    };

    tools.wp_self_update_plugin = {
      description: 'Force the GhostSEO plugin on this site to update itself to the latest published version. Use when the user\'s plugin is older than the version that introduced a tool/endpoint they need, or when they explicitly ask to update the plugin. Returns the new version or indicates already-latest.',
      inputSchema: jsonSchema({ type: 'object', properties: {} }),
    };

    tools.wp_rest_api = {
      description: 'ESCAPE HATCH - invoke ANY WordPress / plugin REST API route as an administrator. Use this ONLY when no dedicated tool covers the operation. Common uses: WooCommerce (/wc/v3/products, /wc/v3/orders, /wc/v3/coupons), Yoast SEO (/yoast/v1/*), RankMath (/rankmath/v1/*), Contact Form 7 (/contact-form-7/v1/*), WPForms (/wpforms/v1/*), Elementor (/elementor/v1/*), Redirection (/redirection/v1/*). ALWAYS do a GET first to discover the schema before writing. Report the raw response to the user if it contains information they need to act on. Never fabricate endpoints - if a GET returns 404 / rest_no_route, the plugin is not installed or the route does not exist.',
      inputSchema: jsonSchema({
        type: 'object',
        properties: {
          method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], description: 'HTTP method. Default: GET.' },
          path: { type: 'string', description: 'REST path starting with "/" - e.g. "/wp/v2/posts", "/wc/v3/products", "/yoast/v1/configuration/configure". Do NOT include the /wp-json prefix.' },
          params: { type: 'object', description: 'Query params (for GET/DELETE) or JSON body (for POST/PUT/PATCH). Keys depend on the target endpoint.' },
          headers: { type: 'object', description: 'Optional extra request headers.' },
          reason: { type: 'string', description: 'Short plain-English description of WHY this call is being made. Shown in the action plan to the user.' },
        },
        required: ['path', 'reason'],
      }),
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

    tools.wp_update_media = {
      description: 'Update an existing media library item\'s metadata: title, alt text, caption, description. Use this for SEO fixes (e.g. adding alt text to images that are missing it). Requires a mediaId from wp_get_media or generate_image. Reversible via rollback (restores the original metadata).',
      inputSchema: jsonSchema({
        type: 'object',
        properties: {
          mediaId: { type: 'number', description: 'WP attachment ID to update.' },
          data: {
            type: 'object',
            description: 'Fields to update on the attachment.',
            properties: {
              title: { type: 'string', description: 'Media title.' },
              alt: { type: 'string', description: 'Alt text for accessibility / SEO. In the user\'s site language.' },
              caption: { type: 'string', description: 'Caption shown under the image.' },
              description: { type: 'string', description: 'Long description.' },
            },
          },
        },
        required: ['mediaId', 'data'],
      }),
    };

    tools.generate_image = {
      description: 'Generate a brand-new image with Gemini Nano Banana from a text prompt and (by default) upload it straight into the WordPress media library. USE THIS whenever the user asks for "an image of X", "create a hero image", "generate a featured image", "make a banner", or anything that produces visual content. NEVER reply with "I cannot generate images" - you CAN. Returns { mediaId, url, alt, title } when uploaded.\n\nFEATURED-IMAGE PREVIEW FLOW (mandatory, do NOT bypass): If the image is intended to become a post\'s featured image, pass setAsFeaturedFor=<postId>. The platform will (a) generate the image, (b) upload it to the media library, (c) show the user a preview message with the image embedded, and (d) automatically create a SECOND pending approval card asking the user to confirm "Use this image as the featured image of post X". The user can then either approve to assign it, or reject and tell you to regenerate with refined instructions. NEVER assume the user wants the image to land on the post automatically - the platform enforces the preview step.\n\nIN-IMAGE TEXT LANGUAGE (automatic): Any text rendered INSIDE the image (titles, signs, headlines, captions) is automatically forced to the site\'s language by the platform - you do NOT need to add a "render text in Hebrew" instruction yourself, the executor prepends it. Just describe what text content you want in your normal English prompt and the platform handles the script/typography.\n\nIMPORTANT for the action-approval flow: when you propose this tool inside propose_action, the user sees an editable prompt textarea and two slots where they can attach their OWN reference images (e.g. a product shot, a brand logo, a previous hero). Those attachments are injected into the args as `referenceImages` at approve-time. So write the FULL English prompt verbatim in both the propose_action description AND the generate_image.prompt arg - the user will review and may tweak it before approving.',
      inputSchema: jsonSchema({
        type: 'object',
        properties: {
          prompt: { type: 'string', description: 'Detailed visual description of the image to generate. Include subject, style, mood, colors, composition. Write in English even when chatting in Hebrew - the image model performs best in English.' },
          aspectRatio: { type: 'string', enum: ['16:9', '1:1', '9:16', '4:3', '3:4'], description: 'Image aspect ratio. Default 16:9 for hero/featured, 1:1 for thumbnails/social, 9:16 for mobile/stories.' },
          title: { type: 'string', description: 'Media library title. Defaults to a truncated version of the prompt.' },
          alt: { type: 'string', description: 'Alt text for accessibility and SEO. Should describe the image in the user\'s site language (e.g. Hebrew for Hebrew sites). REQUIRED when uploadToWp is true.' },
          uploadToWp: { type: 'boolean', description: 'Upload the generated image to the WP media library. Default true. Set false only if the user explicitly asks for a temporary preview.' },
          setAsFeaturedFor: { type: 'number', description: 'If set, also assigns the uploaded image as the featured image of this post ID. Saves a follow-up wp_set_featured_image call.' },
          setAsFeaturedPostType: { type: 'string', description: 'Post type for setAsFeaturedFor. Defaults to "posts".' },
        },
        required: ['prompt'],
      }),
    };

    tools.wp_set_featured_image = {
      description: 'Set or change the featured image (post thumbnail) of an existing post/page. Pass the WP attachment ID returned by generate_image or wp_upload_media. To remove the featured image, pass mediaId=0.\n\nCROSS-STEP CHAINING: When this step comes after a generate_image / wp_upload_media step in the SAME plan, omit mediaId and the executor auto-fills it from the prior step. You may also use mediaId="{{prev.mediaId}}" or "{{steps[N].mediaId}}" to wire explicitly.',
      inputSchema: jsonSchema({
        type: 'object',
        properties: {
          postId: { type: 'number', description: 'Target post/page ID' },
          postType: { type: 'string', description: 'posts | pages | <CPT>. Defaults to posts.' },
          mediaId: { type: 'number', description: 'WP attachment ID. Pass 0 to clear the featured image.' },
        },
        required: ['postId', 'mediaId'],
      }),
    };

    tools.wp_insert_image_in_content = {
      description: 'Insert an image into a post/page body content at a specific position. The image must already exist in the media library - pass the mediaId from generate_image or wp_upload_media. For Elementor/Beaver-built pages prefer manipulate_element with an image element instead; this tool writes raw <figure><img></figure> markup into post_content (works on classic editor + Gutenberg pages).\n\nCROSS-STEP CHAINING: When this step comes AFTER a generate_image or wp_upload_media step in the SAME propose_action plan, you can omit mediaId/imageUrl entirely - the executor auto-fills them from the most recent successful image-producing step. To force the wiring explicitly (e.g. when there are multiple producers and you want a specific one), set `mediaId` to the literal string "{{steps[N].mediaId}}" (1-indexed) or "{{prev.mediaId}}". Same syntax works for imageUrl. NEVER leave both blank when there is no prior generate_image / wp_upload_media in the plan - the step will fail with a "requires either mediaId or imageUrl" error.',
      inputSchema: jsonSchema({
        type: 'object',
        properties: {
          postId: { type: 'number', description: 'Target post/page ID' },
          postType: { type: 'string', description: 'posts | pages | <CPT>. Defaults to posts.' },
          mediaId: { type: 'number', description: 'WP attachment ID to insert.' },
          imageUrl: { type: 'string', description: 'Direct image URL - used when mediaId is not provided. Prefer mediaId.' },
          alt: { type: 'string', description: 'Alt text. Required for accessibility/SEO.' },
          caption: { type: 'string', description: 'Optional caption shown under the image.' },
          align: { type: 'string', enum: ['none', 'left', 'center', 'right', 'wide', 'full'], description: 'Image alignment. Default none.' },
          position: { type: 'string', enum: ['start', 'end', 'before_text', 'after_text'], description: 'Where in the content to insert. start=top, end=bottom, before_text/after_text=relative to anchorText.' },
          anchorText: { type: 'string', description: 'Substring of existing content to anchor against. Required when position is before_text or after_text.' },
        },
        required: ['postId', 'alt'],
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
  if ([
    'run_site_audit',
    'run_agent_scan',
    'research_keywords',
    'add_competitor',
    'scan_competitor_page',
    'create_content_campaign',
    'create_backlink_listing',
  ].includes(toolName)) return TOOL_CATEGORIES.PLATFORM;
  return TOOL_CATEGORIES.ANALYSIS;
}

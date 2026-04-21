import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getCurrentAccountMember } from '@/lib/auth-permissions';
import { getTextModel, MODELS } from '@/lib/ai/gemini';
import { streamText, tool, jsonSchema, stepCountIs, hasToolCall } from 'ai';
import { logAIUsage, AI_OPERATIONS } from '@/lib/ai/credits';
import { trackAIUsage } from '@/lib/ai/credits-service';
import { getChatTools, toolRequiresApproval, getToolCategory } from '@/lib/chat/chat-tools';
import { executeReadOnlyTool } from '@/lib/chat/action-executor';
import { createActionProposal, checkPendingActions } from '@/lib/chat/approval-manager';

export const maxDuration = 300;

const BASE_SYSTEM_PROMPT = `You are the Ghost Post AI Assistant - an expert SEO advisor embedded in the Ghost Post platform.

Your capabilities:
- SEO strategy and analysis
- Content optimization and planning
- Keyword research guidance
- Technical SEO troubleshooting
- Competitor analysis insights
- Link building strategies
- Site audit interpretation
- Content calendar planning
- **Executing actions** on WordPress sites via the connected plugin (when tools are available)
- **Running platform features** like site audits and AI agent scans
- **Analyzing any webpage** by fetching its HTML - works for ALL sites, not just WordPress

Identity:
- You are male. In ALL languages (especially Hebrew, Arabic, and other gendered languages), ALWAYS use masculine/male grammatical forms when referring to yourself. For example in Hebrew: use "אני צריך" not "אני צריכה", use "אבדוק" not "אבדוק", use "מנתח" not "מנתחת", use "ממליץ" not "ממליצה".

Guidelines:
- Be concise, actionable, and data-driven
- When referencing site-specific data, use the context provided about the user's site
- If asked about something outside your expertise, be honest about limitations
- **Language rule (STRICT): You MUST respond ENTIRELY in the same language the user writes in.** If the user writes in Hebrew - respond fully in Hebrew. If English - respond in English. Do NOT mix languages. This includes section headers, tips, explanations, technical terms (use the localized form when one exists), and suggestions. The only exceptions are: code snippets, URLs, HTML tag names, and tool/plugin names that have no translation.
- You are NOT a general-purpose chatbot - stay focused on SEO, content, and digital marketing
- **ALWAYS consider all context of the conversation** - refer back to previous messages, data you fetched, and actions taken

Formatting rules (ALWAYS follow these):
- Use **bold** for key terms and important points
- Use bullet points (- ) or numbered lists (1. ) when listing items
- Use ### headings to separate sections in longer responses
- Add blank lines between paragraphs and sections for readability
- Use \`code\` formatting for technical terms, URLs, HTML tags, or code snippets
- Use > blockquotes for tips or important callouts
- Keep paragraphs short - no more than 3-4 sentences each
- When giving step-by-step instructions, use numbered lists
- For comparisons or pros/cons, use a clear list format

CRITICAL - Tool usage behavior:
- **NEVER say "I'll check" or "let me look into it" WITHOUT immediately calling a tool in the same response.** If you need data, call the tool NOW - don't tell the user you're going to do it.
- **NEVER write text that describes calling a tool** - like "call: analyze_page()" or "I'm calling analyze_page now". Just call the tool. The user sees a nice loading indicator automatically.
- **NEVER ask the user "should I do X?" if you already have enough information to do it.** If the user asks you to make a change or agrees to a suggestion, immediately use propose_action to create an action plan.
- For ANY question about page content, headings, meta tags, images, links, or structure → call analyze_page immediately
- For questions about the homepage → call analyze_page with no URL (it defaults to the site homepage)
- For questions about a specific page → call analyze_page with that page's URL
- For questions about SEO data → call wp_get_seo_data or analyze_page
- For questions about site structure → call wp_search_posts, get_content_entities, or analyze_page
- For questions about keywords/rankings → call get_keywords
- For questions about audit issues → call get_site_audit_results
- You can call MULTIPLE tools in sequence to gather all needed data before responding
- **analyze_page works for ALL sites** - it fetches the live page HTML directly. You don't need a WordPress plugin to analyze a page.
- When the user agrees to a change (says yes, approve, do it, etc.), IMMEDIATELY call propose_action with the full plan - don't re-analyze or ask more questions.

Tool usage rules for write operations:
- For write tools (updating posts, changing SEO, adding code), you MUST:
  1. First gather the current state using read tools (if you haven't already in this conversation)
  2. Call propose_action with the full plan - the user will see approve/reject buttons
  3. In the plan description, explain EVERY change and WHY in clear markdown
  4. NEVER execute write actions without going through the approval flow
- **If you already analyzed the page earlier in the conversation, DON'T analyze it again** - use the data you already have
- **When the user says "yes" or agrees to a suggestion you made, immediately call propose_action** - don't ask more questions, don't re-analyze, don't describe the plan as text. Just call the tool.
- **After calling propose_action, STOP. Do NOT continue writing text.** The user needs to approve or reject before anything else happens. The system will stop automatically - just call the tool and let it be.
- **NEVER output JSON or action plans as text.** Always use the propose_action tool. The user sees a beautiful action card when you call the tool - they will NOT see one if you write text.
- Consider the site's language, installed plugins, active theme, and existing code when proposing changes
- If adding code snippets, write clean, well-commented code that considers the site's existing plugins
- When showing results from platform features, include a link to the relevant dashboard page
- When multiple pages need changes, show ALL changes in a single plan for batch approval

Gentle approval & draft previews (MANDATORY for content creation/replacement):
- When you're about to CREATE or REPLACE substantial content (post body, page body, featured image, meta description, hero section), the action's description MUST include the full draft so the user sees exactly what will land before approving.
  * For wp_create_post / wp_update_post: put the FULL proposed title, slug (if changing), and the FULL HTML body of the post inside a fenced code block in the description. Not a summary - the literal text that will be written.
  * For generate_image: put the FULL English image prompt verbatim in the description, plus the aspectRatio and alt text. The user must be able to read the exact prompt and catch issues before a single generation credit is spent.
  * For wp_update_seo: show the current value vs. the new value side-by-side.
  * For manipulate_element on a visible element: include the new element's text/HTML in the description.
- Phrase the ask gently: "Here's the draft I'd publish - approve if it looks right, or tell me what to change." Never push the user to approve fast.
- If the user hasn't explicitly asked for a specific tone, length, or angle, ask ONE clarifying question BEFORE proposing - don't guess and then write 800 words they didn't want.
- Never propose two destructive actions back-to-back in the same turn without the user saying "go".

Rollback reminders:
- After ANY destructive or content-altering action completes successfully (wp_update_post, wp_create_post, wp_delete_post, manipulate_element, wp_update_seo, wp_update_options, wp_delete_term, wp_delete_menu_item, wp_moderate_comment, wp_delete_comment, generate_image with setAsFeaturedFor, wp_set_featured_image, wp_insert_image_in_content, wp_search_replace_links, wp_update_acf), your follow-up message MUST mention - in one short sentence in the user's language - that the change is reversible via the Rollback button on that action card. Example (Hebrew): "אם תרצה לבטל את השינוי, יש כפתור Rollback על כרטיס הפעולה למעלה." Example (English): "If you want to revert this, hit the Rollback button on the action card above."
- Don't spam the reminder - once per completed action is enough.

Post-execution verification:
- When a user says "verify", "check", "did it work", or similar after an action was executed, IMMEDIATELY call analyze_page on the relevant page to verify the changes took effect
- Compare the current state with what was expected and report results clearly
- If something didn't work, suggest next steps (retry, different approach, rollback)
- After verifying, suggest what the user should do next (e.g., "Now that the H1 is in place, let's optimize the meta description")

Page Builder awareness (CRITICAL for making changes work):
- Check the "WordPress site details" section above for detected capabilities (Elementor, etc.), active theme, and active plugins
- If Elementor is listed in detected capabilities or active plugins, the site uses Elementor - mention this to the user when explaining what you'll do
- For Elementor sites: content is stored in _elementor_data, NOT in post_content. Modifying post_content alone will NOT change what the user sees.
- To ADD a new visible element (H1, paragraph, button, image, etc.), ALWAYS use the manipulate_element tool. Do NOT use wp_update_post.add_h1 for new inserts on Elementor/Beaver pages - the legacy path can silently fall back to prepending raw HTML into post_content, which Elementor never renders on the live page.
- To REPLACE text of an existing H1, prefer manipulate_element with operation="update" + locator. wp_update_post.old_h1/new_h1 still works as a fallback but manipulate_element is more reliable on builder pages.
- For other content changes on Elementor sites, use manipulate_element - data.content overwrites post_content which Elementor ignores.
- If the plugin is older than 3.1.0 (manipulate_element returns "route not found" / 404), fall back to wp_update_post.add_h1. Otherwise do NOT fall back.
- Always use the correct postType: use "pages" for pages, "posts" for posts

H1 Heading workflow (follow this exact sequence):
1. Call analyze_page to check the current live page for existing H1 headings (headings.h1 is authoritative - comes from rendered HTML)
2. Check h1Count: if 0, the page truly has no H1. If > 0, report what's there.
3. Also call wp_get_post or wp_get_site_info to understand the page builder in use
4. Tell the user:
   - Whether the page has an H1 or not (cite analyze_page)
   - What page builder is used (Elementor, Beaver Builder, none)
   - What text you propose for the H1
5. For ADD operations (h1Count === 0), you MUST ask the user WHERE to place the H1 before proposing the action:
   a. Call request_element_placement with { elementType: "H1 heading", pagePath: <path on site>, guidance: <short sentence> }. This opens the live preview in the chat popup with the element inspector enabled.
   b. STOP. Do not call any more tools. End your turn and wait for the user's next message.
   c. When the user replies, their message may include a "[Targeting: ...]" context block from the inspector. PARSE IT - if it contains "elementor_id: <id>" that id is the authoritative target and you MUST use it as locator.value below.
   d. Call propose_action with manipulate_element:
      - tool: "manipulate_element"
      - args: {
          postId: "<page id>",
          operation: "insert",
          position: "before"   // or "after" / "inside_start" depending on the user's wording
          locator: { kind: "widget_id", value: "<the elementor_id from the Targeting block>" },
          element: { tag: "h1", text: "<the H1 text>" }
        }
      If no elementor_id was surfaced (non-Elementor site or user didn't use the inspector), call get_element_structure first, pick a widget_id from the list that matches the user's wording, and use that. Only as a last resort use locator.kind="text_match".
   e. If the user clearly said "at the top" / "first" and you don't have a widget_id, you may call manipulate_element with locator={kind:"tag_text", tag:"body"} + position="inside_start" - but prefer a real widget_id.
6. For REPLACE operations (h1Count > 0), ask for confirmation, then call propose_action:
   - If you have an elementor_id from the Targeting block: manipulate_element with operation="update", locator.kind="widget_id", mutation.text="<new text>"
   - Otherwise fall back to wp_update_post + { old_h1, new_h1 }
7. After execution, suggest verifying the change

Element placement rule (applies to any new element insertion):
- BEFORE proposing an action that ADDS a visible element (new H1, new section, etc.), call request_element_placement so the user can point to the location in the preview. Never skip this - placement-less insertions end up in the wrong place and waste the user's rollback budget.

General element editing (add / change / remove - MANDATORY path for plugin >= 3.1.0):
- For ANY user request to add, update, or remove an on-page element (H1/H2/H3, paragraph, button, image, list item, link, etc.), use the manipulate_element tool. Do NOT use wp_update_post for new element inserts on builder pages - wp_update_post's html_prepend fallback writes to post_content which Elementor/Beaver never render.
- Locator-picking order of preference:
    1. widget_id from the chat's "[Targeting: ...]" block (field "elementor_id") - the user literally pointed at it. Use it verbatim.
    2. widget_id from get_element_structure({ postId }) - call this when the user describes a target by name/position but hasn't used the inspector.
    3. text_match / tag_text - ONLY when the page has no builder (raw HTML / Gutenberg) or no widget_id is findable.
    4. selector - only for raw-HTML (non-builder) posts.
    5. all_of_tag - bulk delete/update (e.g. remove all empty <p>).
- For operation=insert: always provide position ∈ {before, after, inside_start, inside_end, replace} AND an element object ({ tag, text, widget_type?, settings?, attributes? }).
- For operation=update: provide a mutation object with only the fields you want changed (text, tag, attributes, settings).
- For operation=delete: just the locator is enough.
- If the user's target description is ambiguous, run manipulate_element with dry_run=true first - the plugin reports what WOULD change + a candidate list if nothing matched.
- If the plugin response is { applied: false, reason: "no_target_matched" }, the platform will automatically pick a candidate with Gemini and retry - do NOT retry the same call yourself.
- Element insertions still require request_element_placement FIRST so the user can point to the anchor.
- Fall back to wp_update_post.add_h1 ONLY if manipulate_element returns an HTTP 404 / "route not found" (plugin < 3.1.0).

Instructions link rules:
- When providing WordPress admin instructions to the user, ALWAYS include clickable links to the relevant WordPress admin pages
- The WordPress admin URL is always: {site_url}/wp-admin/
- Example links: {site_url}/wp-admin/post.php?post={post_id}&action=edit for editing a post/page
- Example links: {site_url}/wp-admin/edit.php?post_type=page for the pages list
- Example links: {site_url}/wp-admin/options-general.php for general settings
- Wrap links in markdown: [link text](url)
- If giving step-by-step instructions that involve the WordPress admin, link directly to the relevant page

Creating NEW posts / pages (MANDATORY path - never tell the user to do this manually):
- When the user asks you to "publish a post", "write a post about X", "create a page", or anything that produces BRAND-NEW content, use the wp_create_post tool inside propose_action. Never reply with "I cannot create posts" or "you need to do this in WordPress admin" - you CAN do it.
- Always set a realistic status: use "draft" when the user wants to review before publishing, "publish" when they asked for it to go live immediately. If unclear, ask - don't guess.
- For Hebrew/RTL content sites: write the post body content in clean HTML paragraphs (<p>...</p>, <h2>...</h2>, <ul>, <ol>) - do NOT paste block-editor markup. Elementor posts accept plain HTML via post_content; Elementor-specific layouts are only needed when editing an existing Elementor-built page.
- If the user wants a featured image, pass featured_image_url. Pass SEO metadata via the seo field so Yoast/RankMath gets populated automatically.

Menu editing (MANDATORY path - never tell the user to do this manually):
- To change ANY site navigation - rename a link, add a new link, delete a link, reorder - use wp_get_menus first to find the correct menuId and itemId, then use wp_add_menu_item / wp_update_menu_item / wp_delete_menu_item inside propose_action.
- To link a menu item to a post/page, set type="post_type", object="post" or "page", objectId=<post id>. For external URLs set type="custom" and pass url.
- If you don't have the itemId in this conversation, call wp_get_menus to get it - don't ask the user to read IDs off the screen.

Code snippets (MANDATORY path - never tell the user to do this manually):
- To add PHP/JS/CSS custom code, use wp_add_code_snippet. The plugin auto-dispatches to the Code Snippets plugin, then WPCode, then a mu-plugin drop-in fallback - it ALWAYS works as long as the site has our plugin connected. Do NOT tell the user to install Code Snippets or edit functions.php manually.
- If wp_add_code_snippet returns a 404 or "rest_no_route" error, the user's plugin is older than 3.3.0 - tell them that specifically and point them to the Ghost Post dashboard to update the plugin. Do NOT invent other causes (security plugins, WAF, etc.).

Error surfacing discipline:
- NEVER invent causes for tool errors. If a call fails with "Plugin API error (404): ..." your response must quote the LITERAL error text and suggest exactly one thing: check that the user's plugin version is at least the version that introduced this endpoint. Do not guess "WPS Hide Login", "a security plugin", "a firewall", "a cache", or anything else the error text does not say.
- If a write action returns render_mismatch, the change landed in the DB but isn't visible on the live page. Tell the user that directly, then auto-retry with a stricter locator (get_element_structure → widget_id) OR rollback if the retry would be speculative. Do not silently celebrate success.

Verify-before-act on IDs:
- Before calling wp_update_post / wp_update_seo / manipulate_element with a postId, make sure that postId came from a tool call IN THIS CONVERSATION (wp_search_posts, get_content_entities, wp_get_post, analyze_page returning .postId). Never invent or guess numeric post IDs.
- If you're acting on "this page" (the one the user is viewing in the chat popup), the page context is injected at the top of the system prompt under "Active page". Use that postId, not a guess.

Deleting content (MANDATORY path):
- Use wp_delete_post to trash or permanently delete any post/page/CPT entry. Default to trash (reversible); only pass force=true when the user explicitly says "permanently" / "forever" / "remove completely". Show the exact title + URL in the action description so the user sees what disappears.

Categories & tags (MANDATORY path):
- Use wp_list_terms before assigning or modifying any taxonomy. Use wp_create_term to add new categories/tags, wp_update_term to rename/re-slug, wp_delete_term to remove. Works for WooCommerce product categories (taxonomy="product_cat"), product tags ("product_tag"), and any custom taxonomy too.

Comments (MANDATORY path):
- Use wp_list_comments (status="hold" to see what's pending moderation) before taking action. Use wp_moderate_comment to approve/hold/spam/trash, wp_reply_comment to post a reply as the site admin, wp_delete_comment to trash or force-delete.

WP site settings (MANDATORY path):
- Use wp_get_options to read current settings and wp_update_options to change them. Supported keys include site title (blogname), tagline (blogdescription), admin email, timezone_string, date_format, time_format, permalink_structure, homepage config (show_on_front + page_on_front + page_for_posts), posts_per_page, default comment/ping status, blog_public (search engine visibility), users_can_register, default_role. Always show the before/after in the action plan.

Updating the Ghost Post plugin (MANDATORY path when the user's plugin is outdated):
- If a tool call fails with 404 / rest_no_route, the plugin on the user's site is older than the version that introduced that endpoint. Offer to run wp_self_update_plugin - it triggers WP's upgrader and pulls the latest published version from the Ghost Post platform. After a successful update, retry the original tool call.

WooCommerce / form builders / membership & LMS / other plugins (USE wp_rest_api):
- For WooCommerce: /wc/v3/products (GET/POST/PUT/DELETE), /wc/v3/orders, /wc/v3/coupons, /wc/v3/products/categories, /wc/v3/products/tags, /wc/v3/customers. GET first to discover the current schema, then POST/PUT with the returned field shape.
- For Contact Form 7: /contact-form-7/v1/contact-forms (list, create, update, delete forms).
- For WPForms: /wpforms/v1/forms.
- For Gravity Forms (if the REST API add-on is active): /gf/v2/forms.
- For MemberPress / LearnDash / TutorLMS: call the plugin's own REST namespace via wp_rest_api (discover with GET /<namespace>/v1/).
- ALWAYS pass a short "reason" field on every wp_rest_api call - the user sees it in the action plan and needs to understand what you're about to do in plain language.
- Never invent routes. If GET returns "rest_no_route", tell the user the plugin/version is not installed - do NOT retry the same path.

Extended SEO plugin control (USE wp_rest_api when wp_update_seo isn't enough):
- wp_update_seo already covers the common fields (title, description, focus keyword) for Yoast and RankMath.
- For advanced fields (social images, schema type, canonical, breadcrumb label, primary category, noindex/nofollow toggles, sitemap inclusion): use wp_rest_api with path "/yoast/v1/..." (Yoast) or "/rankmath/v1/..." (RankMath). List the plugin's routes with GET "/" first if uncertain.

Full builder control (Elementor / Beaver / Brizy / Divi):
- For inserts/updates/deletes of visible on-page elements, manipulate_element is still the primary tool - it handles Elementor, Beaver Builder, and raw HTML.
- For Elementor global settings, global widgets, saved templates, and kit settings, use wp_rest_api with "/elementor/v1/..." paths. The plugin has an admin-authenticated passthrough, so any Elementor REST route that requires manage_options will work.

Image generation (MANDATORY path - never tell the user "I cannot generate images"):
- You CAN generate images. Use generate_image for ANY request like "create an image of X", "make a hero/banner/featured image", "צור תמונה של…", "design a thumbnail". The tool runs Gemini Nano Banana, uploads the result straight into the WP media library, and returns { mediaId, url, alt, title }.
- ALWAYS write the image prompt itself in ENGLISH - Nano Banana renders best from English prompts - even when the surrounding chat is in Hebrew. Be specific: subject, style (photorealistic / illustration / flat / 3D / watercolor), mood, lighting, color palette, composition.
- ALWAYS pass alt in the user's site language (Hebrew for Hebrew sites). Alt text is for accessibility + SEO; "image of X" is NOT acceptable - describe what's actually visible.
- Choose aspectRatio deliberately: 16:9 for hero/featured/blog covers, 1:1 for social/thumbnails/avatars, 9:16 for mobile-first / story formats, 4:3 / 3:4 only when the user asks for portrait/landscape framing explicitly.
- Featured-image flow (one shot): pass setAsFeaturedFor=<postId> on generate_image - the upload AND the featured-image assignment happen in a single approved action. Do NOT chain generate_image → wp_set_featured_image when you can do it in one call.
- Featured-image swap on an existing image: use wp_set_featured_image with the mediaId you already have (e.g. from wp_get_media or a previous generate_image).
- Content-image flow: generate_image first (without setAsFeaturedFor), then wp_insert_image_in_content with mediaId + alt + position. For Elementor / Beaver-built pages prefer manipulate_element with an image element instead - wp_insert_image_in_content writes raw <figure> markup that Elementor's renderer ignores.
- When generating multiple images for one post (e.g. featured + 2 inline), bundle them into a single propose_action with all the steps so the user approves once. Do NOT propose 3 separate approval cards.
- If the user uploads their OWN image and asks you to use it as featured, skip generate_image - call wp_upload_media (URL) or, when only the image data is available, wp_set_featured_image with the mediaId returned.

Redirection plugins (bot already has wp_create_redirect / wp_delete_redirect / wp_get_redirects):
- Those helpers go through the Ghost Post plugin's own redirect manager which syncs to Redirection / Yoast Premium / Rank Math / Simple 301s / Safe Redirect Manager automatically. Do NOT call the third-party plugin's REST API directly unless the Ghost Post helper fails.

Proactive assistance (CRITICAL - this is how the product is supposed to feel):
- This platform is for users with ZERO web-dev or SEO knowledge. They don't know what to ask for. Your job is to DRIVE the work - always finish your responses with a concrete "Want me to do X for you?" offer (one clear action, not a menu of five options).
- When the user shares a site or uploads an audit, don't just describe issues - immediately offer the fix as an action. "I can fix this now - want me to?" is the right close.
- When a tool you'd need doesn't exist, say so briefly and STILL offer the nearest capability you DO have. Never end a turn with "you'll have to do this manually" when there's a tool-driven alternative (even a partial one).
- When you successfully complete an action, propose the next logical step: "H1 is live. Want me to generate a matching meta description now?"
- Hebrew users: your offers must also be in masculine Hebrew ("רוצה שאטפל בזה?", not "רוצה שאטפל בזה?" - same). Never default to feminine forms.`;

/**
 * Build the full system prompt with site context and WordPress details
 */
function buildSystemPrompt(site, siteInfo) {
  let prompt = BASE_SYSTEM_PROMPT;

  if (site) {
    prompt += `\n\nCurrent site context:
- Site name: ${site.name}
- URL: ${site.url}
- Platform: ${site.platform || 'Unknown'}`;
  }

  if (siteInfo) {
    prompt += `\n\nWordPress site details:`;
    if (siteInfo.locale || siteInfo.language) prompt += `\n- Language/Locale: ${siteInfo.locale || siteInfo.language}`;
    if (siteInfo.wpVersion || siteInfo.wp_version) prompt += `\n- WordPress version: ${siteInfo.wpVersion || siteInfo.wp_version}`;
    if (siteInfo.theme) prompt += `\n- Active theme: ${siteInfo.theme?.name || siteInfo.theme}`;
    if (siteInfo.activePlugins?.length) {
      prompt += `\n- Active plugins: ${siteInfo.activePlugins.map(p => p.name || p).join(', ')}`;
    } else if (siteInfo.active_plugins?.length) {
      prompt += `\n- Active plugins: ${siteInfo.active_plugins.map(p => p.name || p).join(', ')}`;
    }
    // Detected capabilities
    const capabilities = [];
    if (siteInfo.hasYoast) capabilities.push('Yoast SEO');
    if (siteInfo.hasRankMath) capabilities.push('RankMath SEO');
    if (siteInfo.hasACF) capabilities.push('Advanced Custom Fields');
    if (siteInfo.hasElementor) capabilities.push('Elementor');
    if (siteInfo.hasWooCommerce) capabilities.push('WooCommerce');
    if (capabilities.length) prompt += `\n- Detected capabilities: ${capabilities.join(', ')}`;
    if (siteInfo.seo_plugin || siteInfo.seoPlugin) prompt += `\n- SEO plugin: ${siteInfo.seo_plugin || siteInfo.seoPlugin}`;
    if (siteInfo.postTypes?.length) {
      prompt += `\n- Post types: ${siteInfo.postTypes.map(pt => pt.name || pt.slug || pt).join(', ')}`;
    } else if (siteInfo.post_types?.length) {
      prompt += `\n- Post types: ${siteInfo.post_types.map(pt => pt.slug || pt.name || pt).join(', ')}`;
    }
  }

  // Dashboard links
  if (site) {
    const siteId = site.id;
    prompt += `\n\nDashboard page links (use these when referencing platform features):
- Site Audit: /dashboard/site-audit?siteId=${siteId}
- AI Agent Insights: /dashboard/agent?siteId=${siteId}
- Keywords: /dashboard/strategy/keywords?siteId=${siteId}
- Content Entities: /dashboard/entities?siteId=${siteId}
- Competitors: /dashboard/strategy/competitors?siteId=${siteId}
- Content Planner: /dashboard/strategy/content-planner?siteId=${siteId}
- Technical SEO: /dashboard/technical-seo?siteId=${siteId}
- Backlinks: /dashboard/backlinks?siteId=${siteId}`;
  }

  return prompt;
}

/**
 * Strip raw tool call syntax that the model sometimes generates as text.
 * e.g., "call: analyze_page()" or "call: propose_action(description='...', actions=[...])"
 */
function stripToolCallText(text) {
  if (!text) return text;
  return text
    // Remove "call: tool_name(...)" patterns (handles nested parens/brackets)
    .replace(/`?call:\s*\w+\([\s\S]*?\)`?/gi, '')
    // Remove ```tool ... ``` blocks
    .replace(/```tool[\s\S]*?```/gi, '')
    .replace(/\n{3,}/g, '\n\n') // Clean up excessive newlines left behind
    .trim();
}

/**
 * Extract text content from a UIMessage (v6 format with parts)
 */
function getMessageText(msg) {
  if (msg.parts && Array.isArray(msg.parts)) {
    return msg.parts
      .filter(p => p.type === 'text')
      .map(p => p.text)
      .join('');
  }
  // Fallback for legacy format
  return msg.content || '';
}

/**
 * POST /api/chat
 * Send a message and get a streaming AI response with tool calling support.
 * 
 * Read-only tools execute immediately and feed results back to the model.
 * Write tools create a ChatAction proposal that requires user approval.
 */
export async function POST(request) {
  const { authorized, member, error, isSuperAdmin } = await getCurrentAccountMember();
  if (!authorized) {
    return NextResponse.json({ error }, { status: 401 });
  }

  const body = await request.json();
  const { conversationId, siteId, messages: uiMessages, selection } = body;

  // Extract the last user message text from UIMessages array
  const lastUserMsg = uiMessages?.slice().reverse().find(m => m.role === 'user');
  const message = lastUserMsg ? getMessageText(lastUserMsg) : null;

  if (!conversationId || !message) {
    return NextResponse.json({ error: 'conversationId and message are required' }, { status: 400 });
  }

  // Load conversation with full site data (including siteKey for WP detection)
  const conversation = await prisma.chatConversation.findUnique({
    where: { id: conversationId },
    include: {
      site: {
        select: {
          id: true, name: true, url: true, platform: true,
          siteKey: true, siteSecret: true,
        },
      },
    },
  });

  if (!conversation) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
  }

  if (!isSuperAdmin && conversation.accountId !== member.accountId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const site = conversation.site;
  const isWordPress = site?.platform?.toLowerCase() === 'wordpress' && site?.siteKey && site?.siteSecret;

  // Check for pending action expirations on this conversation
  await checkPendingActions(conversationId).catch(() => {});

  // Save user message to DB
  await prisma.chatMessage.create({
    data: {
      conversationId,
      role: 'USER',
      userId: member.userId,
      content: message.trim(),
    },
  });

  // Load conversation history for context
  const history = await prisma.chatMessage.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'asc' },
    take: 50,
  });

  const aiMessages = history
    .filter((msg) => msg.content) // Skip messages with empty content
    .map((msg) => ({
      role: msg.role === 'USER' ? 'user' : 'assistant',
      content: msg.role === 'ASSISTANT' ? stripToolCallText(msg.content) : msg.content,
    }))
    .filter((msg) => msg.content); // Re-filter in case stripping made content empty

  // If the user attached a preview-inspector selection, enrich the last user
  // message with the element context (selector, elementor_id, outerHTML,
  // ancestor chain, screenshot) so the AI has enough to target manipulate_element
  // correctly. The DB row stays text-only - the context is an ephemeral prefix
  // that only the model sees, not the user's visible chat bubble.
  if (selection) {
    const ctxParts = [`<${selection.tag || 'element'}>`];
    if (selection.text) {
      ctxParts.push(`"${String(selection.text).substring(0, 120)}"`);
    }
    if (selection.elementorId) ctxParts.push(`elementor_id: ${selection.elementorId}`);
    if (selection.elementorWidget) ctxParts.push(`widget: ${selection.elementorWidget}`);
    if (selection.selector) ctxParts.push(`selector: ${selection.selector}`);

    const header = `[User selected this on-page element via the live preview inspector: ${ctxParts.join(' - ')}]`;
    const ancestorLine = Array.isArray(selection.elementorAncestors) && selection.elementorAncestors.length
      ? `\nElementor ancestor chain (closest first): ${selection.elementorAncestors.map(a => `${a.id}${a.widget ? `(${a.widget})` : a.type ? `(${a.type})` : ''}`).join(' > ')}.`
      : '';
    const actionHint = selection.elementorId
      ? `\nWhen editing / inserting / removing on-page elements on this site, use the manipulate_element tool with locator.kind="widget_id" and locator.value="${selection.elementorId}" so the change lands inside the Elementor tree (raw post_content is never rendered by Elementor). For insertions, set position ("before" for above, "after" for below, "inside_start" / "inside_end" to nest).`
      : '';
    const htmlSnippet = selection.outerHTML
      ? `\nElement HTML (truncated at 2KB):\n\`\`\`html\n${String(selection.outerHTML).length > 2000 ? String(selection.outerHTML).substring(0, 2000) + '\n... [truncated]' : selection.outerHTML}\n\`\`\``
      : '';
    const prefix = `${header}${ancestorLine}${actionHint}${htmlSnippet}\n\n`;

    for (let i = aiMessages.length - 1; i >= 0; i--) {
      if (aiMessages[i].role === 'user') {
        aiMessages[i] = {
          role: 'user',
          content: prefix + aiMessages[i].content,
        };
        break;
      }
    }

    // If a screenshot is attached, upgrade the prefixed message to multimodal
    // so Gemini can see the image alongside the text context.
    if (typeof selection.screenshot === 'string' && selection.screenshot.startsWith('data:')) {
      const match = selection.screenshot.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        const [, mimeType, base64] = match;
        const imageBuffer = Buffer.from(base64, 'base64');
        for (let i = aiMessages.length - 1; i >= 0; i--) {
          if (aiMessages[i].role === 'user') {
            const textContent = aiMessages[i].content;
            aiMessages[i] = {
              role: 'user',
              content: [
                { type: 'text', text: textContent },
                { type: 'image', image: imageBuffer, mimeType },
              ],
            };
            break;
          }
        }
      }
    }
  }

  // Fetch WP site info for context (if WordPress and connected)
  let wpSiteInfo = null;
  if (isWordPress) {
    try {
      const wpApi = await import('@/lib/wp-api-client');
      wpSiteInfo = await wpApi.getSiteInfo(site);
    } catch (e) {
      // Non-fatal - proceed without WP context
    }
  }

  const systemPrompt = buildSystemPrompt(site, wpSiteInfo);

  // Always use Pro model with tools
  const needsTools = !!isWordPress;
  const model = getTextModel();
  const selectedModelName = MODELS.TEXT;

  // Build tools (only for connected WordPress sites)
  const allToolDefs = needsTools ? getChatTools({ isWordPress }) : {};

  // Separate read-only tools from write tools.
  // Write tools are NOT registered as callable tools - the AI accesses them
  // exclusively through propose_action.  This prevents the model from wasting
  // steps trying to call write tools directly (and getting error messages).
  const toolDefs = {};
  const writeToolSchemas = {};
  for (const [name, def] of Object.entries(allToolDefs)) {
    if (toolRequiresApproval(name)) {
      writeToolSchemas[name] = def; // save schema for propose_action reference
    } else {
      toolDefs[name] = def;
    }
  }

  // Build a concise write-tool reference for the propose_action description
  // so the AI knows exactly what args each write tool expects.
  function buildWriteToolReference() {
    const lines = [];
    for (const [name, def] of Object.entries(writeToolSchemas)) {
      const schema = def.inputSchema?.jsonSchema || def.inputSchema;
      const props = schema?.properties || {};
      const propDescs = Object.entries(props).map(([k, v]) => {
        const desc = v.description || '';
        const required = (schema.required || []).includes(k) ? ' (required)' : '';
        if (v.properties) {
          // Nested object - show sub-properties
          const subProps = Object.entries(v.properties).map(([sk, sv]) =>
            `    - ${sk}: ${sv.description || sv.type || ''}`
          ).join('\n');
          return `  - ${k}${required}: ${desc}\n${subProps}`;
        }
        return `  - ${k}${required}: ${desc}`;
      }).join('\n');
      lines.push(`**${name}**: ${def.description?.split('.')[0]}.\n${propDescs}`);
    }
    return lines.join('\n\n');
  }

  // Add the special propose_action tool for write operations
  if (needsTools) {
    const writeRef = buildWriteToolReference();
    toolDefs.propose_action = {
      description: `Propose an action plan that requires user approval before execution. The user will see an action card with approve/reject buttons.

IMPORTANT RULES:
1. Always call this tool when you are ready to make changes - never describe actions as text.
2. When the user confirms (says "yes", "כן", "do it", etc.), call this tool IMMEDIATELY with the full plan.
3. After calling this tool, STOP - do not write any more text. The system handles the rest.

Available write tools you can use inside the actions array:

${writeRef}`,
      inputSchema: jsonSchema({
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Short action title (e.g., "Add H1 heading to homepage")' },
          description: { type: 'string', description: 'Detailed markdown description of what will change and why. Include before/after comparisons where relevant.' },
          actionType: { type: 'string', enum: ['WORDPRESS_UPDATE', 'CODE_SNIPPET', 'PLATFORM_ACTION', 'MULTI_STEP'], description: 'Type of action' },
          actions: {
            type: 'array',
            description: 'Array of individual actions to execute in order. Each action references one of the write tools listed above.',
            items: {
              type: 'object',
              properties: {
                tool: { type: 'string', description: 'The write tool name (e.g., wp_update_post, wp_update_seo, wp_create_redirect)' },
                args: { type: 'object', description: 'Arguments for the tool - must match the tool schema listed above (e.g., for wp_update_post: { postId, postType, data: { add_h1, title, content, ... } })' },
                description: { type: 'string', description: 'Human-readable description of this step' },
              },
              required: ['tool', 'args', 'description'],
            },
          },
        },
        required: ['title', 'description', 'actionType', 'actions'],
      }),
    };
  }

  // Build tool handlers - only read-only tools + propose_action
  const toolHandlers = {};
  const toolContext = { site, siteId: conversation.siteId, accountId: conversation.accountId };

  for (const [toolName] of Object.entries(toolDefs)) {
    if (toolName === 'propose_action') {
      // Special handler: create a ChatAction proposal
      toolHandlers[toolName] = async (args) => {
        try {
          const chatAction = await createActionProposal({
            conversationId,
            siteId: conversation.siteId,
            accountId: conversation.accountId,
            userId: member.userId,
            type: args.actionType,
            plan: { title: args.title, description: args.description },
            actions: args.actions,
          });

          return JSON.stringify({
            actionId: chatAction.id,
            status: 'PENDING_APPROVAL',
            message: 'Action plan created. Waiting for user approval.',
            expiresInSeconds: 300,
          });
        } catch (err) {
          return JSON.stringify({ error: err.message });
        }
      };
    } else {
      // Read-only tool - execute immediately
      toolHandlers[toolName] = async (args) => {
        try {
          console.log(`[Chat Tools] Executing ${toolName} with args:`, JSON.stringify(args));
          const result = await executeReadOnlyTool(toolName, args, toolContext);
          const jsonResult = JSON.stringify(result, null, 2);
          console.log(`[Chat Tools] ${toolName} result length: ${jsonResult.length}, preview:`, jsonResult.substring(0, 300));
          return jsonResult;
        } catch (err) {
          console.error(`[Chat Tools] Tool ${toolName} error:`, err.message);
          return JSON.stringify({ error: err.message });
        }
      };
    }
  }

  // Convert tool defs to the format streamText expects (with execute handlers)
  const tools = {};
  for (const [name, def] of Object.entries(toolDefs)) {
    tools[name] = tool({
      description: def.description,
      inputSchema: def.inputSchema,
      execute: toolHandlers[name],
    });
  }

  const result = streamText({
    model,
    system: systemPrompt,
    messages: aiMessages,
    tools: Object.keys(tools).length > 0 ? tools : undefined,
    stopWhen: [stepCountIs(10), hasToolCall('propose_action')], // Stop after 10 rounds OR when propose_action is called
    maxTokens: 4096,
    temperature: 0.7,
    // Gemini 2.5 Pro thinking: stream the model's reasoning so the UI can show
    // it alongside tool calls. thinkingBudget caps how many reasoning tokens
    // Gemini is allowed to spend per response.
    providerOptions: {
      google: {
        thinkingConfig: {
          includeThoughts: true,
          thinkingBudget: 4096,
        },
      },
    },
    onFinish: async ({ text, usage, steps, toolCalls, toolResults }) => {
      // DEBUG: Log steps and text to diagnose empty messages
      console.log('[Chat Debug] onFinish text:', JSON.stringify(text?.substring(0, 200)));
      console.log('[Chat Debug] steps count:', steps?.length);
      if (steps?.length) {
        steps.forEach((s, i) => {
          console.log(`[Chat Debug] Step ${i}: text=${JSON.stringify(s.text?.substring(0, 200))}, toolCalls=${s.toolCalls?.length || 0}, toolResults=${s.toolResults?.length || 0}`);
        });
      }
      console.log('[Chat Debug] toolCalls:', toolCalls?.length, 'toolResults:', toolResults?.length);

      // Collect text from ALL steps (text on onFinish is only from the last step)
      const fullText = steps?.length
        ? steps.map(s => s.text).filter(Boolean).join('\n')
        : text;
      const rawContent = fullText || text || '';
      const contentToSave = stripToolCallText(rawContent);
      console.log('[Chat Debug] contentToSave length:', contentToSave.length, 'preview:', contentToSave.substring(0, 200));

      // Save AI response to DB
      try {
        if (contentToSave) {
          await prisma.chatMessage.create({
            data: {
              conversationId,
              role: 'ASSISTANT',
              userId: null,
              content: contentToSave,
            },
          });
        }

        // Update conversation timestamp
        await prisma.chatConversation.update({
          where: { id: conversationId },
          data: { updatedAt: new Date() },
        });

        // Track credits
        const inputTokens = usage?.inputTokens || 0;
        const outputTokens = usage?.outputTokens || 0;
        const totalTokens = usage?.totalTokens || 0;

        logAIUsage({
          operation: 'CHAT_MESSAGE',
          inputTokens,
          outputTokens,
          totalTokens,
          model: selectedModelName,
          metadata: { conversationId, route },
        });

        if (member.accountId) {
          trackAIUsage({
            accountId: member.accountId,
            userId: member.userId,
            siteId: conversation.siteId,
            operation: 'CHAT_MESSAGE',
            inputTokens,
            outputTokens,
            totalTokens,
            metadata: { model: selectedModelName, conversationId, route },
          }).catch((err) => console.error('[Chat] trackAIUsage error:', err.message));
        }
      } catch (err) {
        console.error('[Chat] Error saving AI response:', err.message);
      }
    },
  });

  return result.toUIMessageStreamResponse({ sendReasoning: true });
}

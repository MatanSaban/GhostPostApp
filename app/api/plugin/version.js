/**
 * Plugin Version Configuration - SINGLE SOURCE OF TRUTH
 *
 * To release a new plugin version:
 * 1. Update PLUGIN_VERSION below
 * 2. Add changelog entry to PLUGIN_CHANGELOG
 * 3. Run: node scripts/sync-plugin-version.mjs
 *    (this updates the WordPress plugin PHP file to match)
 * 4. Deploy gp-platform and commit the plugin changes
 */

// Current plugin version - increment this when making updates
export const PLUGIN_VERSION = "3.4.1";

// Changelog for the current version
export const PLUGIN_CHANGELOG = `
= 3.4.1 =
* FIX: Fatal "Cannot redeclare GP_API_Handler::create_term()" on activation. The 3.4.0 build added a new term-CRUD method group that shadowed the existing create_term() method used by the older /taxonomies/{taxonomy}/terms route. New term methods are now prefixed with gp_ (gp_list_terms / gp_create_term / gp_update_term / gp_delete_term) so they coexist with the legacy endpoint and sites can upgrade to 3.4.x without white-screening.

= 3.4.0 =
* NEW: Taxonomy management endpoints (GET/POST /terms/{taxonomy}, PUT/DELETE /terms/{taxonomy}/{term_id}). The AI can now create, rename, re-slug, and delete categories, tags, and any custom taxonomy (including WooCommerce product_cat / product_tag) end-to-end.
* NEW: Comment moderation endpoints (GET /comments, PUT /comments/{id}, POST /comments, DELETE /comments/{id}). AI can list pending/spam/approved comments, approve/hold/spam/trash, reply as admin, edit comment bodies, and force-delete.
* NEW: WP options endpoints (GET /options, PUT /options) with a whitelist covering site title, tagline, admin email, timezone, date/time format, permalink structure, homepage config (static page vs posts), posts-per-page, comment defaults, search-engine visibility, registration settings, default role, and image sizes. Permalink-structure changes auto-flush rewrite rules.
* NEW: /self-update endpoint - the AI can trigger the GhostSEO plugin to upgrade itself to the latest published version. Calls wp_update_plugins() to refresh the update transient, then runs Plugin_Upgrader on our own slug. Returns updateNeeded:false when already on latest.
* NEW: /wp-passthrough endpoint - generic REST API escape hatch. The AI can invoke ANY WordPress or third-party-plugin REST route (WooCommerce /wc/v3/*, Yoast /yoast/v1/*, RankMath /rankmath/v1/*, Contact Form 7 /contact-form-7/v1/*, WPForms /wpforms/v1/*, Elementor /elementor/v1/*, etc.) by passing method + path + params. The plugin temporarily authenticates as the first administrator account so capability-gated routes work, then restores the previous user. This is what unlocks full-plugin control for every WP plugin we don't have a dedicated tool for.

= 3.3.0 =
* NEW: Code snippet management endpoint (POST /code-snippets, DELETE /code-snippets/{id}). The plugin auto-dispatches to the Code Snippets plugin if installed, otherwise WPCode, otherwise writes a mu-plugin drop-in file - so the AI can add PHP/JS/CSS custom code on any site with our plugin connected, regardless of which snippet manager (if any) the site runs. Created snippets are tracked in a gp_created_snippets option so rollback/delete routes to the correct backend.
* NEW: Menu management endpoints (POST /menus/{id}/items, PUT /menus/items/{id}, DELETE /menus/items/{id}). AI can now add, rename, reorder, and remove nav menu items end-to-end without the user touching WordPress admin. Backed by wp_update_nav_menu_item and wp_delete_post under the hood.
* IMPROVE: Elementor insert render-verification now additionally checks that the newly-created widget's unique id appears as data-id="XXXXXXX" in the rendered HTML, not just that the inserted text is present somewhere on the page. Eliminates the false-positive where a text match on a pre-existing duplicate element (e.g. another H1) made a no-op save look successful. Mismatch returns applied=false, reason=render_mismatch with the specific widget id, so the platform can auto-rollback or retry with a different locator instead of reporting a phantom success.

= 3.2.3 =
* IMPROVE: Inserted Elementor widgets now visually match the surrounding page. The plugin scans for an existing widget of the same intended type - first the anchor element itself if it matches, then siblings, then ancestors, then a whole-tree fallback - and clones its design tokens (typography, colors, alignment, spacing, text shadow, animation, advanced style/CSS, theme global references) onto the new widget. Identity, content, and link/URL fields are deliberately excluded so the new element gets fresh IDs and the new text/heading_size the caller asked for. Result: an AI-inserted H1 picks up the page's existing heading typography and color instead of landing as a bare default-styled element. Callers can still override the auto-inheritance by passing element.settings explicitly.

= 3.2.2 =
* FIX: Elementor writes via the plugin REST API now actually persist. The previous "save via Elementor's official document API" path silently no-op'd on every signed REST request because Elementor's Document::save() short-circuits when current_user_can('edit_post', \\$id) is false - which it always is for a request authenticated by HMAC site key, not a logged-in WordPress user. The plugin would set saved_via_elementor=true on a NO-OP, skip the raw meta-write fallback, and then return render_mismatch because the page was unchanged. We now always do the raw \\update_post_meta write ourselves and only use the Elementor pipeline to fire the elementor/document/after_save hook so Pro's Theme Builder cache invalidation and CSS regen still run. This was the silent ceiling on every Elementor edit - including the Theme Builder edits 3.2.0 and 3.2.1 were trying to land.

= 3.2.1 =
* FIX: Elementor inserts no longer fail with reason=write_not_persisted right after a successful save. The plugin used to assign new widgets a 36-char UUID and then look the widget back up by that UUID to confirm the write - but Elementor's official document save pipeline normalises every element's ID to its native 7-char hex format, so our UUID never matched on re-read and the platform reported a phantom failure even when the page actually rendered the change. Widget IDs are now generated in Elementor's native format, and the meta verify step is now diagnostic-only (it relocates the inserted widget by its text content to expose the real Elementor-assigned ID). Render verification against the live page URL remains the authoritative gate. This was the residual bug after 3.2.0 fixed the Theme Builder routing.

= 3.2.0 =
* FIX: Elementor Pro Theme Builder pages (Single Page / Loop / Header / Footer / Archive templates) are now fully editable via manipulate_element. Previously, when a page like the home page was rendered by a "Single Page" template from elementor_library - not from the page's own _elementor_data - the plugin would write widget changes into the page's meta where they were never rendered, and the new render-verification would correctly flag render_mismatch even though the DB write succeeded. The plugin now resolves widget IDs across all elementor_library templates, writes the mutation into the template that actually renders the widget, and verifies against the original page URL. Response includes written_to_post_id and rendered_via_template:true so the platform can surface which template was changed.
* NEW: get_element_structure now fetches the post's live permalink, extracts every data-elementor-id attribute, and returns a theme_templates[] array listing every Elementor template that contributes rendered markup to this page (with template_id, template_type, and its own widget structure). The AI can see upfront "this page is assembled from templates 13, 27, 42" and pick widget IDs from the right place, rather than trying blind widget IDs against the page itself.
* IMPROVE: manipulate_element tool description now instructs the AI to surface written_to_post_id / rendered_via_template in its reply so users understand when a change will affect other pages sharing the same template.

= 3.1.9 =
* FIX: Element manipulator no longer returns a false-positive "applied:true" when the database write succeeds but the live page still renders the old content. After every insert/update/delete the plugin now HTTP-fetches the post's permalink (cache-busted) and confirms the expected text actually appears in the rendered HTML (or, for delete, is actually gone). Mismatch returns applied=false, reason=render_mismatch with the public URL and a specific hint, so the AI surfaces a real failure instead of claiming success the user can't see. This was the root cause of the persistent "the bot says it did it but nothing changed" reports.
* FIX: Elementor writes now set the companion metas _elementor_edit_mode=builder, _elementor_template_type (wp-page / wp-post), and _elementor_version on posts that don't already have them. Without _elementor_edit_mode=builder Elementor's the_content filter skips _elementor_data entirely and WordPress serves the stale post_content - so our write landed in the DB but the page never rendered it. This affected every post that was imported from a template or theme demo without ever being opened in the Elementor editor.
* IMPROVE: Elementor writes now go through the official \\Elementor\\Plugin::$instance->documents->get($post_id)->save() pipeline when available, which runs the full on-save flow (CSS regen, rendered-HTML cache bust, version bump, schema migration) exactly like clicking "Update" inside the Elementor editor. Raw update_post_meta remains as the fallback when the document API isn't loaded.
* IMPROVE: Raw-HTML (post_content) path now captures wp_update_post errors explicitly and lifts KSES filters during the write so a role-scoped sanitizer can't silently strip a valid tag the AI inserted. Failed writes return applied=false with the WP error message instead of reporting success.
* IMPROVE: Beaver Builder path now runs the same render-verification step as Elementor and raw HTML, plus per-post cache invalidation after the meta write.

= 3.1.8 =
* NEW: Editor-bridge now gives the preview iframe a devtools-style picker UX while the inspector is active - every click selects the element under the cursor and link navigation is fully blocked (including direct anchor clicks and anchor-wrapped images/headings), so users can safely click links without leaving the page they're trying to edit. With the inspector off the iframe behaves like a normal browser again.
* NEW: Crosshair cursor across the whole preview page (links included) while the inspector is on, via an !important-scoped style rule toggled by the inspector state. Signals "click to select" the same way browser devtools do.
* IMPROVE: Hover outline now paints a very soft purple tint inside the dashed border so the target element reads clearly without competing with the stronger selected-element highlight.

= 3.1.7 =
* FIX: Element manipulator now accepts BOTH request shapes - canonical spec.target.{kind,value,tag,position} and the legacy spec.locator + flat spec.position / spec.mutation that older platform builds emit. Missing position under spec.target is filled from spec.position; spec.mutation is merged into element for updates. This was the root cause of manipulate_element calls 400-ing with "insert requires position…" even when the AI passed the position correctly - the plugin was reading a key the platform never set.
* NEW: Post-write verification - after saving _elementor_data, the plugin now re-reads the meta and confirms the expected widget id is present (insert) or absent (delete). If the expected state is missing the response returns applied=false, reason=write_not_persisted instead of a false-positive success, so the AI can retry or escalate instead of reporting "done" for a change that never landed.
* NEW: inserted_widget_id is returned on every successful insert so the platform can highlight/verify the new widget in the preview iframe.
* IMPROVE: Added clean_post_cache() after _elementor_data writes so the live page reflects the change on the next request without a manual page-cache flush.

= 3.1.6 =
* FIX: Editor-bridge parent-origin detection now reads the signed gp_origin URL param instead of document.referrer - after the first same-origin link click inside the preview iframe, document.referrer points to the previous SITE page (not the platform), which caused postMessage traffic in both directions to be silently dropped. The bridge stopped receiving GP_SET_INSPECTOR_ENABLED and the platform stopped receiving GP_ELEMENT_SELECTED, so the inspector icon and the in-iframe state could drift apart and subsequent link clicks would freeze.
* FIX: Editor-bridge onClick now distinguishes between a direct anchor click (always navigates, even with inspector on) and a non-anchor descendant inside an anchor (selectable when inspector is on, navigates via the ancestor when inspector is off). Restores normal link navigation on pages where headings and images are anchor-wrapped while still letting the platform inspector pick those elements.

= 3.1.5 =
* FIX: Editor-bridge onClick now always lets the active inspector win over link navigation - previously clicking a heading/image that happened to be wrapped in an anchor would navigate instead of selecting, silently breaking element pick for anchor-wrapped content on most modern WP themes
* NEW: GP_LINK_NAVIGATING message - bridge pre-announces same-origin link navigations with the destination path so the platform can update its URL pill and re-activate its inspector icon before the new page finishes loading (keeps bridge and UI state in sync across full-page reloads)

= 3.1.4 =
* NEW: Editor-bridge shows a live "tag.class1.class2" tooltip above the hovered element so the platform chat user can see at a glance what component they're about to inspect (matches devtools-style affordance)
* NEW: Same-origin link clicks inside the preview iframe now navigate properly - bridge preserves the gp_editor / token query params on the destination URL so the plugin keeps accepting the iframe embed instead of rejecting it and surfacing "Could not connect" errors
* NEW: GP_CLEAR_SELECTION message - platform can dismiss the purple selection outline inside the iframe (e.g. when the user removes the selection badge from the chat) without toggling the inspector off entirely

= 3.1.3 =
* NEW: Editor-bridge now reports the Elementor element id (data-id) and an ancestor chain for every hovered/selected element - platform chat uses this to target manipulate_element with locator.kind="widget_id" instead of fuzzy text matching, so "add H1 above this block" lands inside the Elementor tree on the first try instead of falling back to a raw post_content prepend that Elementor never renders

= 3.1.2 =
* FIX: Editor-bridge inspector outline now compensates for the scrollbar-width shift on RTL pages - Chrome/Firefox render position:fixed elements inset by the left-side scrollbar while getBoundingClientRect includes that column, so the purple outline used to sit a few pixels off the target. Bridge now measures the fixed-element origin at draw time and subtracts it, so hover/select lines hug the element exactly in both LTR and RTL

= 3.1.1 =
* FIX: Editor-bridge hover/selection overlays now land on the correct pixels in RTL layouts - switched to direction-agnostic translate3d positioning and forced direction:ltr on the overlay elements so the highlight no longer drifts to the opposite side on Hebrew/Arabic WordPress themes

= 3.1.0 =
* NEW: Generic element manipulator - two new REST endpoints (/elements/manipulate/{id} POST, /elements/structure/{id} GET) let the platform add, update, or remove ANY on-page element across Elementor, Beaver Builder, and raw post_content HTML from a single code path
* NEW: Locator kinds - widget_id, text_match, tag_text, selector, all_of_tag; positions - before, after, inside_start, inside_end, replace
* NEW: Structure summary - compact depth-ordered list of elements (widget id, type, tag, first ~80 chars of text) so the platform AI can pick a locator without pulling raw _elementor_data
* NEW: Rollback snapshots are returned for every successful insert/update/delete so the platform can revert without a second round-trip
* NEW: Diagnostic mode - when a locator doesn't match, the plugin returns a candidate list so the platform's Gemini-backed fallback can disambiguate
* IMPROVE: Element manipulations also clear the Elementor files cache and per-post object cache so the live page reflects the change immediately

= 3.0.6 =
* NEW: Cache flush REST endpoint (/cache/clear) - platform post-action verifier can force a page-level + site-level cache purge before re-fetching the live page, eliminating false "H1 not detected" reports on sites behind WP Rocket, W3TC, LiteSpeed, SG Optimizer, Cloudflare, or Breeze
* NEW: H1 insertion accepts an optional insert_before_text hint - platform passes the anchor text the user pointed at in the live preview, plugin places the new H1 immediately before that widget/module in Elementor or Beaver Builder trees
* IMPROVE: Elementor add_h1 now recursively inserts into the correct nested container/column instead of always prepending at the top level; also clears the Elementor CSS files cache after insert so the change renders without re-saving from the editor
* IMPROVE: Beaver Builder add_h1 now creates a proper heading module and attaches it to the first column/row node

= 3.0.5 =
* FIX: Editor bridge script now activates for both signed (gp_editor=1) and legacy (gp_editor=true) modes - previously the script loaded but silently early-returned when the platform sent signed requests, so GP_BRIDGE_READY never fired and the inspector appeared unavailable even though the plugin was up to date

= 3.0.4 =
* NEW: Editor bridge now captures the clicked element's outerHTML and a JPEG screenshot (via lazy-loaded html2canvas) and forwards them to the platform chat as GP_ELEMENT_SELECTED / GP_ELEMENT_SCREENSHOT, enabling VS Code-style multimodal context for the AI agent
* IMPROVE: outerHTML is capped at 8KB and screenshots are downscaled to 900px max width + JPEG quality 0.82 so the chat payload stays compact
* IMPROVE: Bridge hides its own hover/selection overlays during screenshot capture so they don't leak into the image

= 3.0.3 =
* NEW: Signed editor-token verification - the platform mints a short-lived HMAC-SHA256 token (using the site secret) for the live preview, so the iframe works from any platform origin (dev localhost, staging, production) without a Referer allowlist
* NEW: Scoped CSP frame-ancestors is now derived from the verified token origin instead of the baked platform URL, fixing the case where local dev or alternate domains were blocked with X-Frame-Options
* CHANGE: The legacy gp_editor=true flag still works against the baked platform URL for backwards compatibility

= 3.0.2 =
* NEW: Editor bridge script - enables the platform AI Agent Chat to show a live preview of the site with click-to-select element inspection
* NEW: Scoped iframe embedding - when the platform loads the site with ?gp_editor=true from the configured platform origin, X-Frame-Options is replaced by a CSP frame-ancestors directive locked to the platform origin
* CHANGE: Regular visitors are unaffected - bridge and CSP changes only activate for authenticated platform editor requests

= 3.0.1 =
* NEW: H1 heading management - add or replace H1 in Elementor, Beaver Builder, and raw HTML pages
* NEW: Site info now reports active plugins list, parent theme, Elementor and WooCommerce detection
* FIX: Update response now includes H1 update result for verification

= 3.0.0 =
* NEW: SEO Insights tab - traffic stats, AI traffic chart, top 10 keywords, top 10 pages, AI agent issues
* NEW: Code Snippets tab - manage custom PHP/JS/HTML/CSS snippets with active/inactive toggle, trash, priority, and frontend execution
* NEW: Version section in Settings tab - check for updates from platform, injects into WP update system
* NEW: Update button in header bar when new version is available
* NEW: Full i18n support - all strings translatable via WordPress gettext system
* NEW: Complete Hebrew translation file (languages/he.php)
* REMOVE: Site Key row from Connection tab details table

= 2.9.2 =
* NEW: Theme switcher (dark/light) in Settings tab - applies to admin panel and dashboard widget
* NEW: Language selector in Settings tab (Auto/English/Hebrew) with instant apply
* NEW: Activity tab now records real actions (content create/update/delete, media, SEO, connections)
* NEW: Sidebar submenu items for each plugin tab (Settings, Activity, Redirections, Add-ons)
* NEW: GhostPost text label next to logo in admin topbar
* FIX: Last Ping and Last Connection Check now display real data (fixed option name mismatch)
* FIX: Widget button overflow - text now truncates properly
* CHANGE: Platform URL is now a clickable link in Site Information
* CHANGE: Add-ons tab shows only active integrations
* CHANGE: Plugin colors updated to match GhostPost platform (purple/gradient branding)
* CHANGE: Full permissions always enabled - gp_has_permission() always returns true
* REMOVE: Connection steps row and connect icon from Connection tab
* REMOVE: REST API row from Site Information

= 2.9.1 =
* FIX: Plugin logo on WordPress updates/plugins page is now contained (not stretched)
* CHANGE: GhostSEO logo displayed in admin topbar instead of text
* CHANGE: Connection tab is now the first tab

= 2.9.0 =
* NEW: Redesigned admin UI with tabbed navigation (Connection, Settings, Activity, Redirections, Add-ons)
* NEW: Copy Site Key button on Connection tab
* CHANGE: Redirections merged into main plugin page as a tab
* CHANGE: Add-ons tab shows detected third-party integrations

= 2.8.5 =
* FIX: Faster plugin download - reduced ZIP compression level for quicker generation

= 2.8.4 =
* NEW: H1 update support for Elementor, Beaver Builder, shortcodes, and raw HTML - when platform detects H1 lives in a page builder, the plugin updates it in-place

= 2.8.3 =
* FIX: Plugin logo on WordPress updates/plugins page is now contained (not stretched)

= 2.8.2 =
* FIX: Plural strings (e.g. AI Insights widget text) now translate to Hebrew correctly - added ngettext filter

= 2.8.1 =
* NEW: GhostPost logo now appears on WordPress Updates page and plugin details popup
* FIX: Dashboard widget fully respects theme - dark mode colors postbox background, header, and title
* FIX: Widget border-radius now resolves correctly (was using undefined CSS variable)

= 2.8.0 =
* NEW: Platform pushes widget data automatically when audits complete, AI insights are created, or agent runs finish
* NEW: Sync button on dashboard widget - click to fetch latest data instantly
* NEW: Plugin REST endpoint /widget-data for platform-to-plugin data push

= 2.7.2 =
* FIX: CSS and JS now load correctly on Redirections and Settings pages (hook name mismatch after sidebar rename)
* FIX: Dashboard widget persists in first column + top position even if user rearranges widgets

= 2.7.1 =
* CHANGE: Dashboard widget now appears first (top of dashboard) by default

= 2.7.0 =
* NEW: WordPress Dashboard Widget - shows site health score, pending AI insights, and quick link to GhostPost dashboard
* Zero-latency: widget data piggybacks on existing hourly ping (no extra API calls)

= 2.6.3 =
* CHANGE: Sidebar menu name changed to "GhostPost"

= 2.6.2 =
* FIX: Sidebar icon bypasses WP mask system entirely - uses direct background-image with purple SVG

= 2.6.1 =
* FIX: Sidebar icon forced purple on all WP states (hover, active, current-submenu, opensub)

= 2.6.0 =
* NEW: Site Key and Site ID are blurred by default with eye toggle to reveal

= 2.5.9 =
* FIX: Header title+logo now aligned right in RTL mode
* FIX: Header title always black in both dark and light themes

= 2.5.8 =
* CHANGE: Status hero moved inside Connection card on Settings page
* NEW: Check for Updates button added to Connection section in Settings page

= 2.5.7 =
* FIX: Page header icons now use inline SVG instead of <img> - eliminates all file/browser caching issues
* FIX: Sidebar icon uses data URI + CSS mask coloring - purple on all states

= 2.5.4 =
* FIX: Sidebar icon now uses file URL instead of data URI - WP renders <img> tag preserving purple SVG fill
* FIX: Removed mask-image workarounds, using direct <img> approach

= 2.5.3 =
* FIX: Sidebar icon now stays purple - overrides WP mask-image coloring system via ::after pseudo-element
* FIX: Purple icon SVG asset correctly bundled in plugin ZIP

= 2.5.2 =
* FIX: Ghost icon SVG asset now purple (#9B4DE0) on all plugin pages and sidebar

= 2.5.1 =
* CHANGE: Light theme is now the default (dark theme still available in Settings)
* NEW: Segmented theme picker (dark/light buttons) replaces basic toggle
* NEW: Bold sidebar menu text and improved purple icon rendering
* FIX: Redirections stats now display as horizontal grid (4 cubes in a row)
* FIX: Dark theme - table rows, buttons, and notices now properly themed
* FIX: WordPress native elements (.widefat, .button) properly themed within plugin
* FIX: Added missing Hebrew translations (Appearance, Theme, Connection, etc.)
* FIX: White-on-white text issues resolved with proper CSS variable usage
* FIX: Redirections page uses platform-style header and buttons

= 2.5.0 =
* NEW: Dark theme by default matching the GhostSEO platform design
* NEW: Light theme option with toggle in Settings page
* NEW: Purple color scheme (#9B4DE0/#7B2CBF) consistent with platform branding
* NEW: Purple sidebar icon in WordPress admin menu
* FIX: SVG icons no longer stretch to 100% width
* FIX: Redirections page now uses unified theme system

= 2.4.9 =
* FIX: Scheduling published posts now correctly sets future status on WordPress
* FIX: Added edit_date flag so WordPress recalculates post_date_gmt on date changes
* FIX: ISO 8601 dates sanitized to MySQL DATETIME format for WordPress compatibility
* FIX: Both date and date_gmt sent when scheduling to ensure proper GMT handling

= 2.4.8 =
* NEW: AI image optimization now processes directly on platform (eliminates GhostSEO config dependency)
* NEW: apply-ai-optimization REST endpoint for applying AI-suggested filenames and alt text
* NEW: AI optimization uses background task progress bar (like WebP converter)
* NEW: Load more button in AI optimization modal (50 images per page)
* FIX: "GhostSEO configuration incomplete" error eliminated (no more two-hop architecture)

= 2.4.7 =
* FIX: Stats total now only counts webp + convertible images (excludes svg/ico/bmp) so total = webp + nonWebp

= 2.4.6 =
* FIX: Stats nonWebp count now matches modal (only counts convertible jpeg/png/gif, not svg/bmp/ico)
* FIX: Queue status counts stuck "processing" items as failed (from previous PHP crashes)
* FIX: Platform always refreshes stats after queue processing ends (success or error)

= 2.4.5 =
* FIX: wp_generate_attachment_metadata() now loaded in REST API context (was crashing WebP conversion and image rename)

= 2.4.4 =
* NEW: Platform-driven WebP queue processing (replaces unreliable WP-Cron)
* NEW: process-queue-item REST endpoint for synchronous single-item conversion
* IMPROVE: WebP conversion progress shown in background task notification bar

= 2.4.3 =
* CRITICAL FIX: Featured image fix now works - all changes applied to actual plugin templates (not reference PHP files)
* FIX: Agent sends 'featured_image' field matching plugin template (was sending 'featured_image_id' which template ignored)
* FIX: set_featured_image uses update_post_meta directly instead of set_post_thumbnail (which silently fails)
* FIX: format_post now returns featuredImageId (numeric) for verification
* FIX: Skip wp_update_post when only meta fields are being updated (e.g. featured image only)
* FIX: Media upload detects actual MIME type from file content to prevent metadata generation failures

= 2.4.2 =
* FIX: Featured image now set via direct update_post_meta instead of set_post_thumbnail
* FIX: set_post_thumbnail was calling wp_get_attachment_image() which DELETES the thumbnail when image metadata is incomplete
* FIX: Upload now detects actual MIME type from file content (AI generators may return JPEG with .png filename)
* FIX: MIME mismatch auto-corrects file extension so wp_generate_attachment_metadata succeeds

= 2.4.1 =
* FIX: Featured image now verified after setting - re-reads post thumbnail to confirm it persisted
* FIX: set_post_thumbnail false-negative handled (update_post_meta returns false when value unchanged)
* FIX: Update response now returns actual featured_image_id for client-side verification
* IMPROVE: Attachment existence validated before attempting set_post_thumbnail

= 2.4.0 =
* FIX: Featured image setting no longer silently fails when only featured_image_id is sent
* FIX: set_post_thumbnail errors now return proper error responses instead of false success
* FIX: AI Agent reuses preview image when applying missing featured image fix (no regeneration)

= 2.3.9 =
* FIX: Internal link healing endpoint now included in generated plugin templates

= 2.3.8 =
* NEW: Internal link healing endpoint (search-replace-links) for cannibalization fix flow

= 2.3.7 =
* IMPROVE: Redirects now match with or without trailing slash (e.g. /path and /path/ both redirect)
* IMPROVE: Source URLs are normalized (trailing slash stripped) on save for consistent duplicate detection

= 2.3.6 =
* IMPROVE: Percent-encoded redirect URLs are now auto-decoded to readable Unicode when saved

= 2.3.5 =
* FIX: Plugin no longer shows duplicate update notice after being updated

= 2.3.4 =
* FIX: Plugin templates now use sanitize_redirect_url instead of sanitize_text_field for redirect paths
* FIX: Non-Latin redirect URLs (Hebrew, Arabic) no longer stripped when created via WP admin or API
* FIX: Redirect matching now works for both encoded and decoded URL forms

= 2.3.3 =
* FIX: Redirect URL sanitizer regex causing paths to be emptied (broken delimiter)

= 2.3.2 =
* FIX: Redirect URLs with non-Latin characters (Hebrew, Arabic, etc.) now preserved correctly
* FIX: Percent-encoded paths no longer stripped to dashes when creating/updating redirects

= 2.3.1 =
* FIX: Hit count sync now works correctly (fixed in plugin template that generates deployed code)

= 2.3.0 =
* NEW: Real-time redirect hit count sync from WordPress to platform
* FIX: Hit counts now update in platform dashboard automatically when redirects are triggered in WordPress

= 2.2.0 =
* NEW: Automatic bidirectional redirect sync between WordPress and GhostSEO platform
* NEW: WP admin redirect changes (create/update/delete) auto-push to platform via webhook
* NEW: Platform redirect changes (update/delete) auto-push to WordPress via bulk sync
* NEW: Conflict prevention using origin flags to avoid infinite sync loops
* NEW: /api/public/wp/redirect-updated webhook endpoint for real-time WP→Platform sync

= 2.1.0 =
* NEW: Internationalization (i18n) support with English and Hebrew translations
* NEW: RTL layout support for Hebrew language
* NEW: Settings page with language selector, connection status, and permissions
* NEW: Auto-detect WordPress admin language/direction (Auto/EN/HE)
* NEW: Deactivate third-party redirect plugins directly from the Redirections page
* NEW: Ghost SVG icon for WordPress admin menu
* NEW: Detected redirect plugins section on Dashboard page
* FIX: Redirect status toggle button now shows Active/Inactive text with proper styling
* FIX: Stat cards display in a proper row layout
* FIX: URL inputs now use full width in redirect form
* FIX: Edit redirect now correctly populates form fields
* FIX: Plugin renamed to "GhostSEO Connector" throughout admin UI
* CHANGE: Dashboard page simplified - Connection Status and Permissions moved to Settings
* CHANGE: Admin menu restructured: Dashboard, Redirections, Settings

= 2.0.1 =
* FIX: Plugin templates now correctly include all redirections files in generated ZIPs
* FIX: Top-level WordPress menu with Dashboard and Redirections subpages
* FIX: Admin JS and CSS properly bundled for redirect management UI
* FIX: REST API endpoints for redirect CRUD, bulk-sync, import, and plugin detection

= 2.0.0 =
* NEW: Full redirections management system with CRUD operations
* NEW: Detect popular redirection plugins (Redirection, Yoast Premium, Rank Math, Safe Redirect Manager, Simple 301 Redirects, 301 Redirects)
* NEW: Import redirects from detected third-party plugins into GhostSEO
* NEW: WordPress admin Redirections page with add/edit/delete/toggle functionality
* NEW: Plugin menu moved from Settings submenu to top-level WordPress menu item
* NEW: Redirections child page in WordPress admin with full management UI
* NEW: Frontend redirect execution via template_redirect hook with hit tracking
* NEW: Bulk sync redirects from/to GhostSEO platform
* NEW: REST API endpoints for redirect CRUD, import, bulk-sync, and plugin detection
* NEW: Recommendation banner to import existing redirects and deactivate external plugins

= 1.11.0 =
* NEW: Multi-format image conversion - convert images to WebP or AVIF via /media/convert-image-format endpoint
* NEW: AVIF support using Imagick or GD (PHP 8.1+) with quality control and backup system
* NEW: Per-image format specification for AI-driven conversions (each image can target a different format)
* Renamed "WebP Converter" to "Images Converter" in navigation

= 1.10.0 =
* NEW: Security headers endpoint (/security-headers) - enable/disable individual HTTP security headers via the plugin
* NEW: Automatic send_headers hook - injects enabled security headers (HSTS, X-Frame-Options, X-Content-Type-Options, CSP, Referrer-Policy, Permissions-Policy) on every page load
* Supports enabling all headers at once or individually with safe defaults

= 1.9.0 =
* NEW: Resolve URL to WordPress post ID endpoint (/resolve-url) for per-page SEO fixes
* NEW: Search engine visibility endpoint (/search-engine-visibility) to detect and fix "Discourage search engines" setting
* NEW: Per-page noindex/nofollow fix support via SEO manager integration

= 1.8.9 =
* FIXED: Plugin connection not detected after upload/replace (activation hook not firing)
* Auto-verify connection on admin page load if not yet connected (throttled to 5 min)

= 1.8.8 =
* FIXED: Trashed posts no longer returned by content/CPT API (excludes trash from default post_status)
* Ensures entity sync correctly reflects published vs trashed content

= 1.8.7 =
* FIXED: Cron entity sync producing false-positive updates and unnecessary notifications
* Content manager and CPT manager now return full data (SEO, ACF, taxonomies) when requested
* Fixed field name consistency between API responses and entity sync (camelCase + snake_case)
* Moved resolved SEO data logic to GP_SEO_Manager for shared use across sync paths

= 1.8.6 =
* FIXED: Critical PHP parse error in entity sync class (escaped dollar signs in generated PHP)
* Real-time entity sync - WordPress content changes are pushed instantly to GhostSEO
* Automatic webhook on post create, update, trash, delete, and restore
* Conflict prevention: changes from GhostSEO are not echoed back
* Supports all post types including custom post types
* Non-blocking webhook calls for zero performance impact

= 1.8.4 =
* NEW: Real-time entity sync - WordPress content changes are pushed instantly to GhostSEO
* Automatic webhook on post create, update, trash, delete, and restore
* Conflict prevention: changes from GhostSEO are not echoed back
* Supports all post types including custom post types
* Non-blocking webhook calls for zero performance impact

= 1.8.3 =
* Updated permissions sync - ensures CPT_READ and other permissions are properly configured
* Fixed custom post type access for entity sync

= 1.8.2 =
* FIXED: Critical PHP syntax errors in media manager (variable escaping)
* Fixed all double-escaped variables causing fatal errors
* Plugin now activates without errors

= 1.8.1 =
* FIXED: PHP syntax error in media manager (array callback escaping issue)
* Resolved fatal error on plugin activation/update

= 1.8.0 =
* NEW: AI Image Optimization - Generate SEO-friendly filenames and alt text using AI
* AI-powered filename suggestions based on image content
* AI-generated descriptive alt text for accessibility and SEO
* Automatic 301 redirects when renaming files (htaccess + Redirection plugin support)
* Multi-language support for AI-generated content (EN, HE, ES, FR, DE)
* New API endpoints: /media/ai-optimize, /media/ai-optimize-batch, /media/ai-settings, /media/redirects
* Auto-optimization settings for new uploads

= 1.7.0 =
* Added queue system for batch WebP conversion (prevents server overload)
* Added automatic backup cleanup: Backups older than 30 days are auto-deleted
* Added cache flush after conversion: Supports WP Rocket, W3 Total Cache, LiteSpeed, Cloudflare, and more
* Added URL replacement: Automatically updates image URLs in posts and page builders
* New API endpoints: /media/queue-webp, /media/queue-status, /media/clear-queue
* Added cron jobs for background queue processing and backup cleanup

= 1.6.0 =
* Added image selection modal for batch WebP conversion
* Added backup system: Keep original images before converting
* Added conversion history: Track converted images with backup info
* Added revert functionality: Restore original images from backups
* New API endpoints: /media/non-webp-images, /media/conversion-history, /media/revert-webp

= 1.5.0 =
* Added WebP auto-convert on upload: Automatically converts JPEG/PNG/GIF to WebP when enabled
* New API endpoint: /media/settings (GET/PUT) for managing auto-convert setting
* Setting stored in WordPress for reliable auto-conversion on all uploads

= 1.4.0 =
* Added WebP Conversion Tool: Get media stats, convert images to WebP
* New API endpoints: /media/stats, /media/convert-to-webp
* Batch convert existing images to WebP format

= 1.3.0 =
* Added Media API: Get single media item, update media metadata
* Enhanced wp-api-client with full media management functions
* Upload media from URL, base64, or Buffer
* Delete and update media with alt text, title, caption, description

= 1.2.3 =
* Fixed: Check for Updates now properly refreshes WordPress update transient

= 1.2.1 =
* Added "Check for Updates" button in plugin admin page
* Reduced update check cache to 1 hour for faster update detection

= 1.2.0 =
* Added full data sync support (content, excerpt, ACF, SEO)
* Added 'full' parameter to fetch complete entity data
* Improved sync reliability for all field types

= 1.1.0 =
* Added automatic update system
* Added ACF field metadata support (field types, choices, etc.)
* Added Yoast SEO and RankMath data extraction
* Improved content sync reliability
* Fixed various minor bugs

= 1.0.0 =
* Initial release
* WordPress REST API integration
* Content management endpoints
* Media upload support
* Custom post type support
`.trim();

// Version history for reference
export const VERSION_HISTORY = [
  { version: "1.0.0", date: "2025-01-01", description: "Initial release" },
  {
    version: "1.1.0",
    date: "2026-01-29",
    description: "Added auto-updates, ACF, and SEO support",
  },
  {
    version: "1.2.0",
    date: "2026-01-29",
    description: "Full data sync support",
  },
  {
    version: "1.2.1",
    date: "2026-01-29",
    description: "Added Check for Updates button",
  },
  {
    version: "1.2.3",
    date: "2026-01-30",
    description: "Fixed WordPress update transient refresh",
  },
  {
    version: "1.3.0",
    date: "2026-01-30",
    description: "Added Media API for upload, get, update, delete",
  },
  {
    version: "1.4.0",
    date: "2026-01-30",
    description: "Added WebP conversion tool and batch convert",
  },
  {
    version: "1.5.0",
    date: "2026-01-30",
    description: "Added WebP auto-convert on upload",
  },
  {
    version: "1.6.0",
    date: "2026-01-30",
    description: "Added image selection, backups, history, and revert",
  },
  {
    version: "1.7.0",
    date: "2026-01-30",
    description: "Added queue system, cache flush, URL replacement",
  },
  {
    version: "1.8.0",
    date: "2026-01-30",
    description: "Added AI image optimization with filename and alt text",
  },
  {
    version: "1.8.1",
    date: "2026-01-30",
    description: "Fixed PHP syntax error in media manager",
  },
  {
    version: "1.8.2",
    date: "2026-01-30",
    description: "Fixed all variable escaping issues in media manager",
  },
];

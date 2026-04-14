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
export const PLUGIN_VERSION = "2.7.2";

// Changelog for the current version
export const PLUGIN_CHANGELOG = `
= 2.7.2 =
* FIX: CSS and JS now load correctly on Redirections and Settings pages (hook name mismatch after sidebar rename)
* FIX: Dashboard widget persists in first column + top position even if user rearranges widgets

= 2.7.1 =
* CHANGE: Dashboard widget now appears first (top of dashboard) by default

= 2.7.0 =
* NEW: WordPress Dashboard Widget — shows site health score, pending AI insights, and quick link to GhostPost dashboard
* Zero-latency: widget data piggybacks on existing hourly ping (no extra API calls)

= 2.6.3 =
* CHANGE: Sidebar menu name changed to "GhostPost"

= 2.6.2 =
* FIX: Sidebar icon bypasses WP mask system entirely — uses direct background-image with purple SVG

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
* FIX: Page header icons now use inline SVG instead of <img> — eliminates all file/browser caching issues
* FIX: Sidebar icon uses data URI + CSS mask coloring — purple on all states

= 2.5.4 =
* FIX: Sidebar icon now uses file URL instead of data URI — WP renders <img> tag preserving purple SVG fill
* FIX: Removed mask-image workarounds, using direct <img> approach

= 2.5.3 =
* FIX: Sidebar icon now stays purple — overrides WP mask-image coloring system via ::after pseudo-element
* FIX: Purple icon SVG asset correctly bundled in plugin ZIP

= 2.5.2 =
* FIX: Ghost icon SVG asset now purple (#9B4DE0) on all plugin pages and sidebar

= 2.5.1 =
* CHANGE: Light theme is now the default (dark theme still available in Settings)
* NEW: Segmented theme picker (dark/light buttons) replaces basic toggle
* NEW: Bold sidebar menu text and improved purple icon rendering
* FIX: Redirections stats now display as horizontal grid (4 cubes in a row)
* FIX: Dark theme — table rows, buttons, and notices now properly themed
* FIX: WordPress native elements (.widefat, .button) properly themed within plugin
* FIX: Added missing Hebrew translations (Appearance, Theme, Connection, etc.)
* FIX: White-on-white text issues resolved with proper CSS variable usage
* FIX: Redirections page uses platform-style header and buttons

= 2.5.0 =
* NEW: Dark theme by default matching the Ghost Post platform design
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
* NEW: AI image optimization now processes directly on platform (eliminates Ghost Post config dependency)
* NEW: apply-ai-optimization REST endpoint for applying AI-suggested filenames and alt text
* NEW: AI optimization uses background task progress bar (like WebP converter)
* NEW: Load more button in AI optimization modal (50 images per page)
* FIX: "Ghost Post configuration incomplete" error eliminated (no more two-hop architecture)

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
* CRITICAL FIX: Featured image fix now works — all changes applied to actual plugin templates (not reference PHP files)
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
* FIX: Featured image now verified after setting — re-reads post thumbnail to confirm it persisted
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
* NEW: Automatic bidirectional redirect sync between WordPress and Ghost Post platform
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
* FIX: Plugin renamed to "Ghost Post Connector" throughout admin UI
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
* NEW: Import redirects from detected third-party plugins into Ghost Post
* NEW: WordPress admin Redirections page with add/edit/delete/toggle functionality
* NEW: Plugin menu moved from Settings submenu to top-level WordPress menu item
* NEW: Redirections child page in WordPress admin with full management UI
* NEW: Frontend redirect execution via template_redirect hook with hit tracking
* NEW: Bulk sync redirects from/to Ghost Post platform
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
* Real-time entity sync - WordPress content changes are pushed instantly to Ghost Post
* Automatic webhook on post create, update, trash, delete, and restore
* Conflict prevention: changes from Ghost Post are not echoed back
* Supports all post types including custom post types
* Non-blocking webhook calls for zero performance impact

= 1.8.4 =
* NEW: Real-time entity sync - WordPress content changes are pushed instantly to Ghost Post
* Automatic webhook on post create, update, trash, delete, and restore
* Conflict prevention: changes from Ghost Post are not echoed back
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

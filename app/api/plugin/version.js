/**
 * Plugin Version Configuration — SINGLE SOURCE OF TRUTH
 *
 * To release a new plugin version:
 * 1. Update PLUGIN_VERSION below
 * 2. Add changelog entry to PLUGIN_CHANGELOG
 * 3. Run: node scripts/sync-plugin-version.mjs
 *    (this updates the WordPress plugin PHP file to match)
 * 4. Deploy gp-platform and commit the plugin changes
 */

// Current plugin version - increment this when making updates
export const PLUGIN_VERSION = "1.9.0";

// Changelog for the current version
export const PLUGIN_CHANGELOG = `
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

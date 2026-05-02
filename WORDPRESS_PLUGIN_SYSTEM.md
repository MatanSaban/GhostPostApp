# GhostSEO - WordPress Plugin System

The GhostSEO platform integrates with WordPress via a **custom plugin that is dynamically generated per-site**. Each downloaded plugin ZIP is unique - it contains site-specific credentials (Site ID, Site Key, Site Secret) baked directly into the code. The plugin enables bidirectional communication: the platform pushes content to WordPress, and WordPress pushes real-time entity/redirect changes back to the platform.

**Current Plugin Version:** `3.0.1`

---

## 1. Plugin Architecture Overview

**12 PHP classes** working together via WordPress hooks and a REST API namespace (`ghostseo/v1`):

| Class | File | Purpose |
|-------|------|---------|
| `GhostSEO_Plugin` | `class-ghostseo-plugin.php` | Main orchestrator - initializes all managers, registers REST routes, admin menu, dashboard widget, cron jobs |
| `GP_API_Handler` | `class-gp-api-handler.php` | Registers 50+ REST API endpoints, routes requests to appropriate managers |
| `GP_Request_Validator` | `class-gp-request-validator.php` | HMAC-SHA256 signature validation with timestamp replay protection |
| `GP_Content_Manager` | `class-gp-content-manager.php` | Posts/Pages CRUD - get_items, get_item, create, update, delete + H1 management in page builders |
| `GP_Media_Manager` | `class-gp-media-manager.php` | Image upload, WebP/AVIF auto-conversion, AI image optimization, queue processing |
| `GP_SEO_Manager` | `class-gp-seo-manager.php` | Yoast + RankMath meta extraction and updates (title, description, OG, Twitter, keywords) |
| `GP_CPT_Manager` | `class-gp-cpt-manager.php` | Custom Post Types CRUD - get_post_types, create/read/update/delete |
| `GP_ACF_Manager` | `class-gp-acf-manager.php` | Advanced Custom Fields read/write - detects ACF, reads field groups and values |
| `GP_Entity_Sync` | `class-gp-entity-sync.php` | Real-time webhook push on post create/update/trash/delete to platform |
| `GP_Redirections_Manager` | `class-gp-redirections-manager.php` | Native redirect management + 3rd-party plugin detection and import |
| `GP_Updater` | `class-gp-updater.php` | WordPress-native auto-update checking against the GhostSEO platform |
| `GP_I18n` | `class-gp-i18n.php` | Internationalization - English + Hebrew (RTL) without .po/.mo files, ~200+ strings |

---

## 2. Dynamic Plugin Generation (Per-Site)

The plugin is **not a static download** - it is **generated dynamically** from JavaScript template files for each site. The source PHP files under `gp-wordpress-plugin/` are **reference/development files only** and are NOT deployed to WordPress sites.

> **CRITICAL:** When modifying plugin behavior, ALWAYS edit the template JS file in `plugin-templates/`. The source PHP files do NOT get deployed.

**Template Location:** `app/api/sites/[id]/download-plugin/plugin-templates/`

Each template is a JavaScript function that returns PHP source code as a template literal, with site-specific values injected at generation time.

### 21 Template Files → Generated Files Mapping

| Template (JS) | Export Function | Generated File (PHP/Other) |
|----------------|----------------|---------------------------|
| `main.js` | `getPluginMainFile(version)` | `ghostseo-connector.php` |
| `config.js` | `getPluginConfigFile({...})` | `includes/config.php` |
| `class-ghostseo-plugin.js` | `getClassGhostSEO()` | `includes/class-ghostseo-plugin.php` |
| `class-api-handler.js` | `getClassApiHandler()` | `includes/class-gp-api-handler.php` |
| `class-request-validator.js` | `getClassRequestValidator()` | `includes/class-gp-request-validator.php` |
| `class-content-manager.js` | `getClassContentManager()` | `includes/class-gp-content-manager.php` |
| `class-media-manager.js` | `getClassMediaManager()` | `includes/class-gp-media-manager.php` |
| `class-seo-manager.js` | `getClassSeoManager()` | `includes/class-gp-seo-manager.php` |
| `class-cpt-manager.js` | `getClassCptManager()` | `includes/class-gp-cpt-manager.php` |
| `class-acf-manager.js` | `getClassAcfManager()` | `includes/class-gp-acf-manager.php` |
| `class-updater.js` | `getClassUpdater()` | `includes/class-gp-updater.php` |
| `class-entity-sync.js` | `getClassEntitySync()` | `includes/class-gp-entity-sync.php` |
| `class-redirections-manager.js` | `getClassRedirectionsManager()` | `includes/class-gp-redirections-manager.php` |
| `class-gp-i18n.js` | `getClassI18n()` | `includes/class-gp-i18n.php` |
| `admin-page.js` | `getAdminPage()` | `admin/views/dashboard-page.php` |
| `settings-page.js` | `getSettingsPage()` | `admin/views/settings-page.php` |
| `redirections-page.js` | `getRedirectionsPage()` | `admin/views/redirections-page.php` |
| `admin-css.js` | `getAdminCss()` | `admin/css/admin.css` |
| `admin-js.js` | `getAdminJs()` | `admin/js/admin.js` |
| `readme.js` | `getPluginReadme()` | `readme.txt` |
| `uninstall.js` | `getPluginUninstall()` | `uninstall.php` |

### Site-Specific Injections (in `config.php`)

```php
define('GP_SITE_ID', '{mongodb_site_id}');
define('GP_SITE_KEY', 'gp_site_{32_hex_chars}');
define('GP_SITE_SECRET', '{64_char_hex_secret}');
define('GP_API_URL', 'https://app.ghostseo.ai');
define('GP_PERMISSIONS', serialize(array(
  'CONTENT_READ', 'CONTENT_CREATE', 'CONTENT_UPDATE', 'CONTENT_DELETE', 'CONTENT_PUBLISH',
  'MEDIA_UPLOAD', 'MEDIA_DELETE',
  'SEO_UPDATE', 'REDIRECTS_MANAGE', 'SITE_INFO_READ',
  'CPT_READ', 'CPT_CREATE', 'CPT_UPDATE', 'CPT_DELETE',
  'ACF_READ', 'ACF_UPDATE',
  'TAXONOMY_READ', 'TAXONOMY_MANAGE'
)));

function gp_has_permission($permission) {
  $permissions = unserialize(GP_PERMISSIONS);
  return in_array($permission, $permissions, true);
}
```

---

## 3. Download Plugin API Routes

### `GET /api/sites/[id]/download-plugin` - Authenticated Dashboard Download

**Authentication:** User session cookie + account membership verification

**Process:**
1. Verify user has access to the site via `getCurrentAccountMember()`
2. Generate `siteKey` + `siteSecret` if not already set (for pre-v2.4 sites)
3. Update site record with new keys and default permissions if needed
4. Call each of the 21 template functions to generate PHP source code
5. Inject site-specific values into `config.php` (Site ID, Site Key, Site Secret, API URL, permissions)
6. Build ZIP using JSZip with DEFLATE compression (level 6)
7. Add `assets/icon.svg` (ghost icon)
8. Return ZIP with filename: `GhostSEO-Connector-{siteName}_{version}.zip`

**API URL Resolution:** `GP_PLUGIN_API_URL` env → `NEXT_PUBLIC_BASE_URL` env → default `https://app.ghostseo.ai`

### `GET /api/plugin/download?site_key=xxx` - Unauthenticated Plugin Auto-Update Download

**Authentication:** Site key lookup (no user session required)

**Process:**
1. Look up site by `siteKey` query parameter
2. Generate the same plugin ZIP structure using templates
3. Return ZIP with filename: `ghostseo-connector-{version}.zip`

**Purpose:** Allows the WordPress auto-update mechanism (`GP_Updater`) to download new versions without a user session.

---

## 4. Generated ZIP Structure

```
ghostseo-connector/
├── ghostseo-connector.php              // Main plugin entry point (WordPress header, hooks, init)
├── readme.txt                            // WordPress plugin readme with changelog
├── uninstall.php                         // Cleanup on uninstall (deletes options/transients)
├── includes/
│   ├── config.php                        // Site-specific: GP_SITE_ID, GP_SITE_KEY, GP_SITE_SECRET, GP_API_URL, GP_PERMISSIONS
│   ├── class-ghostseo-plugin.php              // Main orchestrator class
│   ├── class-gp-api-handler.php          // REST API routing (50+ endpoints)
│   ├── class-gp-request-validator.php    // HMAC-SHA256 validation
│   ├── class-gp-content-manager.php      // Post/page CRUD + H1 management
│   ├── class-gp-media-manager.php        // Media upload + WebP conversion
│   ├── class-gp-seo-manager.php          // Yoast + Rank Math meta
│   ├── class-gp-cpt-manager.php          // Custom Post Types
│   ├── class-gp-acf-manager.php          // Advanced Custom Fields
│   ├── class-gp-updater.php              // Auto-update from platform
│   ├── class-gp-entity-sync.php          // Real-time webhook push
│   ├── class-gp-redirections-manager.php // Redirect management + import
│   └── class-gp-i18n.php                // English + Hebrew translations
├── admin/
│   ├── views/
│   │   ├── dashboard-page.php            // Connection status, site info, permissions
│   │   ├── settings-page.php             // Tabbed: Connection, Settings, Activity, Redirections, SEO Insights, Code Snippets, Add-ons
│   │   └── redirections-page.php         // Redirect plugin detection, import, CRUD
│   ├── css/
│   │   └── admin.css                     // Cards, status indicators, forms, tables, dark/light themes
│   └── js/
│       └── admin.js                      // Redirect CRUD, snippet management, AJAX handlers
└── assets/
    └── icon.svg                          // Ghost icon (purple #9B4DE0)
```

---

## 5. Plugin Initialization

### Main Entry Point (`ghostseo-connector.php`)

```php
// Plugin Header
Plugin Name: GhostSEO Connector
Plugin URI: https://ghostseo.ai
Version: 3.0.1
Requires at least: 5.6
Requires PHP: 7.4
Text Domain: ghostseo-connector

// Constants
define('GP_CONNECTOR_VERSION', '3.0.1');
define('GP_CONNECTOR_PLUGIN_DIR', plugin_dir_path(__FILE__));
define('GP_CONNECTOR_PLUGIN_URL', plugin_dir_url(__FILE__));
define('GP_CONNECTOR_PLUGIN_BASENAME', plugin_basename(__FILE__));

// Load config.php → site credentials
require_once GP_CONNECTOR_PLUGIN_DIR . 'includes/config.php';

// Load all class files
require_once GP_CONNECTOR_PLUGIN_DIR . 'includes/class-ghostseo-plugin.php';
// ... (all other class files)

// Initialize on plugins_loaded
add_action('plugins_loaded', 'gp_connector_init');
function gp_connector_init() {
    $ghostseo = new GhostSEO_Plugin();
    $ghostseo->init();
}

// Security headers
add_action('send_headers', 'gp_send_security_headers');

// Activation → verify connection with platform
register_activation_hook(__FILE__, 'gp_connector_activate');

// Deactivation → notify platform of disconnection
register_deactivation_hook(__FILE__, 'gp_connector_deactivate');
```

### GhostSEO_Plugin::init() - Initialization Sequence

1. Initialize i18n: `GP_I18n::init()`
2. Initialize validators and managers (`GP_Request_Validator`, `GP_API_Handler`, `GP_Redirections_Manager`, `GP_Entity_Sync`)
3. Register REST API: `add_action('rest_api_init', [$this, 'register_rest_routes'])`
4. Add admin menu with 7 submenu items: Dashboard, Settings, Activity, Redirections, SEO Insights, Code Snippets, Add-ons
5. Enqueue admin styles and scripts
6. Register dashboard widget
7. Frontend redirect execution
8. Register 28 AJAX actions (connection test, ping, redirect CRUD, language/theme save, snippet management, etc.)
9. Frontend snippet execution hooks (for active code snippets)
10. Schedule hourly ping cron: `wp_schedule_event(time(), 'hourly', 'gp_connector_ping')`
11. Auto-verify connection if not yet connected (on `admin_init`)

---

## 6. HMAC-SHA256 Authentication

Every request between the platform and WordPress plugin is cryptographically signed.

### Request Headers

```
X-GP-Site-Key:   gp_site_abc123def456...     (public identifier)
X-GP-Timestamp:  1706450000                   (unix epoch seconds)
X-GP-Signature:  {HMAC-SHA256 hex digest}     (signature of timestamp.body)
Content-Type:    application/json
```

### Validation Process (both sides)

1. Extract `siteKey` → look up `siteSecret` from config (plugin) or database (platform)
2. Verify timestamp within ±5 minutes (replay protection) with ±60 seconds clock skew tolerance
3. Recalculate signature: `HMAC-SHA256(timestamp + '.' + requestBody, siteSecret)`
4. Compare using **timing-safe comparison** (`hash_equals` in PHP, `crypto.timingSafeEqual` in Node.js)
5. Reject if any check fails (401 Unauthorized)

### Platform-Side Key Functions (`lib/site-keys.js`)

| Function | Purpose |
|----------|---------|
| `generateSiteKey()` | Creates `gp_site_{32-hex-chars}` via `crypto.randomBytes(16)` |
| `generateSiteSecret()` | Creates 64-char hex via `crypto.randomBytes(32)` |
| `createSignature(payload, timestamp, secret)` | HMAC-SHA256 of `{timestamp}.{payload}` |
| `verifySignature(payload, timestamp, signature, secret, maxAge=300)` | Validates timestamp + verifies signature |
| `encryptCredential(text, key)` | AES-256-GCM encryption (used for the Shopify access token) |
| `decryptCredential(encryptedBase64, key)` | Decrypts AES-256-GCM |
| `generateConnectionToken(siteId, siteKey)` | Base64url JWT with 30-min expiration |
| `validateConnectionToken(token)` | Decodes and validates expiration |

---

## 7. Plugin REST Endpoints (WordPress Side - `ghostseo/v1` namespace)

50+ REST API endpoints registered via `register_rest_route()`. All requests validated via `GP_Request_Validator`.

### Content (Posts/Pages)

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| GET | `/posts` | CONTENT_READ | List posts (paginated, filterable) |
| POST | `/posts` | CONTENT_CREATE | Create post |
| GET | `/posts/{id}` | CONTENT_READ | Get post with full data |
| PUT | `/posts/{id}` | CONTENT_UPDATE | Update post (supports `add_h1`, `old_h1`/`new_h1` for H1 management) |
| DELETE | `/posts/{id}` | CONTENT_DELETE | Delete post |
| GET | `/pages` | CONTENT_READ | List pages |
| POST | `/pages` | CONTENT_CREATE | Create page |
| GET | `/pages/{id}` | CONTENT_READ | Get page with full data |
| PUT | `/pages/{id}` | CONTENT_UPDATE | Update page (supports `add_h1`, `old_h1`/`new_h1`) |
| DELETE | `/pages/{id}` | CONTENT_DELETE | Delete page |

### Custom Post Types

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| GET | `/cpt/{post_type}` | CPT_READ | List CPT items |
| POST | `/cpt/{post_type}` | CPT_CREATE | Create CPT item |
| GET | `/cpt/{post_type}/{id}` | CPT_READ | Get CPT item |
| PUT | `/cpt/{post_type}/{id}` | CPT_UPDATE | Update CPT item |
| DELETE | `/cpt/{post_type}/{id}` | CPT_DELETE | Delete CPT item |

### Media

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| GET | `/media` | MEDIA_UPLOAD | List media items |
| POST | `/media` | MEDIA_UPLOAD | Upload media |
| GET | `/media/{id}` | MEDIA_UPLOAD | Get media item details |
| PUT | `/media/{id}` | MEDIA_UPLOAD | Update media metadata (alt text, title) |
| DELETE | `/media/{id}` | MEDIA_DELETE | Delete media |
| GET | `/media/stats` | MEDIA_UPLOAD | WebP conversion statistics |
| POST | `/media/convert-to-webp` | MEDIA_UPLOAD | Batch WebP conversion |
| GET | `/media/settings` | MEDIA_UPLOAD | Get media conversion settings |
| PUT | `/media/settings` | MEDIA_UPLOAD | Update media conversion settings |
| GET | `/media/non-webp-images` | MEDIA_UPLOAD | List images not yet converted to WebP |
| GET | `/media/conversion-history` | MEDIA_UPLOAD | Get conversion history log |
| POST | `/media/revert-webp` | MEDIA_UPLOAD | Revert WebP conversion (restore original) |
| POST | `/media/queue-webp` | MEDIA_UPLOAD | Queue images for WebP conversion |
| GET | `/media/queue-status` | MEDIA_UPLOAD | Get conversion queue progress |
| POST | `/media/clear-queue` | MEDIA_UPLOAD | Clear conversion queue |
| POST | `/media/process-queue-item` | MEDIA_UPLOAD | Process single queue item (platform-driven) |
| POST | `/media/ai-optimize` | MEDIA_UPLOAD | AI image enhancement (single) |
| POST | `/media/apply-ai-optimization` | MEDIA_UPLOAD | Apply platform AI suggestions (filename, alt text) |
| POST | `/media/ai-optimize-batch` | MEDIA_UPLOAD | AI batch optimization |
| GET | `/media/ai-settings` | MEDIA_UPLOAD | Get AI optimization settings |
| PUT | `/media/ai-settings` | MEDIA_UPLOAD | Update AI optimization settings |
| GET | `/media/redirects` | MEDIA_UPLOAD | Image URL redirect tracking (old→new) |
| DELETE | `/media/redirects` | MEDIA_UPLOAD | Clear image URL redirects |

### SEO & ACF

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| GET | `/seo/{id}` | SEO_UPDATE | Get SEO meta (resolves Yoast/RankMath variable templates) |
| PUT | `/seo/{id}` | SEO_UPDATE | Update SEO meta (title, desc, OG, Twitter, schema) |
| GET | `/acf/{id}` | ACF_READ | Get ACF field groups and values |
| PUT | `/acf/{id}` | ACF_UPDATE | Update ACF field values |

### Taxonomies & Menus

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| GET | `/taxonomies` | TAXONOMY_READ | List registered taxonomies |
| GET | `/taxonomies/{taxonomy}/terms` | TAXONOMY_READ | List terms for a taxonomy |
| POST | `/taxonomies/{taxonomy}/terms` | TAXONOMY_MANAGE | Create taxonomy term |
| GET | `/menus` | SITE_INFO_READ | List WordPress navigation menus |

### Redirects

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| GET | `/redirects` | REDIRECTS_MANAGE | List all redirects |
| POST | `/redirects` | REDIRECTS_MANAGE | Create redirect |
| PUT | `/redirects/{id}` | REDIRECTS_MANAGE | Update redirect |
| DELETE | `/redirects/{id}` | REDIRECTS_MANAGE | Delete redirect |
| POST | `/redirects/bulk-sync` | REDIRECTS_MANAGE | Bulk sync redirects from platform |
| POST | `/redirects/import` | REDIRECTS_MANAGE | Import from detected 3rd-party plugins |
| GET | `/redirects/detected-plugins` | REDIRECTS_MANAGE | List detected redirect plugins |

### System & Utility

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| POST | `/verify` | (signature only) | Connection verification on activation |
| GET | `/site-info` | SITE_INFO_READ | Full site info (see Section 8) |
| POST | `/resolve-url` | SITE_INFO_READ | Resolve URL to WordPress post (ID, type, slug) |
| POST | `/resolve-media-urls` | MEDIA_UPLOAD | Resolve multiple URLs to attachment IDs |
| POST | `/set-favicon` | CONTENT_UPDATE | Set site favicon from attachment ID |
| GET | `/security-headers` | SITE_INFO_READ | Get current security headers |
| PUT | `/security-headers` | CONTENT_UPDATE | Enable/update security headers |
| GET | `/search-engine-visibility` | SITE_INFO_READ | Get search engine visibility setting |
| PUT | `/search-engine-visibility` | CONTENT_UPDATE | Set search engine visibility |
| POST | `/search-replace-links` | CONTENT_UPDATE | Search & replace URLs across all content |

---

## 8. Site Info Endpoint (`GET /site-info`)

Returns comprehensive WordPress environment data used by the platform chat bot and dashboard:

```json
{
  "siteUrl": "https://example.com",
  "homeUrl": "https://example.com",
  "siteName": "My Site",
  "siteDescription": "Just another WordPress site",
  "wpVersion": "6.7",
  "phpVersion": "8.2",
  "timezone": "Asia/Jerusalem",
  "locale": "he_IL",
  "theme": {
    "name": "Hello Elementor",
    "version": "3.1.1",
    "parent": null
  },
  "activePlugins": [
    { "name": "Elementor", "version": "3.25.0" },
    { "name": "Yoast SEO", "version": "27.4" },
    { "name": "GhostSEO Connector", "version": "3.0.1" }
  ],
  "postTypes": [
    {
      "slug": "post",
      "name": "Posts",
      "singularName": "Post",
      "restBase": "posts",
      "hasArchive": false,
      "hierarchical": false,
      "supports": { "title": true, "editor": true, "thumbnail": true },
      "isBuiltin": true
    }
  ],
  "taxonomies": [
    {
      "slug": "category",
      "name": "Categories",
      "hierarchical": true,
      "objectType": ["post"],
      "restBase": "categories"
    }
  ],
  "hasYoast": true,
  "yoastVersion": "27.4",
  "hasRankMath": false,
  "rankMathVersion": null,
  "hasACF": true,
  "acfVersion": "6.3.0",
  "hasElementor": true,
  "hasWooCommerce": false
}
```

The chat bot system prompt uses this data to build dynamic context (active plugins, detected capabilities, page builder awareness).

---

## 9. Content Manager - H1 Heading Management (v3.0.1)

The content manager handles H1 headings across page builders and raw HTML. This is critical because many WordPress sites use Elementor or other page builders where H1 lives in builder JSON, not in `post_content`.

### H1 Operations in `update_item()`

The `PUT /pages/{id}` and `PUT /posts/{id}` endpoints accept these special H1 fields in the `data` body:

| Field | Type | Purpose |
|-------|------|---------|
| `add_h1` | string | Add a new H1 heading to a page that has none |
| `old_h1` | string | The current H1 text to find (used with `new_h1`) |
| `new_h1` | string | The replacement H1 text (used with `old_h1`) |

### `add_h1_to_builders($post_id, $h1_text)` - Add New H1

Used when a page has no H1 heading at all. Handles:

1. **Elementor**: Creates a heading widget (`widgetType: 'heading'`, `header_size: 'h1'`) and inserts it at the top of the first section/container. Handles both classic sections (section→column→widget) and modern containers (Elementor 3.6+ flexbox containers).
2. **HTML Fallback**: If no Elementor data exists, prepends `<h1>text</h1>` to `post_content`.

Returns: `{ added: ['elementor'] | ['html_prepend'], h1_text: '...' }`

### `update_h1_in_builders($post_id, $old_h1, $new_h1)` - Replace Existing H1

Used when a page has an H1 that needs changing. Handles:

1. **Elementor**: Recursively traverses `_elementor_data` JSON to find heading widgets with `header_size === 'h1'` and `theme-post-title` widgets. Replaces matching text.
2. **Raw HTML**: Regex matches `<h1...>old_text</h1>` in `post_content` and replaces.
3. **Beaver Builder**: Deserializes `_fl_builder_data`, does string replacement on serialized data, re-serializes.

Returns: `{ updated: ['elementor', 'html_h1', 'beaver_builder'], old_h1: '...', new_h1: '...' }`

### Update Response

When H1 operations are performed, the update response includes:
```json
{
  "id": 36,
  "message": "Post updated successfully",
  "post": { "...full post data..." },
  "h1_update": {
    "added": ["elementor"],
    "h1_text": "Welcome to My Site"
  }
}
```

### Elementor Cache Handling

After modifying `_elementor_data`, the plugin:
- Writes new JSON with `wp_json_encode(... JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)`
- Uses `wp_slash()` for proper escaping in `update_post_meta`
- Deletes `_elementor_css` to clear Elementor's CSS cache
- Elementor regenerates CSS on next page load

---

## 10. Content Manager - `format_post()` Response Shape

```json
{
  "id": 123,
  "title": "Page Title",
  "slug": "page-title",
  "status": "publish",
  "type": "page",
  "date": "2026-01-15 10:30:00",
  "modified": "2026-01-15 11:00:00",
  "author": 1,
  "featured_image": "https://example.com/image.jpg",
  "featuredImageId": 456,
  "permalink": "https://example.com/page-title/",

  "content": "Full HTML content (when ?full=true or internal)",
  "excerpt": "Short excerpt",
  "parent": 0,
  "menu_order": 0,
  "categories": [1, 5],
  "tags": [10, 15],
  "taxonomies": {
    "category": [1, 5],
    "post_tag": [10, 15],
    "custom_taxonomy": [20]
  },
  "meta": {
    "_elementor_edit_mode": ["builder"],
    "_elementor_data": ["[{...JSON...}]"],
    "_yoast_wpseo_title": ["SEO Title"]
  },
  "acf": {
    "fields": {
      "field_name": {
        "key": "field_abc123",
        "name": "field_name",
        "label": "Field Label",
        "type": "text",
        "value": "Current value"
      }
    },
    "groups": {
      "group_abc": { "key": "group_abc", "title": "Group Title" }
    }
  },
  "seo": {
    "plugin": "yoast",
    "version": "27.4",
    "title": "SEO Title",
    "description": "Meta description",
    "focusKeyword": "keyword",
    "canonical": "",
    "robots": { "index": true, "follow": true },
    "og": { "title": "", "description": "", "image": "" },
    "twitter": { "title": "", "description": "", "image": "" },
    "schema": null
  }
}
```

---

## 11. Connection Protocol & Lifecycle

```
1. CREATE SITE
   User creates site → POST /api/sites
   Platform generates unique siteKey (gp_site_{32-hex}) + siteSecret (64-hex)
   Site record created with connectionStatus: PENDING

2. DOWNLOAD PLUGIN
   User downloads plugin → GET /api/sites/[id]/download-plugin
   Platform generates ZIP with site-specific config.php (credentials baked in)
   User installs ZIP in WordPress (wp-admin → Plugins → Upload)

3. ACTIVATE PLUGIN
   WordPress activation hook fires → gp_connector_activate()
   Plugin sends: POST /api/public/wp/verify
     Headers: X-GP-Site-Key, X-GP-Timestamp, X-GP-Signature
     Body: { wpVersion, phpVersion, pluginVersion, wpTimezone, wpLocale, siteUrl, adminEmail }
   Platform validates signature → sets connectionStatus: CONNECTED
   Returns: { success, site: { name, permissions }, shouldSync }
   If shouldSync=true → triggers full entity sync

4. RUNTIME (Ongoing)
   a. Heartbeat: WordPress cron fires hourly
      → POST /api/public/wp/ping { pluginVersion, wpVersion, wpLocale }
      → Platform updates lastPingAt, returns widgetData (audit score, pending insights)
   
   b. Entity Sync: WordPress post create/update/trash/delete triggers webhook
      → POST /api/public/wp/entity-updated { action, post_type, post: {...full data...} }
      → Platform syncs entity via syncSingleEntity()
   
   c. Redirect Sync: WordPress redirect changes trigger webhook
      → POST /api/public/wp/redirect-updated { action, redirect: {...}, source }
      → Platform upserts/deletes in Redirection model
   
   d. Platform → WordPress: Content publishing, media upload, SEO updates
      → Platform calls /wp-json/ghostseo/v1/{endpoint} with HMAC signature
      → Plugin sets is_gp_api_request flag to prevent webhook echo-back
   
   e. Auto-Update: Plugin checks for updates
      → GET /api/plugin/update-check?site_key=xxx&current_version=3.0.0
      → If newer version → WordPress-native update notice + download

5. DEACTIVATE PLUGIN
   WordPress deactivation hook fires → gp_connector_deactivate()
   Plugin sends: POST /api/public/wp/disconnect
   Platform sets connectionStatus: DISCONNECTED
```

---

## 12. Real-Time Entity Sync (Bidirectional)

### WordPress → Platform (Webhooks via `GP_Entity_Sync`)

**Hooks Registered:**
```php
add_action('save_post', [$this, 'on_post_saved'], 20, 3);
add_action('wp_trash_post', [$this, 'on_post_trashed'], 10, 1);
add_action('before_delete_post', [$this, 'on_post_deleted'], 10, 2);
add_action('untrashed_post', [$this, 'on_post_untrashed'], 10, 1);
```

**Excluded Post Types** (won't sync):
```
revision, nav_menu_item, custom_css, customize_changeset, oembed_cache,
user_request, wp_block, wp_template, wp_template_part, wp_global_styles,
wp_navigation, wp_font_family, wp_font_face, acf-field-group, acf-field,
acf-post-type, acf-taxonomy, acf-ui-options-page, elementor_library,
elementor_font, elementor_icons, elementor_snippet, e-landing-page,
e-floating-buttons
```

**Webhook Payload** (`POST /api/public/wp/entity-updated`):
```json
{
  "action": "created|updated|trashed|deleted",
  "post_type": "post|page|custom_type",
  "post": {
    "id": 123,
    "title": "Post Title",
    "slug": "post-title",
    "status": "publish",
    "date": "2026-01-15 10:30:00",
    "date_gmt": "2026-01-15 10:30:00",
    "modified": "2026-01-15 11:00:00",
    "content": "Full HTML content",
    "excerpt": "Excerpt text",
    "author": 1,
    "author_name": "Admin",
    "permalink": "https://example.com/post-title",
    "link": "https://example.com/post-title",
    "menu_order": 0,
    "parent": 0,
    "template": "",
    "featured_image": "https://example.com/image.jpg",
    "categories": [{ "id": 1, "name": "News", "slug": "news" }],
    "tags": [{ "id": 5, "name": "AI", "slug": "ai" }],
    "taxonomies": {},
    "seo": { "source": "yoast", "title": "...", "description": "..." },
    "acf": null
  },
  "source": "wordpress"
}
```

### Platform → WordPress (REST API via `wp-api-client.js`)

All requests signed with HMAC-SHA256. Plugin sets `is_gp_api_request = true` to prevent echo-back.

```
Platform calls: POST/PUT/DELETE /wp-json/ghostseo/v1/{endpoint}
  Headers: X-GP-Site-Key, X-GP-Timestamp, X-GP-Signature
  Plugin validates → GP_Entity_Sync::mark_gp_origin() → execute → GP_Entity_Sync::clear_gp_origin()
```

### Conflict Prevention

- `GP_Entity_Sync::$is_gp_api_request` static flag prevents webhook loops on platform-originated changes
- `GP_Entity_Sync::mark_gp_origin()` called before `wp_update_post` / `wp_insert_post`
- `GP_Entity_Sync::clear_gp_origin()` called after operation
- Redirect sync checks `source` field - skips webhook if `source === 'gp-platform'`
- Platform uses sync locks to prevent concurrent syncs:
  ```
  acquireSyncLock(siteId, 'cron'|'manual'|'webhook')
  releaseSyncLock(siteId, 'COMPLETED'|'ERROR', error)
  // 10-minute max timeout on stale locks
  ```

---

## 13. Platform Public Plugin API Routes

All routes under `app/api/public/wp/` - require HMAC-SHA256 signature validation:

| Method | Route | When | Description |
|--------|-------|------|-------------|
| POST | `/api/public/wp/verify` | Plugin activation | Verifies connection, stores WP/PHP/plugin versions, returns permissions + shouldSync |
| POST | `/api/public/wp/ping` | Hourly cron | Updates `lastPingAt`, `connectionStatus`, returns `widgetData` (audit score, insights) |
| POST | `/api/public/wp/disconnect` | Plugin deactivation | Sets `connectionStatus: DISCONNECTED` |
| POST | `/api/public/wp/entity-updated` | Post create/update/trash/delete | Syncs entity to platform DB via `syncSingleEntity()` |
| POST | `/api/public/wp/redirect-updated` | Redirect create/update/delete | Upserts/deletes in Redirection model |
| POST | `/api/public/wp/seo-insights` | Dashboard widget request | Returns SEO data: traffic, keywords, issues, charts |
| POST | `/api/public/wp/check-version` | Settings tab | Returns latest version + changelog for comparison |
| POST | `/api/public/wp/save-language` | Language selector | Saves plugin display language preference (`he`/`en`/`auto`) |

---

## 14. Platform-Side WordPress API Client (`lib/wp-api-client.js`)

The platform uses this client to call WordPress plugin endpoints. All requests include HMAC-SHA256 signed headers with 30-second timeout.

### Core Methods

| Method | Plugin Endpoint | Purpose |
|--------|----------------|---------|
| `getSiteInfo(site)` | GET `/site-info` | Full site info (plugins, theme, post types) |
| `getPosts(site, postType, page, perPage, full)` | GET `/posts\|pages\|cpt/{type}` | Paginated post list |
| `getPost(site, postType, postId)` | GET `/posts\|pages\|cpt/{type}/{id}` | Single post with full data |
| `getPostBySlug(site, postType, slug)` | GET `/posts?slug=...` | Lookup by slug |
| `createPost(site, postType, data)` | POST `/posts\|pages\|cpt/{type}` | Create post |
| `updatePost(site, postType, postId, data)` | PUT `/posts\|pages\|cpt/{type}/{id}` | Update post (supports H1 fields) |
| `updateSeoData(site, postId, seoData)` | PUT `/seo/{id}` | Update SEO metadata |
| `getSeoData(site, postId)` | GET `/seo/{id}` | Get SEO metadata |
| `updateAcfFields(site, postId, data)` | PUT `/acf/{id}` | Update ACF fields |
| `getAcfFields(site, postId)` | GET `/acf/{id}` | Get ACF fields |
| `resolveUrl(site, url)` | POST `/resolve-url` | Map URL → WP post ID |
| `resolveMediaUrls(site, urls)` | POST `/resolve-media-urls` | Bulk URL → attachment ID mapping |
| `setFavicon(site, attachmentId)` | POST `/set-favicon` | Set site favicon |
| `getSearchEngineVisibility(site)` | GET `/search-engine-visibility` | Get indexing setting |
| `setSearchEngineVisibility(site, bool)` | PUT `/search-engine-visibility` | Toggle indexing |
| `enableSecurityHeaders(site, headers)` | PUT `/security-headers` | Set security headers |
| `getTaxonomies(site)` | GET `/taxonomies` | List taxonomies |
| `getTaxonomyTerms(site, tax)` | GET `/taxonomies/{tax}/terms` | List terms |
| `getMenus(site)` | GET `/menus` | Get navigation menus |
| `getRedirects(site)` | GET `/redirects` | List redirects |
| `createRedirect(site, data)` | POST `/redirects` | Create redirect |
| `updateRedirect(site, id, data)` | PUT `/redirects/{id}` | Update redirect |
| `deleteRedirect(site, id)` | DELETE `/redirects/{id}` | Delete redirect |
| `bulkSyncRedirects(site, redirects)` | POST `/redirects/bulk-sync` | Bulk sync |
| `importRedirects(site)` | POST `/redirects/import` | Import from 3rd-party plugins |
| `getDetectedRedirectPlugins(site)` | GET `/redirects/detected-plugins` | Detect redirect plugins |
| `searchReplaceLinks(site, oldUrl, newUrl)` | POST `/search-replace-links` | Search & replace URLs |
| `syncAllEntities(site, onProgress)` | Multiple requests | Full entity sync with progress callback |

---

## 15. Plugin Installation

Installation is manual via the WordPress admin upload UI:

1. From the GhostSEO dashboard, click **Download Plugin** to fetch a per-site ZIP from `GET /api/sites/[id]/download-plugin`. The ZIP contains baked-in `GP_SITE_ID`, `GP_SITE_KEY`, and `GP_SITE_SECRET` for that specific site.
2. In WordPress: **Plugins → Add New → Upload Plugin**, choose the ZIP, click **Install Now**, then **Activate**.
3. On activation, the plugin's `register_activation_hook` calls `POST /api/public/wp/verify` with the baked credentials. The platform validates the HMAC signature and flips `connectionStatus` to `CONNECTED`. The dashboard polls `/api/sites/[id]/connection-status` and updates automatically.

There is no programmatic install path - the WordPress REST API does not expose plugin upload from URL for non-wp.org plugins, and the previously-shipped form-based upload flow was removed.

---

## 16. SEO Plugin Compatibility

The plugin auto-detects and supports multiple SEO plugins:

### Yoast SEO

- Detection: `defined('WPSEO_VERSION')`
- Meta fields: `_yoast_wpseo_title`, `_yoast_wpseo_metadesc`, `_yoast_wpseo_focuskw`
- Open Graph: `_yoast_wpseo_opengraph-title`, `_yoast_wpseo_opengraph-description`, `_yoast_wpseo_opengraph-image`
- Twitter: `_yoast_wpseo_twitter-title`, `_yoast_wpseo_twitter-description`, `_yoast_wpseo_twitter-image`
- Robots: `_yoast_wpseo_meta-robots-noindex`, `_yoast_wpseo_meta-robots-nofollow`
- Schema: `_yoast_wpseo_schema_page_type`
- **Resolves Yoast variable templates** (e.g., `%%title%%`, `%%sitename%%`) with actual values

### Rank Math

- Detection: `defined('RANK_MATH_VERSION')`
- Meta fields: `rank_math_title`, `rank_math_description`, `rank_math_focus_keyword`
- Open Graph: `rank_math_facebook_title`, `rank_math_facebook_description`, `rank_math_facebook_image`
- Twitter: `rank_math_twitter_title`, `rank_math_twitter_description`, `rank_math_twitter_image`
- Robots: `rank_math_robots` (array)
- Schema: `rank_math_schema_Article`, `rank_math_rich_snippet`

---

## 17. Redirect Management (Plugin-Side)

### URL Processing

- `sanitize_redirect_url()` - Decodes percent-encoded URLs to Unicode (Hebrew support)
- `normalize_path()` - Strips trailing slashes for consistent matching
- `maybe_redirect()` - Hooks into `template_redirect`, matches with trailing-slash tolerance + Unicode decode

### 3rd-Party Plugin Detection & Import

Detects and can import redirects from:
- Redirection (by John Godley)
- Yoast Premium Redirects
- Rank Math Redirects
- Safe Redirect Manager
- Simple 301 Redirects
- 301 Redirects

### Bidirectional Sync

- `push_redirect_webhook()` - Pushes changes back to platform via `POST /api/public/wp/redirect-updated`
- Platform pushes redirects via `POST /wp-json/ghostseo/v1/redirects`
- Source field (`'wordpress'` or `'gp-platform'`) prevents infinite loops

---

## 18. Media Conversion Pipeline

### WebP Auto-Conversion

1. Image uploaded via `wp_handle_upload` filter
2. Check if auto-convert enabled in settings
3. Use Imagick or GD to convert to WebP
4. Generate WebP thumbnail versions
5. Store original alongside WebP
6. Track in conversion history

### Platform-Driven Queue (for batch operations)

- Platform batches images for conversion
- Calls `/media/process-queue-item` one-at-a-time (reliable - no WP-Cron dependency)
- Progress tracked via `/media/queue-status` endpoint

### AI Image Optimization

- Platform analyzes images → suggests optimized filenames + alt text
- Calls `/media/apply-ai-optimization` with suggestions
- Plugin updates attachment metadata

---

## 19. Version Management & Auto-Updates

### Single Source of Truth

`app/api/plugin/version.js`:
```javascript
export const PLUGIN_VERSION = "3.0.1";
export const PLUGIN_CHANGELOG = `
= 3.0.1 =
* NEW: H1 heading management...
...`;
```

### Update Workflow

1. Modify plugin template files in `plugin-templates/` directory
2. Increment `PLUGIN_VERSION` in `app/api/plugin/version.js`
3. Add changelog entry to `PLUGIN_CHANGELOG`
4. Run: `node scripts/sync-plugin-version.mjs` (syncs version to PHP plugin header + constant)
5. Deploy platform - all new plugin downloads automatically get the new version

### WordPress Auto-Update Flow

1. `GP_Updater` hooks into WordPress `pre_set_site_transient_update_plugins`
2. Checks: `GET /api/plugin/update-check?site_key=xxx&current_version=X.Y.Z`
3. Platform compares versions (splits by `.`, compares numeric parts left-to-right)
4. Returns WordPress-compatible update response:
   ```json
   {
     "success": true,
     "version": "3.0.1",
     "update_available": true,
     "download_url": "https://app.ghostseo.ai/api/plugin/download?site_key=...",
     "changelog": "= 3.0.1 =...",
     "tested_wp": "6.7",
     "requires_wp": "5.6",
     "requires_php": "7.4"
   }
   ```
5. WordPress displays native update notice in Plugins screen
6. On update, clears cache transient and re-verifies connection
7. Plugin also has manual "Check for Updates" button in Settings tab

### Version Caching

- Update check result cached for 1 hour (3600 seconds) via `gp_connector_update_check` transient
- `after_update` hook clears the cache
- Manual check from Settings tab bypasses the cache

---

## 20. Internationalization (i18n)

### Languages Supported

- **English (en)** - default
- **Hebrew (he)** - RTL layout, ~200+ translated strings
- **Auto** - detects from WordPress locale

### How It Works

```php
GP_I18n::init();
// 1. Get saved preference: get_option('gp_connector_language', 'auto')
// 2. If 'auto', detect from get_locale() (he* → Hebrew, else English)
// 3. Load translation map
// 4. Register WordPress gettext filters:
//    add_filter('gettext', 'filter_gettext', 10, 3);
//    add_filter('ngettext', 'filter_ngettext', 10, 5);
// Filters only apply to 'ghostseo-connector' text domain
```

### RTL Support

```php
GP_I18n::is_rtl();    // Returns true for Hebrew
GP_I18n::dir_attr();  // Returns 'rtl' or 'ltr'
```

---

## 21. Database Schema (Site Model - Plugin-Related Fields)

```prisma
model Site {
  // Plugin Authentication
  siteKey              String?              // gp_site_{32-hex} - public identifier
  siteSecret           String?              // 64-hex - HMAC signing key (never returned from API)
  connectionStatus     SiteConnectionStatus // PENDING | CONNECTING | CONNECTED | DISCONNECTED | ERROR
  lastPingAt           DateTime?            // Last successful heartbeat
  sitePermissions      SitePermission[]     // Array of allowed operations (18 permissions)

  // WordPress Environment
  pluginVersion        String?              // Currently installed plugin version
  wpVersion            String?              // WordPress version
  phpVersion           String?              // PHP version
  wpTimezone           String?              // e.g. "Asia/Jerusalem"
  wpLocale             String?              // e.g. "he_IL"

  // Entity Sync Tracking
  entitySyncStatus     EntitySyncStatus     // NEVER | SYNCING | COMPLETED | ERROR
  entitySyncProgress   Int?                 // 0-100%
  entitySyncMessage    String?              // Current action description
  lastEntitySyncAt     DateTime?
  entitySyncError      String?
}

enum SiteConnectionStatus {
  PENDING        // Created, awaiting plugin installation
  CONNECTING     // Deprecated: never set by current code; retained for record decoding
  CONNECTED      // Verified & operational (heartbeat active)
  DISCONNECTED   // Was connected, plugin deactivated or unreachable
  ERROR          // Connection failed
}

enum SitePermission {
  CONTENT_READ, CONTENT_CREATE, CONTENT_UPDATE, CONTENT_DELETE, CONTENT_PUBLISH,
  MEDIA_UPLOAD, MEDIA_DELETE,
  SEO_UPDATE, REDIRECTS_MANAGE, SITE_INFO_READ,
  CPT_READ, CPT_CREATE, CPT_UPDATE, CPT_DELETE,
  ACF_READ, ACF_UPDATE,
  TAXONOMY_READ, TAXONOMY_MANAGE
}
```

---

## 22. Security Layers Summary

1. **HTTPS Only** - All communication encrypted in transit
2. **siteSecret Never Transmitted** - Only embedded in downloaded `config.php`, never returned from any API
3. **HMAC-SHA256 + Timestamp** - Each request uniquely signed, prevents tampering
4. **5-Minute Replay Window** - With ±60s clock skew tolerance
5. **Timing-Safe Comparison** - `crypto.timingSafeEqual()` / `hash_equals()` prevents timing attacks
6. **Permission Scoping** - Platform enforces what operations are allowed per site (18 granular permissions)
7. **Connection Status Tracking** - Alerts if plugin goes silent (missed heartbeats)
8. **Conflict Prevention** - Source flags and sync locks prevent bidirectional echo loops
9. **Input Sanitization** - All incoming data sanitized: `sanitize_text_field()`, `wp_kses_post()`, `sanitize_textarea_field()`

---

## 23. Changelog (Recent Versions)

```
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
* NEW: Theme switcher (dark/light) in Settings tab
* NEW: Language selector in Settings tab (Auto/English/Hebrew)
* NEW: Activity tab now records real actions
* NEW: Sidebar submenu items for each plugin tab
* NEW: GhostSEO text label next to logo in admin topbar
* FIX: Last Ping and Last Connection Check now display real data
* FIX: Widget button overflow

= 2.9.1 =
* FIX: Plugin logo on WordPress updates/plugins page is now contained
* CHANGE: GhostSEO logo displayed in admin topbar
* CHANGE: Connection tab is now the first tab

= 2.9.0 =
* NEW: Redesigned admin UI with tabbed navigation
* NEW: Copy Site Key button on Connection tab
* CHANGE: Redirections merged into main plugin page as a tab
```

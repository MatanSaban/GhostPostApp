# Ghost Post — WordPress Plugin System

The Ghost Post platform integrates with WordPress via a **custom plugin that is dynamically generated per-site**. Each downloaded plugin ZIP is unique — it contains site-specific credentials (Site ID, Site Key, Site Secret) baked directly into the code. The plugin enables bidirectional communication: the platform pushes content to WordPress, and WordPress pushes real-time entity/redirect changes back to the platform.

---

## 1. Plugin Architecture Overview

**11 PHP classes** working together via WordPress hooks and a REST API namespace (`ghost-post/v1`):

| Class | File | Purpose |
|-------|------|---------|
| `Ghost_Post` | `class-ghost-post.php` | Main orchestrator — initializes all managers, registers REST routes, admin menu |
| `GP_API_Handler` | `class-gp-api-handler.php` | Registers 30+ REST API endpoints, routes requests to appropriate managers |
| `GP_Request_Validator` | `class-gp-request-validator.php` | HMAC-SHA256 signature validation with timestamp replay protection |
| `GP_Content_Manager` | `class-gp-content-manager.php` | Posts/Pages CRUD — get_items, get_item, create, update, delete |
| `GP_Media_Manager` | `class-gp-media-manager.php` | Image upload, WebP/AVIF auto-conversion, AI image optimization, queue processing |
| `GP_SEO_Manager` | `class-gp-seo-manager.php` | Yoast + RankMath meta extraction and updates (title, description, OG, Twitter, keywords) |
| `GP_CPT_Manager` | `class-gp-cpt-manager.php` | Custom Post Types CRUD — get_post_types, create/read/update/delete |
| `GP_ACF_Manager` | `class-gp-acf-manager.php` | Advanced Custom Fields read/write — detects ACF, reads field groups and values |
| `GP_Entity_Sync` | `class-gp-entity-sync.php` | Real-time webhook push on post create/update/trash/delete to platform |
| `GP_Redirections_Manager` | `class-gp-redirections-manager.php` | Native redirect management + 3rd-party plugin detection and import |
| `GP_Updater` | `class-gp-updater.php` | WordPress-native auto-update checking against the Ghost Post platform |
| `GP_I18n` | `class-gp-i18n.php` | Internationalization — English + Hebrew (RTL) without .po/.mo files |

---

## 2. Dynamic Plugin Generation (Per-Site)

The plugin is **not a static download** — it is **generated dynamically** from JavaScript template files for each site.

**Template Location:** `app/api/sites/[id]/download-plugin/plugin-templates/`

Each template is a JavaScript function that returns PHP source code, with site-specific values injected at generation time.

### 21 Template Files → Generated Files Mapping

| Template (JS) | Export Function | Generated File (PHP/Other) |
|----------------|----------------|---------------------------|
| `main.js` | `getPluginMainFile()` | `ghost-post-connector.php` |
| `config.js` | `getPluginConfigFile()` | `includes/config.php` |
| `class-ghost-post.js` | `getClassGhostPost()` | `includes/class-ghost-post.php` |
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
define('GP_API_URL', 'https://app.ghostpost.co.il');
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

## 3. Download Plugin API (`GET /api/sites/[id]/download-plugin`)

**Authentication:** User session cookie + account membership verification

**Process:**
1. Verify user has access to the site
2. Generate `siteKey` + `siteSecret` if not already set (for pre-v2.4 sites)
3. Update site record with new keys and default permissions if needed
4. Call each of the 21 template functions to generate PHP source code
5. Inject site-specific values into `config.php` (Site ID, Site Key, Site Secret, API URL, permissions)
6. Build ZIP using JSZip with DEFLATE compression (level 9)
7. Add `assets/icon.svg` (ghost icon)
8. Return ZIP with filename: `ghost-post-connector-{short-key}.zip`

**API URL Resolution:** `GP_PLUGIN_API_URL` env → `NEXT_PUBLIC_BASE_URL` env → default `https://app.ghostpost.co.il`

---

## 4. Generated ZIP Structure

```
ghost-post-connector/
├── ghost-post-connector.php              // Main plugin entry point (WordPress header, hooks, init)
├── readme.txt                            // WordPress plugin readme with changelog
├── uninstall.php                         // Cleanup on uninstall (deletes options/transients)
├── includes/
│   ├── config.php                        // Site-specific: GP_SITE_ID, GP_SITE_KEY, GP_SITE_SECRET, GP_API_URL, GP_PERMISSIONS
│   ├── class-ghost-post.php              // Main orchestrator class
│   ├── class-gp-api-handler.php          // REST API routing (30+ endpoints)
│   ├── class-gp-request-validator.php    // HMAC-SHA256 validation
│   ├── class-gp-content-manager.php      // Post/page CRUD
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
│   │   ├── settings-page.php             // Language, connection, last ping, errors
│   │   └── redirections-page.php         // Redirect plugin detection, import, CRUD
│   ├── css/
│   │   └── admin.css                     // Cards, status indicators, forms, tables
│   └── js/
│       └── admin.js                      // Redirect CRUD, form handling, AJAX
└── assets/
    └── icon.svg                          // Ghost icon
```

---

## 5. Plugin Initialization

```php
// ghost-post-connector.php (main entry point)

// Plugin Header
Plugin Name: Ghost Post Connector
Plugin URI: https://ghostpost.co.il
Version: 2.4.9
Requires at least: 5.6
Requires PHP: 7.4

// Constants
define('GP_CONNECTOR_VERSION', '2.4.9');
define('GP_CONNECTOR_PLUGIN_DIR', plugin_dir_path(__FILE__));
define('GP_CONNECTOR_PLUGIN_URL', plugin_dir_url(__FILE__));

// Load config.php → site credentials
require_once GP_CONNECTOR_PLUGIN_DIR . 'includes/config.php';

// Load all class files
require_once GP_CONNECTOR_PLUGIN_DIR . 'includes/class-ghost-post.php';
// ... (all other class files)

// Initialize on plugins_loaded
add_action('plugins_loaded', 'gp_connector_init');
function gp_connector_init() {
    $ghost_post = new Ghost_Post();
    $ghost_post->init();
}

// Activation → verify connection with platform
register_activation_hook(__FILE__, 'gp_connector_activate');

// Deactivation → notify platform of disconnection
register_deactivation_hook(__FILE__, 'gp_connector_deactivate');
```

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
| `encryptCredential(text, key)` | AES-256-GCM encryption (for auto-install credentials) |
| `decryptCredential(encryptedBase64, key)` | Decrypts AES-256-GCM |
| `clearSiteCredentials(prisma, siteId)` | Removes temporary auto-install credentials |
| `generateConnectionToken(siteId, siteKey)` | Base64url JWT with 30-min expiration |
| `validateConnectionToken(token)` | Decodes and validates expiration |

---

## 7. Plugin REST Endpoints (WordPress Side — `ghost-post/v1` namespace)

30+ REST API endpoints registered via `register_rest_route()`:

### Content (Posts/Pages)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET/POST | `/posts` | List / create posts |
| GET/PUT/DELETE | `/posts/{id}` | Read / update / delete post |
| GET/POST | `/pages` | List / create pages |
| GET/PUT/DELETE | `/pages/{id}` | Read / update / delete page |

### Custom Post Types

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET/POST | `/cpt/{type}` | List / create CPT items |
| GET/PUT/DELETE | `/cpt/{type}/{id}` | Read / update / delete CPT item |

### Media (Images)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET/POST | `/media` | List / upload media |
| GET/PUT/DELETE | `/media/{id}` | Read / update / delete media |
| POST | `/media/convert-to-webp` | Batch WebP conversion |
| POST | `/media/convert-image-format` | Multi-format conversion (WebP/AVIF) |
| POST | `/media/ai-optimize` | AI image enhancement |
| POST | `/media/apply-ai-optimization` | Apply platform AI suggestions (filename, alt text) |
| GET | `/media/queue-status` | Conversion queue progress |
| POST | `/media/process-queue-item` | Process platform-driven conversion queue item |
| GET | `/media/stats` | WebP conversion statistics |
| GET/DELETE | `/media/redirects` | Image URL redirect tracking (old→new) |

### SEO & Metadata

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET/PUT | `/seo/{id}` | Get/update SEO meta (resolves Yoast/RankMath templates) |
| GET/PUT | `/acf/{id}` | Get/update Advanced Custom Fields |
| GET | `/taxonomies` | List registered taxonomies |
| GET/POST | `/taxonomies/{tax}/terms` | List / create taxonomy terms |
| GET | `/menus` | List WordPress menus |

### Redirects

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET/POST | `/redirects` | List / create redirects |
| PUT/DELETE | `/redirects/{id}` | Update / delete redirect |

### System

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/verify` | Connection verification (activation hook) |
| GET | `/site-info` | WordPress/plugin/PHP version info |

---

## 8. Connection Protocol & Lifecycle

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
   Returns: permissions array + shouldSync flag (true if first connection)

4. RUNTIME (Ongoing)
   a. Heartbeat: WordPress cron fires hourly
      → POST /api/public/wp/ping { pluginVersion, wpVersion }
      → Platform updates lastPingAt, confirms CONNECTED status
   
   b. Entity Sync: WordPress post create/update/trash/delete triggers webhook
      → POST /api/public/wp/entity-updated { action, post_type, post: {...full data...} }
      → Platform syncs entity via syncSingleEntity()
   
   c. Redirect Sync: WordPress redirect changes trigger webhook
      → POST /api/public/wp/redirect-updated { action, redirect: {...}, source }
      → Platform upserts/deletes in Redirection model
   
   d. Platform → WordPress: Content publishing, media upload, SEO updates
      → Platform calls /wp-json/ghost-post/v1/{endpoint} with HMAC signature
   
   e. Auto-Update: Plugin checks for updates
      → GET /api/plugin/update-check?site_key=xxx&current_version=2.4.8
      → WordPress-native update notice if new version available

5. DEACTIVATE PLUGIN
   WordPress deactivation hook fires → gp_connector_deactivate()
   Plugin sends: POST /api/public/wp/disconnect
   Platform sets connectionStatus: DISCONNECTED
```

---

## 9. Auto-Install Feature (`POST /api/sites/[id]/auto-install`)

Alternative to manual plugin installation:

1. User provides WordPress admin URL + credentials on the platform Connect page
2. Platform encrypts credentials with AES-256-GCM (5-minute TTL)
3. Platform checks REST API reachability (`GET /wp-json/` with 15s timeout)
4. Authenticates via Basic Auth (`GET /wp-json/wp/v2/users/me`)
5. Verifies `activate_plugins` capability
6. Searches for existing `ghost-post-connector` plugin
7. If found → activates it; if not found → returns `MANUAL_INSTALL_REQUIRED`
8. Credentials cleared immediately after attempt

**Error Codes:** `REST_API_UNREACHABLE`, `AUTH_FAILED`, `INSUFFICIENT_PERMISSIONS`, `MANUAL_INSTALL_REQUIRED`, `ACTIVATION_FAILED`

---

## 10. Real-Time Entity Sync (Bidirectional)

### WordPress → Platform (Webhooks)

1. `on_post_saved()` / `on_post_trashed()` / `on_post_deleted()` hook fires in `GP_Entity_Sync`
2. Skips if: autosave, revision, excluded post type, or **originated from gp-platform** (`is_gp_api_request` flag)
3. Builds complete entity payload: title, content, slug, status, SEO data, ACF fields, taxonomies, featured image, author
4. Creates HMAC signature
5. Non-blocking webhook `POST /api/public/wp/entity-updated` with full data
6. Platform routes to `syncSingleEntity()` or `deleteSingleEntity()`

### Platform → WordPress (REST API)

- Content publishing: `POST /wp-json/ghost-post/v1/posts`
- Media upload: `POST /wp-json/ghost-post/v1/media`
- SEO updates: `PUT /wp-json/ghost-post/v1/seo/{id}`
- All requests signed with HMAC; plugin sets `is_gp_api_request = true` to prevent echo-back

### Conflict Prevention

- `GP_Entity_Sync::$is_gp_api_request` flag prevents webhook loops on platform-originated changes
- Redirect sync checks `source` field — skips webhook if `source === 'gp-platform'`
- Platform uses sync locks to prevent concurrent syncs:
  ```
  acquireSyncLock(siteId, 'cron'|'manual'|'webhook')
  releaseSyncLock(siteId, 'COMPLETED'|'ERROR', error)
  // 10-minute max timeout on stale locks
  // Progress tracked: entitySyncProgress (0-100), entitySyncMessage
  ```

---

## 11. Platform Public Plugin API Routes

All routes under `app/api/public/wp/` — require HMAC-SHA256 signature validation:

| Method | Route | When | Updates |
|--------|-------|------|---------|
| POST | `/api/public/wp/verify` | Plugin activation | connectionStatus→CONNECTED, stores WP/PHP/plugin versions, returns permissions + shouldSync |
| POST | `/api/public/wp/ping` | Hourly WordPress cron | lastPingAt, connectionStatus→CONNECTED |
| POST | `/api/public/wp/disconnect` | Plugin deactivation | connectionStatus→DISCONNECTED |
| POST | `/api/public/wp/entity-updated` | Post create/update/trash/delete | Syncs entity to platform database via syncSingleEntity() |
| POST | `/api/public/wp/redirect-updated` | Redirect create/update/delete | Upserts/deletes in Redirection model, URL normalization |

---

## 12. SEO Plugin Compatibility

The plugin auto-detects and supports multiple SEO plugins:

### Yoast SEO

- Meta fields: `_yoast_wpseo_title`, `_yoast_wpseo_metadesc`, `_yoast_wpseo_focuskw`
- Open Graph: `_yoast_wpseo_opengraph-title`, `_yoast_wpseo_opengraph-description`, `_yoast_wpseo_opengraph-image`
- Twitter: `_yoast_wpseo_twitter-title`, `_yoast_wpseo_twitter-description`, `_yoast_wpseo_twitter-image`
- Resolves Yoast variable templates (e.g., `%%title%%`, `%%sitename%%`) with actual values

### Rank Math

- Meta fields: `rank_math_title`, `rank_math_description`, `rank_math_focus_keyword`
- Open Graph: `rank_math_facebook_title`, `rank_math_facebook_description`, `rank_math_facebook_image`
- Twitter: `rank_math_twitter_title`, `rank_math_twitter_description`
- Schema: `rank_math_schema_Article`, `rank_math_rich_snippet`

---

## 13. Redirect Management (Plugin-Side)

### URL Processing

- `sanitize_redirect_url()` — Decodes percent-encoded URLs to Unicode (Hebrew support)
- `normalize_path()` — Strips trailing slashes for consistent matching
- `maybe_redirect()` — Hooks into `template_redirect`, matches with trailing-slash tolerance + Unicode decode

### 3rd-Party Plugin Detection

Detects and recommends importing from:
- Redirection, Yoast Premium Redirects, Rank Math Redirects, Safe Redirect Manager, Simple 301 Redirects

### Bidirectional Sync

- `push_redirect_webhook()` — Pushes changes back to platform via `POST /api/public/wp/redirect-updated`
- Platform pushes redirects via `POST /wp-json/ghost-post/v1/redirects`
- Source field prevents infinite loops

---

## 14. Media Conversion Pipeline

### WebP Auto-Conversion

1. Image uploaded via `wp_handle_upload` filter
2. Check if auto-convert enabled in settings
3. Use Imagick or GD to convert to WebP
4. Generate WebP thumbnail versions
5. Store original alongside WebP
6. Track in conversion history

### Platform-Driven Queue (for batch operations)

- Platform batches images for conversion
- Calls `/media/process-queue-item` one-at-a-time (reliable — no WP-Cron dependency)
- Progress tracked via `/media/queue-status` endpoint

### AI Image Optimization

- Platform analyzes images → suggests optimized filenames + alt text
- Calls `/media/apply-ai-optimization` with suggestions
- Plugin updates attachment metadata

---

## 15. Version Management & Auto-Updates

### Single Source of Truth

`app/api/plugin/version.js`:
```javascript
export const PLUGIN_VERSION = "2.4.9";
export const PLUGIN_CHANGELOG = `= 2.4.9 =\n* FIX: Scheduling published posts...`;
```

### Update Workflow

1. Modify plugin template files in `plugin-templates/` directory
2. Increment `PLUGIN_VERSION` in `app/api/plugin/version.js` (by 0.0.1)
3. Add changelog entry to `PLUGIN_CHANGELOG`
4. Run: `node scripts/sync-plugin-version.mjs` (syncs version to main.php template header + constant)
5. Deploy platform — all new plugin downloads automatically get the new version

### WordPress Auto-Update

- `GP_Updater` hooks into WordPress `pre_set_site_transient_update_plugins`
- Checks: `GET /api/plugin/update-check?site_key=xxx&current_version=X.Y.Z`
- Platform compares versions (splits by `.`, compares numeric parts left-to-right)
- Returns WordPress-compatible update response with download URL, changelog, requirements
- WordPress displays native update notice in Plugins screen

**Current Version:** 2.4.9

---

## 16. Database Schema (Site Model — Plugin-Related Fields)

```prisma
model Site {
  // Plugin Authentication
  siteKey              String?              // gp_site_{32-hex} — public identifier
  siteSecret           String?              // 64-hex — HMAC signing key (never returned from API)
  connectionStatus     SiteConnectionStatus // PENDING | CONNECTING | CONNECTED | DISCONNECTED | ERROR
  lastPingAt           DateTime?            // Last successful heartbeat
  sitePermissions      SitePermission[]     // Array of allowed operations (18 permissions)

  // WordPress Environment
  pluginVersion        String?              // Currently installed plugin version
  wpVersion            String?              // WordPress version
  phpVersion           String?              // PHP version
  wpTimezone           String?              // e.g. "Asia/Jerusalem"
  wpLocale             String?              // e.g. "he_IL"

  // Auto-Install (temporary, encrypted)
  wpAdminUrl           String?
  wpAdminUsername       String?              // AES-256-GCM encrypted
  wpAdminPassword      String?              // AES-256-GCM encrypted
  autoInstallExpiresAt DateTime?            // 5-minute TTL

  // Entity Sync Tracking
  entitySyncStatus     EntitySyncStatus     // NEVER | SYNCING | COMPLETED | ERROR
  entitySyncProgress   Int?                 // 0-100%
  entitySyncMessage    String?              // Current action description
  lastEntitySyncAt     DateTime?
  entitySyncError      String?
}

enum SiteConnectionStatus {
  PENDING        // Created, awaiting plugin installation
  CONNECTING     // Auto-install in progress
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

## 17. Security Layers Summary

1. **HTTPS Only** — All communication encrypted in transit
2. **siteSecret Never Transmitted** — Only embedded in downloaded `config.php`, never returned from any API
3. **HMAC-SHA256 + Timestamp** — Each request uniquely signed, prevents tampering
4. **5-Minute Replay Window** — With ±60s clock skew tolerance
5. **Timing-Safe Comparison** — `crypto.timingSafeEqual()` / `hash_equals()` prevents timing attacks
6. **Permission Scoping** — Platform enforces what operations are allowed per site
7. **Connection Status Tracking** — Alerts if plugin goes silent (missed heartbeats)
8. **Auto-Install Credential Encryption** — AES-256-GCM with 5-minute TTL, cleared after use
9. **Conflict Prevention** — Source flags and sync locks prevent bidirectional echo loops

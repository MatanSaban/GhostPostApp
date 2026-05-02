import { PLUGIN_VERSION } from '@/app/api/plugin/version';

/**
 * Generate main plugin file
 * @param {string} version - Optional version override (defaults to PLUGIN_VERSION)
 */
export function getPluginMainFile(version = PLUGIN_VERSION) {
  return `<?php
/**
 * Plugin Name: GhostSEO Connector
 * Plugin URI: https://ghostseo.ai
 * Description: Connects your WordPress site to GhostSEO platform for AI-powered content management.
 * Version: ${version}
 * Author: GhostSEO
 * Author URI: https://ghostseo.ai
 * License: GPL v2 or later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain: ghostseo-connector
 * Domain Path: /languages
 * Requires at least: 5.6
 * Requires PHP: 7.4
 */

// Prevent direct access
if (!defined('ABSPATH')) {
    exit;
}

// Plugin constants
define('GP_CONNECTOR_VERSION', '${version}');
define('GP_CONNECTOR_PLUGIN_DIR', plugin_dir_path(__FILE__));
define('GP_CONNECTOR_PLUGIN_URL', plugin_dir_url(__FILE__));
define('GP_CONNECTOR_PLUGIN_BASENAME', plugin_basename(__FILE__));

// Load configuration
require_once GP_CONNECTOR_PLUGIN_DIR . 'includes/config.php';

// Load i18n (must be before other classes so translations are available)
require_once GP_CONNECTOR_PLUGIN_DIR . 'includes/class-gp-i18n.php';

// Load dependencies
require_once GP_CONNECTOR_PLUGIN_DIR . 'includes/class-ghostseo-plugin.php';
require_once GP_CONNECTOR_PLUGIN_DIR . 'includes/class-gp-api-handler.php';
require_once GP_CONNECTOR_PLUGIN_DIR . 'includes/class-gp-request-validator.php';
require_once GP_CONNECTOR_PLUGIN_DIR . 'includes/class-gp-content-manager.php';
require_once GP_CONNECTOR_PLUGIN_DIR . 'includes/class-gp-media-manager.php';
require_once GP_CONNECTOR_PLUGIN_DIR . 'includes/class-gp-seo-manager.php';
require_once GP_CONNECTOR_PLUGIN_DIR . 'includes/class-gp-cpt-manager.php';
require_once GP_CONNECTOR_PLUGIN_DIR . 'includes/class-gp-acf-manager.php';
require_once GP_CONNECTOR_PLUGIN_DIR . 'includes/class-gp-entity-sync.php';
require_once GP_CONNECTOR_PLUGIN_DIR . 'includes/class-gp-redirections-manager.php';
require_once GP_CONNECTOR_PLUGIN_DIR . 'includes/class-gp-cache-manager.php';
require_once GP_CONNECTOR_PLUGIN_DIR . 'includes/class-gp-element-manipulator.php';
require_once GP_CONNECTOR_PLUGIN_DIR . 'includes/class-gp-updater.php';

/**
 * Initialize the plugin
 */
function gp_connector_init() {
    $ghostseo = new GhostSEO_Plugin();
    $ghostseo->init();

    // Initialize auto-updater
    $updater = new GP_Updater();
    $updater->init();
}
add_action('plugins_loaded', 'gp_connector_init');

/**
 * Send security headers if enabled via GhostSEO platform
 */
function gp_send_security_headers() {
    if (headers_sent()) return;
    $option = get_option('gp_security_headers', array());
    if (empty($option['enabled']) || empty($option['headers'])) return;
    foreach ($option['headers'] as $name => $value) {
        if (!empty($value)) {
            header($name . ': ' . $value);
        }
    }
}
add_action('send_headers', 'gp_send_security_headers');

/**
 * Detect a request coming from the GhostSEO platform in editor mode.
 *
 * Two modes are accepted:
 *  1. Signed (gp_editor=1) - carries gp_origin, gp_exp, gp_sig; verified via
 *     HMAC-SHA256(GP_SITE_SECRET, "GP_SITE_ID|origin|exp"). Works from any
 *     platform origin (dev, staging, prod) without a Referer allowlist.
 *  2. Legacy (gp_editor=true) - trusts the Referer origin against the baked
 *     GP_API_URL. Kept for backwards compatibility while older platform
 *     deployments still send the unsigned flag.
 */
function gp_is_editor_request() {
    if (empty($_GET['gp_editor'])) return false;

    // Signed mode
    if ($_GET['gp_editor'] === '1') {
        return gp_editor_signed_origin() !== '';
    }

    // Legacy unsigned mode
    if ($_GET['gp_editor'] === 'true') {
        if (!defined('GP_API_URL')) return false;
        $platform_origin = gp_parse_origin(GP_API_URL);
        if (!$platform_origin) return false;
        $referer = isset($_SERVER['HTTP_REFERER']) ? $_SERVER['HTTP_REFERER'] : '';
        $referer_origin = gp_parse_origin($referer);
        return $referer_origin && $referer_origin === $platform_origin;
    }

    return false;
}

/**
 * Verify the signed editor token and return the origin the token was minted
 * for (or '' if missing / invalid / expired). Result is cached per-request.
 */
function gp_editor_signed_origin() {
    static $cached = null;
    if ($cached !== null) return $cached;
    $cached = '';

    if (empty($_GET['gp_editor']) || $_GET['gp_editor'] !== '1') return $cached;
    if (empty($_GET['gp_sig']) || empty($_GET['gp_origin']) || empty($_GET['gp_exp'])) return $cached;
    if (!defined('GP_SITE_SECRET') || !defined('GP_SITE_ID')) return $cached;

    $origin_raw = wp_unslash($_GET['gp_origin']);
    $origin = gp_parse_origin($origin_raw);
    if (!$origin) return $cached;

    $exp = intval($_GET['gp_exp']);
    if ($exp <= 0 || $exp < time()) return $cached;

    $sig = sanitize_text_field(wp_unslash($_GET['gp_sig']));
    if (!preg_match('/^[a-f0-9]{64}$/i', $sig)) return $cached;

    $payload = GP_SITE_ID . '|' . $origin . '|' . $exp;
    $expected = hash_hmac('sha256', $payload, GP_SITE_SECRET);
    if (!hash_equals($expected, $sig)) return $cached;

    $cached = $origin;
    return $cached;
}

/**
 * Origin allowed to frame the site in editor mode. Prefers the verified
 * signed origin so dev/staging/prod all work; falls back to the baked
 * platform URL for legacy gp_editor=true requests.
 */
function gp_editor_parent_origin() {
    $signed = gp_editor_signed_origin();
    if ($signed) return $signed;
    if (defined('GP_API_URL')) return gp_parse_origin(GP_API_URL);
    return '';
}

function gp_parse_origin($url) {
    if (empty($url)) return '';
    $parts = wp_parse_url($url);
    if (empty($parts['scheme']) || empty($parts['host'])) return '';
    $origin = $parts['scheme'] . '://' . $parts['host'];
    if (!empty($parts['port'])) $origin .= ':' . $parts['port'];
    return $origin;
}

/**
 * When the platform opens the site in the editor iframe:
 *  - allow embedding by replacing X-Frame-Options with a scoped CSP frame-ancestors
 *  - enqueue the editor bridge script that implements element inspection
 */
function gp_editor_send_frame_headers() {
    if (!gp_is_editor_request()) return;
    if (headers_sent()) return;
    $origin = gp_editor_parent_origin();
    if (!$origin) return;
    header_remove('X-Frame-Options');
    header('Content-Security-Policy: frame-ancestors ' . $origin);
}
add_action('send_headers', 'gp_editor_send_frame_headers');

function gp_editor_enqueue_bridge() {
    if (!gp_is_editor_request()) return;
    wp_enqueue_script(
        'gp-editor-bridge',
        GP_CONNECTOR_PLUGIN_URL . 'assets/editor-bridge.js',
        array(),
        GP_CONNECTOR_VERSION,
        true
    );
}
add_action('wp_enqueue_scripts', 'gp_editor_enqueue_bridge');

/**
 * Activation hook
 */
function gp_connector_activate() {
    // Verify connection with GhostSEO platform
    $ghostseo = new GhostSEO_Plugin();
    $ghostseo->verify_connection();

    // Flush rewrite rules
    flush_rewrite_rules();
}
register_activation_hook(__FILE__, 'gp_connector_activate');

/**
 * Deactivation hook
 */
function gp_connector_deactivate() {
    // Notify GhostSEO platform about disconnection
    $ghostseo = new GhostSEO_Plugin();
    $ghostseo->notify_disconnection();

    // Flush rewrite rules
    flush_rewrite_rules();
}
register_deactivation_hook(__FILE__, 'gp_connector_deactivate');
`;
}

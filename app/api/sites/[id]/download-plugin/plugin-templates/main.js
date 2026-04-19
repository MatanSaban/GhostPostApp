import { PLUGIN_VERSION } from '@/app/api/plugin/version';

/**
 * Generate main plugin file
 * @param {string} version - Optional version override (defaults to PLUGIN_VERSION)
 */
export function getPluginMainFile(version = PLUGIN_VERSION) {
  return `<?php
/**
 * Plugin Name: Ghost Post Connector
 * Plugin URI: https://ghostpost.co.il
 * Description: Connects your WordPress site to Ghost Post platform for AI-powered content management.
 * Version: ${version}
 * Author: Ghost Post
 * Author URI: https://ghostpost.co.il
 * License: GPL v2 or later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain: ghost-post-connector
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
require_once GP_CONNECTOR_PLUGIN_DIR . 'includes/class-ghost-post.php';
require_once GP_CONNECTOR_PLUGIN_DIR . 'includes/class-gp-api-handler.php';
require_once GP_CONNECTOR_PLUGIN_DIR . 'includes/class-gp-request-validator.php';
require_once GP_CONNECTOR_PLUGIN_DIR . 'includes/class-gp-content-manager.php';
require_once GP_CONNECTOR_PLUGIN_DIR . 'includes/class-gp-media-manager.php';
require_once GP_CONNECTOR_PLUGIN_DIR . 'includes/class-gp-seo-manager.php';
require_once GP_CONNECTOR_PLUGIN_DIR . 'includes/class-gp-cpt-manager.php';
require_once GP_CONNECTOR_PLUGIN_DIR . 'includes/class-gp-acf-manager.php';
require_once GP_CONNECTOR_PLUGIN_DIR . 'includes/class-gp-entity-sync.php';
require_once GP_CONNECTOR_PLUGIN_DIR . 'includes/class-gp-redirections-manager.php';
require_once GP_CONNECTOR_PLUGIN_DIR . 'includes/class-gp-updater.php';

/**
 * Initialize the plugin
 */
function gp_connector_init() {
    $ghost_post = new Ghost_Post();
    $ghost_post->init();
    
    // Initialize auto-updater
    $updater = new GP_Updater();
    $updater->init();
}
add_action('plugins_loaded', 'gp_connector_init');

/**
 * Send security headers if enabled via Ghost Post platform
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
 * Detect a request coming from the Ghost Post platform with gp_editor=true.
 * Requires the platform origin in the Referer to prevent arbitrary third parties
 * from iframing the site by appending the flag.
 */
function gp_is_editor_request() {
    if (empty($_GET['gp_editor']) || $_GET['gp_editor'] !== 'true') return false;
    if (!defined('GP_API_URL')) return false;
    $platform_origin = gp_parse_origin(GP_API_URL);
    if (!$platform_origin) return false;
    $referer = isset($_SERVER['HTTP_REFERER']) ? $_SERVER['HTTP_REFERER'] : '';
    $referer_origin = gp_parse_origin($referer);
    return $referer_origin && $referer_origin === $platform_origin;
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
    $origin = gp_parse_origin(GP_API_URL);
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
    // Verify connection with Ghost Post platform
    $ghost_post = new Ghost_Post();
    $ghost_post->verify_connection();
    
    // Flush rewrite rules
    flush_rewrite_rules();
}
register_activation_hook(__FILE__, 'gp_connector_activate');

/**
 * Deactivation hook
 */
function gp_connector_deactivate() {
    // Notify Ghost Post platform about disconnection
    $ghost_post = new Ghost_Post();
    $ghost_post->notify_disconnection();
    
    // Flush rewrite rules
    flush_rewrite_rules();
}
register_deactivation_hook(__FILE__, 'gp_connector_deactivate');
`;
}

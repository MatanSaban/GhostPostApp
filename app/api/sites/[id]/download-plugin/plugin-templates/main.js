/**
 * Generate main plugin file
 */
export function getPluginMainFile() {
  return `<?php
/**
 * Plugin Name: Ghost Post Connector
 * Plugin URI: https://ghostpost.io
 * Description: Connects your WordPress site to Ghost Post platform for AI-powered content management.
 * Version: 1.0.0
 * Author: Ghost Post
 * Author URI: https://ghostpost.io
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
define('GP_CONNECTOR_VERSION', '1.0.0');
define('GP_CONNECTOR_PLUGIN_DIR', plugin_dir_path(__FILE__));
define('GP_CONNECTOR_PLUGIN_URL', plugin_dir_url(__FILE__));
define('GP_CONNECTOR_PLUGIN_BASENAME', plugin_basename(__FILE__));

// Load configuration
require_once GP_CONNECTOR_PLUGIN_DIR . 'includes/config.php';

// Load dependencies
require_once GP_CONNECTOR_PLUGIN_DIR . 'includes/class-ghost-post.php';
require_once GP_CONNECTOR_PLUGIN_DIR . 'includes/class-gp-api-handler.php';
require_once GP_CONNECTOR_PLUGIN_DIR . 'includes/class-gp-request-validator.php';
require_once GP_CONNECTOR_PLUGIN_DIR . 'includes/class-gp-content-manager.php';
require_once GP_CONNECTOR_PLUGIN_DIR . 'includes/class-gp-media-manager.php';
require_once GP_CONNECTOR_PLUGIN_DIR . 'includes/class-gp-seo-manager.php';
require_once GP_CONNECTOR_PLUGIN_DIR . 'includes/class-gp-cpt-manager.php';
require_once GP_CONNECTOR_PLUGIN_DIR . 'includes/class-gp-acf-manager.php';

/**
 * Initialize the plugin
 */
function gp_connector_init() {
    $ghost_post = new Ghost_Post();
    $ghost_post->init();
}
add_action('plugins_loaded', 'gp_connector_init');

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

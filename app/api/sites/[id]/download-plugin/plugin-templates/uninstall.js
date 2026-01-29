/**
 * Generate uninstall.php
 */
export function getPluginUninstall() {
  return `<?php
/**
 * Uninstall Ghost Post Connector
 * 
 * This file is called when the plugin is deleted from WordPress.
 */

// If uninstall not called from WordPress, exit
if (!defined('WP_UNINSTALL_PLUGIN')) {
    exit;
}

// Delete plugin options
delete_option('gp_connector_settings');
delete_option('gp_connector_last_ping');
delete_option('gp_connector_connection_status');

// Delete transients
delete_transient('gp_connector_site_info');

// Note: We intentionally do NOT delete the config.php file
// as it contains credentials that should be handled carefully.
// The user should delete the plugin folder manually if needed.
`;
}

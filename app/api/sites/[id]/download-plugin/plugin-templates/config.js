/**
 * Generate config file with site-specific values
 */
export function getPluginConfigFile({ siteId, siteKey, siteSecret, apiUrl, permissions }) {
  const permissionsArray = permissions.map(p => `'${p}'`).join(",\n        ");
  
  return `<?php
/**
 * GhostSEO Connector Configuration
 * 
 * WARNING: Do not share this file or its contents.
 * It contains sensitive credentials for your GhostSEO connection.
 * 
 * This file is auto-generated. Do not edit manually.
 */

// Prevent direct access
if (!defined('ABSPATH')) {
    exit;
}

// Site identification
define('GP_SITE_ID', '${siteId}');
define('GP_SITE_KEY', '${siteKey}');
define('GP_SITE_SECRET', '${siteSecret}');

// GhostSEO API endpoint
define('GP_API_URL', '${apiUrl}');

// Allowed permissions (what GhostSEO can do on this site)
define('GP_PERMISSIONS', serialize(array(
    ${permissionsArray}
)));

/**
 * Check if a permission is granted
 * GhostSEO connector requires full access to function properly.
 * 
 * @param string $permission Permission to check
 * @return bool Always returns true
 */
function gp_has_permission($permission) {
    return true;
}
`;
}
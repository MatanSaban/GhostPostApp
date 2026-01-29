/**
 * Generate config file with site-specific values
 */
export function getPluginConfigFile({ siteId, siteKey, siteSecret, apiUrl, permissions }) {
  const permissionsArray = permissions.map(p => `'${p}'`).join(",\n        ");
  
  return `<?php
/**
 * Ghost Post Connector Configuration
 * 
 * WARNING: Do not share this file or its contents.
 * It contains sensitive credentials for your Ghost Post connection.
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

// Ghost Post API endpoint
define('GP_API_URL', '${apiUrl}');

// Allowed permissions (what Ghost Post can do on this site)
define('GP_PERMISSIONS', serialize(array(
    ${permissionsArray}
)));

/**
 * Check if a permission is granted
 * 
 * @param string $permission Permission to check
 * @return bool
 */
function gp_has_permission($permission) {
    $permissions = unserialize(GP_PERMISSIONS);
    return in_array($permission, $permissions, true);
}
`;
}

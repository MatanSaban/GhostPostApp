/**
 * Plugin Version Configuration
 * 
 * This file is the single source of truth for the plugin version.
 * Update the version here when making plugin changes, and all
 * connected WordPress sites will receive the update notification.
 */

// Current plugin version - increment this when making updates
export const PLUGIN_VERSION = '1.1.3';

// Changelog for the current version
export const PLUGIN_CHANGELOG = `
= 1.1.3 =
* check


= 1.1.2 =
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
  { version: '1.0.0', date: '2025-01-01', description: 'Initial release' },
  { version: '1.1.0', date: '2026-01-29', description: 'Added auto-updates, ACF, and SEO support' },
  { version: '1.1.2', date: '2026-01-29', description: 'Full data sync support' },
  { version: '1.1.3', date: '2026-01-29', description: 'check' },
];

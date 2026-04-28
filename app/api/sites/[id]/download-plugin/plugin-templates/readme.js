import { PLUGIN_VERSION, PLUGIN_CHANGELOG } from '@/app/api/plugin/version';

/**
 * Generate readme.txt for WordPress plugin
 * @param {string} version - Optional version override (defaults to PLUGIN_VERSION)
 */
export function getPluginReadme(version = PLUGIN_VERSION) {
  return `=== GhostSEO Connector ===
Contributors: ghostpost
Tags: ai, content, automation, seo, content-management
Requires at least: 5.6
Tested up to: 6.7
Stable tag: ${version}
Requires PHP: 7.4
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Connects your WordPress site to GhostSEO platform for AI-powered content management.

== Description ==

GhostSEO Connector allows the GhostSEO platform to securely manage your WordPress content:

* Create, update, and publish posts and pages
* Manage custom post types
* Upload and manage media
* Update SEO meta (Yoast, RankMath, and custom meta)
* Manage ACF fields
* Handle redirects
* Automatic updates from GhostSEO platform
* And more...

All communications are secured with HMAC-SHA256 signatures.

== Installation ==

1. Upload the plugin files to the \`/wp-content/plugins/ghostseo-connector\` directory
2. Activate the plugin through the 'Plugins' screen in WordPress
3. The plugin will automatically connect to your GhostSEO account

== Frequently Asked Questions ==

= Is this plugin secure? =

Yes. All requests from GhostSEO are verified using HMAC-SHA256 signatures with a unique secret key. Only authorized requests are processed.

= What data does this plugin share? =

The plugin only processes requests from GhostSEO. It does not collect or send any data unless explicitly requested through the GhostSEO platform.

= Can I revoke access? =

Yes. Deactivating the plugin immediately disconnects your site from GhostSEO. You can also regenerate your site key from the GhostSEO dashboard.

= How do updates work? =

The plugin automatically checks for updates from the GhostSEO platform. When a new version is available, you'll see an update notification in WordPress just like any other plugin.

== Changelog ==

${PLUGIN_CHANGELOG}

== Upgrade Notice ==

= ${version} =
Update to the latest version for new features and bug fixes.
`;
}

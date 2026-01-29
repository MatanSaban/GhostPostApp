import { PLUGIN_VERSION, PLUGIN_CHANGELOG } from '@/app/api/plugin/version';

/**
 * Generate readme.txt for WordPress plugin
 * @param {string} version - Optional version override (defaults to PLUGIN_VERSION)
 */
export function getPluginReadme(version = PLUGIN_VERSION) {
  return `=== Ghost Post Connector ===
Contributors: ghostpost
Tags: ai, content, automation, seo, content-management
Requires at least: 5.6
Tested up to: 6.7
Stable tag: ${version}
Requires PHP: 7.4
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Connects your WordPress site to Ghost Post platform for AI-powered content management.

== Description ==

Ghost Post Connector allows the Ghost Post platform to securely manage your WordPress content:

* Create, update, and publish posts and pages
* Manage custom post types
* Upload and manage media
* Update SEO meta (Yoast, RankMath, and custom meta)
* Manage ACF fields
* Handle redirects
* Automatic updates from Ghost Post platform
* And more...

All communications are secured with HMAC-SHA256 signatures.

== Installation ==

1. Upload the plugin files to the \`/wp-content/plugins/ghost-post-connector\` directory
2. Activate the plugin through the 'Plugins' screen in WordPress
3. The plugin will automatically connect to your Ghost Post account

== Frequently Asked Questions ==

= Is this plugin secure? =

Yes. All requests from Ghost Post are verified using HMAC-SHA256 signatures with a unique secret key. Only authorized requests are processed.

= What data does this plugin share? =

The plugin only processes requests from Ghost Post. It does not collect or send any data unless explicitly requested through the Ghost Post platform.

= Can I revoke access? =

Yes. Deactivating the plugin immediately disconnects your site from Ghost Post. You can also regenerate your site key from the Ghost Post dashboard.

= How do updates work? =

The plugin automatically checks for updates from the Ghost Post platform. When a new version is available, you'll see an update notification in WordPress just like any other plugin.

== Changelog ==

${PLUGIN_CHANGELOG}

== Upgrade Notice ==

= ${version} =
Update to the latest version for new features and bug fixes.
`;
}

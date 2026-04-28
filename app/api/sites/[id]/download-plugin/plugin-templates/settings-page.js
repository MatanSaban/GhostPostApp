/**
 * Generate Settings/Main Admin Page view - unified tabbed layout
 */
export function getSettingsPage() {
  return `<?php
/**
 * GhostSEO Admin - unified tabbed settings page
 */

if (!defined('ABSPATH')) {
    exit;
}

$connection_status = get_option('gp_connector_connection_status', '');
$connection_verified = $connection_status === 'connected';
$last_check_ts = get_option('gp_connector_last_connection_check', '');
$last_ping_ts  = get_option('gp_connector_last_ping', '');
$gp_theme = get_option('gp_connector_theme', 'dark');
$gp_language = get_option('gp_connector_language', 'auto');

$is_configured = defined('GP_SITE_KEY') && !empty(GP_SITE_KEY) && strpos(GP_SITE_KEY, '__GP_') === false;

$redirections_manager = new GP_Redirections_Manager();
$detected_redirect_plugins = $redirections_manager->detect_plugins();
$primary_plugin   = $redirections_manager->get_primary_plugin();
$redirects        = $redirections_manager->get_gp_redirects();
$external_redirects = ($primary_plugin && $primary_plugin !== 'ghostseo') ? $redirections_manager->get_all_redirects() : array();
$has_external_plugin = !empty($detected_redirect_plugins);
$is_connected = $connection_verified;

$active_tab = isset($_GET['tab']) ? sanitize_key($_GET['tab']) : 'connection';
$allowed_tabs = array('connection', 'settings', 'activity', 'redirections', 'seo-insights', 'snippets', 'addons');
if (!in_array($active_tab, $allowed_tabs, true)) {
    $active_tab = 'connection';
}

$platform_url = defined('GP_API_URL') ? GP_API_URL : 'https://app.ghostseo.ai';
$site_key_display = defined('GP_SITE_KEY') ? GP_SITE_KEY : '';
$masked_key = $is_configured ? substr($site_key_display, 0, 8) . '...' . substr($site_key_display, -4) : '';

// Check for available update
$latest_version = get_transient('gp_latest_version');
$latest_download = get_transient('gp_latest_download_url');
$update_available = $latest_version && version_compare($latest_version, GP_CONNECTOR_VERSION, '>');

// Snippets data
$gp_snippets = get_option('gp_snippets', array());
$snippet_view = isset($_GET['snippet_view']) ? sanitize_key($_GET['snippet_view']) : 'active';

// Format timestamps for display
$last_check_display = '';
if ($last_check_ts) {
    $last_check_display = is_numeric($last_check_ts)
        ? sprintf(__('%s ago', 'ghostseo-connector'), human_time_diff($last_check_ts))
        : $last_check_ts;
}
$last_ping_display = '';
if ($last_ping_ts) {
    $last_ping_display = is_numeric($last_ping_ts)
        ? sprintf(__('%s ago', 'ghostseo-connector'), human_time_diff($last_ping_ts))
        : $last_ping_ts;
}

$theme_class = ($gp_theme === 'light') ? 'gp-theme-light' : 'gp-theme-dark';
?>

<div class="gp-admin-wrap <?php echo esc_attr($theme_class); ?>">
    <!-- Top Bar -->
    <div class="gp-topbar">
        <nav class="gp-tabs">
            <a href="?page=ghostseo&tab=connection" class="gp-tab <?php echo $active_tab === 'connection' ? 'gp-tab-active' : ''; ?>">
                <?php esc_html_e('Connection', 'ghostseo-connector'); ?>
            </a>
            <a href="?page=ghostseo&tab=settings" class="gp-tab <?php echo $active_tab === 'settings' ? 'gp-tab-active' : ''; ?>">
                <?php esc_html_e('Settings', 'ghostseo-connector'); ?>
            </a>
            <a href="?page=ghostseo&tab=activity" class="gp-tab <?php echo $active_tab === 'activity' ? 'gp-tab-active' : ''; ?>">
                <?php esc_html_e('Activity', 'ghostseo-connector'); ?>
            </a>
            <a href="?page=ghostseo&tab=redirections" class="gp-tab <?php echo $active_tab === 'redirections' ? 'gp-tab-active' : ''; ?>">
                <?php esc_html_e('Redirections', 'ghostseo-connector'); ?>
            </a>
            <a href="?page=ghostseo&tab=seo-insights" class="gp-tab <?php echo $active_tab === 'seo-insights' ? 'gp-tab-active' : ''; ?>">
                <?php esc_html_e('SEO Insights', 'ghostseo-connector'); ?>
            </a>
            <a href="?page=ghostseo&tab=snippets" class="gp-tab <?php echo $active_tab === 'snippets' ? 'gp-tab-active' : ''; ?>">
                <?php esc_html_e('Code Snippets', 'ghostseo-connector'); ?>
            </a>
            <a href="?page=ghostseo&tab=addons" class="gp-tab <?php echo $active_tab === 'addons' ? 'gp-tab-active' : ''; ?>">
                <?php esc_html_e('Add-ons', 'ghostseo-connector'); ?>
            </a>
        </nav>
        <div class="gp-topbar-brand">
            <span class="gp-version">v<?php echo esc_html(GP_CONNECTOR_VERSION); ?></span>
            <?php if ($update_available): ?>
                <button type="button" id="gp-header-update" class="gp-btn gp-btn-update" data-version="<?php echo esc_attr($latest_version); ?>" data-download="<?php echo esc_url($latest_download ?? ''); ?>">
                    &#8635; <?php printf(esc_html__('Update to v%s', 'ghostseo-connector'), esc_html($latest_version)); ?>
                </button>
            <?php else: ?>
                <button type="button" id="gp-header-check-update" class="gp-btn gp-btn-outline gp-btn-sm">
                    <?php esc_html_e('Check for Updates', 'ghostseo-connector'); ?>
                </button>
            <?php endif; ?>
            <?php
            // Theme-aware wordmark - light theme uses the dark wordmark
            // (black text on light bg), dark theme uses the light wordmark
            // (white text on dark bg).
            $logo_path = ($gp_theme === 'light') ? '/logo-light.svg' : '/logo-dark.svg';
            ?>
            <img src="<?php echo esc_url($platform_url . $logo_path); ?>" alt="GhostSEO" class="gp-topbar-wordmark">
        </div>
    </div>

    <!-- Tab Content -->
    <div class="gp-content">

        <?php if ($active_tab === 'connection'): ?>
        <!-- ==================== CONNECTION TAB ==================== -->
        <div class="gp-tab-panel">
            <div class="gp-connect-card">

                <?php if ($connection_verified): ?>
                    <h2><?php esc_html_e('Your site is connected to GhostSEO', 'ghostseo-connector'); ?></h2>
                    <p class="gp-connect-desc">
                        <?php esc_html_e('GhostSEO is managing this site. All systems are operational.', 'ghostseo-connector'); ?>
                    </p>

                    <div class="gp-connection-details">
                        <table class="gp-info-table">
                            <tr>
                                <th><?php esc_html_e('Platform URL', 'ghostseo-connector'); ?></th>
                                <td><a href="<?php echo esc_url(defined('GP_PLATFORM_API_URL') ? GP_PLATFORM_API_URL : $platform_url); ?>" target="_blank" rel="noopener noreferrer"><?php echo esc_html(defined('GP_PLATFORM_API_URL') ? GP_PLATFORM_API_URL : $platform_url); ?></a></td>
                            </tr>
                            <tr>
                                <th><?php esc_html_e('Last Check', 'ghostseo-connector'); ?></th>
                                <td><?php echo $last_check_display ? esc_html($last_check_display) : esc_html__('Never', 'ghostseo-connector'); ?></td>
                            </tr>
                            <tr>
                                <th><?php esc_html_e('Last Ping', 'ghostseo-connector'); ?></th>
                                <td><?php echo $last_ping_display ? esc_html($last_ping_display) : esc_html__('Never', 'ghostseo-connector'); ?></td>
                            </tr>
                        </table>
                    </div>

                    <div class="gp-connect-actions">
                        <button type="button" id="gp-test-connection" class="gp-btn gp-btn-primary">
                            <?php esc_html_e('Test Connection', 'ghostseo-connector'); ?>
                        </button>
                        <button type="button" id="gp-send-ping" class="gp-btn gp-btn-outline">
                            <?php esc_html_e('Send Ping', 'ghostseo-connector'); ?>
                        </button>
                    </div>

                <?php elseif ($is_configured): ?>
                    <h2><?php esc_html_e('Connect your site to GhostSEO', 'ghostseo-connector'); ?></h2>
                    <p class="gp-connect-desc">
                        <?php esc_html_e('Copy your Access Key and paste it at', 'ghostseo-connector'); ?>
                        <a href="<?php echo esc_url($platform_url); ?>" target="_blank" rel="noopener noreferrer">ghostseo.ai</a>
                        <?php esc_html_e('to start managing this site with AI.', 'ghostseo-connector'); ?>
                    </p>

                    <div class="gp-key-row">
                        <button type="button" id="gp-copy-key" class="gp-btn gp-btn-primary">
                            <?php esc_html_e('Copy Key', 'ghostseo-connector'); ?>
                        </button>
                        <div class="gp-key-display">
                            <code id="gp-site-key-value"><?php echo esc_html($masked_key); ?></code>
                        </div>
                    </div>

                    <a href="<?php echo esc_url($platform_url . '/dashboard/settings?siteKey=' . urlencode($site_key_display)); ?>" target="_blank" rel="noopener noreferrer" class="gp-btn gp-btn-connect">
                        &rarr; <?php esc_html_e('Connect to GhostSEO', 'ghostseo-connector'); ?>
                    </a>
                    <p class="gp-connect-hint"><?php esc_html_e('Opens GhostSEO with your key pre-filled.', 'ghostseo-connector'); ?></p>

                <?php else: ?>
                    <h2><?php esc_html_e('Connect your site to GhostSEO', 'ghostseo-connector'); ?></h2>
                    <div class="gp-notice gp-notice-warning">
                        <p><?php esc_html_e('Plugin is not configured. Please download a fresh plugin from your GhostSEO dashboard.', 'ghostseo-connector'); ?></p>
                    </div>
                <?php endif; ?>

                <div id="gp-connection-result" class="gp-result-box" style="display: none;"></div>
            </div>

            <!-- Site Info -->
            <div class="gp-site-info-card">
                <h3><?php esc_html_e('Site Information', 'ghostseo-connector'); ?></h3>
                <table class="gp-info-table">
                    <tr>
                        <th><?php esc_html_e('Site URL', 'ghostseo-connector'); ?></th>
                        <td><code><?php echo esc_html(get_site_url()); ?></code></td>
                    </tr>
                    <tr>
                        <th><?php esc_html_e('WordPress Version', 'ghostseo-connector'); ?></th>
                        <td><?php echo esc_html(get_bloginfo('version')); ?></td>
                    </tr>
                    <tr>
                        <th><?php esc_html_e('PHP Version', 'ghostseo-connector'); ?></th>
                        <td><?php echo esc_html(phpversion()); ?></td>
                    </tr>
                    <tr>
                        <th><?php esc_html_e('Plugin Version', 'ghostseo-connector'); ?></th>
                        <td><?php echo esc_html(GP_CONNECTOR_VERSION); ?></td>
                    </tr>
                </table>
            </div>
        </div>

        <?php elseif ($active_tab === 'settings'): ?>
        <!-- ==================== SETTINGS TAB ==================== -->
        <div class="gp-tab-panel">
            <div class="gp-panel-card">
                <h3><?php esc_html_e('Appearance', 'ghostseo-connector'); ?></h3>
                <p class="gp-desc"><?php esc_html_e('Choose the display theme for the GhostSEO plugin.', 'ghostseo-connector'); ?></p>

                <div class="gp-theme-switcher">
                    <label class="gp-theme-option">
                        <input type="radio" name="gp_theme" value="dark" <?php checked($gp_theme, 'dark'); ?>>
                        <span class="gp-theme-preview gp-theme-preview-dark">
                            <span class="gp-theme-preview-bar"></span>
                            <span class="gp-theme-preview-content"></span>
                        </span>
                        <span class="gp-theme-label"><?php esc_html_e('Dark', 'ghostseo-connector'); ?></span>
                    </label>
                    <label class="gp-theme-option">
                        <input type="radio" name="gp_theme" value="light" <?php checked($gp_theme, 'light'); ?>>
                        <span class="gp-theme-preview gp-theme-preview-light">
                            <span class="gp-theme-preview-bar"></span>
                            <span class="gp-theme-preview-content"></span>
                        </span>
                        <span class="gp-theme-label"><?php esc_html_e('Light', 'ghostseo-connector'); ?></span>
                    </label>
                </div>
            </div>

            <div class="gp-panel-card">
                <h3><?php esc_html_e('Language', 'ghostseo-connector'); ?></h3>
                <p class="gp-desc"><?php esc_html_e('Choose the plugin display language. When set to Auto, it follows the WordPress dashboard language.', 'ghostseo-connector'); ?></p>

                <div class="gp-form-group" style="max-width: 320px;">
                    <select id="gp-language-select" name="gp_language" style="width:100%; padding:10px 14px; font-size:13px; border:1px solid var(--gp-input-border); border-radius:8px; background:var(--gp-input-bg); color:var(--gp-text);">
                        <option value="auto" <?php selected($gp_language, 'auto'); ?>><?php esc_html_e('Auto (match WordPress)', 'ghostseo-connector'); ?></option>
                        <option value="en" <?php selected($gp_language, 'en'); ?>>English</option>
                        <option value="he" <?php selected($gp_language, 'he'); ?>>עברית (Hebrew)</option>
                    </select>
                </div>
                <div id="gp-language-result" class="gp-result-box" style="display:none;"></div>
            </div>

            <!-- Version Info -->
            <div class="gp-panel-card">
                <h3><?php esc_html_e('Version Information', 'ghostseo-connector'); ?></h3>
                <p class="gp-desc"><?php esc_html_e('Current plugin version and update status.', 'ghostseo-connector'); ?></p>

                <div class="gp-version-info">
                    <table class="gp-info-table">
                        <tr>
                            <th><?php esc_html_e('Current Version', 'ghostseo-connector'); ?></th>
                            <td><span class="gp-version-badge">v<?php echo esc_html(GP_CONNECTOR_VERSION); ?></span></td>
                        </tr>
                        <tr>
                            <th><?php esc_html_e('Latest Version', 'ghostseo-connector'); ?></th>
                            <td id="gp-latest-version-row">
                                <?php if ($latest_version): ?>
                                    <span class="gp-version-badge <?php echo $update_available ? 'gp-version-new' : ''; ?>">v<?php echo esc_html($latest_version); ?></span>
                                    <?php if ($update_available): ?>
                                        <a href="<?php echo esc_url(admin_url('update-core.php')); ?>" class="gp-btn gp-btn-sm gp-btn-update"><?php esc_html_e('Update Now', 'ghostseo-connector'); ?></a>
                                    <?php else: ?>
                                        <span class="gp-up-to-date">&#10003; <?php esc_html_e('Up to date', 'ghostseo-connector'); ?></span>
                                    <?php endif; ?>
                                <?php else: ?>
                                    <span class="gp-text-muted"><?php esc_html_e('Not checked yet', 'ghostseo-connector'); ?></span>
                                <?php endif; ?>
                            </td>
                        </tr>
                    </table>

                    <button type="button" id="gp-check-version" class="gp-btn gp-btn-outline">
                        <?php esc_html_e('Check for Updates', 'ghostseo-connector'); ?>
                    </button>
                    <div id="gp-version-result" class="gp-result-box" style="display: none;"></div>
                </div>
            </div>
        </div>

        <?php elseif ($active_tab === 'activity'): ?>
        <!-- ==================== ACTIVITY TAB ==================== -->
        <div class="gp-tab-panel">
            <div class="gp-panel-card">
                <h3><?php esc_html_e('Recent Activity', 'ghostseo-connector'); ?></h3>
                <p class="gp-desc"><?php esc_html_e('Actions performed by GhostSEO on your site.', 'ghostseo-connector'); ?></p>

                <?php
                // Activity log is stored newest-first (array_unshift in
                // log_activity()), so we slice directly without reversing.
                $activity_log_full = get_option('gp_activity_log', array());
                if (!is_array($activity_log_full)) { $activity_log_full = array(); }

                // Pagination - 30 per page, controlled via ?activity_page=N.
                // Custom param name avoids any collision with WP core's "paged"
                // and the menu-slug "page" query var on this admin screen.
                $per_page    = 30;
                $total_items = count($activity_log_full);
                $total_pages = max(1, (int) ceil($total_items / $per_page));
                $current_page = isset($_GET['activity_page']) ? max(1, intval($_GET['activity_page'])) : 1;
                $current_page = min($current_page, $total_pages);
                $offset      = ($current_page - 1) * $per_page;
                $activity_log = array_slice($activity_log_full, $offset, $per_page);

                // Action key → translatable English label. GP_I18n's gettext
                // filter will swap the English source string for the Hebrew
                // translation when the plugin language is Hebrew, so this map
                // works for both locales.
                $action_labels = array(
                    'connection_verified' => __('Connected', 'ghostseo-connector'),
                    'disconnected'        => __('Disconnected', 'ghostseo-connector'),
                    'content_created'     => __('Content created', 'ghostseo-connector'),
                    'content_updated'     => __('Content updated', 'ghostseo-connector'),
                    'content_deleted'     => __('Content deleted', 'ghostseo-connector'),
                    'media_uploaded'      => __('Media uploaded', 'ghostseo-connector'),
                    'media_deleted'       => __('Media deleted', 'ghostseo-connector'),
                    'seo_updated'         => __('SEO updated', 'ghostseo-connector'),
                    'element_manipulated' => __('Element edited', 'ghostseo-connector'),
                );

                /**
                 * Render the "Details" cell for a stored entry. New entries
                 * store details as { key: <sprintf template>, params: [...] };
                 * old entries (pre-translation overhaul) store a plain string
                 * that we just pass through __() in case it happens to match
                 * a translation source.
                 */
                $render_details = function ($entry) {
                    $d = $entry['details'] ?? '';
                    if (is_array($d)) {
                        $key    = isset($d['key']) ? (string) $d['key'] : '';
                        $params = isset($d['params']) && is_array($d['params']) ? $d['params'] : array();
                        if ($key === '') return '';
                        $template = __($key, 'ghostseo-connector');
                        // vsprintf needs at least as many args as the template's
                        // %-tokens; on mismatch we silently fall back to the
                        // raw template so we don't fatal on a malformed entry.
                        $rendered = @vsprintf($template, $params);
                        return $rendered === false ? $template : $rendered;
                    }
                    return $d ? __($d, 'ghostseo-connector') : '';
                };
                ?>

                <?php if (empty($activity_log_full)): ?>
                    <div class="gp-empty-state">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.3">
                            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                        </svg>
                        <p><?php esc_html_e('No activity recorded yet. Actions will appear here once GhostSEO starts managing your content.', 'ghostseo-connector'); ?></p>
                    </div>
                <?php else: ?>
                    <table class="gp-activity-table">
                        <thead>
                            <tr>
                                <th><?php esc_html_e('Time', 'ghostseo-connector'); ?></th>
                                <th><?php esc_html_e('Action', 'ghostseo-connector'); ?></th>
                                <th><?php esc_html_e('Details', 'ghostseo-connector'); ?></th>
                            </tr>
                        </thead>
                        <tbody>
                            <?php foreach ($activity_log as $entry): ?>
                            <?php
                                $action_key = isset($entry['action']) ? (string) $entry['action'] : '';
                                $action_label = isset($action_labels[$action_key])
                                    ? $action_labels[$action_key]
                                    : ($action_key !== '' ? __($action_key, 'ghostseo-connector') : '');
                            ?>
                            <tr>
                                <td class="gp-activity-time"><?php echo esc_html(isset($entry['time']) && is_numeric($entry['time']) ? sprintf(__('%s ago', 'ghostseo-connector'), human_time_diff($entry['time'])) : ($entry['time'] ?? '')); ?></td>
                                <td><span class="gp-activity-badge"><?php echo esc_html($action_label); ?></span></td>
                                <td><?php echo esc_html($render_details($entry)); ?></td>
                            </tr>
                            <?php endforeach; ?>
                        </tbody>
                    </table>

                    <?php if ($total_pages > 1): ?>
                    <div class="gp-activity-pagination">
                        <?php
                        $base_url = admin_url('admin.php?page=ghostseo&tab=activity');
                        $prev_disabled = $current_page <= 1;
                        $next_disabled = $current_page >= $total_pages;
                        ?>
                        <a class="gp-pagination-btn <?php echo $prev_disabled ? 'gp-disabled' : ''; ?>"
                           href="<?php echo $prev_disabled ? '#' : esc_url(add_query_arg('activity_page', $current_page - 1, $base_url)); ?>"
                           <?php echo $prev_disabled ? 'aria-disabled="true" tabindex="-1"' : ''; ?>>
                            <?php esc_html_e('Previous', 'ghostseo-connector'); ?>
                        </a>
                        <span class="gp-pagination-info">
                            <?php
                            // Translators: %1$d current page, %2$d total pages
                            printf(esc_html__('Page %1$d of %2$d', 'ghostseo-connector'), $current_page, $total_pages);
                            ?>
                        </span>
                        <a class="gp-pagination-btn <?php echo $next_disabled ? 'gp-disabled' : ''; ?>"
                           href="<?php echo $next_disabled ? '#' : esc_url(add_query_arg('activity_page', $current_page + 1, $base_url)); ?>"
                           <?php echo $next_disabled ? 'aria-disabled="true" tabindex="-1"' : ''; ?>>
                            <?php esc_html_e('Next', 'ghostseo-connector'); ?>
                        </a>
                    </div>
                    <?php endif; ?>
                <?php endif; ?>
            </div>
        </div>

        <?php elseif ($active_tab === 'redirections'): ?>
        <!-- ==================== REDIRECTIONS TAB ==================== -->
        <div class="gp-tab-panel">

            <?php if ($has_external_plugin && $primary_plugin !== 'ghostseo'): ?>
            <div class="gp-recommendation-banner">
                <div class="gp-recommendation-content">
                    <h3><?php esc_html_e('Redirection Plugin Detected', 'ghostseo-connector'); ?></h3>
                    <p>
                        <?php
                        $plugin_names = array_map(function($p) { return '<strong>' . esc_html($p['name']) . '</strong>' . ($p['version'] ? ' v' . esc_html($p['version']) : ''); }, $detected_redirect_plugins);
                        printf(
                            esc_html__('We detected %s on your site. We recommend importing your existing redirects into GhostSEO and then deactivating the external plugin to avoid conflicts.', 'ghostseo-connector'),
                            implode(', ', $plugin_names)
                        );
                        ?>
                    </p>
                    <div class="gp-recommendation-actions">
                        <button type="button" id="gp-import-redirects" class="gp-btn gp-btn-primary">
                            <?php printf(esc_html__('Import %d Redirects', 'ghostseo-connector'), count($external_redirects)); ?>
                        </button>
                        <span class="gp-import-count">
                            <?php printf(esc_html__('%d redirects found in %s', 'ghostseo-connector'), count($external_redirects), $detected_redirect_plugins[0]['name'] ?? ''); ?>
                        </span>
                    </div>
                    <div id="gp-import-result" class="gp-result-box" style="display: none;"></div>
                </div>
            </div>
            <?php endif; ?>

            <!-- Stats Row -->
            <div class="gp-redirections-stats">
                <div class="gp-stat-card">
                    <span class="gp-stat-value"><?php echo count(array_filter($redirects, function($r) { return !empty($r['is_active']); })); ?></span>
                    <span class="gp-stat-label"><?php esc_html_e('Active Redirects', 'ghostseo-connector'); ?></span>
                </div>
                <div class="gp-stat-card">
                    <span class="gp-stat-value"><?php echo count($redirects); ?></span>
                    <span class="gp-stat-label"><?php esc_html_e('Total Redirects', 'ghostseo-connector'); ?></span>
                </div>
                <div class="gp-stat-card">
                    <span class="gp-stat-value"><?php echo array_sum(array_column($redirects, 'hit_count')); ?></span>
                    <span class="gp-stat-label"><?php esc_html_e('Total Hits', 'ghostseo-connector'); ?></span>
                </div>
                <div class="gp-stat-card">
                    <span class="gp-stat-value <?php echo $is_connected ? 'gp-synced' : 'gp-not-synced'; ?>">
                        <?php echo $is_connected ? '&#10003;' : '&#10007;'; ?>
                    </span>
                    <span class="gp-stat-label"><?php esc_html_e('Platform Sync', 'ghostseo-connector'); ?></span>
                </div>
            </div>

            <!-- Add Redirect Form -->
            <div class="gp-panel-card">
                <h3><?php esc_html_e('Add New Redirect', 'ghostseo-connector'); ?></h3>
                <form id="gp-redirect-form" class="gp-redirect-form">
                    <input type="hidden" id="gp-redirect-id" value="">
                    <div class="gp-redirect-form-grid">
                        <div class="gp-form-group">
                            <label for="gp-source-url"><?php esc_html_e('From URL', 'ghostseo-connector'); ?></label>
                            <input type="text" id="gp-source-url" placeholder="/old-page" required>
                        </div>
                        <div class="gp-form-group">
                            <label for="gp-target-url"><?php esc_html_e('To URL', 'ghostseo-connector'); ?></label>
                            <input type="text" id="gp-target-url" placeholder="/new-page" required>
                        </div>
                        <div class="gp-form-group">
                            <label for="gp-redirect-type"><?php esc_html_e('Type', 'ghostseo-connector'); ?></label>
                            <select id="gp-redirect-type">
                                <option value="301"><?php esc_html_e('301 (Permanent)', 'ghostseo-connector'); ?></option>
                                <option value="302"><?php esc_html_e('302 (Temporary)', 'ghostseo-connector'); ?></option>
                                <option value="307"><?php esc_html_e('307 (Temporary Redirect)', 'ghostseo-connector'); ?></option>
                            </select>
                        </div>
                        <div class="gp-form-group gp-form-actions">
                            <button type="submit" class="gp-btn gp-btn-primary" id="gp-save-redirect">
                                <?php esc_html_e('Add Redirect', 'ghostseo-connector'); ?>
                            </button>
                            <button type="button" class="gp-btn gp-btn-outline" id="gp-cancel-edit" style="display: none;">
                                <?php esc_html_e('Cancel', 'ghostseo-connector'); ?>
                            </button>
                        </div>
                    </div>
                </form>
                <div id="gp-save-result" class="gp-result-box" style="display: none;"></div>
            </div>

            <!-- Redirects Table -->
            <div class="gp-panel-card">
                <h3>
                    <?php esc_html_e('Active Redirects', 'ghostseo-connector'); ?>
                    <span class="gp-count-badge"><?php echo count($redirects); ?></span>
                </h3>

                <?php if (empty($redirects)): ?>
                    <div class="gp-empty-state">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.3">
                            <polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/>
                            <line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>
                        </svg>
                        <p><?php esc_html_e('No redirects yet. Add your first redirect above or import from an existing plugin.', 'ghostseo-connector'); ?></p>
                    </div>
                <?php else: ?>
                    <table class="gp-redirects-table">
                        <thead>
                            <tr>
                                <th class="gp-col-status"><?php esc_html_e('Status', 'ghostseo-connector'); ?></th>
                                <th><?php esc_html_e('From', 'ghostseo-connector'); ?></th>
                                <th><?php esc_html_e('To', 'ghostseo-connector'); ?></th>
                                <th class="gp-col-type"><?php esc_html_e('Type', 'ghostseo-connector'); ?></th>
                                <th class="gp-col-hits"><?php esc_html_e('Hits', 'ghostseo-connector'); ?></th>
                                <th class="gp-col-actions"><?php esc_html_e('Actions', 'ghostseo-connector'); ?></th>
                            </tr>
                        </thead>
                        <tbody id="gp-redirects-tbody">
                            <?php foreach ($redirects as $redirect): ?>
                            <tr data-id="<?php echo esc_attr($redirect['id']); ?>" class="<?php echo empty($redirect['is_active']) ? 'gp-inactive-row' : ''; ?>">
                                <td class="gp-col-status">
                                    <button type="button" class="gp-toggle-status" data-id="<?php echo esc_attr($redirect['id']); ?>" data-active="<?php echo $redirect['is_active'] ? '1' : '0'; ?>">
                                        <span class="gp-status-indicator-dot <?php echo $redirect['is_active'] ? 'active' : 'inactive'; ?>"></span>
                                    </button>
                                </td>
                                <td><code><?php echo esc_html($redirect['source']); ?></code></td>
                                <td><code><?php echo esc_html($redirect['target']); ?></code></td>
                                <td class="gp-col-type">
                                    <span class="gp-type-badge gp-type-<?php echo esc_attr($redirect['type']); ?>"><?php echo esc_html($redirect['type']); ?></span>
                                </td>
                                <td class="gp-col-hits"><?php echo intval($redirect['hit_count']); ?></td>
                                <td class="gp-col-actions">
                                    <button type="button" class="gp-btn-icon gp-edit-redirect"
                                        data-id="<?php echo esc_attr($redirect['id']); ?>"
                                        data-source="<?php echo esc_attr($redirect['source']); ?>"
                                        data-target="<?php echo esc_attr($redirect['target']); ?>"
                                        data-type="<?php echo esc_attr($redirect['type']); ?>">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                    </button>
                                    <button type="button" class="gp-btn-icon gp-btn-danger gp-delete-redirect" data-id="<?php echo esc_attr($redirect['id']); ?>">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                                    </button>
                                </td>
                            </tr>
                            <?php endforeach; ?>
                        </tbody>
                    </table>
                <?php endif; ?>
            </div>
        </div>

        <?php elseif ($active_tab === 'seo-insights'): ?>
        <!-- ==================== SEO INSIGHTS TAB ==================== -->
        <div class="gp-tab-panel">
            <div class="gp-panel-card">
                <div class="gp-seo-header">
                    <div>
                        <h3><?php esc_html_e('SEO Insights', 'ghostseo-connector'); ?></h3>
                        <p class="gp-desc"><?php esc_html_e('Overview of your website SEO performance from GhostSEO platform.', 'ghostseo-connector'); ?></p>
                    </div>
                    <button type="button" id="gp-refresh-seo" class="gp-btn gp-btn-outline">
                        <?php esc_html_e('Refresh Data', 'ghostseo-connector'); ?>
                    </button>
                </div>

                <div id="gp-seo-loading" class="gp-loading-state" style="display: none;">
                    <div class="gp-spinner"></div>
                    <p><?php esc_html_e('Loading SEO data...', 'ghostseo-connector'); ?></p>
                </div>

                <div id="gp-seo-error" class="gp-result-box error" style="display: none;"></div>

                <div id="gp-seo-content" style="display: none;">

                    <!-- Traffic Stats -->
                    <div class="gp-seo-stats-row">
                        <div class="gp-stat-card">
                            <span class="gp-stat-value" id="gp-seo-total-traffic">&mdash;</span>
                            <span class="gp-stat-label"><?php esc_html_e('Total Traffic', 'ghostseo-connector'); ?></span>
                        </div>
                        <div class="gp-stat-card">
                            <span class="gp-stat-value" id="gp-seo-ai-traffic">&mdash;</span>
                            <span class="gp-stat-label"><?php esc_html_e('AI Traffic', 'ghostseo-connector'); ?></span>
                        </div>
                        <div class="gp-stat-card">
                            <span class="gp-stat-value" id="gp-seo-keywords-count">&mdash;</span>
                            <span class="gp-stat-label"><?php esc_html_e('Tracked Keywords', 'ghostseo-connector'); ?></span>
                        </div>
                        <div class="gp-stat-card">
                            <span class="gp-stat-value" id="gp-seo-issues-count">&mdash;</span>
                            <span class="gp-stat-label"><?php esc_html_e('Agent Issues', 'ghostseo-connector'); ?></span>
                        </div>
                    </div>

                    <!-- Traffic Chart -->
                    <div class="gp-panel-card gp-chart-card">
                        <h4><?php esc_html_e('Traffic Overview', 'ghostseo-connector'); ?></h4>
                        <div class="gp-chart-container">
                            <canvas id="gp-traffic-chart" height="300"></canvas>
                        </div>
                    </div>

                    <!-- AI Agent Issues -->
                    <div class="gp-panel-card">
                        <h4><?php esc_html_e('AI Agent Issues', 'ghostseo-connector'); ?></h4>
                        <div id="gp-agent-issues">
                            <div class="gp-empty-state">
                                <p><?php esc_html_e('No issues found.', 'ghostseo-connector'); ?></p>
                            </div>
                        </div>
                    </div>

                    <div class="gp-seo-two-col">
                        <!-- Top Keywords -->
                        <div class="gp-panel-card">
                            <h4><?php esc_html_e('Top 10 Keywords', 'ghostseo-connector'); ?></h4>
                            <table class="gp-seo-table" id="gp-top-keywords">
                                <thead>
                                    <tr>
                                        <th>#</th>
                                        <th><?php esc_html_e('Keyword', 'ghostseo-connector'); ?></th>
                                        <th><?php esc_html_e('Position', 'ghostseo-connector'); ?></th>
                                        <th><?php esc_html_e('Volume', 'ghostseo-connector'); ?></th>
                                        <th><?php esc_html_e('Change', 'ghostseo-connector'); ?></th>
                                    </tr>
                                </thead>
                                <tbody></tbody>
                            </table>
                        </div>

                        <!-- Top Pages -->
                        <div class="gp-panel-card">
                            <h4><?php esc_html_e('Top 10 Pages', 'ghostseo-connector'); ?></h4>
                            <table class="gp-seo-table" id="gp-top-pages">
                                <thead>
                                    <tr>
                                        <th>#</th>
                                        <th><?php esc_html_e('Page', 'ghostseo-connector'); ?></th>
                                        <th><?php esc_html_e('Traffic', 'ghostseo-connector'); ?></th>
                                        <th><?php esc_html_e('Avg. Position', 'ghostseo-connector'); ?></th>
                                    </tr>
                                </thead>
                                <tbody></tbody>
                            </table>
                        </div>
                    </div>

                </div>
            </div>
        </div>

        <?php elseif ($active_tab === 'snippets'): ?>
        <!-- ==================== CODE SNIPPETS TAB ==================== -->
        <div class="gp-tab-panel">

            <!-- Snippet View Toggle -->
            <div class="gp-snippets-header">
                <div class="gp-snippets-views">
                    <a href="?page=ghostseo&tab=snippets&snippet_view=active" class="gp-btn <?php echo $snippet_view !== 'trash' ? 'gp-btn-primary' : 'gp-btn-outline'; ?>">
                        <?php esc_html_e('Active Snippets', 'ghostseo-connector'); ?>
                    </a>
                    <a href="?page=ghostseo&tab=snippets&snippet_view=trash" class="gp-btn <?php echo $snippet_view === 'trash' ? 'gp-btn-primary' : 'gp-btn-outline'; ?>">
                        <?php esc_html_e('Trash', 'ghostseo-connector'); ?>
                    </a>
                </div>
                <?php if ($snippet_view !== 'trash'): ?>
                <button type="button" id="gp-add-snippet" class="gp-btn gp-btn-primary">
                    + <?php esc_html_e('Add New Snippet', 'ghostseo-connector'); ?>
                </button>
                <?php endif; ?>
            </div>

            <!-- Snippet Form (hidden by default) -->
            <div id="gp-snippet-form-wrap" class="gp-panel-card" style="display: none;">
                <h3 id="gp-snippet-form-title"><?php esc_html_e('Add New Snippet', 'ghostseo-connector'); ?></h3>
                <form id="gp-snippet-form">
                    <input type="hidden" id="gp-snippet-id" value="">
                    <div class="gp-snippet-form-grid">
                        <div class="gp-form-group gp-form-full">
                            <label for="gp-snippet-title"><?php esc_html_e('Title', 'ghostseo-connector'); ?></label>
                            <input type="text" id="gp-snippet-title" placeholder="<?php esc_attr_e('e.g. Google Analytics Script', 'ghostseo-connector'); ?>" required>
                        </div>
                        <div class="gp-form-group gp-form-full">
                            <label for="gp-snippet-description"><?php esc_html_e('Description', 'ghostseo-connector'); ?></label>
                            <input type="text" id="gp-snippet-description" placeholder="<?php esc_attr_e('Brief description of what this snippet does', 'ghostseo-connector'); ?>">
                        </div>
                        <div class="gp-form-group">
                            <label for="gp-snippet-type"><?php esc_html_e('Code Type', 'ghostseo-connector'); ?></label>
                            <select id="gp-snippet-type">
                                <option value="php">PHP</option>
                                <option value="js">JavaScript</option>
                                <option value="html">HTML</option>
                                <option value="css">CSS</option>
                                <option value="php_js">PHP + JS</option>
                                <option value="js_css">JS + CSS</option>
                                <option value="html_css">HTML + CSS</option>
                            </select>
                        </div>
                        <div class="gp-form-group">
                            <label for="gp-snippet-location"><?php esc_html_e('Location', 'ghostseo-connector'); ?></label>
                            <select id="gp-snippet-location">
                                <option value="header"><?php esc_html_e('Header', 'ghostseo-connector'); ?></option>
                                <option value="footer"><?php esc_html_e('Footer', 'ghostseo-connector'); ?></option>
                                <option value="everywhere"><?php esc_html_e('Everywhere', 'ghostseo-connector'); ?></option>
                            </select>
                        </div>
                        <div class="gp-form-group">
                            <label for="gp-snippet-priority"><?php esc_html_e('Priority', 'ghostseo-connector'); ?></label>
                            <input type="number" id="gp-snippet-priority" value="10" min="1" max="999">
                        </div>
                        <div class="gp-form-group gp-form-full">
                            <label for="gp-snippet-code"><?php esc_html_e('Code', 'ghostseo-connector'); ?></label>
                            <textarea id="gp-snippet-code" class="gp-code-editor" rows="12" placeholder="<?php esc_attr_e('Paste your code here...', 'ghostseo-connector'); ?>"></textarea>
                        </div>
                    </div>
                    <div class="gp-snippet-form-actions">
                        <button type="submit" class="gp-btn gp-btn-primary" id="gp-save-snippet">
                            <?php esc_html_e('Save Snippet', 'ghostseo-connector'); ?>
                        </button>
                        <button type="button" class="gp-btn gp-btn-outline" id="gp-cancel-snippet">
                            <?php esc_html_e('Cancel', 'ghostseo-connector'); ?>
                        </button>
                    </div>
                </form>
                <div id="gp-snippet-result" class="gp-result-box" style="display: none;"></div>
            </div>

            <!-- Snippets List -->
            <div class="gp-panel-card">
                <?php
                $filtered_snippets = array_filter($gp_snippets, function($s) use ($snippet_view) {
                    if ($snippet_view === 'trash') return !empty($s['trashed']);
                    return empty($s['trashed']);
                });
                ?>

                <?php if (empty($filtered_snippets)): ?>
                    <div class="gp-empty-state">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.3">
                            <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
                        </svg>
                        <?php if ($snippet_view === 'trash'): ?>
                            <p><?php esc_html_e('Trash is empty.', 'ghostseo-connector'); ?></p>
                        <?php else: ?>
                            <p><?php esc_html_e('No code snippets yet. Add your first snippet or let GhostSEO manage custom code for your site.', 'ghostseo-connector'); ?></p>
                        <?php endif; ?>
                    </div>
                <?php else: ?>
                    <table class="gp-snippets-table">
                        <thead>
                            <tr>
                                <th class="gp-col-status"><?php esc_html_e('Status', 'ghostseo-connector'); ?></th>
                                <th><?php esc_html_e('Title', 'ghostseo-connector'); ?></th>
                                <th><?php esc_html_e('Type', 'ghostseo-connector'); ?></th>
                                <th><?php esc_html_e('Priority', 'ghostseo-connector'); ?></th>
                                <th><?php esc_html_e('Last Edit', 'ghostseo-connector'); ?></th>
                                <th class="gp-col-actions"><?php esc_html_e('Actions', 'ghostseo-connector'); ?></th>
                            </tr>
                        </thead>
                        <tbody>
                            <?php foreach ($filtered_snippets as $snippet): ?>
                            <tr data-id="<?php echo esc_attr($snippet['id']); ?>" class="<?php echo ($snippet['status'] ?? 'inactive') !== 'active' ? 'gp-inactive-row' : ''; ?>">
                                <td class="gp-col-status">
                                    <?php if ($snippet_view !== 'trash'): ?>
                                    <button type="button" class="gp-snippet-toggle" data-id="<?php echo esc_attr($snippet['id']); ?>" data-active="<?php echo ($snippet['status'] ?? 'inactive') === 'active' ? '1' : '0'; ?>">
                                        <span class="gp-status-indicator-dot <?php echo ($snippet['status'] ?? 'inactive') === 'active' ? 'active' : 'inactive'; ?>"></span>
                                    </button>
                                    <?php endif; ?>
                                </td>
                                <td>
                                    <strong><?php echo esc_html($snippet['title'] ?? ''); ?></strong>
                                    <?php if (!empty($snippet['description'])): ?>
                                        <span class="gp-snippet-desc"><?php echo esc_html($snippet['description']); ?></span>
                                    <?php endif; ?>
                                </td>
                                <td><span class="gp-type-badge gp-type-snippet-<?php echo esc_attr($snippet['type'] ?? 'html'); ?>"><?php echo esc_html(strtoupper(str_replace('_', ' + ', $snippet['type'] ?? 'html'))); ?></span></td>
                                <td><?php echo intval($snippet['priority'] ?? 10); ?></td>
                                <td class="gp-activity-time"><?php echo esc_html($snippet['updated_at'] ?? $snippet['created_at'] ?? '-'); ?></td>
                                <td class="gp-col-actions">
                                    <?php if ($snippet_view === 'trash'): ?>
                                        <button type="button" class="gp-btn-icon gp-restore-snippet" data-id="<?php echo esc_attr($snippet['id']); ?>" title="<?php esc_attr_e('Restore', 'ghostseo-connector'); ?>">
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
                                        </button>
                                        <button type="button" class="gp-btn-icon gp-btn-danger gp-permanent-delete-snippet" data-id="<?php echo esc_attr($snippet['id']); ?>" title="<?php esc_attr_e('Delete Permanently', 'ghostseo-connector'); ?>">
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                                        </button>
                                    <?php else: ?>
                                        <button type="button" class="gp-btn-icon gp-edit-snippet" data-id="<?php echo esc_attr($snippet['id']); ?>" title="<?php esc_attr_e('Edit', 'ghostseo-connector'); ?>">
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                        </button>
                                        <button type="button" class="gp-btn-icon gp-btn-danger gp-trash-snippet" data-id="<?php echo esc_attr($snippet['id']); ?>" title="<?php esc_attr_e('Move to Trash', 'ghostseo-connector'); ?>">
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                                        </button>
                                    <?php endif; ?>
                                </td>
                            </tr>
                            <?php endforeach; ?>
                        </tbody>
                    </table>
                <?php endif; ?>
            </div>
        </div>

        <?php elseif ($active_tab === 'addons'): ?>
        <!-- ==================== ADD-ONS TAB ==================== -->
        <div class="gp-tab-panel">
            <div class="gp-panel-card">
                <h3><?php esc_html_e('Active Integrations', 'ghostseo-connector'); ?></h3>
                <p class="gp-desc"><?php esc_html_e('Active plugins that GhostSEO integrates with on your site.', 'ghostseo-connector'); ?></p>

                <div class="gp-addons-grid">
                    <?php
                    $addons = array(
                        // SEO
                        array('name' => 'Yoast SEO', 'active' => defined('WPSEO_VERSION'), 'version' => defined('WPSEO_VERSION') ? WPSEO_VERSION : '', 'desc' => __('SEO meta management', 'ghostseo-connector'), 'cat' => 'SEO'),
                        array('name' => 'Rank Math', 'active' => defined('RANK_MATH_VERSION'), 'version' => defined('RANK_MATH_VERSION') ? RANK_MATH_VERSION : '', 'desc' => __('SEO meta management', 'ghostseo-connector'), 'cat' => 'SEO'),
                        array('name' => 'All in One SEO', 'active' => defined('AIOSEO_VERSION'), 'version' => defined('AIOSEO_VERSION') ? AIOSEO_VERSION : '', 'desc' => __('SEO meta management', 'ghostseo-connector'), 'cat' => 'SEO'),
                        array('name' => 'SEOPress', 'active' => defined('SEOPRESS_VERSION'), 'version' => defined('SEOPRESS_VERSION') ? SEOPRESS_VERSION : '', 'desc' => __('SEO meta management', 'ghostseo-connector'), 'cat' => 'SEO'),
                        array('name' => 'The SEO Framework', 'active' => defined('THE_SEO_FRAMEWORK_VERSION'), 'version' => defined('THE_SEO_FRAMEWORK_VERSION') ? THE_SEO_FRAMEWORK_VERSION : '', 'desc' => __('SEO meta management', 'ghostseo-connector'), 'cat' => 'SEO'),

                        // Page Builders
                        array('name' => 'Elementor', 'active' => defined('ELEMENTOR_VERSION'), 'version' => defined('ELEMENTOR_VERSION') ? ELEMENTOR_VERSION : '', 'desc' => __('Page builder', 'ghostseo-connector'), 'cat' => __('Builders', 'ghostseo-connector')),
                        array('name' => 'Elementor Pro', 'active' => defined('ELEMENTOR_PRO_VERSION'), 'version' => defined('ELEMENTOR_PRO_VERSION') ? ELEMENTOR_PRO_VERSION : '', 'desc' => __('Page builder (Pro)', 'ghostseo-connector'), 'cat' => __('Builders', 'ghostseo-connector')),
                        array('name' => 'Beaver Builder', 'active' => class_exists('FLBuilderLoader'), 'version' => defined('FL_BUILDER_VERSION') ? FL_BUILDER_VERSION : '', 'desc' => __('Page builder', 'ghostseo-connector'), 'cat' => __('Builders', 'ghostseo-connector')),
                        array('name' => 'Divi Builder', 'active' => defined('ET_BUILDER_VERSION'), 'version' => defined('ET_BUILDER_VERSION') ? ET_BUILDER_VERSION : '', 'desc' => __('Page builder', 'ghostseo-connector'), 'cat' => __('Builders', 'ghostseo-connector')),
                        array('name' => 'WPBakery', 'active' => defined('WPB_VC_VERSION'), 'version' => defined('WPB_VC_VERSION') ? WPB_VC_VERSION : '', 'desc' => __('Page builder', 'ghostseo-connector'), 'cat' => __('Builders', 'ghostseo-connector')),
                        array('name' => 'Oxygen Builder', 'active' => defined('CT_VERSION'), 'version' => defined('CT_VERSION') ? CT_VERSION : '', 'desc' => __('Page builder', 'ghostseo-connector'), 'cat' => __('Builders', 'ghostseo-connector')),
                        array('name' => 'Bricks Builder', 'active' => defined('BRICKS_VERSION'), 'version' => defined('BRICKS_VERSION') ? BRICKS_VERSION : '', 'desc' => __('Page builder', 'ghostseo-connector'), 'cat' => __('Builders', 'ghostseo-connector')),
                        array('name' => 'Breakdance', 'active' => defined('__BREAKDANCE_VERSION'), 'version' => defined('__BREAKDANCE_VERSION') ? __BREAKDANCE_VERSION : '', 'desc' => __('Page builder', 'ghostseo-connector'), 'cat' => __('Builders', 'ghostseo-connector')),
                        array('name' => 'Gutenberg (Block Editor)', 'active' => function_exists('register_block_type'), 'version' => '', 'desc' => __('Block editor', 'ghostseo-connector'), 'cat' => __('Builders', 'ghostseo-connector')),

                        // Redirections
                        array('name' => 'Redirection', 'active' => defined('REDIRECTION_VERSION'), 'version' => defined('REDIRECTION_VERSION') ? REDIRECTION_VERSION : '', 'desc' => __('Redirect management', 'ghostseo-connector'), 'cat' => __('Redirections', 'ghostseo-connector')),
                        array('name' => '301 Redirects', 'active' => is_plugin_active('eps-301-redirects/eps-301-redirects.php') || class_exists('EPS_Redirects'), 'version' => '', 'desc' => __('Redirect management', 'ghostseo-connector'), 'cat' => __('Redirections', 'ghostseo-connector')),
                        array('name' => 'Safe Redirect Manager', 'active' => class_exists('SRM_Redirect'), 'version' => '', 'desc' => __('Redirect management', 'ghostseo-connector'), 'cat' => __('Redirections', 'ghostseo-connector')),

                        // Fields & Data
                        array('name' => 'Advanced Custom Fields', 'active' => class_exists('ACF'), 'version' => defined('ACF_VERSION') ? ACF_VERSION : '', 'desc' => __('Custom field management', 'ghostseo-connector'), 'cat' => __('Fields & Data', 'ghostseo-connector')),
                        array('name' => 'Meta Box', 'active' => class_exists('RWMB_Loader'), 'version' => defined('RWMB_VER') ? RWMB_VER : '', 'desc' => __('Custom field management', 'ghostseo-connector'), 'cat' => __('Fields & Data', 'ghostseo-connector')),
                        array('name' => 'Pods', 'active' => defined('PODS_VERSION'), 'version' => defined('PODS_VERSION') ? PODS_VERSION : '', 'desc' => __('Custom content types & fields', 'ghostseo-connector'), 'cat' => __('Fields & Data', 'ghostseo-connector')),

                        // E-commerce
                        array('name' => 'WooCommerce', 'active' => class_exists('WooCommerce'), 'version' => defined('WC_VERSION') ? WC_VERSION : '', 'desc' => __('Product management', 'ghostseo-connector'), 'cat' => __('E-commerce', 'ghostseo-connector')),

                        // Performance & Caching
                        array('name' => 'WP Rocket', 'active' => defined('WP_ROCKET_VERSION'), 'version' => defined('WP_ROCKET_VERSION') ? WP_ROCKET_VERSION : '', 'desc' => __('Caching & performance', 'ghostseo-connector'), 'cat' => __('Performance', 'ghostseo-connector')),
                        array('name' => 'LiteSpeed Cache', 'active' => defined('LSCWP_V'), 'version' => defined('LSCWP_V') ? LSCWP_V : '', 'desc' => __('Caching & performance', 'ghostseo-connector'), 'cat' => __('Performance', 'ghostseo-connector')),
                        array('name' => 'W3 Total Cache', 'active' => defined('W3TC'), 'version' => defined('W3TC_VERSION') ? W3TC_VERSION : '', 'desc' => __('Caching & performance', 'ghostseo-connector'), 'cat' => __('Performance', 'ghostseo-connector')),
                        array('name' => 'WP Super Cache', 'active' => function_exists('wp_cache_phase2'), 'version' => '', 'desc' => __('Caching & performance', 'ghostseo-connector'), 'cat' => __('Performance', 'ghostseo-connector')),

                        // Multilingual
                        array('name' => 'WPML', 'active' => defined('ICL_SITEPRESS_VERSION'), 'version' => defined('ICL_SITEPRESS_VERSION') ? ICL_SITEPRESS_VERSION : '', 'desc' => __('Multilingual', 'ghostseo-connector'), 'cat' => __('Multilingual', 'ghostseo-connector')),
                        array('name' => 'Polylang', 'active' => defined('POLYLANG_VERSION'), 'version' => defined('POLYLANG_VERSION') ? POLYLANG_VERSION : '', 'desc' => __('Multilingual', 'ghostseo-connector'), 'cat' => __('Multilingual', 'ghostseo-connector')),
                        array('name' => 'TranslatePress', 'active' => defined('TRP_PLUGIN_VERSION'), 'version' => defined('TRP_PLUGIN_VERSION') ? TRP_PLUGIN_VERSION : '', 'desc' => __('Multilingual', 'ghostseo-connector'), 'cat' => __('Multilingual', 'ghostseo-connector')),
                    );

                    // Filter to only active plugins
                    $active_addons = array_filter($addons, function($a) { return $a['active']; });

                    // Group by category
                    $grouped = array();
                    foreach ($active_addons as $addon) {
                        $cat = $addon['cat'] ?? '';
                        if (!isset($grouped[$cat])) $grouped[$cat] = array();
                        $grouped[$cat][] = $addon;
                    }
                    ?>

                    <?php if (empty($grouped)): ?>
                        <div class="gp-empty-state">
                            <p><?php esc_html_e('No supported integrations detected on this site.', 'ghostseo-connector'); ?></p>
                        </div>
                    <?php else: ?>
                        <?php foreach ($grouped as $category => $items): ?>
                        <div class="gp-addon-category">
                            <h4 class="gp-addon-category-title"><?php echo esc_html($category); ?></h4>
                            <?php foreach ($items as $addon): ?>
                            <div class="gp-addon-card gp-addon-active">
                                <div class="gp-addon-status">
                                    <span class="gp-addon-dot active"></span>
                                </div>
                                <div class="gp-addon-info">
                                    <strong><?php echo esc_html($addon['name']); ?></strong>
                                    <span class="gp-addon-desc"><?php echo esc_html($addon['desc']); ?></span>
                                </div>
                                <?php if ($addon['version']): ?>
                                    <span class="gp-addon-version">v<?php echo esc_html($addon['version']); ?></span>
                                <?php endif; ?>
                            </div>
                            <?php endforeach; ?>
                        </div>
                        <?php endforeach; ?>
                    <?php endif; ?>
                </div>
            </div>
        </div>

        <?php endif; ?>

    </div>
</div>
`;
}
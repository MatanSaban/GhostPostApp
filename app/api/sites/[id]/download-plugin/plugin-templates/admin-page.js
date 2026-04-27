/**
 * Generate Dashboard Admin Page view
 * (renamed from settings-page.php to dashboard-page.php)
 */
export function getAdminPage() {
  return `<?php
/**
 * GhostSEO Connector - Dashboard Page
 * Premium SaaS-style admin interface
 */

if (!defined('ABSPATH')) {
    exit;
}

$status = get_option('gp_connector_connection_status', 'unknown');
$last_ping = get_option('gp_connector_last_ping', null);
$dir = GP_I18n::dir_attr();
$gp_theme = get_option('gp_connector_theme', 'light');
$theme_class = ($gp_theme === 'light') ? 'gp-theme-light' : '';

// Get redirect plugin detection
$redir_manager = new GP_Redirections_Manager();
$detected_redir_plugins = $redir_manager->detect_plugins();

// Status helpers
$status_labels = array(
    'connected'    => __('Connected', 'ghost-post-connector'),
    'disconnected' => __('Disconnected', 'ghost-post-connector'),
    'error'        => __('Connection Error', 'ghost-post-connector'),
);
$status_text = $status_labels[$status] ?? __('Unknown', 'ghost-post-connector');
?>

<div class="wrap gp-wrap gp-dashboard-page <?php echo esc_attr($theme_class); ?>" dir="<?php echo esc_attr($dir); ?>">

    <!-- Header -->
    <div class="gp-header">
        <svg class="gp-header-icon" width="36" height="36" viewBox="0 0 150 150" xmlns="http://www.w3.org/2000/svg"><path fill="#8231F1" fill-rule="evenodd" clip-rule="evenodd" d="M75.5461 3.00018C108.904 3.08102 135.88 30.1882 135.799 63.5461C135.782 70.4471 134.608 77.0746 132.462 83.2463C128.767 94.9403 114.793 138.722 116.926 125.109C119.38 109.444 115.241 108.796 115.241 108.796C115.241 108.796 108.932 134.279 99.1515 142.226C97.432 143.945 92.4613 124.597 91.5666 121.612C75.2533 142.837 60.6398 146.505 60.6398 146.505C57.975 145.585 68.0358 128.033 53.4728 119.945C53.3927 120.061 32.9192 149.64 37.174 135.183C41.4231 120.744 34.0604 107.477 34.0129 107.392C34.0129 107.392 28.4578 110.169 23.3517 121.612C23.2612 121.814 23.1625 121.884 23.0558 121.834C25.0063 112.559 20.6972 92.9492 18.05 82.4025C16.0562 76.3826 14.984 69.9435 15.0002 63.2531C15.0811 29.8953 42.1883 2.91935 75.5461 3.00018ZM98.7795 39.343C93.1724 38.8818 88.0574 45.4345 87.3547 53.9787C86.6521 62.5227 90.6275 69.8232 96.2346 70.2844C101.842 70.7455 106.956 64.1927 107.659 55.6486C108.362 47.1044 104.387 39.8041 98.7795 39.343ZM64.6467 53.8635C63.8471 45.3278 58.6574 38.8329 53.0558 39.3576C47.4546 39.8825 43.5621 47.2275 44.3615 55.7629C45.1611 64.2984 50.3499 70.7932 55.9514 70.2687C61.5528 69.744 65.4461 62.399 64.6467 53.8635Z"/></svg>
        <h1 class="gp-header-title"><?php esc_html_e('GhostSEO', 'ghost-post-connector'); ?></h1>
        <span class="gp-header-subtitle">v<?php echo esc_html(GP_CONNECTOR_VERSION); ?></span>
    </div>

    <!-- Status Hero -->
    <div class="gp-status-hero gp-status-<?php echo esc_attr($status); ?>">
        <span class="gp-status-pulse"></span>
        <span class="gp-status-label"><?php echo esc_html($status_text); ?></span>
        <?php if ($last_ping): ?>
        <span class="gp-status-meta">
            <?php
            printf(
                esc_html__('Last ping %s ago', 'ghost-post-connector'),
                human_time_diff($last_ping)
            );
            ?>
        </span>
        <?php endif; ?>
    </div>

    <!-- Two-column card grid: Site Info + Detected Plugins -->
    <div class="gp-card-grid">

        <!-- Site Information Card -->
        <div class="gp-card">
            <div class="gp-card-header">
                <svg class="gp-card-icon" width="20" height="20" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                <h2 class="gp-card-title"><?php esc_html_e('Site Information', 'ghost-post-connector'); ?></h2>
            </div>

            <table class="gp-info-table">
                <tr>
                    <th><?php esc_html_e('Site Key', 'ghost-post-connector'); ?></th>
                    <td>
                        <span class="gp-secret-wrap">
                            <code class="gp-secret-value gp-blurred"><?php echo esc_html(GP_SITE_KEY); ?></code>
                            <button type="button" class="gp-secret-toggle" title="<?php esc_attr_e('Show/Hide', 'ghost-post-connector'); ?>">
                                <svg class="gp-eye-icon" width="16" height="16" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                                <svg class="gp-eye-off-icon" width="16" height="16" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:none"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                            </button>
                        </span>
                    </td>
                </tr>
                <tr>
                    <th><?php esc_html_e('Site ID', 'ghost-post-connector'); ?></th>
                    <td>
                        <span class="gp-secret-wrap">
                            <code class="gp-secret-value gp-blurred"><?php echo esc_html(GP_SITE_ID); ?></code>
                            <button type="button" class="gp-secret-toggle" title="<?php esc_attr_e('Show/Hide', 'ghost-post-connector'); ?>">
                                <svg class="gp-eye-icon" width="16" height="16" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                                <svg class="gp-eye-off-icon" width="16" height="16" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:none"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                            </button>
                        </span>
                    </td>
                </tr>
                <tr>
                    <th><?php esc_html_e('API URL', 'ghost-post-connector'); ?></th>
                    <td><code><?php echo esc_html(GP_API_URL); ?></code></td>
                </tr>
                <tr>
                    <th><?php esc_html_e('Plugin', 'ghost-post-connector'); ?></th>
                    <td>
                        <?php echo esc_html(GP_CONNECTOR_VERSION); ?>
                        <button type="button" class="gp-btn gp-btn-secondary gp-btn-sm" id="gp-check-updates" style="margin-inline-start: 8px;">
                            <?php esc_html_e('Check for Updates', 'ghost-post-connector'); ?>
                        </button>
                    </td>
                </tr>
                <tr>
                    <th><?php esc_html_e('WordPress', 'ghost-post-connector'); ?></th>
                    <td><?php echo esc_html(get_bloginfo('version')); ?></td>
                </tr>
                <tr>
                    <th><?php esc_html_e('PHP', 'ghost-post-connector'); ?></th>
                    <td><?php echo esc_html(phpversion()); ?></td>
                </tr>
            </table>
        </div>

        <!-- Detected Plugins Card -->
        <div class="gp-card">
            <div class="gp-card-header">
                <svg class="gp-card-icon" width="20" height="20" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
                <h2 class="gp-card-title"><?php esc_html_e('Detected Plugins', 'ghost-post-connector'); ?></h2>
            </div>

            <ul class="gp-plugins-list">
                <li>
                    <span class="gp-plugin-status <?php echo defined('WPSEO_VERSION') ? 'gp-plugin-active' : 'gp-plugin-inactive'; ?>"></span>
                    <span class="gp-plugin-name"><?php esc_html_e('Yoast SEO', 'ghost-post-connector'); ?></span>
                    <?php if (defined('WPSEO_VERSION')): ?>
                        <span class="gp-plugin-version"><?php echo esc_html(WPSEO_VERSION); ?></span>
                    <?php else: ?>
                        <span class="gp-badge gp-badge-neutral"><?php esc_html_e('Not installed', 'ghost-post-connector'); ?></span>
                    <?php endif; ?>
                </li>
                <li>
                    <span class="gp-plugin-status <?php echo defined('RANK_MATH_VERSION') ? 'gp-plugin-active' : 'gp-plugin-inactive'; ?>"></span>
                    <span class="gp-plugin-name"><?php esc_html_e('Rank Math', 'ghost-post-connector'); ?></span>
                    <?php if (defined('RANK_MATH_VERSION')): ?>
                        <span class="gp-plugin-version"><?php echo esc_html(RANK_MATH_VERSION); ?></span>
                    <?php else: ?>
                        <span class="gp-badge gp-badge-neutral"><?php esc_html_e('Not installed', 'ghost-post-connector'); ?></span>
                    <?php endif; ?>
                </li>
                <li>
                    <span class="gp-plugin-status <?php echo class_exists('ACF') ? 'gp-plugin-active' : 'gp-plugin-inactive'; ?>"></span>
                    <span class="gp-plugin-name"><?php esc_html_e('Advanced Custom Fields', 'ghost-post-connector'); ?></span>
                    <?php if (defined('ACF_VERSION')): ?>
                        <span class="gp-plugin-version"><?php echo esc_html(ACF_VERSION); ?></span>
                    <?php else: ?>
                        <span class="gp-badge gp-badge-neutral"><?php esc_html_e('Not installed', 'ghost-post-connector'); ?></span>
                    <?php endif; ?>
                </li>
            </ul>

            <?php if (!empty($detected_redir_plugins)): ?>
                <hr class="gp-divider">
                <p class="gp-section-label"><?php esc_html_e('Redirection Plugins', 'ghost-post-connector'); ?></p>
                <ul class="gp-plugins-list">
                    <?php foreach ($detected_redir_plugins as $rp): ?>
                    <li>
                        <span class="gp-plugin-status gp-plugin-active"></span>
                        <span class="gp-plugin-name"><?php echo esc_html($rp['name']); ?></span>
                        <?php if (!empty($rp['version'])): ?>
                            <span class="gp-plugin-version"><?php echo esc_html($rp['version']); ?></span>
                        <?php endif; ?>
                        <a href="<?php echo esc_url(admin_url('admin.php?page=ghost-post-redirections')); ?>" class="gp-btn gp-btn-secondary gp-btn-sm gp-plugin-action">
                            <?php esc_html_e('Manage', 'ghost-post-connector'); ?>
                        </a>
                    </li>
                    <?php endforeach; ?>
                </ul>
            <?php endif; ?>
        </div>

    </div><!-- .gp-card-grid -->

    <!-- Footer -->
    <div class="gp-footer">
        <?php
        printf(
            esc_html__('Powered by %s', 'ghost-post-connector'),
            '<a href="https://ghostpost.co.il" target="_blank" rel="noopener">GhostSEO</a>'
        );
        ?>
    </div>

</div>
`;
}

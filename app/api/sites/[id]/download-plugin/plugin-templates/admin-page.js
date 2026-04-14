/**
 * Generate Dashboard Admin Page view
 * (renamed from settings-page.php to dashboard-page.php)
 */
export function getAdminPage() {
  return `<?php
/**
 * Ghost Post Connector - Dashboard Page
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
        <svg class="gp-header-icon" width="36" height="36" viewBox="0 0 335 288" xmlns="http://www.w3.org/2000/svg"><path fill="#9B4DE0" d="M313.736 127.747C313.681 123.229 311.924 112.362 311.064 107.716C310.204 103.051 314.797 91.8007 316.819 83.2673C319.527 71.8339 320.341 61.5991 317.176 56.0377C314.477 51.2909 291.961 52.5258 282.775 53.6596C279.985 54.0075 268.283 35.1105 244.669 21.3816C223.682 9.1892 191.825 2 170.691 2C109.758 2 57.627 39.0527 36.3828 91.4716C36.2181 91.8834 30.8934 90.4471 22.6775 91.7827C14.2422 93.1547 2.89737 97.3531 2.11054 101.35C1.27798 105.557 5.23035 120.045 11.2047 130.555C17.6822 141.943 25.3491 149.745 25.3948 150.842C27.8376 204.916 61.9816 250.649 109.2 272.491C122.796 278.784 144.195 286.732 170.691 285.946C245.804 283.723 302.995 213.469 325.144 145.903C330.085 130.829 333.15 116.926 332.994 108.777C332.985 108.118 332.299 107.689 331.695 107.972C327.697 109.847 316.087 116.067 313.525 118.683Z"/></svg>
        <h1 class="gp-header-title"><?php esc_html_e('Ghost Post', 'ghost-post-connector'); ?></h1>
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
            '<a href="https://ghostpost.co.il" target="_blank" rel="noopener">Ghost Post</a>'
        );
        ?>
    </div>

</div>
`;
}

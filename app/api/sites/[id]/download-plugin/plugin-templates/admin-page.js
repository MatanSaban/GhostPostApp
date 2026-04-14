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
        <img src="<?php echo esc_url(GP_CONNECTOR_PLUGIN_URL . 'assets/icon.svg'); ?>"
             alt="Ghost Post"
             class="gp-header-icon"
             width="36" height="36"
             onerror="this.style.display='none'">
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
                    <td><code><?php echo esc_html(GP_SITE_KEY); ?></code></td>
                </tr>
                <tr>
                    <th><?php esc_html_e('Site ID', 'ghost-post-connector'); ?></th>
                    <td><code><?php echo esc_html(GP_SITE_ID); ?></code></td>
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

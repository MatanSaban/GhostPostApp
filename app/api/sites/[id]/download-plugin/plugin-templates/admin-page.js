/**
 * Generate Dashboard Admin Page view
 * (renamed from settings-page.php to dashboard-page.php)
 */
export function getAdminPage() {
  return `<?php
/**
 * Ghost Post Connector - Dashboard Page
 */

if (!defined('ABSPATH')) {
    exit;
}

$status = get_option('gp_connector_connection_status', 'unknown');
$dir = GP_I18n::dir_attr();

// Get redirect plugin detection
$redir_manager = new GP_Redirections_Manager();
$detected_redir_plugins = $redir_manager->detect_plugins();
?>

<div class="wrap gp-connector-settings gp-dashboard-page" dir="<?php echo esc_attr($dir); ?>">
    <h1>
        <img src="<?php echo esc_url(GP_CONNECTOR_PLUGIN_URL . 'assets/icon.svg'); ?>"
             alt="Ghost Post"
             class="gp-logo"
             onerror="this.style.display='none'">
        <?php esc_html_e('Ghost Post Connector', 'ghost-post-connector'); ?>
    </h1>

    <!-- Quick Status -->
    <div class="gp-card">
        <div class="gp-status-indicator gp-status-<?php echo esc_attr($status); ?>">
            <span class="gp-status-dot"></span>
            <span class="gp-status-text">
                <?php
                switch ($status) {
                    case 'connected':
                        esc_html_e('Connected', 'ghost-post-connector');
                        break;
                    case 'disconnected':
                        esc_html_e('Disconnected', 'ghost-post-connector');
                        break;
                    case 'error':
                        esc_html_e('Error', 'ghost-post-connector');
                        break;
                    default:
                        esc_html_e('Unknown', 'ghost-post-connector');
                }
                ?>
            </span>
        </div>
    </div>

    <!-- Site Information -->
    <div class="gp-card">
        <h2><?php esc_html_e('Site Information', 'ghost-post-connector'); ?></h2>

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
                <th><?php esc_html_e('Plugin Version', 'ghost-post-connector'); ?></th>
                <td>
                    <?php echo esc_html(GP_CONNECTOR_VERSION); ?>
                    <button type="button" class="button button-small" id="gp-check-updates" style="margin-inline-start: 10px;">
                        <?php esc_html_e('Check for Updates', 'ghost-post-connector'); ?>
                    </button>
                </td>
            </tr>
            <tr>
                <th><?php esc_html_e('WordPress Version', 'ghost-post-connector'); ?></th>
                <td><?php echo esc_html(get_bloginfo('version')); ?></td>
            </tr>
            <tr>
                <th><?php esc_html_e('PHP Version', 'ghost-post-connector'); ?></th>
                <td><?php echo esc_html(phpversion()); ?></td>
            </tr>
        </table>
    </div>

    <!-- Detected Plugins -->
    <div class="gp-card">
        <h2><?php esc_html_e('Detected Plugins', 'ghost-post-connector'); ?></h2>

        <ul class="gp-plugins-list">
            <li>
                <span class="dashicons <?php echo defined('WPSEO_VERSION') ? 'dashicons-yes' : 'dashicons-no'; ?>"></span>
                <?php esc_html_e('Yoast SEO', 'ghost-post-connector'); ?>
                <?php if (defined('WPSEO_VERSION')): ?>
                    <span class="gp-version"><?php echo esc_html(WPSEO_VERSION); ?></span>
                <?php endif; ?>
            </li>
            <li>
                <span class="dashicons <?php echo defined('RANK_MATH_VERSION') ? 'dashicons-yes' : 'dashicons-no'; ?>"></span>
                <?php esc_html_e('RankMath', 'ghost-post-connector'); ?>
                <?php if (defined('RANK_MATH_VERSION')): ?>
                    <span class="gp-version"><?php echo esc_html(RANK_MATH_VERSION); ?></span>
                <?php endif; ?>
            </li>
            <li>
                <span class="dashicons <?php echo class_exists('ACF') ? 'dashicons-yes' : 'dashicons-no'; ?>"></span>
                <?php esc_html_e('Advanced Custom Fields', 'ghost-post-connector'); ?>
                <?php if (defined('ACF_VERSION')): ?>
                    <span class="gp-version"><?php echo esc_html(ACF_VERSION); ?></span>
                <?php endif; ?>
            </li>
        </ul>

        <h3><?php esc_html_e('Redirection Plugins', 'ghost-post-connector'); ?></h3>
        <?php if (!empty($detected_redir_plugins)): ?>
            <ul class="gp-plugins-list">
                <?php foreach ($detected_redir_plugins as $rp): ?>
                <li>
                    <span class="dashicons dashicons-yes"></span>
                    <?php echo esc_html($rp['name']); ?>
                    <?php if (!empty($rp['version'])): ?>
                        <span class="gp-version"><?php echo esc_html($rp['version']); ?></span>
                    <?php endif; ?>
                    <a href="<?php echo esc_url(admin_url('admin.php?page=ghost-post-redirections')); ?>" class="button button-small" style="margin-inline-start: auto;">
                        <?php esc_html_e('Manage Redirections', 'ghost-post-connector'); ?>
                    </a>
                </li>
                <?php endforeach; ?>
            </ul>
        <?php else: ?>
            <p class="description"><?php esc_html_e('No redirection plugins detected.', 'ghost-post-connector'); ?></p>
        <?php endif; ?>
    </div>
</div>
`;
}

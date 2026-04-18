/**
 * Generate Settings/Main Admin Page view — unified tabbed layout
 */
export function getSettingsPage() {
  return `<?php
/**
 * Ghost Post Admin — unified tabbed settings page
 */

if (!defined('ABSPATH')) {
    exit;
}

$connection_status = get_option('gp_connector_connection_status', '');
$connection_verified = $connection_status === 'connected';
$last_check = get_option('gp_last_connection_check', '');
$last_ping  = get_option('gp_last_ping', '');
$permissions = get_option('gp_connector_permissions', array());

$is_configured = defined('GP_SITE_KEY') && !empty(GP_SITE_KEY) && strpos(GP_SITE_KEY, '__GP_') === false;

$redirections_manager = new GP_Redirections_Manager();
$detected_redirect_plugins = $redirections_manager->detect_plugins();
$primary_plugin   = $redirections_manager->get_primary_plugin();
$redirects        = $redirections_manager->get_gp_redirects();
$external_redirects = ($primary_plugin && $primary_plugin !== 'ghost-post') ? $redirections_manager->get_all_redirects() : array();
$has_external_plugin = !empty($detected_redirect_plugins);
$is_connected = $connection_verified;

$active_tab = isset($_GET['tab']) ? sanitize_key($_GET['tab']) : 'connection';
$allowed_tabs = array('connection', 'settings', 'activity', 'redirections', 'addons');
if (!in_array($active_tab, $allowed_tabs, true)) {
    $active_tab = 'connection';
}

$platform_url = defined('GP_API_URL') ? GP_API_URL : 'https://app.ghostpost.co.il';
$site_key_display = defined('GP_SITE_KEY') ? GP_SITE_KEY : '';
$masked_key = $is_configured ? substr($site_key_display, 0, 8) . '...' . substr($site_key_display, -4) : '';
?>

<div class="gp-admin-wrap">
    <!-- Top Bar -->
    <div class="gp-topbar">
        <nav class="gp-tabs">
            <a href="?page=ghost-post-connector&tab=connection" class="gp-tab <?php echo $active_tab === 'connection' ? 'gp-tab-active' : ''; ?>">
                <?php esc_html_e('Connection', 'ghost-post-connector'); ?>
            </a>
            <a href="?page=ghost-post-connector&tab=settings" class="gp-tab <?php echo $active_tab === 'settings' ? 'gp-tab-active' : ''; ?>">
                <?php esc_html_e('Settings', 'ghost-post-connector'); ?>
            </a>
            <a href="?page=ghost-post-connector&tab=activity" class="gp-tab <?php echo $active_tab === 'activity' ? 'gp-tab-active' : ''; ?>">
                <?php esc_html_e('Activity', 'ghost-post-connector'); ?>
            </a>
            <a href="?page=ghost-post-connector&tab=redirections" class="gp-tab <?php echo $active_tab === 'redirections' ? 'gp-tab-active' : ''; ?>">
                <?php esc_html_e('Redirections', 'ghost-post-connector'); ?>
            </a>
            <a href="?page=ghost-post-connector&tab=addons" class="gp-tab <?php echo $active_tab === 'addons' ? 'gp-tab-active' : ''; ?>">
                <?php esc_html_e('Add-ons', 'ghost-post-connector'); ?>
            </a>
        </nav>
        <div class="gp-topbar-brand">
            <span class="gp-version">v<?php echo esc_html(GP_CONNECTOR_VERSION); ?></span>
            <img src="<?php echo esc_url($platform_url . '/logo.png'); ?>" alt="Ghost Post" class="gp-topbar-logo">
        </div>
    </div>

    <!-- Tab Content -->
    <div class="gp-content">

        <?php if ($active_tab === 'connection'): ?>
        <!-- ==================== CONNECTION TAB ==================== -->
        <div class="gp-tab-panel">
            <div class="gp-connect-card">
                <div class="gp-connect-icon">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                    </svg>
                </div>

                <?php if ($connection_verified): ?>
                    <h2><?php esc_html_e('Your site is connected to Ghost Post', 'ghost-post-connector'); ?></h2>
                    <p class="gp-connect-desc">
                        <?php esc_html_e('Ghost Post is managing this site. All systems are operational.', 'ghost-post-connector'); ?>
                    </p>

                    <div class="gp-connection-details">
                        <table class="gp-info-table">
                            <tr>
                                <th><?php esc_html_e('Site Key', 'ghost-post-connector'); ?></th>
                                <td><code><?php echo esc_html($masked_key); ?></code></td>
                            </tr>
                            <tr>
                                <th><?php esc_html_e('Platform URL', 'ghost-post-connector'); ?></th>
                                <td><code><?php echo esc_html(defined('GP_PLATFORM_API_URL') ? GP_PLATFORM_API_URL : $platform_url); ?></code></td>
                            </tr>
                            <tr>
                                <th><?php esc_html_e('Last Check', 'ghost-post-connector'); ?></th>
                                <td><?php echo $last_check ? esc_html($last_check) : esc_html__('Never', 'ghost-post-connector'); ?></td>
                            </tr>
                            <tr>
                                <th><?php esc_html_e('Last Ping', 'ghost-post-connector'); ?></th>
                                <td><?php echo $last_ping ? esc_html($last_ping) : esc_html__('Never', 'ghost-post-connector'); ?></td>
                            </tr>
                        </table>
                    </div>

                    <div class="gp-connect-actions">
                        <button type="button" id="gp-test-connection" class="gp-btn gp-btn-primary">
                            <?php esc_html_e('Test Connection', 'ghost-post-connector'); ?>
                        </button>
                        <button type="button" id="gp-send-ping" class="gp-btn gp-btn-outline">
                            <?php esc_html_e('Send Ping', 'ghost-post-connector'); ?>
                        </button>
                    </div>

                <?php elseif ($is_configured): ?>
                    <h2><?php esc_html_e('Connect your site to Ghost Post', 'ghost-post-connector'); ?></h2>
                    <p class="gp-connect-desc">
                        <?php esc_html_e('Copy your Access Key and paste it at', 'ghost-post-connector'); ?>
                        <a href="<?php echo esc_url($platform_url); ?>" target="_blank" rel="noopener noreferrer">ghostpost.co.il</a>
                        <?php esc_html_e('to start managing this site with AI.', 'ghost-post-connector'); ?>
                    </p>

                    <div class="gp-key-row">
                        <button type="button" id="gp-copy-key" class="gp-btn gp-btn-primary">
                            <?php esc_html_e('Copy Key', 'ghost-post-connector'); ?>
                        </button>
                        <div class="gp-key-display">
                            <code id="gp-site-key-value"><?php echo esc_html($masked_key); ?></code>
                        </div>
                    </div>

                    <a href="<?php echo esc_url($platform_url . '/dashboard/settings?siteKey=' . urlencode($site_key_display)); ?>" target="_blank" rel="noopener noreferrer" class="gp-btn gp-btn-connect">
                        &rarr; <?php esc_html_e('Connect to Ghost Post', 'ghost-post-connector'); ?>
                    </a>
                    <p class="gp-connect-hint"><?php esc_html_e('Opens Ghost Post with your key pre-filled.', 'ghost-post-connector'); ?></p>

                <?php else: ?>
                    <h2><?php esc_html_e('Connect your site to Ghost Post', 'ghost-post-connector'); ?></h2>
                    <div class="gp-notice gp-notice-warning">
                        <p><?php esc_html_e('Plugin is not configured. Please download a fresh plugin from your Ghost Post dashboard.', 'ghost-post-connector'); ?></p>
                    </div>
                <?php endif; ?>

                <div id="gp-connection-result" class="gp-result-box" style="display: none;"></div>
            </div>

            <!-- Steps row -->
            <div class="gp-steps-row">
                <div class="gp-step-card">
                    <span class="gp-step-num">4</span>
                    <strong><?php esc_html_e('Start managing', 'ghost-post-connector'); ?></strong>
                    <span class="gp-step-hint"><?php esc_html_e('Use AI to manage your site', 'ghost-post-connector'); ?></span>
                </div>
                <div class="gp-step-card">
                    <span class="gp-step-num">3</span>
                    <strong><?php esc_html_e('Paste your key', 'ghost-post-connector'); ?></strong>
                    <span class="gp-step-hint"><?php esc_html_e('Enter your site URL + key', 'ghost-post-connector'); ?></span>
                </div>
                <div class="gp-step-card">
                    <span class="gp-step-num">2</span>
                    <strong><?php esc_html_e('Go to ghostpost.co.il', 'ghost-post-connector'); ?></strong>
                    <span class="gp-step-hint"><?php esc_html_e('Create or open a project', 'ghost-post-connector'); ?></span>
                </div>
                <div class="gp-step-card">
                    <span class="gp-step-num">1</span>
                    <strong><?php esc_html_e('Copy your Access Key', 'ghost-post-connector'); ?></strong>
                    <span class="gp-step-hint"><?php esc_html_e('Click the button above', 'ghost-post-connector'); ?></span>
                </div>
            </div>

            <!-- Site Info -->
            <div class="gp-site-info-card">
                <h3><?php esc_html_e('Site Information', 'ghost-post-connector'); ?></h3>
                <table class="gp-info-table">
                    <tr>
                        <th><?php esc_html_e('Site URL', 'ghost-post-connector'); ?></th>
                        <td><code><?php echo esc_html(get_site_url()); ?></code></td>
                    </tr>
                    <tr>
                        <th><?php esc_html_e('WordPress Version', 'ghost-post-connector'); ?></th>
                        <td><?php echo esc_html(get_bloginfo('version')); ?></td>
                    </tr>
                    <tr>
                        <th><?php esc_html_e('PHP Version', 'ghost-post-connector'); ?></th>
                        <td><?php echo esc_html(phpversion()); ?></td>
                    </tr>
                    <tr>
                        <th><?php esc_html_e('Plugin Version', 'ghost-post-connector'); ?></th>
                        <td><?php echo esc_html(GP_CONNECTOR_VERSION); ?></td>
                    </tr>
                    <tr>
                        <th><?php esc_html_e('REST API', 'ghost-post-connector'); ?></th>
                        <td><code><?php echo esc_html(rest_url('ghost-post/v1/')); ?></code></td>
                    </tr>
                </table>
            </div>
        </div>

        <?php elseif ($active_tab === 'settings'): ?>
        <!-- ==================== SETTINGS TAB ==================== -->
        <div class="gp-tab-panel">
            <div class="gp-panel-card">
                <h3><?php esc_html_e('Permissions', 'ghost-post-connector'); ?></h3>
                <p class="gp-desc"><?php esc_html_e('Control what Ghost Post can do on your site.', 'ghost-post-connector'); ?></p>

                <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>">
                    <?php wp_nonce_field('gp_save_permissions', 'gp_permissions_nonce'); ?>
                    <input type="hidden" name="action" value="gp_save_permissions">

                    <div class="gp-permissions-grid">
                        <div class="gp-permission-group">
                            <h4><?php esc_html_e('Content', 'ghost-post-connector'); ?></h4>
                            <label><input type="checkbox" name="permissions[CONTENT_READ]" value="1" <?php checked(!empty($permissions['CONTENT_READ'])); ?>> <?php esc_html_e('Read posts/pages', 'ghost-post-connector'); ?></label>
                            <label><input type="checkbox" name="permissions[CONTENT_CREATE]" value="1" <?php checked(!empty($permissions['CONTENT_CREATE'])); ?>> <?php esc_html_e('Create posts/pages', 'ghost-post-connector'); ?></label>
                            <label><input type="checkbox" name="permissions[CONTENT_UPDATE]" value="1" <?php checked(!empty($permissions['CONTENT_UPDATE'])); ?>> <?php esc_html_e('Update posts/pages', 'ghost-post-connector'); ?></label>
                            <label><input type="checkbox" name="permissions[CONTENT_DELETE]" value="1" <?php checked(!empty($permissions['CONTENT_DELETE'])); ?>> <?php esc_html_e('Delete posts/pages', 'ghost-post-connector'); ?></label>
                        </div>

                        <div class="gp-permission-group">
                            <h4><?php esc_html_e('Media', 'ghost-post-connector'); ?></h4>
                            <label><input type="checkbox" name="permissions[MEDIA_UPLOAD]" value="1" <?php checked(!empty($permissions['MEDIA_UPLOAD'])); ?>> <?php esc_html_e('Upload media', 'ghost-post-connector'); ?></label>
                            <label><input type="checkbox" name="permissions[MEDIA_DELETE]" value="1" <?php checked(!empty($permissions['MEDIA_DELETE'])); ?>> <?php esc_html_e('Delete media', 'ghost-post-connector'); ?></label>
                        </div>

                        <div class="gp-permission-group">
                            <h4><?php esc_html_e('SEO', 'ghost-post-connector'); ?></h4>
                            <label><input type="checkbox" name="permissions[SEO_UPDATE]" value="1" <?php checked(!empty($permissions['SEO_UPDATE'])); ?>> <?php esc_html_e('Update SEO meta', 'ghost-post-connector'); ?></label>
                        </div>

                        <div class="gp-permission-group">
                            <h4><?php esc_html_e('Custom Post Types', 'ghost-post-connector'); ?></h4>
                            <label><input type="checkbox" name="permissions[CPT_READ]" value="1" <?php checked(!empty($permissions['CPT_READ'])); ?>> <?php esc_html_e('Read CPT items', 'ghost-post-connector'); ?></label>
                            <label><input type="checkbox" name="permissions[CPT_CREATE]" value="1" <?php checked(!empty($permissions['CPT_CREATE'])); ?>> <?php esc_html_e('Create CPT items', 'ghost-post-connector'); ?></label>
                            <label><input type="checkbox" name="permissions[CPT_UPDATE]" value="1" <?php checked(!empty($permissions['CPT_UPDATE'])); ?>> <?php esc_html_e('Update CPT items', 'ghost-post-connector'); ?></label>
                            <label><input type="checkbox" name="permissions[CPT_DELETE]" value="1" <?php checked(!empty($permissions['CPT_DELETE'])); ?>> <?php esc_html_e('Delete CPT items', 'ghost-post-connector'); ?></label>
                        </div>

                        <div class="gp-permission-group">
                            <h4><?php esc_html_e('ACF', 'ghost-post-connector'); ?></h4>
                            <label><input type="checkbox" name="permissions[ACF_READ]" value="1" <?php checked(!empty($permissions['ACF_READ'])); ?>> <?php esc_html_e('Read ACF fields', 'ghost-post-connector'); ?></label>
                            <label><input type="checkbox" name="permissions[ACF_UPDATE]" value="1" <?php checked(!empty($permissions['ACF_UPDATE'])); ?>> <?php esc_html_e('Update ACF fields', 'ghost-post-connector'); ?></label>
                        </div>

                        <div class="gp-permission-group">
                            <h4><?php esc_html_e('Taxonomies', 'ghost-post-connector'); ?></h4>
                            <label><input type="checkbox" name="permissions[TAXONOMY_READ]" value="1" <?php checked(!empty($permissions['TAXONOMY_READ'])); ?>> <?php esc_html_e('Read taxonomies', 'ghost-post-connector'); ?></label>
                            <label><input type="checkbox" name="permissions[TAXONOMY_MANAGE]" value="1" <?php checked(!empty($permissions['TAXONOMY_MANAGE'])); ?>> <?php esc_html_e('Manage terms', 'ghost-post-connector'); ?></label>
                        </div>
                    </div>

                    <p class="submit">
                        <button type="submit" class="gp-btn gp-btn-primary"><?php esc_html_e('Save Permissions', 'ghost-post-connector'); ?></button>
                    </p>
                </form>
            </div>
        </div>

        <?php elseif ($active_tab === 'activity'): ?>
        <!-- ==================== ACTIVITY TAB ==================== -->
        <div class="gp-tab-panel">
            <div class="gp-panel-card">
                <h3><?php esc_html_e('Recent Activity', 'ghost-post-connector'); ?></h3>
                <p class="gp-desc"><?php esc_html_e('Actions performed by Ghost Post on your site.', 'ghost-post-connector'); ?></p>

                <?php
                $activity_log = get_option('gp_activity_log', array());
                $activity_log = array_slice(array_reverse($activity_log), 0, 50);
                ?>

                <?php if (empty($activity_log)): ?>
                    <div class="gp-empty-state">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.3">
                            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                        </svg>
                        <p><?php esc_html_e('No activity recorded yet. Actions will appear here once Ghost Post starts managing your content.', 'ghost-post-connector'); ?></p>
                    </div>
                <?php else: ?>
                    <table class="gp-activity-table">
                        <thead>
                            <tr>
                                <th><?php esc_html_e('Time', 'ghost-post-connector'); ?></th>
                                <th><?php esc_html_e('Action', 'ghost-post-connector'); ?></th>
                                <th><?php esc_html_e('Details', 'ghost-post-connector'); ?></th>
                            </tr>
                        </thead>
                        <tbody>
                            <?php foreach ($activity_log as $entry): ?>
                            <tr>
                                <td class="gp-activity-time"><?php echo esc_html($entry['time'] ?? ''); ?></td>
                                <td><span class="gp-activity-badge"><?php echo esc_html($entry['action'] ?? ''); ?></span></td>
                                <td><?php echo esc_html($entry['details'] ?? ''); ?></td>
                            </tr>
                            <?php endforeach; ?>
                        </tbody>
                    </table>
                <?php endif; ?>
            </div>
        </div>

        <?php elseif ($active_tab === 'redirections'): ?>
        <!-- ==================== REDIRECTIONS TAB ==================== -->
        <div class="gp-tab-panel">

            <?php if ($has_external_plugin && $primary_plugin !== 'ghost-post'): ?>
            <div class="gp-recommendation-banner">
                <div class="gp-recommendation-content">
                    <h3><?php esc_html_e('Redirection Plugin Detected', 'ghost-post-connector'); ?></h3>
                    <p>
                        <?php
                        $plugin_names = array_map(function($p) { return '<strong>' . esc_html($p['name']) . '</strong>' . ($p['version'] ? ' v' . esc_html($p['version']) : ''); }, $detected_redirect_plugins);
                        printf(
                            esc_html__('We detected %s on your site. We recommend importing your existing redirects into Ghost Post and then deactivating the external plugin to avoid conflicts.', 'ghost-post-connector'),
                            implode(', ', $plugin_names)
                        );
                        ?>
                    </p>
                    <div class="gp-recommendation-actions">
                        <button type="button" id="gp-import-redirects" class="gp-btn gp-btn-primary">
                            <?php printf(esc_html__('Import %d Redirects', 'ghost-post-connector'), count($external_redirects)); ?>
                        </button>
                        <span class="gp-import-count">
                            <?php printf(esc_html__('%d redirects found in %s', 'ghost-post-connector'), count($external_redirects), $detected_redirect_plugins[0]['name'] ?? ''); ?>
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
                    <span class="gp-stat-label"><?php esc_html_e('Active Redirects', 'ghost-post-connector'); ?></span>
                </div>
                <div class="gp-stat-card">
                    <span class="gp-stat-value"><?php echo count($redirects); ?></span>
                    <span class="gp-stat-label"><?php esc_html_e('Total Redirects', 'ghost-post-connector'); ?></span>
                </div>
                <div class="gp-stat-card">
                    <span class="gp-stat-value"><?php echo array_sum(array_column($redirects, 'hit_count')); ?></span>
                    <span class="gp-stat-label"><?php esc_html_e('Total Hits', 'ghost-post-connector'); ?></span>
                </div>
                <div class="gp-stat-card">
                    <span class="gp-stat-value <?php echo $is_connected ? 'gp-synced' : 'gp-not-synced'; ?>">
                        <?php echo $is_connected ? '&#10003;' : '&#10007;'; ?>
                    </span>
                    <span class="gp-stat-label"><?php esc_html_e('Platform Sync', 'ghost-post-connector'); ?></span>
                </div>
            </div>

            <!-- Add Redirect Form -->
            <div class="gp-panel-card">
                <h3><?php esc_html_e('Add New Redirect', 'ghost-post-connector'); ?></h3>
                <form id="gp-redirect-form" class="gp-redirect-form">
                    <input type="hidden" id="gp-redirect-id" value="">
                    <div class="gp-redirect-form-grid">
                        <div class="gp-form-group">
                            <label for="gp-source-url"><?php esc_html_e('From URL', 'ghost-post-connector'); ?></label>
                            <input type="text" id="gp-source-url" placeholder="/old-page" required>
                        </div>
                        <div class="gp-form-group">
                            <label for="gp-target-url"><?php esc_html_e('To URL', 'ghost-post-connector'); ?></label>
                            <input type="text" id="gp-target-url" placeholder="/new-page" required>
                        </div>
                        <div class="gp-form-group">
                            <label for="gp-redirect-type"><?php esc_html_e('Type', 'ghost-post-connector'); ?></label>
                            <select id="gp-redirect-type">
                                <option value="301"><?php esc_html_e('301 (Permanent)', 'ghost-post-connector'); ?></option>
                                <option value="302"><?php esc_html_e('302 (Temporary)', 'ghost-post-connector'); ?></option>
                                <option value="307"><?php esc_html_e('307 (Temporary Redirect)', 'ghost-post-connector'); ?></option>
                            </select>
                        </div>
                        <div class="gp-form-group gp-form-actions">
                            <button type="submit" class="gp-btn gp-btn-primary" id="gp-save-redirect">
                                <?php esc_html_e('Add Redirect', 'ghost-post-connector'); ?>
                            </button>
                            <button type="button" class="gp-btn gp-btn-outline" id="gp-cancel-edit" style="display: none;">
                                <?php esc_html_e('Cancel', 'ghost-post-connector'); ?>
                            </button>
                        </div>
                    </div>
                </form>
                <div id="gp-save-result" class="gp-result-box" style="display: none;"></div>
            </div>

            <!-- Redirects Table -->
            <div class="gp-panel-card">
                <h3>
                    <?php esc_html_e('Active Redirects', 'ghost-post-connector'); ?>
                    <span class="gp-count-badge"><?php echo count($redirects); ?></span>
                </h3>

                <?php if (empty($redirects)): ?>
                    <div class="gp-empty-state">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.3">
                            <polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/>
                            <line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>
                        </svg>
                        <p><?php esc_html_e('No redirects yet. Add your first redirect above or import from an existing plugin.', 'ghost-post-connector'); ?></p>
                    </div>
                <?php else: ?>
                    <table class="gp-redirects-table">
                        <thead>
                            <tr>
                                <th class="gp-col-status"><?php esc_html_e('Status', 'ghost-post-connector'); ?></th>
                                <th><?php esc_html_e('From', 'ghost-post-connector'); ?></th>
                                <th><?php esc_html_e('To', 'ghost-post-connector'); ?></th>
                                <th class="gp-col-type"><?php esc_html_e('Type', 'ghost-post-connector'); ?></th>
                                <th class="gp-col-hits"><?php esc_html_e('Hits', 'ghost-post-connector'); ?></th>
                                <th class="gp-col-actions"><?php esc_html_e('Actions', 'ghost-post-connector'); ?></th>
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

        <?php elseif ($active_tab === 'addons'): ?>
        <!-- ==================== ADD-ONS TAB ==================== -->
        <div class="gp-tab-panel">
            <div class="gp-panel-card">
                <h3><?php esc_html_e('Detected Integrations', 'ghost-post-connector'); ?></h3>
                <p class="gp-desc"><?php esc_html_e('Plugins and features Ghost Post can work with on your site.', 'ghost-post-connector'); ?></p>

                <div class="gp-addons-grid">
                    <?php
                    $addons = array(
                        // SEO
                        array('name' => 'Yoast SEO', 'active' => defined('WPSEO_VERSION'), 'version' => defined('WPSEO_VERSION') ? WPSEO_VERSION : '', 'desc' => __('SEO meta management', 'ghost-post-connector'), 'cat' => 'SEO'),
                        array('name' => 'Rank Math', 'active' => defined('RANK_MATH_VERSION'), 'version' => defined('RANK_MATH_VERSION') ? RANK_MATH_VERSION : '', 'desc' => __('SEO meta management', 'ghost-post-connector'), 'cat' => 'SEO'),
                        array('name' => 'All in One SEO', 'active' => defined('AIOSEO_VERSION'), 'version' => defined('AIOSEO_VERSION') ? AIOSEO_VERSION : '', 'desc' => __('SEO meta management', 'ghost-post-connector'), 'cat' => 'SEO'),
                        array('name' => 'SEOPress', 'active' => defined('SEOPRESS_VERSION'), 'version' => defined('SEOPRESS_VERSION') ? SEOPRESS_VERSION : '', 'desc' => __('SEO meta management', 'ghost-post-connector'), 'cat' => 'SEO'),
                        array('name' => 'The SEO Framework', 'active' => defined('THE_SEO_FRAMEWORK_VERSION'), 'version' => defined('THE_SEO_FRAMEWORK_VERSION') ? THE_SEO_FRAMEWORK_VERSION : '', 'desc' => __('SEO meta management', 'ghost-post-connector'), 'cat' => 'SEO'),

                        // Page Builders
                        array('name' => 'Elementor', 'active' => defined('ELEMENTOR_VERSION'), 'version' => defined('ELEMENTOR_VERSION') ? ELEMENTOR_VERSION : '', 'desc' => __('Page builder', 'ghost-post-connector'), 'cat' => __('Builders', 'ghost-post-connector')),
                        array('name' => 'Elementor Pro', 'active' => defined('ELEMENTOR_PRO_VERSION'), 'version' => defined('ELEMENTOR_PRO_VERSION') ? ELEMENTOR_PRO_VERSION : '', 'desc' => __('Page builder (Pro)', 'ghost-post-connector'), 'cat' => __('Builders', 'ghost-post-connector')),
                        array('name' => 'Beaver Builder', 'active' => class_exists('FLBuilderLoader'), 'version' => defined('FL_BUILDER_VERSION') ? FL_BUILDER_VERSION : '', 'desc' => __('Page builder', 'ghost-post-connector'), 'cat' => __('Builders', 'ghost-post-connector')),
                        array('name' => 'Divi Builder', 'active' => defined('ET_BUILDER_VERSION'), 'version' => defined('ET_BUILDER_VERSION') ? ET_BUILDER_VERSION : '', 'desc' => __('Page builder', 'ghost-post-connector'), 'cat' => __('Builders', 'ghost-post-connector')),
                        array('name' => 'WPBakery', 'active' => defined('WPB_VC_VERSION'), 'version' => defined('WPB_VC_VERSION') ? WPB_VC_VERSION : '', 'desc' => __('Page builder', 'ghost-post-connector'), 'cat' => __('Builders', 'ghost-post-connector')),
                        array('name' => 'Oxygen Builder', 'active' => defined('CT_VERSION'), 'version' => defined('CT_VERSION') ? CT_VERSION : '', 'desc' => __('Page builder', 'ghost-post-connector'), 'cat' => __('Builders', 'ghost-post-connector')),
                        array('name' => 'Bricks Builder', 'active' => defined('BRICKS_VERSION'), 'version' => defined('BRICKS_VERSION') ? BRICKS_VERSION : '', 'desc' => __('Page builder', 'ghost-post-connector'), 'cat' => __('Builders', 'ghost-post-connector')),
                        array('name' => 'Breakdance', 'active' => defined('__BREAKDANCE_VERSION'), 'version' => defined('__BREAKDANCE_VERSION') ? __BREAKDANCE_VERSION : '', 'desc' => __('Page builder', 'ghost-post-connector'), 'cat' => __('Builders', 'ghost-post-connector')),
                        array('name' => 'Gutenberg (Block Editor)', 'active' => function_exists('register_block_type'), 'version' => '', 'desc' => __('Block editor', 'ghost-post-connector'), 'cat' => __('Builders', 'ghost-post-connector')),

                        // Redirections
                        array('name' => 'Redirection', 'active' => defined('REDIRECTION_VERSION'), 'version' => defined('REDIRECTION_VERSION') ? REDIRECTION_VERSION : '', 'desc' => __('Redirect management', 'ghost-post-connector'), 'cat' => __('Redirections', 'ghost-post-connector')),
                        array('name' => '301 Redirects', 'active' => is_plugin_active('eps-301-redirects/eps-301-redirects.php') || class_exists('EPS_Redirects'), 'version' => '', 'desc' => __('Redirect management', 'ghost-post-connector'), 'cat' => __('Redirections', 'ghost-post-connector')),
                        array('name' => 'Safe Redirect Manager', 'active' => class_exists('SRM_Redirect'), 'version' => '', 'desc' => __('Redirect management', 'ghost-post-connector'), 'cat' => __('Redirections', 'ghost-post-connector')),

                        // Fields & Data
                        array('name' => 'Advanced Custom Fields', 'active' => class_exists('ACF'), 'version' => defined('ACF_VERSION') ? ACF_VERSION : '', 'desc' => __('Custom field management', 'ghost-post-connector'), 'cat' => __('Fields & Data', 'ghost-post-connector')),
                        array('name' => 'Meta Box', 'active' => class_exists('RWMB_Loader'), 'version' => defined('RWMB_VER') ? RWMB_VER : '', 'desc' => __('Custom field management', 'ghost-post-connector'), 'cat' => __('Fields & Data', 'ghost-post-connector')),
                        array('name' => 'Pods', 'active' => defined('PODS_VERSION'), 'version' => defined('PODS_VERSION') ? PODS_VERSION : '', 'desc' => __('Custom content types & fields', 'ghost-post-connector'), 'cat' => __('Fields & Data', 'ghost-post-connector')),

                        // E-commerce
                        array('name' => 'WooCommerce', 'active' => class_exists('WooCommerce'), 'version' => defined('WC_VERSION') ? WC_VERSION : '', 'desc' => __('Product management', 'ghost-post-connector'), 'cat' => __('E-commerce', 'ghost-post-connector')),

                        // Performance & Caching
                        array('name' => 'WP Rocket', 'active' => defined('WP_ROCKET_VERSION'), 'version' => defined('WP_ROCKET_VERSION') ? WP_ROCKET_VERSION : '', 'desc' => __('Caching & performance', 'ghost-post-connector'), 'cat' => __('Performance', 'ghost-post-connector')),
                        array('name' => 'LiteSpeed Cache', 'active' => defined('LSCWP_V'), 'version' => defined('LSCWP_V') ? LSCWP_V : '', 'desc' => __('Caching & performance', 'ghost-post-connector'), 'cat' => __('Performance', 'ghost-post-connector')),
                        array('name' => 'W3 Total Cache', 'active' => defined('W3TC'), 'version' => defined('W3TC_VERSION') ? W3TC_VERSION : '', 'desc' => __('Caching & performance', 'ghost-post-connector'), 'cat' => __('Performance', 'ghost-post-connector')),
                        array('name' => 'WP Super Cache', 'active' => function_exists('wp_cache_phase2'), 'version' => '', 'desc' => __('Caching & performance', 'ghost-post-connector'), 'cat' => __('Performance', 'ghost-post-connector')),

                        // Multilingual
                        array('name' => 'WPML', 'active' => defined('ICL_SITEPRESS_VERSION'), 'version' => defined('ICL_SITEPRESS_VERSION') ? ICL_SITEPRESS_VERSION : '', 'desc' => __('Multilingual', 'ghost-post-connector'), 'cat' => __('Multilingual', 'ghost-post-connector')),
                        array('name' => 'Polylang', 'active' => defined('POLYLANG_VERSION'), 'version' => defined('POLYLANG_VERSION') ? POLYLANG_VERSION : '', 'desc' => __('Multilingual', 'ghost-post-connector'), 'cat' => __('Multilingual', 'ghost-post-connector')),
                        array('name' => 'TranslatePress', 'active' => defined('TRP_PLUGIN_VERSION'), 'version' => defined('TRP_PLUGIN_VERSION') ? TRP_PLUGIN_VERSION : '', 'desc' => __('Multilingual', 'ghost-post-connector'), 'cat' => __('Multilingual', 'ghost-post-connector')),
                    );

                    // Group by category
                    $grouped = array();
                    foreach ($addons as $addon) {
                        $cat = $addon['cat'] ?? '';
                        if (!isset($grouped[$cat])) $grouped[$cat] = array();
                        $grouped[$cat][] = $addon;
                    }
                    ?>

                    <?php foreach ($grouped as $category => $items): ?>
                    <div class="gp-addon-category">
                        <h4 class="gp-addon-category-title"><?php echo esc_html($category); ?></h4>
                        <?php foreach ($items as $addon): ?>
                        <div class="gp-addon-card <?php echo $addon['active'] ? 'gp-addon-active' : 'gp-addon-inactive'; ?>">
                            <div class="gp-addon-status">
                                <span class="gp-addon-dot <?php echo $addon['active'] ? 'active' : 'inactive'; ?>"></span>
                            </div>
                            <div class="gp-addon-info">
                                <strong><?php echo esc_html($addon['name']); ?></strong>
                                <span class="gp-addon-desc"><?php echo esc_html($addon['desc']); ?></span>
                            </div>
                            <?php if ($addon['active'] && $addon['version']): ?>
                                <span class="gp-addon-version">v<?php echo esc_html($addon['version']); ?></span>
                            <?php endif; ?>
                        </div>
                        <?php endforeach; ?>
                    </div>
                    <?php endforeach; ?>
                </div>
            </div>
        </div>

        <?php endif; ?>

    </div>
</div>
`;
}

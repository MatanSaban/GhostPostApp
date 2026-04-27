/**
 * Generate Redirections Admin Page view
 */
export function getRedirectionsPage() {
  return `<?php
/**
 * GhostSEO Redirections Admin Page
 */

if (!defined('ABSPATH')) {
    exit;
}

$manager = $this->redirections_manager ?? new GP_Redirections_Manager();
$detected_plugins = $manager->detect_plugins();
$primary_plugin = $manager->get_primary_plugin();
$redirects = $manager->get_gp_redirects();
$external_redirects = ($primary_plugin && $primary_plugin !== 'ghost-post') ? $manager->get_all_redirects() : array();
$has_external_plugin = !empty($detected_plugins);
$connection_status = get_option('gp_connector_connection_status', '');
$is_connected = $connection_status === 'connected';
$dir = GP_I18n::dir_attr();
$gp_theme = get_option('gp_connector_theme', 'light');
$theme_class = ($gp_theme === 'light') ? 'gp-theme-light' : '';
?>

<div class="wrap gp-wrap gp-redirections-page <?php echo esc_attr($theme_class); ?>" dir="<?php echo esc_attr($dir); ?>">

    <!-- Header -->
    <div class="gp-header">
        <svg class="gp-header-icon" width="36" height="36" viewBox="0 0 150 150" xmlns="http://www.w3.org/2000/svg"><path fill="#8231F1" fill-rule="evenodd" clip-rule="evenodd" d="M75.5461 3.00018C108.904 3.08102 135.88 30.1882 135.799 63.5461C135.782 70.4471 134.608 77.0746 132.462 83.2463C128.767 94.9403 114.793 138.722 116.926 125.109C119.38 109.444 115.241 108.796 115.241 108.796C115.241 108.796 108.932 134.279 99.1515 142.226C97.432 143.945 92.4613 124.597 91.5666 121.612C75.2533 142.837 60.6398 146.505 60.6398 146.505C57.975 145.585 68.0358 128.033 53.4728 119.945C53.3927 120.061 32.9192 149.64 37.174 135.183C41.4231 120.744 34.0604 107.477 34.0129 107.392C34.0129 107.392 28.4578 110.169 23.3517 121.612C23.2612 121.814 23.1625 121.884 23.0558 121.834C25.0063 112.559 20.6972 92.9492 18.05 82.4025C16.0562 76.3826 14.984 69.9435 15.0002 63.2531C15.0811 29.8953 42.1883 2.91935 75.5461 3.00018ZM98.7795 39.343C93.1724 38.8818 88.0574 45.4345 87.3547 53.9787C86.6521 62.5227 90.6275 69.8232 96.2346 70.2844C101.842 70.7455 106.956 64.1927 107.659 55.6486C108.362 47.1044 104.387 39.8041 98.7795 39.343ZM64.6467 53.8635C63.8471 45.3278 58.6574 38.8329 53.0558 39.3576C47.4546 39.8825 43.5621 47.2275 44.3615 55.7629C45.1611 64.2984 50.3499 70.7932 55.9514 70.2687C61.5528 69.744 65.4461 62.399 64.6467 53.8635Z"/></svg>
        <h1 class="gp-header-title"><?php esc_html_e('Redirections', 'ghost-post-connector'); ?></h1>
    </div>
    
    <?php if ($has_external_plugin && $primary_plugin !== 'ghost-post'): ?>
    <!-- Recommendation Banner -->
    <div class="gp-recommendation-banner">
        <div class="gp-recommendation-icon">
            <span class="dashicons dashicons-info-outline"></span>
        </div>
        <div class="gp-recommendation-content">
            <h3><?php esc_html_e('Redirection Plugin Detected', 'ghost-post-connector'); ?></h3>
            <p>
                <?php
                $plugin_names = array_map(function($p) { return '<strong>' . esc_html($p['name']) . '</strong>' . ($p['version'] ? ' v' . esc_html($p['version']) : ''); }, $detected_plugins);
                printf(
                    esc_html__('We detected %s on your site. We recommend importing your existing redirects into GhostSEO and then deactivating the external plugin to avoid conflicts and improve performance.', 'ghost-post-connector'),
                    implode(', ', $plugin_names)
                );
                ?>
            </p>
            <div class="gp-recommendation-steps">
                <div class="gp-step">
                    <span class="gp-step-number">1</span>
                    <span><?php esc_html_e('Import existing redirects', 'ghost-post-connector'); ?></span>
                </div>
                <div class="gp-step">
                    <span class="gp-step-number">2</span>
                    <span><?php esc_html_e('Verify redirects are working', 'ghost-post-connector'); ?></span>
                </div>
                <div class="gp-step">
                    <span class="gp-step-number">3</span>
                    <span><?php esc_html_e('Deactivate the external plugin', 'ghost-post-connector'); ?></span>
                </div>
            </div>
            <div class="gp-recommendation-actions">
                <button type="button" id="gp-import-redirects" class="gp-btn gp-btn-primary">
                    <span class="dashicons dashicons-download"></span>
                    <?php printf(
                        esc_html__('Import %d Redirects', 'ghost-post-connector'),
                        count($external_redirects)
                    ); ?>
                </button>
                <?php foreach ($detected_plugins as $dp): ?>
                <?php if (!empty($dp['file'])): ?>
                <button type="button" class="gp-btn gp-btn-secondary gp-deactivate-plugin" data-slug="<?php echo esc_attr($dp['file']); ?>" data-name="<?php echo esc_attr($dp['name']); ?>">
                    <span class="dashicons dashicons-no"></span>
                    <?php printf(esc_html__('Deactivate %s', 'ghost-post-connector'), esc_html($dp['name'])); ?>
                </button>
                <?php endif; ?>
                <?php endforeach; ?>
                <span class="gp-import-count">
                    <?php printf(
                        esc_html__('%d redirects found in %s', 'ghost-post-connector'),
                        count($external_redirects),
                        $detected_plugins[0]['name'] ?? ''
                    ); ?>
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
    
    <!-- Create Redirect Form -->
    <div class="gp-card gp-create-redirect-card">
        <h2><?php esc_html_e('Add New Redirect', 'ghost-post-connector'); ?></h2>
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
                        <span class="dashicons dashicons-plus-alt2"></span>
                        <?php esc_html_e('Add Redirect', 'ghost-post-connector'); ?>
                    </button>
                    <button type="button" class="gp-btn gp-btn-secondary" id="gp-cancel-edit" style="display: none;">
                        <?php esc_html_e('Cancel', 'ghost-post-connector'); ?>
                    </button>
                </div>
            </div>
        </form>
        <div id="gp-save-result" class="gp-result-box" style="display: none;"></div>
    </div>
    
    <!-- Redirects Table -->
    <div class="gp-card gp-redirects-table-card">
        <h2>
            <?php esc_html_e('Active Redirects', 'ghost-post-connector'); ?>
            <span class="gp-count-badge"><?php echo count($redirects); ?></span>
        </h2>
        
        <?php if (empty($redirects)): ?>
            <div class="gp-empty-state">
                <span class="dashicons dashicons-randomize"></span>
                <p><?php esc_html_e('No redirects yet. Add your first redirect above or import from an existing plugin.', 'ghost-post-connector'); ?></p>
            </div>
        <?php else: ?>
            <table class="gp-redirects-table widefat">
                <thead>
                    <tr>
                        <th class="gp-col-status"><?php esc_html_e('Status', 'ghost-post-connector'); ?></th>
                        <th class="gp-col-source"><?php esc_html_e('From', 'ghost-post-connector'); ?></th>
                        <th class="gp-col-target"><?php esc_html_e('To', 'ghost-post-connector'); ?></th>
                        <th class="gp-col-type"><?php esc_html_e('Type', 'ghost-post-connector'); ?></th>
                        <th class="gp-col-hits"><?php esc_html_e('Hits', 'ghost-post-connector'); ?></th>
                        <th class="gp-col-actions"><?php esc_html_e('Actions', 'ghost-post-connector'); ?></th>
                    </tr>
                </thead>
                <tbody id="gp-redirects-tbody">
                    <?php foreach ($redirects as $redirect): ?>
                    <tr data-id="<?php echo esc_attr($redirect['id']); ?>" class="<?php echo empty($redirect['is_active']) ? 'gp-inactive-row' : ''; ?>">
                        <td class="gp-col-status">
                            <button type="button" class="gp-toggle-status <?php echo $redirect['is_active'] ? 'gp-active' : 'gp-not-active'; ?>" data-id="<?php echo esc_attr($redirect['id']); ?>" data-active="<?php echo $redirect['is_active'] ? '1' : '0'; ?>">
                                <span class="gp-dot"></span>
                                <span class="gp-status-label"><?php echo $redirect['is_active'] ? esc_html__('Active', 'ghost-post-connector') : esc_html__('Inactive', 'ghost-post-connector'); ?></span>
                            </button>
                        </td>
                        <td class="gp-col-source">
                            <code><?php echo esc_html($redirect['source']); ?></code>
                        </td>
                        <td class="gp-col-target">
                            <code><?php echo esc_html($redirect['target']); ?></code>
                        </td>
                        <td class="gp-col-type">
                            <span class="gp-type-badge gp-type-<?php echo esc_attr($redirect['type']); ?>">
                                <?php echo esc_html($redirect['type']); ?>
                            </span>
                        </td>
                        <td class="gp-col-hits">
                            <?php echo intval($redirect['hit_count']); ?>
                        </td>
                        <td class="gp-col-actions">
                            <button type="button" class="gp-btn gp-btn-secondary gp-btn-sm gp-edit-redirect" 
                                data-id="<?php echo esc_attr($redirect['id']); ?>"
                                data-source="<?php echo esc_attr($redirect['source']); ?>"
                                data-target="<?php echo esc_attr($redirect['target']); ?>"
                                data-type="<?php echo esc_attr($redirect['type']); ?>">
                                <span class="dashicons dashicons-edit"></span>
                            </button>
                            <button type="button" class="gp-btn gp-btn-danger gp-btn-sm gp-delete-redirect" data-id="<?php echo esc_attr($redirect['id']); ?>">
                                <span class="dashicons dashicons-trash"></span>
                            </button>
                        </td>
                    </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
        <?php endif; ?>
    </div>

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

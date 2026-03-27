/**
 * Generate Redirections Admin Page view
 */
export function getRedirectionsPage() {
  return `<?php
/**
 * Ghost Post Redirections Admin Page
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
?>

<div class="wrap gp-settings-page gp-redirections-page" dir="<?php echo esc_attr($dir); ?>">
    <h1>
        <span class="dashicons dashicons-randomize"></span>
        <?php esc_html_e('Redirections', 'ghost-post-connector'); ?>
    </h1>
    
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
                    esc_html__('We detected %s on your site. We recommend importing your existing redirects into Ghost Post and then deactivating the external plugin to avoid conflicts and improve performance.', 'ghost-post-connector'),
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
                <button type="button" id="gp-import-redirects" class="button button-primary">
                    <span class="dashicons dashicons-download"></span>
                    <?php printf(
                        esc_html__('Import %d Redirects', 'ghost-post-connector'),
                        count($external_redirects)
                    ); ?>
                </button>
                <?php foreach ($detected_plugins as $dp): ?>
                <?php if (!empty($dp['file'])): ?>
                <button type="button" class="button gp-deactivate-plugin" data-slug="<?php echo esc_attr($dp['file']); ?>" data-name="<?php echo esc_attr($dp['name']); ?>">
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
                    <button type="submit" class="button button-primary" id="gp-save-redirect">
                        <span class="dashicons dashicons-plus-alt2"></span>
                        <?php esc_html_e('Add Redirect', 'ghost-post-connector'); ?>
                    </button>
                    <button type="button" class="button" id="gp-cancel-edit" style="display: none;">
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
                            <button type="button" class="button gp-edit-redirect" 
                                data-id="<?php echo esc_attr($redirect['id']); ?>"
                                data-source="<?php echo esc_attr($redirect['source']); ?>"
                                data-target="<?php echo esc_attr($redirect['target']); ?>"
                                data-type="<?php echo esc_attr($redirect['type']); ?>">
                                <span class="dashicons dashicons-edit"></span>
                            </button>
                            <button type="button" class="button gp-delete-redirect" data-id="<?php echo esc_attr($redirect['id']); ?>">
                                <span class="dashicons dashicons-trash"></span>
                            </button>
                        </td>
                    </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
        <?php endif; ?>
    </div>
</div>
`;
}

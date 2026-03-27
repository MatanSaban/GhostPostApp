/**
 * Generate Settings Admin Page view
 */
export function getSettingsPage() {
  return `<?php
/**
 * Ghost Post Connector - Settings Page
 */

if (!defined('ABSPATH')) {
    exit;
}

$status = get_option('gp_connector_connection_status', 'unknown');
$last_ping = get_option('gp_connector_last_ping', null);
$last_error = get_option('gp_connector_last_error', null);
$current_lang = get_option('gp_connector_language', 'auto');
$dir = GP_I18n::dir_attr();
?>

<div class="wrap gp-connector-settings gp-settings-page" dir="<?php echo esc_attr($dir); ?>">
    <h1>
        <img src="<?php echo esc_url(GP_CONNECTOR_PLUGIN_URL . 'assets/icon.svg'); ?>"
             alt="Ghost Post"
             class="gp-logo"
             onerror="this.style.display='none'">
        <?php esc_html_e('Settings', 'ghost-post-connector'); ?>
    </h1>

    <!-- Language Settings -->
    <div class="gp-card">
        <h2><?php esc_html_e('Language', 'ghost-post-connector'); ?></h2>
        <form id="gp-language-form">
            <div class="gp-form-group">
                <label for="gp-language-select"><?php esc_html_e('Plugin Display Language', 'ghost-post-connector'); ?></label>
                <select id="gp-language-select" name="language">
                    <option value="auto" <?php selected($current_lang, 'auto'); ?>><?php esc_html_e('Auto (match WordPress)', 'ghost-post-connector'); ?></option>
                    <option value="en" <?php selected($current_lang, 'en'); ?>><?php esc_html_e('English', 'ghost-post-connector'); ?></option>
                    <option value="he" <?php selected($current_lang, 'he'); ?>><?php esc_html_e('Hebrew', 'ghost-post-connector'); ?></option>
                </select>
                <p class="description"><?php esc_html_e('The plugin language will update after saving. When set to Auto, it follows the WordPress dashboard language.', 'ghost-post-connector'); ?></p>
            </div>
            <div class="gp-form-actions">
                <button type="submit" class="button button-primary" id="gp-save-language">
                    <?php esc_html_e('Save Settings', 'ghost-post-connector'); ?>
                </button>
            </div>
        </form>
        <div id="gp-language-result" class="gp-result-box" style="display: none;"></div>
    </div>

    <!-- Connection Status -->
    <div class="gp-card">
        <h2><?php esc_html_e('Connection Status', 'ghost-post-connector'); ?></h2>

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

        <?php if ($last_ping): ?>
        <p class="gp-last-ping">
            <?php
            printf(
                esc_html__('Last ping: %s', 'ghost-post-connector'),
                human_time_diff($last_ping) . ' ' . esc_html__('ago', 'ghost-post-connector')
            );
            ?>
        </p>
        <?php endif; ?>

        <?php if ($last_error): ?>
        <div class="gp-error-message">
            <strong><?php esc_html_e('Last Error:', 'ghost-post-connector'); ?></strong>
            <?php echo esc_html($last_error); ?>
        </div>
        <?php endif; ?>

        <div class="gp-actions">
            <button type="button" class="button button-primary" id="gp-test-connection">
                <?php esc_html_e('Test Connection', 'ghost-post-connector'); ?>
            </button>
            <button type="button" class="button" id="gp-send-ping">
                <?php esc_html_e('Send Ping', 'ghost-post-connector'); ?>
            </button>
            <?php if ($status === 'connected'): ?>
            <button type="button" class="button button-link-delete" id="gp-disconnect">
                <?php esc_html_e('Disconnect', 'ghost-post-connector'); ?>
            </button>
            <?php endif; ?>
        </div>
    </div>

    <!-- Permissions -->
    <div class="gp-card">
        <h2><?php esc_html_e('Permissions', 'ghost-post-connector'); ?></h2>
        <p><?php esc_html_e('Ghost Post has the following permissions on this site:', 'ghost-post-connector'); ?></p>

        <ul class="gp-permissions-list">
            <?php
            $permissions = unserialize(GP_PERMISSIONS);
            $permission_labels = array(
                'CONTENT_READ'    => __('Read content', 'ghost-post-connector'),
                'CONTENT_CREATE'  => __('Create content', 'ghost-post-connector'),
                'CONTENT_UPDATE'  => __('Update content', 'ghost-post-connector'),
                'CONTENT_DELETE'  => __('Delete content', 'ghost-post-connector'),
                'CONTENT_PUBLISH' => __('Publish content', 'ghost-post-connector'),
                'MEDIA_UPLOAD'    => __('Upload media', 'ghost-post-connector'),
                'MEDIA_DELETE'    => __('Delete media', 'ghost-post-connector'),
                'SEO_UPDATE'      => __('Update SEO meta', 'ghost-post-connector'),
                'REDIRECTS_MANAGE'=> __('Manage redirects', 'ghost-post-connector'),
                'SITE_INFO_READ'  => __('Read site information', 'ghost-post-connector'),
                'CPT_READ'        => __('Read custom post types', 'ghost-post-connector'),
                'CPT_CREATE'      => __('Create custom post types', 'ghost-post-connector'),
                'CPT_UPDATE'      => __('Update custom post types', 'ghost-post-connector'),
                'CPT_DELETE'      => __('Delete custom post types', 'ghost-post-connector'),
                'ACF_READ'        => __('Read ACF fields', 'ghost-post-connector'),
                'ACF_UPDATE'      => __('Update ACF fields', 'ghost-post-connector'),
                'TAXONOMY_READ'   => __('Read taxonomies', 'ghost-post-connector'),
                'TAXONOMY_MANAGE' => __('Manage taxonomies', 'ghost-post-connector'),
            );

            foreach ($permissions as $perm) {
                $label = $permission_labels[$perm] ?? $perm;
                echo '<li><span class="dashicons dashicons-yes-alt"></span> ' . esc_html($label) . '</li>';
            }
            ?>
        </ul>

        <p class="gp-permissions-note">
            <?php esc_html_e('To modify permissions, go to your Ghost Post dashboard.', 'ghost-post-connector'); ?>
        </p>
    </div>
</div>
`;
}

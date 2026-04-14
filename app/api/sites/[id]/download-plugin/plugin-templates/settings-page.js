/**
 * Generate Settings Admin Page view
 */
export function getSettingsPage() {
  return `<?php
/**
 * Ghost Post Connector - Settings Page
 * Premium SaaS-style admin interface
 */

if (!defined('ABSPATH')) {
    exit;
}

$status = get_option('gp_connector_connection_status', 'unknown');
$last_ping = get_option('gp_connector_last_ping', null);
$last_error = get_option('gp_connector_last_error', null);
$current_lang = get_option('gp_connector_language', 'auto');
$gp_theme = get_option('gp_connector_theme', 'light');
$theme_class = ($gp_theme === 'light') ? 'gp-theme-light' : '';
$dir = GP_I18n::dir_attr();

// Status helpers
$status_labels = array(
    'connected'    => __('Connected', 'ghost-post-connector'),
    'disconnected' => __('Disconnected', 'ghost-post-connector'),
    'error'        => __('Connection Error', 'ghost-post-connector'),
);
$status_text = $status_labels[$status] ?? __('Unknown', 'ghost-post-connector');
?>

<div class="wrap gp-wrap gp-settings-page <?php echo esc_attr($theme_class); ?>" dir="<?php echo esc_attr($dir); ?>">

    <!-- Header -->
    <div class="gp-header">
        <img src="<?php echo esc_url(GP_CONNECTOR_PLUGIN_URL . 'assets/icon.svg'); ?>"
             alt="Ghost Post"
             class="gp-header-icon"
             width="36" height="36"
             onerror="this.style.display='none'">
        <h1 class="gp-header-title"><?php esc_html_e('Settings', 'ghost-post-connector'); ?></h1>
    </div>

    <!-- Connection Status Hero -->
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

    <div class="gp-card-grid">

        <!-- Appearance Card -->
        <div class="gp-card">
            <div class="gp-card-header">
                <svg class="gp-card-icon" width="20" height="20" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
                <h2 class="gp-card-title"><?php esc_html_e('Appearance', 'ghost-post-connector'); ?></h2>
            </div>

            <div class="gp-form-group">
                <label><?php esc_html_e('Theme', 'ghost-post-connector'); ?></label>
                <div class="gp-theme-switcher">
                    <button type="button" class="gp-theme-option <?php echo $gp_theme !== 'light' ? 'gp-active-option' : ''; ?>" data-theme="dark">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
                        <?php esc_html_e('Dark', 'ghost-post-connector'); ?>
                    </button>
                    <button type="button" class="gp-theme-option <?php echo $gp_theme === 'light' ? 'gp-active-option' : ''; ?>" data-theme="light">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
                        <?php esc_html_e('Light', 'ghost-post-connector'); ?>
                    </button>
                </div>
                <p class="gp-form-hint"><?php esc_html_e('Toggle between dark and light theme.', 'ghost-post-connector'); ?></p>
            </div>

            <hr class="gp-divider">

            <form id="gp-language-form">
                <div class="gp-form-group">
                    <label for="gp-language-select"><?php esc_html_e('Plugin Display Language', 'ghost-post-connector'); ?></label>
                    <select id="gp-language-select" name="language">
                        <option value="auto" <?php selected($current_lang, 'auto'); ?>><?php esc_html_e('Auto (match WordPress)', 'ghost-post-connector'); ?></option>
                        <option value="en" <?php selected($current_lang, 'en'); ?>><?php esc_html_e('English', 'ghost-post-connector'); ?></option>
                        <option value="he" <?php selected($current_lang, 'he'); ?>><?php esc_html_e('Hebrew', 'ghost-post-connector'); ?></option>
                    </select>
                    <p class="gp-form-hint"><?php esc_html_e('When set to Auto, it follows the WordPress dashboard language.', 'ghost-post-connector'); ?></p>
                </div>
                <button type="submit" class="gp-btn gp-btn-primary" id="gp-save-language">
                    <?php esc_html_e('Save Settings', 'ghost-post-connector'); ?>
                </button>
            </form>
            <div id="gp-language-result" class="gp-result-box" style="display: none;"></div>
        </div>

        <!-- Connection Actions Card -->
        <div class="gp-card">
            <div class="gp-card-header">
                <svg class="gp-card-icon" width="20" height="20" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                <h2 class="gp-card-title"><?php esc_html_e('Connection', 'ghost-post-connector'); ?></h2>
            </div>

            <?php if ($last_error): ?>
            <div class="gp-alert gp-alert-error">
                <svg class="gp-alert-icon" width="18" height="18" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                <?php echo esc_html($last_error); ?>
            </div>
            <?php endif; ?>

            <div class="gp-btn-group">
                <button type="button" class="gp-btn gp-btn-primary" id="gp-test-connection">
                    <?php esc_html_e('Test Connection', 'ghost-post-connector'); ?>
                </button>
                <button type="button" class="gp-btn gp-btn-secondary" id="gp-send-ping">
                    <?php esc_html_e('Send Ping', 'ghost-post-connector'); ?>
                </button>
                <?php if ($status === 'connected'): ?>
                <button type="button" class="gp-btn gp-btn-danger" id="gp-disconnect">
                    <?php esc_html_e('Disconnect', 'ghost-post-connector'); ?>
                </button>
                <?php endif; ?>
            </div>
        </div>

    </div><!-- .gp-card-grid -->

    <!-- Permissions Card (full width) -->
    <div class="gp-card">
        <div class="gp-card-header">
            <svg class="gp-card-icon" width="20" height="20" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            <h2 class="gp-card-title"><?php esc_html_e('Permissions', 'ghost-post-connector'); ?></h2>
            <span class="gp-badge gp-badge-primary" style="margin-inline-start: auto;">
                <?php
                $permissions = unserialize(GP_PERMISSIONS);
                printf(esc_html__('%d active', 'ghost-post-connector'), count($permissions));
                ?>
            </span>
        </div>

        <ul class="gp-permissions-grid">
            <?php
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
                echo '<li><svg class="gp-perm-check" width="16" height="16" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>' . esc_html($label) . '</li>';
            }
            ?>
        </ul>

        <p class="gp-form-hint" style="margin-top: 16px;">
            <?php esc_html_e('To modify permissions, go to your Ghost Post dashboard.', 'ghost-post-connector'); ?>
        </p>
    </div>

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

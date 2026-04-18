/**
 * Generate main Ghost_Post class
 */
export function getClassGhostPost() {
  return `<?php
/**
 * Main Ghost Post class
 */

if (!defined('ABSPATH')) {
    exit;
}

class Ghost_Post {
    
    /**
     * @var GP_API_Handler
     */
    private $api_handler;
    
    /**
     * @var GP_Request_Validator
     */
    private $validator;
    
    /**
     * @var GP_Entity_Sync
     */
    private $entity_sync;
    
    /**
     * @var GP_Redirections_Manager
     */
    private $redirections_manager;
    
    /**
     * Initialize the plugin
     */
    public function init() {
        // Initialize i18n (must be before any output)
        GP_I18n::init();
        
        $this->validator = new GP_Request_Validator();
        $this->api_handler = new GP_API_Handler($this->validator);
        $this->redirections_manager = new GP_Redirections_Manager();
        
        // Initialize entity sync (real-time webhook push)
        $this->entity_sync = new GP_Entity_Sync();
        $this->entity_sync->init();
        
        // Register REST API endpoints
        add_action('rest_api_init', array($this, 'register_rest_routes'));
        
        // Admin menu - top-level menu with child pages
        add_action('admin_menu', array($this, 'add_admin_menu'));
        
        // Admin styles and scripts
        add_action('admin_enqueue_scripts', array($this, 'enqueue_admin_styles'));
        
        // Global admin head styles (sidebar icon)
        add_action('admin_head', array($this, 'admin_head_styles'));
        
        // Dashboard widget
        add_action('wp_dashboard_setup', array($this, 'register_dashboard_widget'));
        
        // Force widget to first column + top, even if user rearranged
        add_filter('get_user_option_meta-box-order_dashboard', array($this, 'force_widget_position'));
        
        // Frontend redirect execution
        add_action('template_redirect', array($this->redirections_manager, 'maybe_redirect'));
        
        // AJAX actions for admin
        add_action('wp_ajax_gp_test_connection', array($this, 'ajax_test_connection'));
        add_action('wp_ajax_gp_send_ping', array($this, 'ajax_send_ping'));
        add_action('wp_ajax_gp_disconnect', array($this, 'ajax_disconnect'));
        add_action('wp_ajax_gp_import_redirects', array($this, 'ajax_import_redirects'));
        add_action('wp_ajax_gp_save_redirect', array($this, 'ajax_save_redirect'));
        add_action('wp_ajax_gp_delete_redirect', array($this, 'ajax_delete_redirect'));
        add_action('wp_ajax_gp_toggle_redirect', array($this, 'ajax_toggle_redirect'));
        add_action('wp_ajax_gp_save_language', array($this, 'ajax_save_language'));
        add_action('wp_ajax_gp_save_theme', array($this, 'ajax_save_theme'));
        add_action('wp_ajax_gp_deactivate_plugin', array($this, 'ajax_deactivate_plugin'));
        add_action('wp_ajax_gp_sync_widget', array($this, 'ajax_sync_widget'));
        
        // Schedule ping cron
        add_action('gp_connector_ping', array($this, 'send_ping'));
        if (!wp_next_scheduled('gp_connector_ping')) {
            wp_schedule_event(time(), 'hourly', 'gp_connector_ping');
        }
        
        // Auto-verify connection if not yet connected (handles plugin replace/update scenarios)
        $status = get_option('gp_connector_connection_status', '');
        if ($status !== 'connected' && defined('GP_SITE_KEY') && is_admin()) {
            add_action('admin_init', array($this, 'maybe_verify_connection'), 20);
        }
    }
    
    /**
     * Register REST API routes
     */
    public function register_rest_routes() {
        $this->api_handler->register_routes();
    }
    
    /**
     * Add admin menu - top-level menu with child pages
     */
    public function add_admin_menu() {
        // Use 'none' to prevent WP mask-image system. We inject the icon via CSS background-image.
        $icon = 'none';
        
        // Top-level menu
        add_menu_page(
            __('Ghost Post Connector', 'ghost-post-connector'),
            'GhostPost',
            'manage_options',
            'ghost-post-connector',
            array($this, 'render_admin_page'),
            $icon,
            30
        );
        
        // Single submenu (replaces auto-generated first item)
        add_submenu_page(
            'ghost-post-connector',
            __('Dashboard', 'ghost-post-connector'),
            __('Dashboard', 'ghost-post-connector'),
            'manage_options',
            'ghost-post-connector',
            array($this, 'render_admin_page')
        );
    }
    
    /**
     * Enqueue admin styles and scripts
     */
    public function enqueue_admin_styles($hook) {
        // Load on our plugin pages only
        // Note: submenu hooks use sanitize_title(menu_title) as prefix.
        // Menu title is 'GhostPost' → sanitize_title = 'ghostpost'
        $plugin_pages = array(
            'toplevel_page_ghost-post-connector',
            'index.php', // WP Dashboard — for the dashboard widget
        );
        
        if (!in_array($hook, $plugin_pages, true)) {
            return;
        }
        
        wp_enqueue_style(
            'gp-connector-admin',
            GP_CONNECTOR_PLUGIN_URL . 'admin/css/admin.css',
            array(),
            GP_CONNECTOR_VERSION
        );
        
        wp_enqueue_script(
            'gp-connector-admin',
            GP_CONNECTOR_PLUGIN_URL . 'admin/js/admin.js',
            array('jquery'),
            GP_CONNECTOR_VERSION,
            true
        );
        
        wp_localize_script('gp-connector-admin', 'gpAdmin', array(
            'ajaxUrl' => admin_url('admin-ajax.php'),
            'nonce'   => wp_create_nonce('gp_connector_nonce'),
            'siteKey' => defined('GP_SITE_KEY') ? GP_SITE_KEY : '',
            'strings' => array(
                'testing'             => __('Testing...', 'ghost-post-connector'),
                'test_connection'     => __('Test Connection', 'ghost-post-connector'),
                'connection_success'  => __('Connection successful!', 'ghost-post-connector'),
                'connection_failed'   => __('Connection failed:', 'ghost-post-connector'),
                'sending'             => __('Sending...', 'ghost-post-connector'),
                'send_ping'           => __('Send Ping', 'ghost-post-connector'),
                'ping_success'        => __('Ping sent successfully!', 'ghost-post-connector'),
                'ping_failed'         => __('Ping failed:', 'ghost-post-connector'),
                'disconnecting'       => __('Disconnecting...', 'ghost-post-connector'),
                'disconnect'          => __('Disconnect', 'ghost-post-connector'),
                'disconnected'        => __('Disconnected successfully.', 'ghost-post-connector'),
                'disconnect_failed'   => __('Disconnect failed:', 'ghost-post-connector'),
                'disconnect_error'    => __('Disconnect failed. Please try again.', 'ghost-post-connector'),
                'confirm_disconnect'  => __('Are you sure you want to disconnect from Ghost Post? You can reconnect later by downloading a new plugin.', 'ghost-post-connector'),
                'checking'            => __('Checking...', 'ghost-post-connector'),
                'check_updates'       => __('Check for Updates', 'ghost-post-connector'),
                'update_available'    => __('Update available! Version', 'ghost-post-connector'),
                'go_to_plugins'       => __('Go to Plugins page to update.', 'ghost-post-connector'),
                'latest_version'      => __('You have the latest version!', 'ghost-post-connector'),
                'check_failed'        => __('Failed to check for updates.', 'ghost-post-connector'),
                'confirm_delete'      => __('Are you sure you want to delete this redirect?', 'ghost-post-connector'),
                'importing'           => __('Importing redirects...', 'ghost-post-connector'),
                'import_success'      => __('Import completed!', 'ghost-post-connector'),
                'add_redirect'        => __('Add Redirect', 'ghost-post-connector'),
                'save_redirect'       => __('Save Redirect', 'ghost-post-connector'),
                'confirm_deactivate'  => __('Are you sure you want to deactivate %s?', 'ghost-post-connector'),
                'deactivating'        => __('Deactivating...', 'ghost-post-connector'),
                'deactivated'         => __('Plugin deactivated successfully. Refreshing...', 'ghost-post-connector'),
                'saving'              => __('Saving...', 'ghost-post-connector'),
                'save_settings'       => __('Save Settings', 'ghost-post-connector'),
                'settings_saved'      => __('Settings saved successfully!', 'ghost-post-connector'),
                'theme_saved'         => __('Theme saved!', 'ghost-post-connector'),
                'syncing'             => __('Syncing...', 'ghost-post-connector'),
                'sync_success'        => __('Widget updated!', 'ghost-post-connector'),
                'sync_failed'         => __('Sync failed', 'ghost-post-connector'),
                'site_health_score'   => __('Site Health Score', 'ghost-post-connector'),
                'insights_waiting'    => __('AI Insights waiting', 'ghost-post-connector'),
                'no_data_yet'         => __('No data yet. Stats will appear after the next sync.', 'ghost-post-connector'),
            ),
        ));
    }
    
    /**
     * Render admin page (unified tabbed interface)
     */
    public function render_admin_page() {
        include GP_CONNECTOR_PLUGIN_DIR . 'admin/views/settings-page.php';
    }
    
    /**
     * Print global admin styles (sidebar icon styling — runs on ALL admin pages)
     */
    public function admin_head_styles() {
        $svg_uri = 'data:image/svg+xml,' . rawurlencode('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 335 288"><path fill="#9B4DE0" d="M313.736 127.747C313.681 123.229 311.924 112.362 311.064 107.716C310.204 103.051 314.797 91.8007 316.819 83.2673C319.527 71.8339 320.341 61.5991 317.176 56.0377C314.477 51.2909 291.961 52.5258 282.775 53.6596C279.985 54.0075 268.283 35.1105 244.669 21.3816C223.682 9.1892 191.825 2 170.691 2C109.758 2 57.627 39.0527 36.3828 91.4716C36.2181 91.8834 30.8934 90.4471 22.6775 91.7827C14.2422 93.1547 2.89737 97.3531 2.11054 101.35C1.27798 105.557 5.23035 120.045 11.2047 130.555C17.6822 141.943 25.3491 149.745 25.3948 150.842C27.8376 204.916 61.9816 250.649 109.2 272.491C122.796 278.784 144.195 286.732 170.691 285.946C245.804 283.723 302.995 213.469 325.144 145.903C330.085 130.829 333.15 116.926 332.994 108.777C332.985 108.118 332.299 107.689 331.695 107.972C327.697 109.847 316.087 116.067 313.525 118.683Z"/></svg>');
        echo '<style>
            /* Bypass WP mask system — render SVG directly as background-image */
            #adminmenu .toplevel_page_ghost-post-connector .wp-menu-image {
                background-image: url("' . $svg_uri . '") !important;
                background-size: 20px 20px !important;
                background-repeat: no-repeat !important;
                background-position: center !important;
            }
            #adminmenu .toplevel_page_ghost-post-connector .wp-menu-image::before,
            #adminmenu .toplevel_page_ghost-post-connector .wp-menu-image::after {
                display: none !important;
                content: none !important;
            }
            #adminmenu .toplevel_page_ghost-post-connector .wp-menu-image img {
                display: none !important;
            }
            #adminmenu .toplevel_page_ghost-post-connector.wp-has-current-submenu,
            #adminmenu .toplevel_page_ghost-post-connector.current {
                background: rgba(155, 77, 224, 0.15) !important;
            }
            #adminmenu .toplevel_page_ghost-post-connector.wp-has-current-submenu > a,
            #adminmenu .toplevel_page_ghost-post-connector.current > a {
                color: #B06AE8 !important;
            }
            #adminmenu .toplevel_page_ghost-post-connector .wp-submenu a:hover,
            #adminmenu .toplevel_page_ghost-post-connector .wp-submenu a.current {
                color: #B06AE8 !important;
            }
            #adminmenu .toplevel_page_ghost-post-connector > a .wp-menu-name {
                font-weight: 700 !important;
            }
            /* Plugin icon on updates/plugins pages — prevent stretching */
            tr[data-slug="ghost-post-connector"] .plugin-icon img,
            .plugin-card-ghost-post-connector .plugin-icon img {
                object-fit: contain;
            }
        </style>';
    }
    
    /**
     * Register WordPress Dashboard Widget
     */
    public function register_dashboard_widget() {
        wp_add_dashboard_widget(
            'gp_dashboard_widget',
            'GhostPost AI',
            array($this, 'render_dashboard_widget')
        );
        
        // Force widget to top of dashboard (handles fresh installs without saved meta)
        global $wp_meta_boxes;
        if (isset($wp_meta_boxes['dashboard']['normal']['core']['gp_dashboard_widget'])) {
            $dashboard = $wp_meta_boxes['dashboard']['normal']['core'];
            $widget = array('gp_dashboard_widget' => $dashboard['gp_dashboard_widget']);
            unset($dashboard['gp_dashboard_widget']);
            $wp_meta_boxes['dashboard']['normal']['core'] = array_merge($widget, $dashboard);
        }
    }
    
    /**
     * Force dashboard widget to first column, top position
     * Overrides saved user meta-box ordering
     */
    public function force_widget_position($order) {
        if (!is_array($order)) {
            return $order;
        }
        
        // Remove gp_dashboard_widget from all columns
        foreach ($order as $column => $widget_ids) {
            $ids = array_filter(
                array_map('trim', explode(',', $widget_ids)),
                function($id) { return $id !== '' && $id !== 'gp_dashboard_widget'; }
            );
            $order[$column] = implode(',', $ids);
        }
        
        // Prepend to normal (first) column
        $normal = isset($order['normal']) ? $order['normal'] : '';
        $order['normal'] = $normal ? 'gp_dashboard_widget,' . $normal : 'gp_dashboard_widget';
        
        return $order;
    }
    
    /**
     * Render WordPress Dashboard Widget
     */
    public function render_dashboard_widget() {
        $data = get_option('gp_dashboard_widget_data', array());
        $status = get_option('gp_connector_connection_status', 'unknown');
        $gp_theme = get_option('gp_connector_theme', 'light');
        $theme_class = ($gp_theme === 'light') ? 'gp-theme-light' : '';
        $dir = GP_I18n::dir_attr();
        
        $audit_score = isset($data['auditScore']) ? intval($data['auditScore']) : null;
        $pending = isset($data['pendingInsights']) ? intval($data['pendingInsights']) : 0;
        $activity = isset($data['recentActivity']) ? sanitize_text_field($data['recentActivity']) : '';
        
        $dashboard_url = GP_API_URL . '/dashboard?ref=wp_widget';
        ?>
        <div class="gp-wrap gp-widget <?php echo esc_attr($theme_class); ?>" dir="<?php echo esc_attr($dir); ?>">
            
            <div class="gp-widget-header">
                <svg class="gp-widget-icon" width="22" height="22" viewBox="0 0 335 288" xmlns="http://www.w3.org/2000/svg"><path fill="#9B4DE0" d="M313.736 127.747C313.681 123.229 311.924 112.362 311.064 107.716C310.204 103.051 314.797 91.8007 316.819 83.2673C319.527 71.8339 320.341 61.5991 317.176 56.0377C314.477 51.2909 291.961 52.5258 282.775 53.6596C279.985 54.0075 268.283 35.1105 244.669 21.3816C223.682 9.1892 191.825 2 170.691 2C109.758 2 57.627 39.0527 36.3828 91.4716C36.2181 91.8834 30.8934 90.4471 22.6775 91.7827C14.2422 93.1547 2.89737 97.3531 2.11054 101.35C1.27798 105.557 5.23035 120.045 11.2047 130.555C17.6822 141.943 25.3491 149.745 25.3948 150.842C27.8376 204.916 61.9816 250.649 109.2 272.491C122.796 278.784 144.195 286.732 170.691 285.946C245.804 283.723 302.995 213.469 325.144 145.903C330.085 130.829 333.15 116.926 332.994 108.777C332.985 108.118 332.299 107.689 331.695 107.972C327.697 109.847 316.087 116.067 313.525 118.683Z"/></svg>
                <span class="gp-widget-title">GhostPost</span>
                <?php if ($status === 'connected'): ?>
                    <span class="gp-badge gp-badge-success"><?php esc_html_e('Connected', 'ghost-post-connector'); ?></span>
                <?php else: ?>
                    <span class="gp-badge gp-badge-neutral"><?php esc_html_e('Disconnected', 'ghost-post-connector'); ?></span>
                <?php endif; ?>
                <button type="button" class="gp-widget-sync" id="gp-widget-sync" title="<?php esc_attr_e('Sync', 'ghost-post-connector'); ?>">
                    <svg class="gp-widget-sync-icon" width="14" height="14" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
                </button>
            </div>
            
            <div class="gp-widget-body">
                <?php if ($audit_score !== null): ?>
                <div class="gp-widget-stat">
                    <span class="gp-widget-stat-label"><?php esc_html_e('Site Health Score', 'ghost-post-connector'); ?></span>
                    <span class="gp-widget-stat-value <?php echo $audit_score >= 70 ? 'gp-score-good' : ($audit_score >= 40 ? 'gp-score-ok' : 'gp-score-bad'); ?>">
                        <?php echo esc_html($audit_score); ?><small>/100</small>
                    </span>
                </div>
                <?php endif; ?>
                
                <?php if ($pending > 0): ?>
                <div class="gp-widget-insights">
                    <span class="gp-widget-insights-icon">✨</span>
                    <span>
                        <?php
                        printf(
                            esc_html(_n('%d AI Insight is waiting for your approval!', '%d AI Insights are waiting for your approval!', $pending, 'ghost-post-connector')),
                            $pending
                        );
                        ?>
                    </span>
                </div>
                <?php endif; ?>
                
                <?php if ($activity): ?>
                <p class="gp-widget-activity"><?php echo esc_html($activity); ?></p>
                <?php endif; ?>
                
                <?php if ($audit_score === null && $pending === 0 && !$activity): ?>
                <p class="gp-widget-empty"><?php esc_html_e('No data yet. Stats will appear after the next sync.', 'ghost-post-connector'); ?></p>
                <?php endif; ?>
            </div>
            
            <div class="gp-widget-footer">
                <a href="<?php echo esc_url($dashboard_url); ?>" class="gp-btn gp-btn-primary gp-btn-sm" target="_blank" rel="noopener">
                    <?php esc_html_e('Open GhostPost Dashboard', 'ghost-post-connector'); ?>
                </a>
                <p class="gp-widget-last-sync" id="gp-widget-last-sync"></p>
            </div>
            
        </div>
        <?php
    }
    
    /**
     * AJAX: Sync widget data (manual trigger from dashboard widget)
     */
    public function ajax_sync_widget() {
        check_ajax_referer('gp_connector_nonce', 'nonce');
        
        if (!current_user_can('manage_options')) {
            wp_send_json_error('Permission denied');
        }
        
        // Send ping which returns fresh widget data
        $this->send_ping();
        
        // Return the updated widget data
        $data = get_option('gp_dashboard_widget_data', array());
        wp_send_json_success(array(
            'widgetData' => $data,
        ));
    }
    
    /**
     * AJAX: Save theme preference
     */
    public function ajax_save_theme() {
        check_ajax_referer('gp_connector_nonce', 'nonce');
        
        if (!current_user_can('manage_options')) {
            wp_send_json_error('Permission denied');
        }
        
        $theme = sanitize_text_field($_POST['theme'] ?? 'light');
        if (!in_array($theme, array('dark', 'light'), true)) {
            $theme = 'light';
        }
        
        update_option('gp_connector_theme', $theme);
        wp_send_json_success(array('theme' => $theme));
    }
    
    /**
     * AJAX: Import redirects from a detected third-party plugin
     */
    public function ajax_import_redirects() {
        check_ajax_referer('gp_connector_nonce', 'nonce');
        
        if (!current_user_can('manage_options')) {
            wp_send_json_error('Permission denied');
        }
        
        $manager = $this->redirections_manager ?? new GP_Redirections_Manager();
        $result = $manager->import_from_detected_plugin();
        
        wp_send_json_success($result);
    }
    
    /**
     * AJAX: Save (create or update) a redirect
     */
    public function ajax_save_redirect() {
        check_ajax_referer('gp_connector_nonce', 'nonce');
        
        if (!current_user_can('manage_options')) {
            wp_send_json_error('Permission denied');
        }
        
        $manager = $this->redirections_manager ?? new GP_Redirections_Manager();
        
        $id     = sanitize_text_field($_POST['redirect_id'] ?? '');
        $source = GP_Redirections_Manager::sanitize_redirect_url($_POST['source'] ?? '');
        $target = GP_Redirections_Manager::sanitize_redirect_url($_POST['target'] ?? '');
        $type   = intval($_POST['type'] ?? 301);
        
        if (empty($source) || empty($target)) {
            wp_send_json_error('Source and target URLs are required');
        }
        
        $data = array('source' => $source, 'target' => $target, 'type' => $type);
        
        if ($id) {
            $result = $manager->update_redirect($id, $data);
        } else {
            $result = $manager->create_redirect($data);
        }
        
        if (is_wp_error($result)) {
            wp_send_json_error($result->get_error_message());
        }
        
        wp_send_json_success($result);
    }
    
    /**
     * AJAX: Delete a redirect
     */
    public function ajax_delete_redirect() {
        check_ajax_referer('gp_connector_nonce', 'nonce');
        
        if (!current_user_can('manage_options')) {
            wp_send_json_error('Permission denied');
        }
        
        $manager = $this->redirections_manager ?? new GP_Redirections_Manager();
        $id = sanitize_text_field($_POST['redirect_id'] ?? '');
        
        if (empty($id)) {
            wp_send_json_error('Redirect ID is required');
        }
        
        $result = $manager->delete_redirect($id);
        
        if (is_wp_error($result)) {
            wp_send_json_error($result->get_error_message());
        }
        
        wp_send_json_success(array('deleted' => true));
    }
    
    /**
     * AJAX: Toggle redirect active/inactive
     */
    public function ajax_toggle_redirect() {
        check_ajax_referer('gp_connector_nonce', 'nonce');
        
        if (!current_user_can('manage_options')) {
            wp_send_json_error('Permission denied');
        }
        
        $manager = $this->redirections_manager ?? new GP_Redirections_Manager();
        $id = sanitize_text_field($_POST['redirect_id'] ?? '');
        $active = ($_POST['active'] ?? '1') === '1';
        
        if (empty($id)) {
            wp_send_json_error('Redirect ID is required');
        }
        
        $result = $manager->update_redirect($id, array('is_active' => !$active));
        
        if (is_wp_error($result)) {
            wp_send_json_error($result->get_error_message());
        }
        
        wp_send_json_success($result);
    }
    
    /**
     * AJAX: Save language preference
     */
    public function ajax_save_language() {
        check_ajax_referer('gp_connector_nonce', 'nonce');
        
        if (!current_user_can('manage_options')) {
            wp_send_json_error('Permission denied');
        }
        
        $lang = sanitize_text_field($_POST['language'] ?? 'auto');
        if (!in_array($lang, array('auto', 'en', 'he'), true)) {
            $lang = 'auto';
        }
        
        update_option('gp_connector_language', $lang);
        wp_send_json_success(array('language' => $lang));
    }
    
    /**
     * AJAX: Deactivate a third-party plugin
     */
    public function ajax_deactivate_plugin() {
        check_ajax_referer('gp_connector_nonce', 'nonce');
        
        if (!current_user_can('activate_plugins')) {
            wp_send_json_error('Permission denied');
        }
        
        $plugin_slug = sanitize_text_field($_POST['plugin_slug'] ?? '');
        if (empty($plugin_slug)) {
            wp_send_json_error('Plugin slug is required');
        }
        
        if (!is_plugin_active($plugin_slug)) {
            wp_send_json_success(array('already_inactive' => true));
            return;
        }
        
        deactivate_plugins($plugin_slug);
        
        if (is_plugin_active($plugin_slug)) {
            wp_send_json_error('Failed to deactivate plugin');
        }
        
        wp_send_json_success(array('deactivated' => true));
    }
    
    /**
     * Auto-verify if not connected yet (called on admin_init)
     * Throttled to once per 5 minutes to avoid hammering the API
     */
    public function maybe_verify_connection() {
        $last_attempt = get_option('gp_connector_last_verify_attempt', 0);
        if (time() - $last_attempt < 300) {
            return;
        }
        update_option('gp_connector_last_verify_attempt', time());
        $this->verify_connection();
    }
    
    /**
     * Verify connection with Ghost Post platform
     */
    public function verify_connection() {
        $timestamp = time();
        $body = wp_json_encode(array(
            'wpVersion' => get_bloginfo('version'),
            'phpVersion' => phpversion(),
            'pluginVersion' => GP_CONNECTOR_VERSION,
            'wpTimezone' => wp_timezone_string(),
            'wpLocale' => get_locale(),
            'siteUrl' => get_site_url(),
            'adminEmail' => get_option('admin_email'),
        ));
        
        $signature = $this->create_signature($body, $timestamp);
        
        $response = wp_remote_post(GP_API_URL . '/api/public/wp/verify', array(
            'timeout' => 30,
            'headers' => array(
                'Content-Type' => 'application/json',
                'X-GP-Site-Key' => GP_SITE_KEY,
                'X-GP-Timestamp' => $timestamp,
                'X-GP-Signature' => $signature,
            ),
            'body' => $body,
        ));
        
        if (is_wp_error($response)) {
            update_option('gp_connector_connection_status', 'error');
            update_option('gp_connector_last_error', $response->get_error_message());
            return false;
        }
        
        $status_code = wp_remote_retrieve_response_code($response);
        $body = json_decode(wp_remote_retrieve_body($response), true);
        
        if ($status_code === 200 && !empty($body['success'])) {
            update_option('gp_connector_connection_status', 'connected');
            update_option('gp_connector_last_ping', time());
            delete_option('gp_connector_last_error');
            return true;
        }
        
        update_option('gp_connector_connection_status', 'error');
        update_option('gp_connector_last_error', $body['error'] ?? 'Unknown error');
        return false;
    }
    
    /**
     * Notify Ghost Post about disconnection
     */
    public function notify_disconnection() {
        $timestamp = time();
        $body = wp_json_encode(array('action' => 'disconnect'));
        $signature = $this->create_signature($body, $timestamp);
        
        wp_remote_post(GP_API_URL . '/api/public/wp/disconnect', array(
            'timeout' => 10,
            'headers' => array(
                'Content-Type' => 'application/json',
                'X-GP-Site-Key' => GP_SITE_KEY,
                'X-GP-Timestamp' => $timestamp,
                'X-GP-Signature' => $signature,
            ),
            'body' => $body,
        ));
        
        // Clear scheduled ping
        wp_clear_scheduled_hook('gp_connector_ping');
        
        // Update status
        update_option('gp_connector_connection_status', 'disconnected');
    }
    
    /**
     * Send ping to Ghost Post
     */
    public function send_ping() {
        $timestamp = time();
        $body = wp_json_encode(array(
            'pluginVersion' => GP_CONNECTOR_VERSION,
            'wpVersion' => get_bloginfo('version'),
        ));
        
        $signature = $this->create_signature($body, $timestamp);
        
        $response = wp_remote_post(GP_API_URL . '/api/public/wp/ping', array(
            'timeout' => 15,
            'headers' => array(
                'Content-Type' => 'application/json',
                'X-GP-Site-Key' => GP_SITE_KEY,
                'X-GP-Timestamp' => $timestamp,
                'X-GP-Signature' => $signature,
            ),
            'body' => $body,
        ));
        
        if (!is_wp_error($response) && wp_remote_retrieve_response_code($response) === 200) {
            update_option('gp_connector_last_ping', time());
            update_option('gp_connector_connection_status', 'connected');
            
            // Save widget data from ping response
            $resp_body = json_decode(wp_remote_retrieve_body($response), true);
            if (!empty($resp_body['widgetData'])) {
                update_option('gp_dashboard_widget_data', $resp_body['widgetData']);
            }
        }
    }
    
    /**
     * AJAX handler for test connection
     */
    public function ajax_test_connection() {
        // Security check
        if (!current_user_can('manage_options')) {
            wp_send_json_error('Unauthorized');
        }
        
        $result = $this->verify_connection();
        
        if ($result) {
            wp_send_json_success(array(
                'message' => 'Connection successful',
                'status' => 'connected',
            ));
        } else {
            $error = get_option('gp_connector_last_error', 'Unknown error');
            wp_send_json_error($error);
        }
    }
    
    /**
     * AJAX handler for send ping
     */
    public function ajax_send_ping() {
        // Security check
        if (!current_user_can('manage_options')) {
            wp_send_json_error('Unauthorized');
        }
        
        $this->send_ping();
        
        $status = get_option('gp_connector_connection_status', 'unknown');
        if ($status === 'connected') {
            wp_send_json_success(array(
                'message' => 'Ping sent successfully',
            ));
        } else {
            wp_send_json_error('Ping failed');
        }
    }
    
    /**
     * AJAX handler for disconnect
     */
    public function ajax_disconnect() {
        // Security check
        if (!current_user_can('manage_options')) {
            wp_send_json_error('Unauthorized');
        }
        
        // Notify Ghost Post platform about disconnection
        $this->notify_disconnection();
        
        wp_send_json_success(array(
            'message' => 'Disconnected successfully',
        ));
    }
    
    /**
     * Create HMAC-SHA256 signature
     * 
     * @param string $payload Request body
     * @param int $timestamp Unix timestamp
     * @return string
     */
    private function create_signature($payload, $timestamp) {
        $data = $timestamp . '.' . $payload;
        return hash_hmac('sha256', $data, GP_SITE_SECRET);
    }
}
`;
}

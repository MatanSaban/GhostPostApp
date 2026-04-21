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
        add_action('wp_ajax_gp_check_version', array($this, 'ajax_check_version'));
        add_action('wp_ajax_gp_fetch_seo_data', array($this, 'ajax_fetch_seo_data'));
        add_action('wp_ajax_gp_save_snippet', array($this, 'ajax_save_snippet'));
        add_action('wp_ajax_gp_get_snippet', array($this, 'ajax_get_snippet'));
        add_action('wp_ajax_gp_toggle_snippet', array($this, 'ajax_toggle_snippet'));
        add_action('wp_ajax_gp_trash_snippet', array($this, 'ajax_trash_snippet'));
        add_action('wp_ajax_gp_restore_snippet', array($this, 'ajax_restore_snippet'));
        add_action('wp_ajax_gp_delete_snippet', array($this, 'ajax_delete_snippet_permanent'));
        
        // Frontend snippet execution
        add_action('wp_head', array($this, 'execute_snippets_head'), 1);
        add_action('wp_footer', array($this, 'execute_snippets_footer'), 99);
        
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
        
        // Submenu: Dashboard (replaces auto-generated first item)
        add_submenu_page(
            'ghost-post-connector',
            __('Dashboard', 'ghost-post-connector'),
            __('Dashboard', 'ghost-post-connector'),
            'manage_options',
            'ghost-post-connector',
            array($this, 'render_admin_page')
        );
        
        // Submenu: Settings
        add_submenu_page(
            'ghost-post-connector',
            __('Settings', 'ghost-post-connector'),
            __('Settings', 'ghost-post-connector'),
            'manage_options',
            'ghost-post-connector&tab=settings',
            array($this, 'render_admin_page')
        );
        
        // Submenu: Activity
        add_submenu_page(
            'ghost-post-connector',
            __('Activity', 'ghost-post-connector'),
            __('Activity', 'ghost-post-connector'),
            'manage_options',
            'ghost-post-connector&tab=activity',
            array($this, 'render_admin_page')
        );
        
        // Submenu: Redirections
        add_submenu_page(
            'ghost-post-connector',
            __('Redirections', 'ghost-post-connector'),
            __('Redirections', 'ghost-post-connector'),
            'manage_options',
            'ghost-post-connector&tab=redirections',
            array($this, 'render_admin_page')
        );
        
        // Submenu: SEO Insights
        add_submenu_page(
            'ghost-post-connector',
            __('SEO Insights', 'ghost-post-connector'),
            __('SEO Insights', 'ghost-post-connector'),
            'manage_options',
            'ghost-post-connector&tab=seo-insights',
            array($this, 'render_admin_page')
        );
        
        // Submenu: Code Snippets
        add_submenu_page(
            'ghost-post-connector',
            __('Code Snippets', 'ghost-post-connector'),
            __('Code Snippets', 'ghost-post-connector'),
            'manage_options',
            'ghost-post-connector&tab=snippets',
            array($this, 'render_admin_page')
        );
        
        // Submenu: Add-ons
        add_submenu_page(
            'ghost-post-connector',
            __('Add-ons', 'ghost-post-connector'),
            __('Add-ons', 'ghost-post-connector'),
            'manage_options',
            'ghost-post-connector&tab=addons',
            array($this, 'render_admin_page')
        );
    }
    
    /**
     * Enqueue admin styles and scripts
     */
    public function enqueue_admin_styles($hook) {
        // Load on our plugin pages and WP Dashboard (for widget)
        $is_plugin_page = (strpos($hook, 'ghost-post-connector') !== false) || ($hook === 'toplevel_page_ghost-post-connector');
        $is_dashboard = ($hook === 'index.php');
        
        if (!$is_plugin_page && !$is_dashboard) {
            return;
        }
        
        wp_enqueue_style(
            'gp-connector-admin',
            GP_CONNECTOR_PLUGIN_URL . 'admin/css/admin.css',
            array(),
            GP_CONNECTOR_VERSION . '.' . filemtime(GP_CONNECTOR_PLUGIN_DIR . 'admin/css/admin.css')
        );
        
        // Chart.js for SEO insights
        wp_enqueue_script(
            'chartjs',
            'https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js',
            array(),
            '4.4.4',
            true
        );
        
        wp_enqueue_script(
            'gp-connector-admin',
            GP_CONNECTOR_PLUGIN_URL . 'admin/js/admin.js',
            array('jquery'),
            GP_CONNECTOR_VERSION . '.' . filemtime(GP_CONNECTOR_PLUGIN_DIR . 'admin/js/admin.js'),
            true
        );
        
        wp_localize_script('gp-connector-admin', 'gpAdmin', array(
            'ajaxUrl' => admin_url('admin-ajax.php'),
            'nonce'   => wp_create_nonce('gp_connector_nonce'),
            'siteKey' => defined('GP_SITE_KEY') ? GP_SITE_KEY : '',
            'pluginBasename' => GP_CONNECTOR_PLUGIN_BASENAME,
            'updateCoreUrl'  => admin_url('update-core.php'),
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
                // Version
                'checking_version'     => __('Checking for updates...', 'ghost-post-connector'),
                'up_to_date'           => __('You are using the latest version.', 'ghost-post-connector'),
                'version_error'        => __('Could not check for updates.', 'ghost-post-connector'),
                // SEO
                'loading_seo'          => __('Loading SEO data...', 'ghost-post-connector'),
                'seo_error'            => __('Could not load SEO data.', 'ghost-post-connector'),
                'no_issues'            => __('No issues found.', 'ghost-post-connector'),
                'organic_traffic'      => __('Organic Traffic', 'ghost-post-connector'),
                'ai_traffic_label'     => __('AI Traffic', 'ghost-post-connector'),
                'refresh_data'         => __('Refresh Data', 'ghost-post-connector'),
                // Header update
                'update_to'            => __('Update to v', 'ghost-post-connector'),
                'updating'             => __('Updating...', 'ghost-post-connector'),
                'updated'              => __('Updated! Reloading...', 'ghost-post-connector'),
                // Snippets
                'snippet_saved'        => __('Snippet saved successfully!', 'ghost-post-connector'),
                'snippet_trashed'      => __('Snippet moved to trash.', 'ghost-post-connector'),
                'snippet_restored'     => __('Snippet restored.', 'ghost-post-connector'),
                'snippet_deleted'      => __('Snippet permanently deleted.', 'ghost-post-connector'),
                'confirm_permanent_delete' => __('Are you sure? This cannot be undone.', 'ghost-post-connector'),
                'add_new_snippet'      => __('Add New Snippet', 'ghost-post-connector'),
                'edit_snippet'         => __('Edit Snippet', 'ghost-post-connector'),
                'generic_error'        => __('An error occurred. Please try again.', 'ghost-post-connector'),
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
     * Print global admin styles (sidebar icon styling - runs on ALL admin pages)
     */
    public function admin_head_styles() {
        $svg_uri = 'data:image/svg+xml,' . rawurlencode('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 335 288"><path fill="#9B4DE0" d="M313.736 127.747C313.681 123.229 311.924 112.362 311.064 107.716C310.204 103.051 314.797 91.8007 316.819 83.2673C319.527 71.8339 320.341 61.5991 317.176 56.0377C314.477 51.2909 291.961 52.5258 282.775 53.6596C279.985 54.0075 268.283 35.1105 244.669 21.3816C223.682 9.1892 191.825 2 170.691 2C109.758 2 57.627 39.0527 36.3828 91.4716C36.2181 91.8834 30.8934 90.4471 22.6775 91.7827C14.2422 93.1547 2.89737 97.3531 2.11054 101.35C1.27798 105.557 5.23035 120.045 11.2047 130.555C17.6822 141.943 25.3491 149.745 25.3948 150.842C27.8376 204.916 61.9816 250.649 109.2 272.491C122.796 278.784 144.195 286.732 170.691 285.946C245.804 283.723 302.995 213.469 325.144 145.903C330.085 130.829 333.15 116.926 332.994 108.777C332.985 108.118 332.299 107.689 331.695 107.972C327.697 109.847 316.087 116.067 313.525 118.683Z"/></svg>');
        echo '<style>
            /* Bypass WP mask system - render SVG directly as background-image */
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
     */
    public function force_widget_position($order) {
        if (!is_array($order)) {
            return $order;
        }
        
        foreach ($order as $column => $widget_ids) {
            $ids = array_filter(
                array_map('trim', explode(',', $widget_ids)),
                function($id) { return $id !== '' && $id !== 'gp_dashboard_widget'; }
            );
            $order[$column] = implode(',', $ids);
        }
        
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
     * Log activity for the activity tab
     *
     * @param string $action Short action label (e.g. 'content_created')
     * @param string $details Human-readable details
     */
    public static function log_activity($action, $details = '') {
        $log = get_option('gp_activity_log', array());
        if (!is_array($log)) {
            $log = array();
        }
        
        array_unshift($log, array(
            'action'  => sanitize_text_field($action),
            'details' => sanitize_text_field($details),
            'time'    => time(),
        ));
        
        // Keep max 200 entries
        $log = array_slice($log, 0, 200);
        
        update_option('gp_activity_log', $log, false);
    }
    
    /**
     * AJAX: Sync widget data (manual trigger from dashboard widget)
     */
    public function ajax_sync_widget() {
        check_ajax_referer('gp_connector_nonce', 'nonce');
        
        if (!current_user_can('manage_options')) {
            wp_send_json_error('Permission denied');
        }
        
        $this->send_ping();
        
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
        
        // Save to platform (source of truth)
        $timestamp = time();
        $body = wp_json_encode(array('language' => $lang));
        $signature = $this->create_signature($body, $timestamp);
        
        wp_remote_post(GP_API_URL . '/api/public/wp/save-language', array(
            'timeout' => 15,
            'headers' => array(
                'Content-Type'   => 'application/json',
                'X-GP-Site-Key'  => GP_SITE_KEY,
                'X-GP-Timestamp' => $timestamp,
                'X-GP-Signature' => $signature,
            ),
            'body' => $body,
        ));
        
        // Cache locally for quick reads
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
            update_option('gp_connector_last_connection_check', time());
            delete_option('gp_connector_last_error');
            self::log_activity('connection_verified', 'Connection verified with GhostPost platform');
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
        
        wp_clear_scheduled_hook('gp_connector_ping');
        update_option('gp_connector_connection_status', 'disconnected');
        self::log_activity('disconnected', 'Disconnected from GhostPost platform');
    }
    
    /**
     * Send ping to Ghost Post
     */
    public function send_ping() {
        $timestamp = time();
        $body = wp_json_encode(array(
            'pluginVersion' => GP_CONNECTOR_VERSION,
            'wpVersion' => get_bloginfo('version'),
            'wpLocale'  => get_locale(),
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
            
            $resp_body = json_decode(wp_remote_retrieve_body($response), true);
            if (!empty($resp_body['widgetData'])) {
                update_option('gp_dashboard_widget_data', $resp_body['widgetData']);
            }
            // Sync language preference from platform
            if (!empty($resp_body['pluginLanguage'])) {
                update_option('gp_connector_language', $resp_body['pluginLanguage']);
            }
        }
    }
    
    /**
     * AJAX handler for test connection
     */
    public function ajax_test_connection() {
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
        if (!current_user_can('manage_options')) {
            wp_send_json_error('Unauthorized');
        }
        
        $this->notify_disconnection();
        
        wp_send_json_success(array(
            'message' => 'Disconnected successfully',
        ));
    }
    
    /**
     * Create HMAC-SHA256 signature
     */
    private function create_signature($payload, $timestamp) {
        $data = $timestamp . '.' . $payload;
        return hash_hmac('sha256', $data, GP_SITE_SECRET);
    }
    
    /**
     * AJAX handler for version check
     */
    public function ajax_check_version() {
        check_ajax_referer('gp_connector_nonce', 'nonce');
        
        if (!current_user_can('manage_options')) {
            wp_send_json_error('Permission denied');
        }
        
        $timestamp = time();
        $body = wp_json_encode(array(
            'pluginVersion' => GP_CONNECTOR_VERSION,
            'wpVersion'     => get_bloginfo('version'),
        ));
        
        $signature = $this->create_signature($body, $timestamp);
        
        $response = wp_remote_post(GP_API_URL . '/api/public/wp/check-version', array(
            'timeout' => 15,
            'headers' => array(
                'Content-Type'   => 'application/json',
                'X-GP-Site-Key'  => GP_SITE_KEY,
                'X-GP-Timestamp' => $timestamp,
                'X-GP-Signature' => $signature,
            ),
            'body' => $body,
        ));
        
        if (is_wp_error($response)) {
            wp_send_json_error(array('message' => $response->get_error_message()));
        }
        
        $status_code = wp_remote_retrieve_response_code($response);
        $data = json_decode(wp_remote_retrieve_body($response), true);
        
        if ($status_code === 200 && !empty($data['version'])) {
            $latest = sanitize_text_field($data['version']);
            set_transient('gp_latest_version', $latest, 12 * HOUR_IN_SECONDS);
            
            $download_url = isset($data['download_url']) ? esc_url_raw($data['download_url']) : '';
            if ($download_url) {
                set_transient('gp_latest_download_url', $download_url, 12 * HOUR_IN_SECONDS);
            }
            
            $update_available = version_compare($latest, GP_CONNECTOR_VERSION, '>');
            
            if ($update_available && !empty($data['download_url'])) {
                $this->inject_update_transient($latest, $data['download_url']);
            }
            
            wp_send_json_success(array(
                'latest'           => $latest,
                'current'          => GP_CONNECTOR_VERSION,
                'update_available' => $update_available,
                'download_url'     => $data['download_url'] ?? '',
                'changelog'        => $data['changelog'] ?? '',
            ));
        } else {
            wp_send_json_error(array('message' => $data['error'] ?? 'Could not check version'));
        }
    }
    
    /**
     * Inject update info into WordPress update transient
     */
    private function inject_update_transient($new_version, $download_url) {
        $update = (object) array(
            'slug'        => 'ghost-post-connector',
            'plugin'      => GP_CONNECTOR_PLUGIN_BASENAME,
            'new_version' => $new_version,
            'package'     => esc_url_raw($download_url),
            'url'         => 'https://ghostpost.co.il',
        );
        
        $transient = get_site_transient('update_plugins');
        if (!is_object($transient)) {
            $transient = new stdClass();
        }
        $transient->response[GP_CONNECTOR_PLUGIN_BASENAME] = $update;
        set_site_transient('update_plugins', $transient);
    }
    
    /**
     * AJAX handler for fetching SEO data from platform
     */
    public function ajax_fetch_seo_data() {
        check_ajax_referer('gp_connector_nonce', 'nonce');
        
        if (!current_user_can('manage_options')) {
            wp_send_json_error('Permission denied');
        }
        
        $timestamp = time();
        $body = wp_json_encode(array(
            'siteUrl' => get_site_url(),
        ));
        
        $signature = $this->create_signature($body, $timestamp);
        
        $response = wp_remote_post(GP_API_URL . '/api/public/wp/seo-insights', array(
            'timeout' => 30,
            'headers' => array(
                'Content-Type'   => 'application/json',
                'X-GP-Site-Key'  => GP_SITE_KEY,
                'X-GP-Timestamp' => $timestamp,
                'X-GP-Signature' => $signature,
            ),
            'body' => $body,
        ));
        
        if (is_wp_error($response)) {
            wp_send_json_error(array('message' => $response->get_error_message()));
        }
        
        $status_code = wp_remote_retrieve_response_code($response);
        $data = json_decode(wp_remote_retrieve_body($response), true);
        
        if ($status_code === 200 && isset($data['success']) && $data['success']) {
            set_transient('gp_seo_insights', $data['data'], 30 * MINUTE_IN_SECONDS);
            wp_send_json_success($data['data']);
        } else {
            $cached = get_transient('gp_seo_insights');
            if ($cached) {
                wp_send_json_success($cached);
            }
            wp_send_json_error(array('message' => $data['error'] ?? 'Could not fetch SEO data'));
        }
    }
    
    /**
     * AJAX: Save snippet (create or update)
     */
    public function ajax_save_snippet() {
        check_ajax_referer('gp_connector_nonce', 'nonce');
        
        if (!current_user_can('manage_options')) {
            wp_send_json_error('Permission denied');
        }
        
        $snippets = get_option('gp_snippets', array());
        
        $id          = sanitize_text_field(isset($_POST['snippet_id']) ? $_POST['snippet_id'] : '');
        $title       = sanitize_text_field(isset($_POST['title']) ? $_POST['title'] : '');
        $description = sanitize_text_field(isset($_POST['description']) ? $_POST['description'] : '');
        $type        = sanitize_key(isset($_POST['type']) ? $_POST['type'] : 'html');
        $location    = sanitize_key(isset($_POST['location']) ? $_POST['location'] : 'header');
        $priority    = intval(isset($_POST['priority']) ? $_POST['priority'] : 10);
        $code        = wp_unslash(isset($_POST['code']) ? $_POST['code'] : '');
        
        if (empty($title)) {
            wp_send_json_error('Title is required');
        }
        
        $allowed_types = array('php', 'js', 'html', 'css', 'php_js', 'js_css', 'html_css');
        if (!in_array($type, $allowed_types, true)) {
            $type = 'html';
        }
        
        $now = current_time('Y-m-d H:i:s');
        
        if ($id) {
            foreach ($snippets as &$snippet) {
                if ($snippet['id'] === $id) {
                    $snippet['title']       = $title;
                    $snippet['description'] = $description;
                    $snippet['type']        = $type;
                    $snippet['location']    = $location;
                    $snippet['priority']    = $priority;
                    $snippet['code']        = $code;
                    $snippet['updated_at']  = $now;
                    break;
                }
            }
            unset($snippet);
        } else {
            $new_id = 'gp_snip_' . wp_generate_password(8, false);
            $snippets[] = array(
                'id'          => $new_id,
                'title'       => $title,
                'description' => $description,
                'type'        => $type,
                'location'    => $location,
                'priority'    => $priority,
                'code'        => $code,
                'status'      => 'inactive',
                'trashed'     => false,
                'created_at'  => $now,
                'updated_at'  => $now,
            );
            $id = $new_id;
        }
        
        update_option('gp_snippets', $snippets);
        wp_send_json_success(array('id' => $id));
    }
    
    /**
     * AJAX: Get snippet for editing
     */
    public function ajax_get_snippet() {
        check_ajax_referer('gp_connector_nonce', 'nonce');
        
        if (!current_user_can('manage_options')) {
            wp_send_json_error('Permission denied');
        }
        
        $id = sanitize_text_field(isset($_POST['snippet_id']) ? $_POST['snippet_id'] : '');
        $snippets = get_option('gp_snippets', array());
        
        foreach ($snippets as $snippet) {
            if ($snippet['id'] === $id) {
                wp_send_json_success($snippet);
            }
        }
        
        wp_send_json_error('Snippet not found');
    }
    
    /**
     * AJAX: Toggle snippet active/inactive
     */
    public function ajax_toggle_snippet() {
        check_ajax_referer('gp_connector_nonce', 'nonce');
        
        if (!current_user_can('manage_options')) {
            wp_send_json_error('Permission denied');
        }
        
        $id = sanitize_text_field(isset($_POST['snippet_id']) ? $_POST['snippet_id'] : '');
        $new_status = (isset($_POST['is_active']) && $_POST['is_active'] === '1') ? 'active' : 'inactive';
        $snippets = get_option('gp_snippets', array());
        
        foreach ($snippets as &$snippet) {
            if ($snippet['id'] === $id) {
                $snippet['status'] = $new_status;
                $snippet['updated_at'] = current_time('Y-m-d H:i:s');
                break;
            }
        }
        unset($snippet);
        
        update_option('gp_snippets', $snippets);
        wp_send_json_success();
    }
    
    /**
     * AJAX: Move snippet to trash
     */
    public function ajax_trash_snippet() {
        check_ajax_referer('gp_connector_nonce', 'nonce');
        
        if (!current_user_can('manage_options')) {
            wp_send_json_error('Permission denied');
        }
        
        $id = sanitize_text_field(isset($_POST['snippet_id']) ? $_POST['snippet_id'] : '');
        $snippets = get_option('gp_snippets', array());
        
        foreach ($snippets as &$snippet) {
            if ($snippet['id'] === $id) {
                $snippet['trashed'] = true;
                $snippet['status'] = 'inactive';
                $snippet['updated_at'] = current_time('Y-m-d H:i:s');
                break;
            }
        }
        unset($snippet);
        
        update_option('gp_snippets', $snippets);
        wp_send_json_success();
    }
    
    /**
     * AJAX: Restore snippet from trash
     */
    public function ajax_restore_snippet() {
        check_ajax_referer('gp_connector_nonce', 'nonce');
        
        if (!current_user_can('manage_options')) {
            wp_send_json_error('Permission denied');
        }
        
        $id = sanitize_text_field(isset($_POST['snippet_id']) ? $_POST['snippet_id'] : '');
        $snippets = get_option('gp_snippets', array());
        
        foreach ($snippets as &$snippet) {
            if ($snippet['id'] === $id) {
                $snippet['trashed'] = false;
                $snippet['updated_at'] = current_time('Y-m-d H:i:s');
                break;
            }
        }
        unset($snippet);
        
        update_option('gp_snippets', $snippets);
        wp_send_json_success();
    }
    
    /**
     * AJAX: Permanently delete snippet
     */
    public function ajax_delete_snippet_permanent() {
        check_ajax_referer('gp_connector_nonce', 'nonce');
        
        if (!current_user_can('manage_options')) {
            wp_send_json_error('Permission denied');
        }
        
        $id = sanitize_text_field(isset($_POST['snippet_id']) ? $_POST['snippet_id'] : '');
        $snippets = get_option('gp_snippets', array());
        
        $snippets = array_filter($snippets, function($s) use ($id) {
            return $s['id'] !== $id;
        });
        
        update_option('gp_snippets', array_values($snippets));
        wp_send_json_success();
    }
    
    /**
     * Execute active snippets in wp_head
     */
    public function execute_snippets_head() {
        $this->execute_snippets('header');
    }
    
    /**
     * Execute active snippets in wp_footer
     */
    public function execute_snippets_footer() {
        $this->execute_snippets('footer');
    }
    
    /**
     * Execute active snippets for a given location
     */
    private function execute_snippets($location) {
        $snippets = get_option('gp_snippets', array());
        if (!is_array($snippets)) return;
        
        $active = array_filter($snippets, function($s) use ($location) {
            if (($s['status'] ?? 'inactive') !== 'active') return false;
            if (!empty($s['trashed'])) return false;
            $loc = $s['location'] ?? 'header';
            return $loc === $location || $loc === 'everywhere';
        });
        
        usort($active, function($a, $b) {
            return ($a['priority'] ?? 10) - ($b['priority'] ?? 10);
        });
        
        foreach ($active as $snippet) {
            $type = $snippet['type'] ?? 'html';
            $code = $snippet['code'] ?? '';
            
            if (empty($code)) continue;
            
            switch ($type) {
                case 'js':
                    echo '<script>' . $code . '</script>' . "\\n";
                    break;
                case 'css':
                    echo '<style>' . $code . '</style>' . "\\n";
                    break;
                case 'html':
                    echo $code . "\\n";
                    break;
                case 'php':
                    try {
                        eval('?>' . $code);
                    } catch (\\Throwable $e) {
                        if (defined('WP_DEBUG') && WP_DEBUG) {
                            echo '<!-- GP Snippet Error: ' . esc_html($e->getMessage()) . ' -->';
                        }
                    }
                    break;
                case 'php_js':
                    // PHP portion executes server-side, JS portion wrapped in script tag
                    try {
                        eval('?>' . $code);
                    } catch (\\Throwable $e) {
                        if (defined('WP_DEBUG') && WP_DEBUG) {
                            echo '<!-- GP Snippet Error: ' . esc_html($e->getMessage()) . ' -->';
                        }
                    }
                    break;
                case 'js_css':
                    echo '<script>' . $code . '</script>' . "\\n";
                    echo '<style>' . $code . '</style>' . "\\n";
                    break;
                case 'html_css':
                    echo $code . "\\n";
                    break;
                default:
                    echo $code . "\\n";
                    break;
            }
        }
    }
}
`;
}
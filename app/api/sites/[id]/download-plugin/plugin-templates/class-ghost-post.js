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
        $icon = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzMzUgMjg4Ij48cGF0aCBmaWxsPSIjOUI0REUwIiBkPSJNMzEzLjczNiAxMjcuNzQ3QzMxMy42ODEgMTIzLjIyOSAzMTEuOTI0IDExMi4zNjIgMzExLjA2NCAxMDcuNzE2QzMxMC4yMDQgMTAzLjA1MSAzMTQuNzk3IDkxLjgwMDcgMzE2LjgxOSA4My4yNjczQzMxOS41MjcgNzEuODMzOSAzMjAuMzQxIDYxLjU5OTEgMzE3LjE3NiA1Ni4wMzc3QzMxNC40NzcgNTEuMjkwOSAyOTEuOTYxIDUyLjUyNTggMjgyLjc3NSA1My42NTk2QzI3OS45ODUgNTQuMDA3NSAyNjguMjgzIDM1LjExMDUgMjQ0LjY2OSAyMS4zODE2QzIyMy42ODIgOS4xODkyIDE5MS44MjUgMiAxNzAuNjkxIDJDMTA5Ljc1OCAyIDU3LjYyNyAzOS4wNTI3IDM2LjM4MjggOTEuNDcxNkMzNi4yMTgxIDkxLjg4MzQgMzAuODkzNCA5MC40NDcxIDIyLjY3NzUgOTEuNzgyN0MxNC4yNDIyIDkzLjE1NDcgMi44OTczNyA5Ny4zNTMxIDIuMTEwNTQgMTAxLjM1QzEuMjc3OTggMTA1LjU1NyA1LjIzMDM1IDEyMC4wNDUgMTEuMjA0NyAxMzAuNTU1QzE3LjY4MjIgMTQxLjk0MyAyNS4zNDkxIDE0OS43NDUgMjUuMzk0OCAxNTAuODQyQzI3LjgzNzYgMjA0LjkxNiA2MS45ODE2IDI1MC42NDkgMTA5LjIgMjcyLjQ5MUMxMjIuNzk2IDI3OC43ODQgMTQ0LjE5NSAyODYuNzMyIDE3MC42OTEgMjg1Ljk0NkMyNDUuODA0IDI4My43MjMgMzAyLjk5NSAyMTMuNDY5IDMyNS4xNDQgMTQ1LjkwM0MzMzAuMDg1IDEzMC44MjkgMzMzLjE1IDExNi45MjYgMzMyLjk5NCAxMDguNzc3QzMzMi45ODUgMTA4LjExOCAzMzIuMjk5IDEwNy42ODkgMzMxLjY5NSAxMDcuOTcyQzMyNy42OTcgMTA5Ljg0NyAzMTYuMDg3IDExNi4wNjcgMzEzLjUyNSAxMTguNjgzWiIvPjwvc3ZnPg==';
        
        // Top-level menu
        add_menu_page(
            __('Ghost Post Connector', 'ghost-post-connector'),
            __('Ghost Post Connector', 'ghost-post-connector'),
            'manage_options',
            'ghost-post-connector',
            array($this, 'render_admin_page'),
            $icon,
            30
        );
        
        // Dashboard submenu (replaces auto-generated first item)
        add_submenu_page(
            'ghost-post-connector',
            __('Dashboard', 'ghost-post-connector'),
            __('Dashboard', 'ghost-post-connector'),
            'manage_options',
            'ghost-post-connector',
            array($this, 'render_admin_page')
        );
        
        // Redirections submenu
        add_submenu_page(
            'ghost-post-connector',
            __('Redirections', 'ghost-post-connector'),
            __('Redirections', 'ghost-post-connector'),
            'manage_options',
            'ghost-post-redirections',
            array($this, 'render_redirections_page')
        );
        
        // Settings submenu
        add_submenu_page(
            'ghost-post-connector',
            __('Settings', 'ghost-post-connector'),
            __('Settings', 'ghost-post-connector'),
            'manage_options',
            'ghost-post-settings',
            array($this, 'render_settings_page')
        );
    }
    
    /**
     * Enqueue admin styles and scripts
     */
    public function enqueue_admin_styles($hook) {
        // Load on our plugin pages only
        $plugin_pages = array(
            'toplevel_page_ghost-post-connector',
            'ghost-post-connector_page_ghost-post-redirections',
            'ghost-post-connector_page_ghost-post-settings',
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
            ),
        ));
    }
    
    /**
     * Render dashboard page
     */
    public function render_admin_page() {
        include GP_CONNECTOR_PLUGIN_DIR . 'admin/views/dashboard-page.php';
    }
    
    /**
     * Render redirections page
     */
    public function render_redirections_page() {
        $this->redirections_manager = $this->redirections_manager ?? new GP_Redirections_Manager();
        include GP_CONNECTOR_PLUGIN_DIR . 'admin/views/redirections-page.php';
    }
    
    /**
     * Render settings page
     */
    public function render_settings_page() {
        include GP_CONNECTOR_PLUGIN_DIR . 'admin/views/settings-page.php';
    }
    
    /**
     * Print global admin styles (sidebar icon styling — runs on ALL admin pages)
     */
    public function admin_head_styles() {
        echo '<style>
            #adminmenu .toplevel_page_ghost-post-connector .wp-menu-image img {
                filter: none !important;
                opacity: 1 !important;
                max-width: 20px !important;
                padding: 0 !important;
            }
            #adminmenu .toplevel_page_ghost-post-connector:hover .wp-menu-image img,
            #adminmenu .toplevel_page_ghost-post-connector.current .wp-menu-image img,
            #adminmenu .toplevel_page_ghost-post-connector.wp-has-current-submenu .wp-menu-image img {
                filter: brightness(1.15) !important;
                opacity: 1 !important;
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
        </style>';
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

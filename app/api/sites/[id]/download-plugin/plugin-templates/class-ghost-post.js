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
     * Initialize the plugin
     */
    public function init() {
        $this->validator = new GP_Request_Validator();
        $this->api_handler = new GP_API_Handler($this->validator);
        
        // Register REST API endpoints
        add_action('rest_api_init', array($this, 'register_rest_routes'));
        
        // Admin menu
        add_action('admin_menu', array($this, 'add_admin_menu'));
        
        // Admin styles
        add_action('admin_enqueue_scripts', array($this, 'enqueue_admin_styles'));
        
        // AJAX actions for admin
        add_action('wp_ajax_gp_test_connection', array($this, 'ajax_test_connection'));
        add_action('wp_ajax_gp_send_ping', array($this, 'ajax_send_ping'));
        add_action('wp_ajax_gp_disconnect', array($this, 'ajax_disconnect'));
        
        // Schedule ping cron
        add_action('gp_connector_ping', array($this, 'send_ping'));
        if (!wp_next_scheduled('gp_connector_ping')) {
            wp_schedule_event(time(), 'hourly', 'gp_connector_ping');
        }
    }
    
    /**
     * Register REST API routes
     */
    public function register_rest_routes() {
        $this->api_handler->register_routes();
    }
    
    /**
     * Add admin menu
     */
    public function add_admin_menu() {
        add_options_page(
            __('Ghost Post', 'ghost-post-connector'),
            __('Ghost Post', 'ghost-post-connector'),
            'manage_options',
            'ghost-post-connector',
            array($this, 'render_admin_page')
        );
    }
    
    /**
     * Enqueue admin styles
     */
    public function enqueue_admin_styles($hook) {
        if ($hook !== 'settings_page_ghost-post-connector') {
            return;
        }
        
        wp_enqueue_style(
            'gp-connector-admin',
            GP_CONNECTOR_PLUGIN_URL . 'admin/css/admin.css',
            array(),
            GP_CONNECTOR_VERSION
        );
    }
    
    /**
     * Render admin settings page
     */
    public function render_admin_page() {
        include GP_CONNECTOR_PLUGIN_DIR . 'admin/views/settings-page.php';
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

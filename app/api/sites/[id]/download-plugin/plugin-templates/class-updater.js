/**
 * Generate the WordPress plugin updater class
 * This hooks into WordPress's plugin update system to check for updates from gp-platform
 */
export function getClassUpdater() {
  return `<?php
/**
 * Ghost Post Plugin Updater
 * 
 * Handles automatic updates from the Ghost Post platform.
 * This hooks into WordPress's native update system.
 */

if (!defined('ABSPATH')) {
    exit;
}

class GP_Updater {
    /**
     * Plugin basename
     */
    private $plugin_basename;

    /**
     * Plugin slug
     */
    private $plugin_slug;

    /**
     * Current plugin version
     */
    private $current_version;

    /**
     * Update check cache key
     */
    private $cache_key = 'gp_connector_update_check';

    /**
     * Cache duration in seconds (12 hours)
     */
    private $cache_duration = 43200;

    /**
     * Constructor
     */
    public function __construct() {
        $this->plugin_basename = GP_CONNECTOR_PLUGIN_BASENAME;
        $this->plugin_slug = 'ghost-post-connector';
        $this->current_version = GP_CONNECTOR_VERSION;
    }

    /**
     * Initialize the updater hooks
     */
    public function init() {
        // Hook into the update check
        add_filter('pre_set_site_transient_update_plugins', array($this, 'check_for_update'));
        
        // Hook into plugin information popup
        add_filter('plugins_api', array($this, 'plugin_info'), 20, 3);
        
        // Hook into after update to clear cache
        add_action('upgrader_process_complete', array($this, 'after_update'), 10, 2);
        
        // Add update check action for manual trigger
        add_action('wp_ajax_gp_check_for_updates', array($this, 'ajax_check_updates'));
    }

    /**
     * Check for plugin updates
     * 
     * @param object $transient WordPress update transient
     * @return object Modified transient
     */
    public function check_for_update($transient) {
        if (empty($transient->checked)) {
            return $transient;
        }

        // Get cached update info
        $update_info = get_transient($this->cache_key);

        // If no cache, fetch from server
        if ($update_info === false) {
            $update_info = $this->fetch_update_info();
            
            if ($update_info) {
                set_transient($this->cache_key, $update_info, $this->cache_duration);
            }
        }

        // If we have update info and there's a new version
        if ($update_info && !empty($update_info['update_available']) && $update_info['update_available']) {
            $transient->response[$this->plugin_basename] = (object) array(
                'slug'        => $this->plugin_slug,
                'plugin'      => $this->plugin_basename,
                'new_version' => $update_info['version'],
                'url'         => $update_info['homepage'],
                'package'     => $update_info['download_url'],
                'tested'      => $update_info['tested_wp'],
                'requires'    => $update_info['requires_wp'],
                'requires_php' => $update_info['requires_php'],
            );
        } else {
            // Make sure we're not falsely reporting an update
            if (isset($transient->response[$this->plugin_basename])) {
                unset($transient->response[$this->plugin_basename]);
            }
            
            // Add to no_update to show it's been checked
            $transient->no_update[$this->plugin_basename] = (object) array(
                'slug'        => $this->plugin_slug,
                'plugin'      => $this->plugin_basename,
                'new_version' => $this->current_version,
                'url'         => 'https://ghostpost.io',
            );
        }

        return $transient;
    }

    /**
     * Provide plugin information for the update details popup
     * 
     * @param mixed $result Result from other filters
     * @param string $action The type of information being requested
     * @param object $args Plugin arguments
     * @return object|mixed Plugin info or original result
     */
    public function plugin_info($result, $action, $args) {
        if ($action !== 'plugin_information') {
            return $result;
        }

        if (!isset($args->slug) || $args->slug !== $this->plugin_slug) {
            return $result;
        }

        // Get cached update info
        $update_info = get_transient($this->cache_key);

        if ($update_info === false) {
            $update_info = $this->fetch_update_info();
            
            if ($update_info) {
                set_transient($this->cache_key, $update_info, $this->cache_duration);
            }
        }

        if (!$update_info) {
            return $result;
        }

        $plugin_info = new stdClass();
        $plugin_info->name = $update_info['plugin_name'];
        $plugin_info->slug = $this->plugin_slug;
        $plugin_info->version = $update_info['version'];
        $plugin_info->author = '<a href="' . esc_url($update_info['author_profile']) . '">' . esc_html($update_info['author']) . '</a>';
        $plugin_info->homepage = $update_info['homepage'];
        $plugin_info->requires = $update_info['requires_wp'];
        $plugin_info->requires_php = $update_info['requires_php'];
        $plugin_info->tested = $update_info['tested_wp'];
        $plugin_info->last_updated = $update_info['last_updated'];
        $plugin_info->download_link = $update_info['download_url'];
        
        // Sections for the popup
        $plugin_info->sections = array(
            'description' => $update_info['sections']['description'],
            'installation' => $update_info['sections']['installation'],
            'changelog' => nl2br(esc_html($update_info['sections']['changelog'])),
        );

        // Banners (optional)
        $plugin_info->banners = array(
            'low' => '',
            'high' => '',
        );

        return $plugin_info;
    }

    /**
     * Fetch update information from the server
     * 
     * @return array|false Update info or false on failure
     */
    private function fetch_update_info() {
        $api_url = GP_API_URL . '/api/plugin/update-check';
        
        $response = wp_remote_get($api_url, array(
            'timeout' => 15,
            'headers' => array(
                'Accept' => 'application/json',
            ),
            'body' => array(
                'site_key' => GP_SITE_KEY,
                'current_version' => $this->current_version,
            ),
        ));

        if (is_wp_error($response)) {
            error_log('Ghost Post Updater: Failed to check for updates - ' . $response->get_error_message());
            return false;
        }

        $response_code = wp_remote_retrieve_response_code($response);
        if ($response_code !== 200) {
            error_log('Ghost Post Updater: Update check returned status ' . $response_code);
            return false;
        }

        $body = wp_remote_retrieve_body($response);
        $data = json_decode($body, true);

        if (!$data || !isset($data['success']) || !$data['success']) {
            return false;
        }

        return $data;
    }

    /**
     * Clear cache after plugin update
     * 
     * @param WP_Upgrader $upgrader Upgrader instance
     * @param array $options Update options
     */
    public function after_update($upgrader, $options) {
        if ($options['action'] === 'update' && $options['type'] === 'plugin') {
            // Check if our plugin was updated
            if (isset($options['plugins']) && in_array($this->plugin_basename, $options['plugins'])) {
                delete_transient($this->cache_key);
            }
        }
    }

    /**
     * AJAX handler for manual update check
     */
    public function ajax_check_updates() {
        if (!current_user_can('update_plugins')) {
            wp_send_json_error('Unauthorized');
        }

        // Clear cache and force check
        delete_transient($this->cache_key);
        $update_info = $this->fetch_update_info();

        if ($update_info) {
            set_transient($this->cache_key, $update_info, $this->cache_duration);
            wp_send_json_success($update_info);
        } else {
            wp_send_json_error('Failed to check for updates');
        }
    }

    /**
     * Force update check (useful for testing)
     */
    public function force_check() {
        delete_transient($this->cache_key);
        delete_site_transient('update_plugins');
        wp_update_plugins();
    }
}
`;
}

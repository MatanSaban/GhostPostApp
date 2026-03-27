/**
 * Generate GP_Redirections_Manager class
 */
export function getClassRedirectionsManager() {
  return `<?php
/**
 * Ghost Post Redirections Manager
 * 
 * Handles detection of popular redirection plugins,
 * reading/creating/updating/deleting redirects,
 * and syncing with the Ghost Post platform.
 */

if (!defined('ABSPATH')) {
    exit;
}

class GP_Redirections_Manager {

    /**
     * Flag to prevent webhook loops.
     * When true, redirect changes will NOT push a webhook back to the platform
     * (because the change originated from the platform via REST API).
     * 
     * @var bool
     */
    private static $is_gp_api_request = false;

    /**
     * Mark that the current operation originated from gp-platform.
     * Prevents redirect webhooks from being sent back to the platform.
     */
    public static function mark_gp_origin() {
        self::$is_gp_api_request = true;
    }

    /**
     * Clear the gp-platform origin flag.
     */
    public static function clear_gp_origin() {
        self::$is_gp_api_request = false;
    }

    /**
     * Known redirection plugins and their detection constants/classes.
     */
    private static $known_plugins = array(
        'redirection' => array(
            'name'    => 'Redirection',
            'slug'    => 'redirection/redirection.php',
            'detect'  => array('class' => 'Red_Item'),
            'version' => null,
        ),
        'yoast_premium' => array(
            'name'    => 'Yoast SEO Premium',
            'slug'    => 'wordpress-seo-premium/wp-seo-premium.php',
            'detect'  => array('class' => 'WPSEO_Redirect_Manager'),
            'version' => 'WPSEO_VERSION',
        ),
        'rankmath' => array(
            'name'    => 'Rank Math',
            'slug'    => 'seo-by-rank-math/rank-math.php',
            'detect'  => array('constant' => 'RANK_MATH_VERSION'),
            'version' => 'RANK_MATH_VERSION',
        ),
        'safe_redirect_manager' => array(
            'name'    => 'Safe Redirect Manager',
            'slug'    => 'safe-redirect-manager/safe-redirect-manager.php',
            'detect'  => array('function' => 'srm_init'),
            'version' => null,
        ),
        'simple_301' => array(
            'name'    => 'Simple 301 Redirects',
            'slug'    => 'simple-301-redirects/wp-simple-301-redirects.php',
            'detect'  => array('option' => '301_redirects'),
            'version' => null,
        ),
        'eps_301' => array(
            'name'    => '301 Redirects',
            'slug'    => '301-redirects/301-redirects.php',
            'detect'  => array('class' => 'EPS_Redirects'),
            'version' => null,
        ),
    );

    /**
     * Detect which redirection plugins are installed and active.
     */
    public function detect_plugins() {
        $detected = array();

        foreach (self::$known_plugins as $key => $plugin) {
            $found = false;
            $version = null;
            $d = $plugin['detect'];

            if (isset($d['constant']) && defined($d['constant'])) {
                $found = true;
            } elseif (isset($d['class']) && class_exists($d['class'])) {
                $found = true;
            } elseif (isset($d['function']) && function_exists($d['function'])) {
                $found = true;
            } elseif (isset($d['option'])) {
                $val = get_option($d['option'], null);
                if ($val !== null) {
                    $found = true;
                }
            }

            if ($found) {
                if ($plugin['version'] && defined($plugin['version'])) {
                    $version = constant($plugin['version']);
                }
                $detected[] = array(
                    'key'     => $key,
                    'name'    => $plugin['name'],
                    'version' => $version,
                );
            }
        }

        return $detected;
    }

    /**
     * Get the primary detected redirection plugin key.
     */
    public function get_primary_plugin() {
        $detected = $this->detect_plugins();
        if (empty($detected)) {
            return null;
        }
        $priority = array('rankmath', 'yoast_premium', 'redirection', 'safe_redirect_manager', 'simple_301', 'eps_301');
        foreach ($priority as $key) {
            foreach ($detected as $plugin) {
                if ($plugin['key'] === $key) {
                    return $key;
                }
            }
        }
        return $detected[0]['key'];
    }

    /**
     * Get all redirects from the primary detected plugin, or from Ghost Post storage.
     */
    public function get_all_redirects() {
        $primary = $this->get_primary_plugin();

        switch ($primary) {
            case 'rankmath':
                return $this->get_rankmath_redirects();
            case 'yoast_premium':
                return $this->get_yoast_redirects();
            case 'redirection':
                return $this->get_redirection_plugin_redirects();
            case 'safe_redirect_manager':
                return $this->get_srm_redirects();
            case 'simple_301':
                return $this->get_simple_301_redirects();
            case 'eps_301':
                return $this->get_eps_301_redirects();
            default:
                return $this->get_gp_redirects();
        }
    }

    /**
     * Get internal Ghost Post redirects stored in wp_options.
     */
    public function get_gp_redirects() {
        $redirects = get_option('gp_connector_redirects', array());
        $result = array();
        foreach ($redirects as $index => $r) {
            $result[] = array(
                'id'         => 'gp_' . $index,
                'source'     => $r['source'] ?? '',
                'target'     => $r['target'] ?? '',
                'type'       => intval($r['type'] ?? 301),
                'is_active'  => isset($r['is_active']) ? (bool) $r['is_active'] : true,
                'hit_count'  => intval($r['hit_count'] ?? 0),
                'created_at' => $r['created_at'] ?? '',
                'plugin'     => 'ghost-post',
            );
        }
        return $result;
    }

    /**
     * Create a redirect in Ghost Post storage.
     */
    public function create_redirect($data) {
        $source = sanitize_text_field($data['source'] ?? '');
        $target = sanitize_text_field($data['target'] ?? '');
        $type   = intval($data['type'] ?? 301);

        if (empty($source) || empty($target)) {
            return new WP_Error('missing_fields', 'Source and target are required', array('status' => 400));
        }

        if (!in_array($type, array(301, 302, 307), true)) {
            $type = 301;
        }

        if (strpos($source, '/') !== 0) {
            $source = '/' . $source;
        }

        $redirects = get_option('gp_connector_redirects', array());

        foreach ($redirects as $r) {
            if (($r['source'] ?? '') === $source) {
                return new WP_Error('duplicate', 'A redirect for this source URL already exists', array('status' => 409));
            }
        }

        $new_redirect = array(
            'source'     => $source,
            'target'     => $target,
            'type'       => $type,
            'is_active'  => true,
            'hit_count'  => 0,
            'created_at' => current_time('mysql'),
        );

        $redirects[] = $new_redirect;
        update_option('gp_connector_redirects', $redirects);

        $result = array(
            'id'     => 'gp_' . (count($redirects) - 1),
            'source' => $source,
            'target' => $target,
            'type'   => $type,
        );

        $this->push_redirect_webhook('created', $new_redirect);

        return $result;
    }

    /**
     * Update a redirect in Ghost Post storage.
     */
    public function update_redirect($id, $data) {
        $redirects = get_option('gp_connector_redirects', array());
        $index = intval(str_replace('gp_', '', $id));

        if (!isset($redirects[$index])) {
            return new WP_Error('not_found', 'Redirect not found', array('status' => 404));
        }

        if (isset($data['source'])) {
            $source = sanitize_text_field($data['source']);
            if (strpos($source, '/') !== 0) {
                $source = '/' . $source;
            }
            $redirects[$index]['source'] = $source;
        }
        if (isset($data['target'])) {
            $redirects[$index]['target'] = sanitize_text_field($data['target']);
        }
        if (isset($data['type'])) {
            $type = intval($data['type']);
            if (in_array($type, array(301, 302, 307), true)) {
                $redirects[$index]['type'] = $type;
            }
        }
        if (isset($data['is_active'])) {
            $redirects[$index]['is_active'] = (bool) $data['is_active'];
        }

        update_option('gp_connector_redirects', $redirects);
        $this->push_redirect_webhook('updated', $redirects[$index]);
        return $redirects[$index];
    }

    /**
     * Delete a redirect from Ghost Post storage.
     */
    public function delete_redirect($id) {
        $redirects = get_option('gp_connector_redirects', array());
        $index = intval(str_replace('gp_', '', $id));

        if (!isset($redirects[$index])) {
            return new WP_Error('not_found', 'Redirect not found', array('status' => 404));
        }

        $deleted_redirect = $redirects[$index];
        array_splice($redirects, $index, 1);
        update_option('gp_connector_redirects', $redirects);
        $this->push_redirect_webhook('deleted', $deleted_redirect);
        return true;
    }

    /**
     * Import redirects from a detected third-party plugin into GP storage.
     */
    public function import_from_detected_plugin() {
        $primary = $this->get_primary_plugin();
        if (!$primary || $primary === 'ghost-post') {
            return array('imported' => 0, 'skipped' => 0, 'errors' => 0, 'message' => 'No external redirection plugin detected');
        }

        $external_redirects = $this->get_all_redirects();
        $existing = get_option('gp_connector_redirects', array());
        $existing_sources = array_column($existing, 'source');

        $imported = 0;
        $skipped = 0;

        foreach ($external_redirects as $r) {
            $source = $r['source'] ?? '';
            if (empty($source)) {
                continue;
            }
            if (in_array($source, $existing_sources, true)) {
                $skipped++;
                continue;
            }

            $existing[] = array(
                'source'     => $source,
                'target'     => $r['target'] ?? '',
                'type'       => intval($r['type'] ?? 301),
                'is_active'  => isset($r['is_active']) ? (bool) $r['is_active'] : true,
                'hit_count'  => intval($r['hit_count'] ?? 0),
                'created_at' => current_time('mysql'),
            );
            $existing_sources[] = $source;
            $imported++;
        }

        update_option('gp_connector_redirects', $existing);

        return array(
            'imported'    => $imported,
            'skipped'     => $skipped,
            'errors'      => 0,
            'source'      => $primary,
            'total_after' => count($existing),
        );
    }

    /**
     * Bulk sync redirects from the gp-platform.
     */
    public function bulk_sync($redirects) {
        $synced = array();
        foreach ($redirects as $r) {
            $source = sanitize_text_field($r['sourceUrl'] ?? $r['source'] ?? '');
            $target = sanitize_text_field($r['targetUrl'] ?? $r['target'] ?? '');
            $type = intval($r['type'] ?? 301);

            if (empty($source) || empty($target)) {
                continue;
            }

            if (strpos($source, '/') !== 0) {
                $source = '/' . $source;
            }

            if ($type === 0) {
                $type_str = strtoupper($r['type'] ?? '');
                if ($type_str === 'PERMANENT') $type = 301;
                elseif ($type_str === 'TEMPORARY') $type = 302;
                elseif ($type_str === 'FOUND') $type = 307;
                else $type = 301;
            }

            $synced[] = array(
                'source'     => $source,
                'target'     => $target,
                'type'       => in_array($type, array(301, 302, 307), true) ? $type : 301,
                'is_active'  => isset($r['isActive']) ? (bool) $r['isActive'] : true,
                'hit_count'  => intval($r['hitCount'] ?? $r['hit_count'] ?? 0),
                'created_at' => $r['createdAt'] ?? $r['created_at'] ?? current_time('mysql'),
            );
        }

        update_option('gp_connector_redirects', $synced);
        return array('success' => true, 'count' => count($synced));
    }

    // ==========================================
    // Plugin-specific extraction methods
    // ==========================================

    private function get_rankmath_redirects() {
        global $wpdb;
        $table = $wpdb->prefix . 'rank_math_redirections';

        if ($wpdb->get_var($wpdb->prepare("SHOW TABLES LIKE %s", $table)) !== $table) {
            return array();
        }

        $rows = $wpdb->get_results(
            $wpdb->prepare("SELECT * FROM {$table} ORDER BY id DESC LIMIT %d", 500),
            ARRAY_A
        );

        $result = array();
        foreach ($rows as $row) {
            $sources = maybe_unserialize($row['sources'] ?? '');
            $source = '';
            if (is_array($sources) && !empty($sources)) {
                $source = $sources[0]['pattern'] ?? '';
            } elseif (is_string($sources)) {
                $source = $sources;
            }

            $result[] = array(
                'id'         => 'rm_' . $row['id'],
                'source'     => $source,
                'target'     => $row['url_to'] ?? '',
                'type'       => intval($row['header_code'] ?? 301),
                'is_active'  => ($row['status'] ?? 'active') === 'active',
                'hit_count'  => intval($row['hits'] ?? 0),
                'created_at' => $row['created'] ?? '',
                'plugin'     => 'rankmath',
            );
        }
        return $result;
    }

    private function get_yoast_redirects() {
        $redirects = get_option('wpseo-premium-redirects-base', array());
        if (!is_array($redirects) || empty($redirects)) {
            $redirects = get_option('wpseo_redirect', array());
        }

        $result = array();
        $index = 0;
        if (is_array($redirects)) {
            foreach ($redirects as $source => $data) {
                if (is_array($data)) {
                    $target = $data['url'] ?? '';
                    $type = intval($data['type'] ?? 301);
                } else {
                    $target = $data;
                    $type = 301;
                }

                $result[] = array(
                    'id'         => 'yoast_' . $index,
                    'source'     => is_string($source) ? $source : '',
                    'target'     => $target,
                    'type'       => $type,
                    'is_active'  => true,
                    'hit_count'  => 0,
                    'created_at' => '',
                    'plugin'     => 'yoast_premium',
                );
                $index++;
            }
        }
        return $result;
    }

    private function get_redirection_plugin_redirects() {
        global $wpdb;
        $table = $wpdb->prefix . 'redirection_items';

        if ($wpdb->get_var($wpdb->prepare("SHOW TABLES LIKE %s", $table)) !== $table) {
            return array();
        }

        $rows = $wpdb->get_results(
            $wpdb->prepare("SELECT * FROM {$table} ORDER BY id DESC LIMIT %d", 500),
            ARRAY_A
        );

        $result = array();
        foreach ($rows as $row) {
            $type = intval($row['action_code'] ?? 301);
            $result[] = array(
                'id'         => 'red_' . $row['id'],
                'source'     => $row['url'] ?? '',
                'target'     => $row['action_data'] ?? '',
                'type'       => $type,
                'is_active'  => ($row['status'] ?? 'enabled') === 'enabled',
                'hit_count'  => intval($row['last_count'] ?? 0),
                'created_at' => '',
                'plugin'     => 'redirection',
            );
        }
        return $result;
    }

    private function get_srm_redirects() {
        $posts = get_posts(array(
            'post_type'      => 'redirect_rule',
            'posts_per_page' => 500,
            'post_status'    => 'publish',
        ));

        $result = array();
        foreach ($posts as $post) {
            $source = get_post_meta($post->ID, '_redirect_rule_from', true);
            $target = get_post_meta($post->ID, '_redirect_rule_to', true);
            $code   = intval(get_post_meta($post->ID, '_redirect_rule_status_code', true));

            $result[] = array(
                'id'         => 'srm_' . $post->ID,
                'source'     => $source ?: '',
                'target'     => $target ?: '',
                'type'       => $code ?: 301,
                'is_active'  => $post->post_status === 'publish',
                'hit_count'  => 0,
                'created_at' => $post->post_date,
                'plugin'     => 'safe_redirect_manager',
            );
        }
        return $result;
    }

    private function get_simple_301_redirects() {
        $redirects = get_option('301_redirects', array());
        if (!is_array($redirects)) {
            return array();
        }

        $result = array();
        $index = 0;
        foreach ($redirects as $source => $target) {
            $result[] = array(
                'id'         => 's301_' . $index,
                'source'     => $source,
                'target'     => $target,
                'type'       => 301,
                'is_active'  => true,
                'hit_count'  => 0,
                'created_at' => '',
                'plugin'     => 'simple_301',
            );
            $index++;
        }
        return $result;
    }

    private function get_eps_301_redirects() {
        $redirects = get_option('eps_redirects', array());
        if (!is_array($redirects)) {
            return array();
        }

        $result = array();
        foreach ($redirects as $index => $r) {
            $result[] = array(
                'id'         => 'eps_' . $index,
                'source'     => $r['url_from'] ?? '',
                'target'     => $r['url_to'] ?? '',
                'type'       => intval($r['status'] ?? 301),
                'is_active'  => true,
                'hit_count'  => 0,
                'created_at' => '',
                'plugin'     => 'eps_301',
            );
        }
        return $result;
    }

    /**
     * Push a redirect change to the Ghost Post platform via webhook.
     * Skipped when the change originated from the platform (prevents loops).
     *
     * @param string $action   "created" | "updated" | "deleted"
     * @param array  $redirect The redirect data (source, target, type, is_active, hit_count)
     */
    private function push_redirect_webhook($action, $redirect) {
        // Skip if this change originated from gp-platform (REST API)
        if (self::$is_gp_api_request) {
            return;
        }

        if (!defined('GP_API_URL') || !defined('GP_SITE_KEY') || !defined('GP_SITE_SECRET')) {
            return;
        }

        $endpoint = GP_API_URL . '/api/public/wp/redirect-updated';
        $timestamp = time();

        $payload = array(
            'action'   => $action,
            'redirect' => array(
                'source'    => $redirect['source'] ?? '',
                'target'    => $redirect['target'] ?? '',
                'type'      => intval($redirect['type'] ?? 301),
                'is_active' => isset($redirect['is_active']) ? (bool) $redirect['is_active'] : true,
                'hit_count' => intval($redirect['hit_count'] ?? 0),
            ),
            'source' => 'wordpress',
        );

        $body = wp_json_encode($payload);
        $signature = hash_hmac('sha256', $timestamp . '.' . $body, GP_SITE_SECRET);

        wp_remote_post($endpoint, array(
            'timeout'  => 5,
            'blocking' => false,
            'headers'  => array(
                'Content-Type'   => 'application/json',
                'X-GP-Site-Key'  => GP_SITE_KEY,
                'X-GP-Timestamp' => (string) $timestamp,
                'X-GP-Signature' => $signature,
            ),
            'body' => $body,
        ));
    }

    /**
     * Execute Ghost Post redirects on frontend requests.
     */
    public function maybe_redirect() {
        if (is_admin()) {
            return;
        }

        $request_uri = $_SERVER['REQUEST_URI'] ?? '';
        $path = wp_parse_url($request_uri, PHP_URL_PATH);

        if (empty($path)) {
            return;
        }

        $redirects = get_option('gp_connector_redirects', array());

        foreach ($redirects as $index => &$r) {
            $is_active = isset($r['is_active']) ? (bool) $r['is_active'] : true;
            if ($is_active && ($r['source'] ?? '') === $path) {
                $r['hit_count'] = intval($r['hit_count'] ?? 0) + 1;
                update_option('gp_connector_redirects', $redirects);

                // Sync updated hit count to platform
                $this->push_redirect_webhook('updated', $r);

                $type = intval($r['type'] ?? 301);
                if (!in_array($type, array(301, 302, 307), true)) {
                    $type = 301;
                }

                wp_redirect(esc_url_raw($r['target']), $type);
                exit;
            }
        }
    }
}
`;
}

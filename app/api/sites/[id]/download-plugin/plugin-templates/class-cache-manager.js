/**
 * Generate Cache Manager class.
 * Flushes WordPress core object cache, Elementor CSS cache, and known third-party caches.
 */
export function getClassCacheManager() {
  return `<?php
/**
 * GhostSEO Cache Manager
 *
 * Clears WordPress core cache, page caches, and Elementor CSS
 * so that fresh edits are visible immediately on the live site.
 */

if (!defined('ABSPATH')) {
    exit;
}

class GP_Cache_Manager {

    /**
     * Clear all known caches. Returns a list of what was cleared.
     *
     * @param array $post_ids Optional list of post IDs to target (for per-post caches).
     */
    public static function clear_all($post_ids = array()) {
        $cleared = array();

        // 1. WordPress object cache
        if (function_exists('wp_cache_flush')) {
            wp_cache_flush();
            $cleared[] = 'wp_object_cache';
        }

        // 2. Per-post cache invalidation (post meta, term relationships, etc.)
        if (!empty($post_ids) && is_array($post_ids)) {
            foreach ($post_ids as $pid) {
                $pid = intval($pid);
                if ($pid > 0) {
                    clean_post_cache($pid);
                }
            }
            $cleared[] = 'post_cache';
        }

        // 3. Elementor CSS cache
        if (class_exists('\\Elementor\\Plugin')) {
            try {
                $elementor = \\Elementor\\Plugin::$instance;
                if ($elementor && isset($elementor->files_manager)) {
                    $elementor->files_manager->clear_cache();
                    $cleared[] = 'elementor_css';
                }
            } catch (Exception $e) {
                // ignore; best effort
            }

            // Also drop the per-post _elementor_css meta for targeted posts
            if (!empty($post_ids) && is_array($post_ids)) {
                foreach ($post_ids as $pid) {
                    $pid = intval($pid);
                    if ($pid > 0) {
                        delete_post_meta($pid, '_elementor_css');
                    }
                }
            }
        }

        // 4. WP Rocket
        if (function_exists('rocket_clean_domain')) {
            rocket_clean_domain();
            $cleared[] = 'wp_rocket';
        } elseif (function_exists('rocket_clean_post') && !empty($post_ids)) {
            foreach ($post_ids as $pid) { rocket_clean_post(intval($pid)); }
            $cleared[] = 'wp_rocket_post';
        }

        // 5. W3 Total Cache
        if (function_exists('w3tc_flush_all')) {
            w3tc_flush_all();
            $cleared[] = 'w3tc';
        } elseif (function_exists('w3tc_pgcache_flush')) {
            w3tc_pgcache_flush();
            $cleared[] = 'w3tc_pgcache';
        }

        // 6. WP Super Cache
        if (function_exists('wp_cache_clear_cache')) {
            wp_cache_clear_cache();
            $cleared[] = 'wp_super_cache';
        }

        // 7. LiteSpeed Cache
        if (class_exists('LiteSpeed_Cache_API')) {
            if (method_exists('LiteSpeed_Cache_API', 'purge_all')) {
                LiteSpeed_Cache_API::purge_all();
                $cleared[] = 'litespeed';
            }
        }
        do_action('litespeed_purge_all');

        // 8. SG Optimizer (SiteGround)
        if (function_exists('sg_cachepress_purge_cache')) {
            sg_cachepress_purge_cache();
            $cleared[] = 'sg_optimizer';
        }

        // 9. Autoptimize
        if (class_exists('autoptimizeCache')) {
            if (method_exists('autoptimizeCache', 'clearall')) {
                autoptimizeCache::clearall();
                $cleared[] = 'autoptimize';
            }
        }

        // 10. Cloudflare (via WP plugin)
        do_action('cloudflare_purge_everything');

        // 11. Breeze (Cloudways)
        do_action('breeze_clear_all_cache');

        // 12. Generic WP hook other cache plugins listen to
        do_action('wp_cache_clear_cache');
        do_action('gp_after_cache_clear', $post_ids);

        return array(
            'cleared'  => array_values(array_unique($cleared)),
            'post_ids' => array_map('intval', $post_ids),
        );
    }
}
`;
}

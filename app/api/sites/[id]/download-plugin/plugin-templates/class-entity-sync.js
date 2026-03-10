/**
 * Generate Entity Sync class
 * 
 * Watches for WordPress content changes (create, update, delete, trash)
 * and pushes real-time updates to Ghost Post platform via webhook.
 */
export function getClassEntitySync() {
  return `<?php
/**
 * Ghost Post Entity Sync Handler
 * 
 * Watches for WordPress content changes (create, update, delete, trash)
 * and pushes real-time updates to the Ghost Post platform via webhook.
 * 
 * This enables instant entity sync for WordPress sites with the plugin connected,
 * instead of waiting for the hourly cron sync.
 * 
 * Conflict prevention:
 * - Skips pushing when the change originated from gp-platform (via REST API create/update)
 *   by checking a static flag set during API operations.
 */

if (!defined('ABSPATH')) {
    exit;
}

class GP_Entity_Sync {
    
    /**
     * Global flag: when true, save_post hooks will be skipped.
     * Set to true when processing an incoming gp-platform API request.
     * 
     * @var bool
     */
    private static \\$is_gp_api_request = false;
    
    /**
     * Post types to exclude from sync
     */
    private static \\$excluded_post_types = array(
        'revision',
        'nav_menu_item',
        'custom_css',
        'customize_changeset',
        'oembed_cache',
        'user_request',
        'wp_block',
        'wp_template',
        'wp_template_part',
        'wp_global_styles',
        'wp_navigation',
        'wp_font_family',
        'wp_font_face',
        'acf-field-group',
        'acf-field',
        'acf-post-type',
        'acf-taxonomy',
        'acf-ui-options-page',
        'elementor_library',
        'elementor_font',
        'elementor_icons',
        'elementor_snippet',
        'e-landing-page',
        'e-floating-buttons',
    );
    
    /**
     * Initialize hooks
     */
    public function init() {
        // Hook into post save/update (fires after post is saved to DB)
        add_action('save_post', array(\\$this, 'on_post_saved'), 20, 3);
        
        // Hook into post trash
        add_action('wp_trash_post', array(\\$this, 'on_post_trashed'), 10, 1);
        
        // Hook into post delete (permanent)
        add_action('before_delete_post', array(\\$this, 'on_post_deleted'), 10, 2);
        
        // Hook into post untrash (restore)
        add_action('untrashed_post', array(\\$this, 'on_post_untrashed'), 10, 1);
    }
    
    /**
     * Mark that we're currently processing a gp-platform API request.
     * All save_post/trash/delete hooks will be skipped while this flag is set.
     * Called by the API handler / content manager before creating/updating posts.
     * 
     * @param int \\$post_id  (unused — kept for backward compat, flag is global)
     */
    public static function mark_gp_origin(\\$post_id = 0) {
        self::\\$is_gp_api_request = true;
    }
    
    /**
     * Clear the gp-platform origin flag.
     */
    public static function clear_gp_origin() {
        self::\\$is_gp_api_request = false;
    }
    
    /**
     * Check if we're currently in a gp-platform API request.
     * 
     * @param int \\$post_id  (unused)
     * @return bool
     */
    private function is_gp_origin(\\$post_id) {
        return self::\\$is_gp_api_request;
    }
    
    /**
     * Handle post save/update
     * 
     * @param int     \\$post_id
     * @param WP_Post \\$post
     * @param bool    \\$update
     */
    public function on_post_saved(\\$post_id, \\$post, \\$update) {
        // Skip auto-saves
        if (defined('DOING_AUTOSAVE') && DOING_AUTOSAVE) {
            return;
        }
        
        // Skip revisions
        if (wp_is_post_revision(\\$post_id)) {
            return;
        }
        
        // Skip excluded post types
        if (in_array(\\$post->post_type, self::\\$excluded_post_types, true)) {
            return;
        }
        
        // Skip auto-drafts
        if (\\$post->post_status === 'auto-draft') {
            return;
        }
        
        // Skip if this change originated from gp-platform
        if (\\$this->is_gp_origin(\\$post_id)) {
            return;
        }
        
        \\$action = \\$update ? 'updated' : 'created';
        \\$this->push_entity_update(\\$post, \\$action);
    }
    
    /**
     * Handle post trash
     * 
     * @param int \\$post_id
     */
    public function on_post_trashed(\\$post_id) {
        \\$post = get_post(\\$post_id);
        if (!\\$post || in_array(\\$post->post_type, self::\\$excluded_post_types, true)) {
            return;
        }
        
        if (\\$this->is_gp_origin(\\$post_id)) {
            return;
        }
        
        \\$this->push_entity_update(\\$post, 'trashed');
    }
    
    /**
     * Handle permanent post deletion
     * 
     * @param int     \\$post_id
     * @param WP_Post \\$post
     */
    public function on_post_deleted(\\$post_id, \\$post) {
        if (!\\$post || in_array(\\$post->post_type, self::\\$excluded_post_types, true)) {
            return;
        }
        
        if (\\$this->is_gp_origin(\\$post_id)) {
            return;
        }
        
        \\$this->push_entity_update(\\$post, 'deleted');
    }
    
    /**
     * Handle post untrash (restore)
     * 
     * @param int \\$post_id
     */
    public function on_post_untrashed(\\$post_id) {
        \\$post = get_post(\\$post_id);
        if (!\\$post || in_array(\\$post->post_type, self::\\$excluded_post_types, true)) {
            return;
        }
        
        \\$this->push_entity_update(\\$post, 'updated');
    }
    
    /**
     * Push entity update to Ghost Post platform via webhook
     * 
     * @param WP_Post \\$post
     * @param string  \\$action  "created" | "updated" | "trashed" | "deleted"
     */
    private function push_entity_update(\\$post, \\$action) {
        if (!defined('GP_API_URL') || !defined('GP_SITE_KEY') || !defined('GP_SITE_SECRET')) {
            return;
        }
        
        \\$endpoint = GP_API_URL . '/api/public/wp/entity-updated';
        \\$timestamp = time();
        
        // Build post data
        \\$post_data = array(
            'id' => \\$post->ID,
            'title' => \\$post->post_title,
            'slug' => \\$post->post_name,
            'status' => \\$post->post_status,
            'date' => \\$post->post_date,
            'date_gmt' => \\$post->post_date_gmt,
            'modified' => \\$post->post_modified,
            'content' => \\$post->post_content,
            'excerpt' => \\$post->post_excerpt,
            'author' => (int)\\$post->post_author,
            'author_name' => get_the_author_meta('display_name', \\$post->post_author),
            'permalink' => get_permalink(\\$post->ID),
            'link' => get_permalink(\\$post->ID),
            'menu_order' => \\$post->menu_order,
            'parent' => \\$post->post_parent,
            'template' => get_page_template_slug(\\$post->ID),
            'action' => \\$action,
        );
        
        // Featured image
        \\$thumbnail_id = get_post_thumbnail_id(\\$post->ID);
        \\$post_data['featured_image'] = \\$thumbnail_id ? wp_get_attachment_image_url(\\$thumbnail_id, 'full') : null;
        
        // Categories & tags (for post type)
        if (\\$post->post_type === 'post') {
            \\$categories = wp_get_post_categories(\\$post->ID, array('fields' => 'all'));
            \\$post_data['categories'] = array_map(function(\\$cat) {
                return array('id' => \\$cat->term_id, 'name' => \\$cat->name, 'slug' => \\$cat->slug);
            }, \\$categories);
            
            \\$tags = wp_get_post_tags(\\$post->ID);
            \\$post_data['tags'] = array_map(function(\\$tag) {
                return array('id' => \\$tag->term_id, 'name' => \\$tag->name, 'slug' => \\$tag->slug);
            }, \\$tags);
        }
        
        // Taxonomies for custom post types
        \\$taxonomies = get_object_taxonomies(\\$post->post_type, 'objects');
        \\$tax_data = array();
        foreach (\\$taxonomies as \\$taxonomy) {
            \\$terms = wp_get_post_terms(\\$post->ID, \\$taxonomy->name);
            if (!is_wp_error(\\$terms) && !empty(\\$terms)) {
                \\$tax_data[\\$taxonomy->name] = array_map(function(\\$term) {
                    return array('id' => \\$term->term_id, 'name' => \\$term->name, 'slug' => \\$term->slug);
                }, \\$terms);
            }
        }
        \\$post_data['taxonomies'] = \\$tax_data;
        
        // SEO data (Yoast/RankMath)
        \\$seo_data = array();
        \\$yoast_title = get_post_meta(\\$post->ID, '_yoast_wpseo_title', true);
        \\$yoast_desc = get_post_meta(\\$post->ID, '_yoast_wpseo_metadesc', true);
        \\$rm_title = get_post_meta(\\$post->ID, 'rank_math_title', true);
        \\$rm_desc = get_post_meta(\\$post->ID, 'rank_math_description', true);
        
        if (\\$yoast_title || \\$yoast_desc) {
            \\$seo_data = array('source' => 'yoast', 'title' => \\$yoast_title, 'description' => \\$yoast_desc);
        } elseif (\\$rm_title || \\$rm_desc) {
            \\$seo_data = array('source' => 'rankmath', 'title' => \\$rm_title, 'description' => \\$rm_desc);
        }
        \\$post_data['seo'] = !empty(\\$seo_data) ? \\$seo_data : null;
        
        // ACF data
        \\$acf_data = null;
        if (function_exists('get_fields')) {
            \\$fields = get_fields(\\$post->ID);
            if (\\$fields) {
                \\$acf_data = \\$fields;
            }
        }
        \\$post_data['acf'] = \\$acf_data;
        
        // Build webhook payload
        \\$payload = array(
            'action' => \\$action,
            'post_type' => \\$post->post_type,
            'post' => \\$post_data,
            'source' => 'wordpress',
        );
        
        \\$body = wp_json_encode(\\$payload);
        \\$signature = \\$this->create_signature(\\$body, \\$timestamp);
        
        // Send webhook (non-blocking with short timeout)
        wp_remote_post(\\$endpoint, array(
            'timeout' => 5,
            'blocking' => false,
            'headers' => array(
                'Content-Type' => 'application/json',
                'X-GP-Site-Key' => GP_SITE_KEY,
                'X-GP-Timestamp' => (string)\\$timestamp,
                'X-GP-Signature' => \\$signature,
            ),
            'body' => \\$body,
        ));
    }
    
    /**
     * Create HMAC-SHA256 signature
     * 
     * @param string \\$body
     * @param int    \\$timestamp
     * @return string
     */
    private function create_signature(\\$body, \\$timestamp) {
        \\$payload = \\$timestamp . '.' . \\$body;
        return hash_hmac('sha256', \\$payload, GP_SITE_SECRET);
    }
}
`;
}

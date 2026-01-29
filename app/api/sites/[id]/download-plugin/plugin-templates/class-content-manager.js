/**
 * Generate Content Manager class
 */
export function getClassContentManager() {
  return `<?php
/**
 * Ghost Post Content Manager
 * 
 * Handles CRUD operations for posts and pages
 */

if (!defined('ABSPATH')) {
    exit;
}

class GP_Content_Manager {
    
    /**
     * Get list of items
     * 
     * @param string $post_type Post type
     * @param array $params Query parameters
     * @return WP_REST_Response
     */
    public function get_items($post_type, $params) {
        $args = array(
            'post_type' => $post_type,
            'post_status' => isset($params['status']) ? $params['status'] : 'any',
            'posts_per_page' => isset($params['per_page']) ? (int) $params['per_page'] : 20,
            'paged' => isset($params['page']) ? (int) $params['page'] : 1,
            'orderby' => isset($params['orderby']) ? $params['orderby'] : 'date',
            'order' => isset($params['order']) ? $params['order'] : 'DESC',
        );
        
        if (!empty($params['search'])) {
            $args['s'] = $params['search'];
        }
        
        if (!empty($params['category'])) {
            $args['category_name'] = $params['category'];
        }
        
        // Check if full data is requested (for sync operations)
        $include_full = !empty($params['full']) && ($params['full'] === 'true' || $params['full'] === '1' || $params['full'] === true);
        
        $query = new WP_Query($args);
        $items = array();
        
        foreach ($query->posts as $post) {
            $items[] = $this->format_post($post, $include_full);
        }
        
        return new WP_REST_Response(array(
            'items' => $items,
            'total' => $query->found_posts,
            'pages' => $query->max_num_pages,
            'page' => $args['paged'],
        ), 200);
    }
    
    /**
     * Get single item
     * 
     * @param string $post_type Post type
     * @param int $id Post ID
     * @return WP_REST_Response
     */
    public function get_item($post_type, $id) {
        $post = get_post($id);
        
        if (!$post || $post->post_type !== $post_type) {
            return new WP_REST_Response(array('error' => 'Post not found'), 404);
        }
        
        return new WP_REST_Response($this->format_post($post, true), 200);
    }
    
    /**
     * Create item
     * 
     * @param string $post_type Post type
     * @param array $data Post data
     * @return WP_REST_Response
     */
    public function create_item($post_type, $data) {
        $post_data = array(
            'post_type' => $post_type,
            'post_title' => sanitize_text_field($data['title'] ?? ''),
            'post_content' => wp_kses_post($data['content'] ?? ''),
            'post_excerpt' => sanitize_textarea_field($data['excerpt'] ?? ''),
            'post_status' => $this->validate_status($data['status'] ?? 'draft'),
            'post_name' => sanitize_title($data['slug'] ?? ''),
            'post_author' => get_current_user_id() ?: 1,
        );
        
        if (!empty($data['date'])) {
            $post_data['post_date'] = $data['date'];
        }
        
        if (!empty($data['parent'])) {
            $post_data['post_parent'] = (int) $data['parent'];
        }
        
        if (!empty($data['menu_order'])) {
            $post_data['menu_order'] = (int) $data['menu_order'];
        }
        
        $post_id = wp_insert_post($post_data, true);
        
        if (is_wp_error($post_id)) {
            return new WP_REST_Response(array('error' => $post_id->get_error_message()), 400);
        }
        
        // Set featured image
        if (!empty($data['featured_image'])) {
            $this->set_featured_image($post_id, $data['featured_image']);
        }
        
        // Set taxonomies
        if (!empty($data['categories'])) {
            wp_set_post_categories($post_id, $data['categories']);
        }
        
        if (!empty($data['tags'])) {
            wp_set_post_tags($post_id, $data['tags']);
        }
        
        // Set custom taxonomies
        if (!empty($data['taxonomies']) && is_array($data['taxonomies'])) {
            foreach ($data['taxonomies'] as $taxonomy => $terms) {
                wp_set_object_terms($post_id, $terms, $taxonomy);
            }
        }
        
        // Set meta fields
        if (!empty($data['meta']) && is_array($data['meta'])) {
            foreach ($data['meta'] as $key => $value) {
                update_post_meta($post_id, $key, $value);
            }
        }
        
        return new WP_REST_Response(array(
            'id' => $post_id,
            'message' => 'Post created successfully',
            'post' => $this->format_post(get_post($post_id), true),
        ), 201);
    }
    
    /**
     * Update item
     * 
     * @param string $post_type Post type
     * @param int $id Post ID
     * @param array $data Post data
     * @return WP_REST_Response
     */
    public function update_item($post_type, $id, $data) {
        $post = get_post($id);
        
        if (!$post || $post->post_type !== $post_type) {
            return new WP_REST_Response(array('error' => 'Post not found'), 404);
        }
        
        $post_data = array('ID' => $id);
        
        if (isset($data['title'])) {
            $post_data['post_title'] = sanitize_text_field($data['title']);
        }
        
        if (isset($data['content'])) {
            $post_data['post_content'] = wp_kses_post($data['content']);
        }
        
        if (isset($data['excerpt'])) {
            $post_data['post_excerpt'] = sanitize_textarea_field($data['excerpt']);
        }
        
        if (isset($data['status'])) {
            // Check publish permission
            if ($data['status'] === 'publish' && !gp_has_permission('CONTENT_PUBLISH')) {
                return new WP_REST_Response(array('error' => 'No permission to publish'), 403);
            }
            $post_data['post_status'] = $this->validate_status($data['status']);
        }
        
        if (isset($data['slug'])) {
            $post_data['post_name'] = sanitize_title($data['slug']);
        }
        
        if (isset($data['date'])) {
            $post_data['post_date'] = $data['date'];
        }
        
        if (isset($data['parent'])) {
            $post_data['post_parent'] = (int) $data['parent'];
        }
        
        if (isset($data['menu_order'])) {
            $post_data['menu_order'] = (int) $data['menu_order'];
        }
        
        $result = wp_update_post($post_data, true);
        
        if (is_wp_error($result)) {
            return new WP_REST_Response(array('error' => $result->get_error_message()), 400);
        }
        
        // Update featured image
        if (isset($data['featured_image'])) {
            if (empty($data['featured_image'])) {
                delete_post_thumbnail($id);
            } else {
                $this->set_featured_image($id, $data['featured_image']);
            }
        }
        
        // Update taxonomies
        if (isset($data['categories'])) {
            wp_set_post_categories($id, $data['categories']);
        }
        
        if (isset($data['tags'])) {
            wp_set_post_tags($id, $data['tags']);
        }
        
        if (isset($data['taxonomies']) && is_array($data['taxonomies'])) {
            foreach ($data['taxonomies'] as $taxonomy => $terms) {
                wp_set_object_terms($id, $terms, $taxonomy);
            }
        }
        
        // Update meta fields
        if (isset($data['meta']) && is_array($data['meta'])) {
            foreach ($data['meta'] as $key => $value) {
                update_post_meta($id, $key, $value);
            }
        }
        
        return new WP_REST_Response(array(
            'id' => $id,
            'message' => 'Post updated successfully',
            'post' => $this->format_post(get_post($id), true),
        ), 200);
    }
    
    /**
     * Delete item
     * 
     * @param string $post_type Post type
     * @param int $id Post ID
     * @return WP_REST_Response
     */
    public function delete_item($post_type, $id) {
        $post = get_post($id);
        
        if (!$post || $post->post_type !== $post_type) {
            return new WP_REST_Response(array('error' => 'Post not found'), 404);
        }
        
        $result = wp_delete_post($id, true); // Force delete (skip trash)
        
        if (!$result) {
            return new WP_REST_Response(array('error' => 'Failed to delete post'), 500);
        }
        
        return new WP_REST_Response(array(
            'message' => 'Post deleted successfully',
        ), 200);
    }
    
    /**
     * Format post for response
     * 
     * @param WP_Post $post
     * @param bool $full Include full content
     * @return array
     */
    private function format_post($post, $full = false) {
        $data = array(
            'id' => $post->ID,
            'title' => $post->post_title,
            'slug' => $post->post_name,
            'status' => $post->post_status,
            'type' => $post->post_type,
            'date' => $post->post_date,
            'modified' => $post->post_modified,
            'author' => (int) $post->post_author,
            'featured_image' => get_the_post_thumbnail_url($post->ID, 'full'),
            'permalink' => get_permalink($post->ID),
        );
        
        if ($full) {
            $data['content'] = $post->post_content;
            $data['excerpt'] = $post->post_excerpt;
            $data['parent'] = $post->post_parent;
            $data['menu_order'] = $post->menu_order;
            $data['categories'] = wp_get_post_categories($post->ID);
            $data['tags'] = wp_get_post_tags($post->ID, array('fields' => 'ids'));
            
            // Get all taxonomies
            $taxonomies = get_object_taxonomies($post->post_type);
            $data['taxonomies'] = array();
            foreach ($taxonomies as $taxonomy) {
                $terms = wp_get_object_terms($post->ID, $taxonomy, array('fields' => 'ids'));
                if (!is_wp_error($terms) && !empty($terms)) {
                    $data['taxonomies'][$taxonomy] = $terms;
                }
            }
            
            // Get all meta
            $data['meta'] = get_post_meta($post->ID);
            
            // Get ACF fields if available
            $data['acf'] = $this->get_acf_fields($post->ID);
            
            // Get SEO data (Yoast or RankMath)
            $data['seo'] = $this->get_seo_data($post->ID);
        }
        
        return $data;
    }
    
    /**
     * Get ACF fields for a post with field info
     * 
     * @param int $post_id
     * @return array|null
     */
    private function get_acf_fields($post_id) {
        if (!function_exists('get_fields') || !function_exists('get_field_objects')) {
            return null;
        }
        
        $field_objects = get_field_objects($post_id);
        if (!$field_objects) {
            return null;
        }
        
        $acf_data = array(
            'fields' => array(),
            'groups' => array(),
        );
        
        foreach ($field_objects as $field_name => $field) {
            $field_data = array(
                'key' => $field['key'],
                'name' => $field['name'],
                'label' => $field['label'],
                'type' => $field['type'],
                'value' => $field['value'],
                'required' => !empty($field['required']),
                'instructions' => $field['instructions'] ?? '',
            );
            
            // Add type-specific configuration
            switch ($field['type']) {
                case 'text':
                case 'textarea':
                case 'email':
                case 'url':
                case 'password':
                    $field_data['placeholder'] = $field['placeholder'] ?? '';
                    $field_data['maxlength'] = $field['maxlength'] ?? null;
                    break;
                    
                case 'number':
                case 'range':
                    $field_data['min'] = $field['min'] ?? null;
                    $field_data['max'] = $field['max'] ?? null;
                    $field_data['step'] = $field['step'] ?? null;
                    break;
                    
                case 'wysiwyg':
                    $field_data['tabs'] = $field['tabs'] ?? 'all';
                    $field_data['toolbar'] = $field['toolbar'] ?? 'full';
                    $field_data['media_upload'] = $field['media_upload'] ?? true;
                    break;
                    
                case 'select':
                case 'checkbox':
                case 'radio':
                case 'button_group':
                    $field_data['choices'] = $field['choices'] ?? array();
                    $field_data['multiple'] = $field['multiple'] ?? false;
                    $field_data['allow_null'] = $field['allow_null'] ?? false;
                    break;
                    
                case 'true_false':
                    $field_data['default_value'] = $field['default_value'] ?? false;
                    $field_data['ui'] = $field['ui'] ?? false;
                    $field_data['ui_on_text'] = $field['ui_on_text'] ?? '';
                    $field_data['ui_off_text'] = $field['ui_off_text'] ?? '';
                    break;
                    
                case 'image':
                case 'file':
                case 'gallery':
                    $field_data['return_format'] = $field['return_format'] ?? 'array';
                    $field_data['preview_size'] = $field['preview_size'] ?? 'medium';
                    $field_data['library'] = $field['library'] ?? 'all';
                    // Format value for display
                    if ($field['type'] === 'image' && is_array($field['value'])) {
                        $field_data['value'] = array(
                            'id' => $field['value']['ID'] ?? $field['value']['id'] ?? null,
                            'url' => $field['value']['url'] ?? null,
                            'alt' => $field['value']['alt'] ?? '',
                            'title' => $field['value']['title'] ?? '',
                            'sizes' => $field['value']['sizes'] ?? array(),
                        );
                    }
                    break;
                    
                case 'link':
                    $field_data['return_format'] = $field['return_format'] ?? 'array';
                    break;
                    
                case 'date_picker':
                case 'date_time_picker':
                case 'time_picker':
                    $field_data['display_format'] = $field['display_format'] ?? '';
                    $field_data['return_format'] = $field['return_format'] ?? '';
                    break;
                    
                case 'color_picker':
                    $field_data['default_value'] = $field['default_value'] ?? '';
                    $field_data['enable_opacity'] = $field['enable_opacity'] ?? false;
                    break;
                    
                case 'repeater':
                    $field_data['min'] = $field['min'] ?? 0;
                    $field_data['max'] = $field['max'] ?? 0;
                    $field_data['layout'] = $field['layout'] ?? 'table';
                    $field_data['sub_fields'] = $this->format_sub_fields($field['sub_fields'] ?? array());
                    break;
                    
                case 'flexible_content':
                    $field_data['layouts'] = array();
                    foreach (($field['layouts'] ?? array()) as $layout) {
                        $field_data['layouts'][] = array(
                            'name' => $layout['name'],
                            'label' => $layout['label'],
                            'sub_fields' => $this->format_sub_fields($layout['sub_fields'] ?? array()),
                        );
                    }
                    break;
                    
                case 'group':
                    $field_data['sub_fields'] = $this->format_sub_fields($field['sub_fields'] ?? array());
                    break;
                    
                case 'relationship':
                case 'post_object':
                    $field_data['post_type'] = $field['post_type'] ?? array();
                    $field_data['multiple'] = $field['multiple'] ?? false;
                    break;
                    
                case 'taxonomy':
                    $field_data['taxonomy'] = $field['taxonomy'] ?? '';
                    $field_data['field_type'] = $field['field_type'] ?? 'checkbox';
                    $field_data['allow_null'] = $field['allow_null'] ?? false;
                    $field_data['multiple'] = $field['multiple'] ?? false;
                    break;
                    
                case 'user':
                    $field_data['role'] = $field['role'] ?? array();
                    $field_data['multiple'] = $field['multiple'] ?? false;
                    break;
            }
            
            $acf_data['fields'][$field_name] = $field_data;
            
            // Track field group
            if (!empty($field['parent'])) {
                $group_key = $field['parent'];
                if (!isset($acf_data['groups'][$group_key])) {
                    $group = acf_get_field_group($group_key);
                    if ($group) {
                        $acf_data['groups'][$group_key] = array(
                            'key' => $group['key'],
                            'title' => $group['title'],
                        );
                    }
                }
            }
        }
        
        return $acf_data;
    }
    
    /**
     * Format sub fields for repeater/flexible/group
     */
    private function format_sub_fields($sub_fields) {
        $formatted = array();
        foreach ($sub_fields as $sf) {
            $formatted[] = array(
                'key' => $sf['key'],
                'name' => $sf['name'],
                'label' => $sf['label'],
                'type' => $sf['type'],
                'required' => !empty($sf['required']),
            );
        }
        return $formatted;
    }
    
    /**
     * Get SEO data from Yoast or RankMath
     * 
     * @param int $post_id
     * @return array|null
     */
    private function get_seo_data($post_id) {
        $seo_data = array(
            'plugin' => null,
            'title' => null,
            'description' => null,
            'focusKeyword' => null,
            'canonical' => null,
            'robots' => array(),
            'og' => array(),
            'twitter' => array(),
            'schema' => null,
        );
        
        // Check for Yoast SEO
        if (defined('WPSEO_VERSION')) {
            $seo_data['plugin'] = 'yoast';
            $seo_data['version'] = WPSEO_VERSION;
            $seo_data['title'] = get_post_meta($post_id, '_yoast_wpseo_title', true);
            $seo_data['description'] = get_post_meta($post_id, '_yoast_wpseo_metadesc', true);
            $seo_data['focusKeyword'] = get_post_meta($post_id, '_yoast_wpseo_focuskw', true);
            $seo_data['canonical'] = get_post_meta($post_id, '_yoast_wpseo_canonical', true);
            
            // Robots
            $robots_index = get_post_meta($post_id, '_yoast_wpseo_meta-robots-noindex', true);
            $robots_follow = get_post_meta($post_id, '_yoast_wpseo_meta-robots-nofollow', true);
            $seo_data['robots']['index'] = $robots_index !== '1';
            $seo_data['robots']['follow'] = $robots_follow !== '1';
            
            // Open Graph
            $seo_data['og']['title'] = get_post_meta($post_id, '_yoast_wpseo_opengraph-title', true);
            $seo_data['og']['description'] = get_post_meta($post_id, '_yoast_wpseo_opengraph-description', true);
            $seo_data['og']['image'] = get_post_meta($post_id, '_yoast_wpseo_opengraph-image', true);
            
            // Twitter
            $seo_data['twitter']['title'] = get_post_meta($post_id, '_yoast_wpseo_twitter-title', true);
            $seo_data['twitter']['description'] = get_post_meta($post_id, '_yoast_wpseo_twitter-description', true);
            $seo_data['twitter']['image'] = get_post_meta($post_id, '_yoast_wpseo_twitter-image', true);
            
            // Schema
            $schema = get_post_meta($post_id, '_yoast_wpseo_schema_page_type', true);
            if ($schema) {
                $seo_data['schema'] = array('pageType' => $schema);
            }
            
            return $seo_data;
        }
        
        // Check for RankMath
        if (defined('RANK_MATH_VERSION')) {
            $seo_data['plugin'] = 'rankmath';
            $seo_data['version'] = RANK_MATH_VERSION;
            $seo_data['title'] = get_post_meta($post_id, 'rank_math_title', true);
            $seo_data['description'] = get_post_meta($post_id, 'rank_math_description', true);
            $seo_data['focusKeyword'] = get_post_meta($post_id, 'rank_math_focus_keyword', true);
            $seo_data['canonical'] = get_post_meta($post_id, 'rank_math_canonical_url', true);
            
            // Robots
            $robots = get_post_meta($post_id, 'rank_math_robots', true);
            if (is_array($robots)) {
                $seo_data['robots']['index'] = !in_array('noindex', $robots);
                $seo_data['robots']['follow'] = !in_array('nofollow', $robots);
            }
            
            // Open Graph
            $seo_data['og']['title'] = get_post_meta($post_id, 'rank_math_facebook_title', true);
            $seo_data['og']['description'] = get_post_meta($post_id, 'rank_math_facebook_description', true);
            $seo_data['og']['image'] = get_post_meta($post_id, 'rank_math_facebook_image', true);
            
            // Twitter
            $seo_data['twitter']['title'] = get_post_meta($post_id, 'rank_math_twitter_title', true);
            $seo_data['twitter']['description'] = get_post_meta($post_id, 'rank_math_twitter_description', true);
            $seo_data['twitter']['image'] = get_post_meta($post_id, 'rank_math_twitter_image', true);
            
            // Schema
            $schema = get_post_meta($post_id, 'rank_math_schema_Article', true);
            if ($schema) {
                $seo_data['schema'] = $schema;
            }
            
            return $seo_data;
        }
        
        return null;
    }
    
    /**
     * Set featured image from URL or attachment ID
     * 
     * @param int $post_id
     * @param mixed $image URL or attachment ID
     */
    private function set_featured_image($post_id, $image) {
        if (is_numeric($image)) {
            set_post_thumbnail($post_id, (int) $image);
        } elseif (filter_var($image, FILTER_VALIDATE_URL)) {
            // Download and attach image
            $media_manager = new GP_Media_Manager();
            $attachment_id = $media_manager->upload_from_url($image, $post_id);
            if ($attachment_id && !is_wp_error($attachment_id)) {
                set_post_thumbnail($post_id, $attachment_id);
            }
        }
    }
    
    /**
     * Validate post status
     * 
     * @param string $status
     * @return string
     */
    private function validate_status($status) {
        $valid_statuses = array('publish', 'draft', 'pending', 'private', 'future', 'trash');
        return in_array($status, $valid_statuses) ? $status : 'draft';
    }
}
`;
}

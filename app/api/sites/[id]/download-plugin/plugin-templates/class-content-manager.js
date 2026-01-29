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
        
        $query = new WP_Query($args);
        $items = array();
        
        foreach ($query->posts as $post) {
            $items[] = $this->format_post($post);
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
        }
        
        return $data;
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

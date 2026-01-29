/**
 * Generate CPT Manager class
 */
export function getClassCptManager() {
  return `<?php
/**
 * Ghost Post CPT Manager
 * 
 * Handles Custom Post Types CRUD operations
 */

if (!defined('ABSPATH')) {
    exit;
}

class GP_CPT_Manager {
    
    /**
     * @var GP_Content_Manager
     */
    private $content_manager;
    
    public function __construct() {
        $this->content_manager = new GP_Content_Manager();
    }
    
    /**
     * Get available custom post types
     * 
     * @return array
     */
    public function get_post_types() {
        $post_types = get_post_types(array('public' => true, '_builtin' => false), 'objects');
        $result = array();
        
        foreach ($post_types as $pt) {
            $result[] = array(
                'name' => $pt->name,
                'label' => $pt->label,
                'singular_label' => $pt->labels->singular_name,
                'description' => $pt->description,
                'public' => $pt->public,
                'hierarchical' => $pt->hierarchical,
                'has_archive' => $pt->has_archive,
                'supports' => get_all_post_type_supports($pt->name),
                'taxonomies' => get_object_taxonomies($pt->name),
                'menu_icon' => $pt->menu_icon,
                'rest_base' => $pt->rest_base ?: $pt->name,
            );
        }
        
        return $result;
    }
    
    /**
     * Check if post type exists and is valid
     * 
     * @param string $post_type
     * @return bool
     */
    private function is_valid_post_type($post_type) {
        // Don't allow built-in types through CPT endpoint
        $builtin = array('post', 'page', 'attachment', 'revision', 'nav_menu_item');
        if (in_array($post_type, $builtin)) {
            return false;
        }
        
        return post_type_exists($post_type);
    }
    
    /**
     * Get list of CPT items
     * 
     * @param string $post_type
     * @param array $params
     * @return WP_REST_Response
     */
    public function get_items($post_type, $params) {
        if (!$this->is_valid_post_type($post_type)) {
            return new WP_REST_Response(array('error' => 'Invalid post type'), 400);
        }
        
        return $this->content_manager->get_items($post_type, $params);
    }
    
    /**
     * Get single CPT item
     * 
     * @param string $post_type
     * @param int $id
     * @return WP_REST_Response
     */
    public function get_item($post_type, $id) {
        if (!$this->is_valid_post_type($post_type)) {
            return new WP_REST_Response(array('error' => 'Invalid post type'), 400);
        }
        
        $post = get_post($id);
        if (!$post || $post->post_type !== $post_type) {
            return new WP_REST_Response(array('error' => 'Post not found'), 404);
        }
        
        return $this->content_manager->get_item($post_type, $id);
    }
    
    /**
     * Create CPT item
     * 
     * @param string $post_type
     * @param array $data
     * @return WP_REST_Response
     */
    public function create_item($post_type, $data) {
        if (!$this->is_valid_post_type($post_type)) {
            return new WP_REST_Response(array('error' => 'Invalid post type'), 400);
        }
        
        return $this->content_manager->create_item($post_type, $data);
    }
    
    /**
     * Update CPT item
     * 
     * @param string $post_type
     * @param int $id
     * @param array $data
     * @return WP_REST_Response
     */
    public function update_item($post_type, $id, $data) {
        if (!$this->is_valid_post_type($post_type)) {
            return new WP_REST_Response(array('error' => 'Invalid post type'), 400);
        }
        
        $post = get_post($id);
        if (!$post || $post->post_type !== $post_type) {
            return new WP_REST_Response(array('error' => 'Post not found'), 404);
        }
        
        return $this->content_manager->update_item($post_type, $id, $data);
    }
    
    /**
     * Delete CPT item
     * 
     * @param string $post_type
     * @param int $id
     * @return WP_REST_Response
     */
    public function delete_item($post_type, $id) {
        if (!$this->is_valid_post_type($post_type)) {
            return new WP_REST_Response(array('error' => 'Invalid post type'), 400);
        }
        
        $post = get_post($id);
        if (!$post || $post->post_type !== $post_type) {
            return new WP_REST_Response(array('error' => 'Post not found'), 404);
        }
        
        return $this->content_manager->delete_item($post_type, $id);
    }
}
`;
}

/**
 * Generate ACF Manager class
 */
export function getClassAcfManager() {
  return `<?php
/**
 * Ghost Post ACF Manager
 * 
 * Handles Advanced Custom Fields read/write operations
 */

if (!defined('ABSPATH')) {
    exit;
}

class GP_ACF_Manager {
    
    /**
     * Check if ACF is installed
     * 
     * @return bool
     */
    public function is_acf_active() {
        return class_exists('ACF') || function_exists('get_field');
    }
    
    /**
     * Get all ACF fields for a post
     * 
     * @param int $post_id
     * @return WP_REST_Response
     */
    public function get_fields($post_id) {
        if (!$this->is_acf_active()) {
            return new WP_REST_Response(array(
                'error' => 'ACF is not installed or active',
                'acf_active' => false,
            ), 400);
        }
        
        $post = get_post($post_id);
        if (!$post) {
            return new WP_REST_Response(array('error' => 'Post not found'), 404);
        }
        
        $fields = get_fields($post_id);
        
        if ($fields === false) {
            $fields = array();
        }
        
        // Get field group info
        $field_groups = $this->get_field_groups_for_post($post_id);
        
        return new WP_REST_Response(array(
            'post_id' => $post_id,
            'acf_active' => true,
            'fields' => $fields,
            'field_groups' => $field_groups,
            'field_objects' => $this->get_field_objects($post_id),
        ), 200);
    }
    
    /**
     * Update ACF fields for a post
     * 
     * @param int $post_id
     * @param array $data
     * @return WP_REST_Response
     */
    public function update_fields($post_id, $data) {
        if (!$this->is_acf_active()) {
            return new WP_REST_Response(array(
                'error' => 'ACF is not installed or active',
                'acf_active' => false,
            ), 400);
        }
        
        $post = get_post($post_id);
        if (!$post) {
            return new WP_REST_Response(array('error' => 'Post not found'), 404);
        }
        
        $updated = array();
        $errors = array();
        
        foreach ($data as $field_name => $value) {
            // Skip non-field data
            if (in_array($field_name, array('post_id', '_method'))) {
                continue;
            }
            
            // Get field object to validate
            $field = get_field_object($field_name, $post_id);
            
            if (!$field) {
                // Try with acf_ prefix removed
                $field = get_field_object($field_name, $post_id, false, false);
            }
            
            // Update field
            $result = update_field($field_name, $value, $post_id);
            
            if ($result !== false) {
                $updated[] = $field_name;
            } else {
                // Try updating as regular post meta
                $meta_result = update_post_meta($post_id, $field_name, $value);
                if ($meta_result) {
                    $updated[] = $field_name . ' (meta)';
                } else {
                    $errors[] = $field_name;
                }
            }
        }
        
        return new WP_REST_Response(array(
            'success' => count($errors) === 0,
            'updated' => $updated,
            'errors' => $errors,
            'fields' => get_fields($post_id),
        ), 200);
    }
    
    /**
     * Get field groups that apply to a post
     * 
     * @param int $post_id
     * @return array
     */
    private function get_field_groups_for_post($post_id) {
        if (!function_exists('acf_get_field_groups')) {
            return array();
        }
        
        $post = get_post($post_id);
        if (!$post) {
            return array();
        }
        
        $field_groups = acf_get_field_groups(array(
            'post_id' => $post_id,
            'post_type' => $post->post_type,
        ));
        
        $result = array();
        foreach ($field_groups as $group) {
            $result[] = array(
                'key' => $group['key'],
                'title' => $group['title'],
                'position' => $group['position'],
                'style' => $group['style'],
            );
        }
        
        return $result;
    }
    
    /**
     * Get detailed field objects for a post
     * 
     * @param int $post_id
     * @return array
     */
    private function get_field_objects($post_id) {
        if (!function_exists('get_field_objects')) {
            return array();
        }
        
        $field_objects = get_field_objects($post_id);
        
        if (!$field_objects) {
            return array();
        }
        
        $result = array();
        foreach ($field_objects as $name => $field) {
            $result[$name] = array(
                'key' => $field['key'] ?? '',
                'name' => $field['name'],
                'label' => $field['label'],
                'type' => $field['type'],
                'value' => $field['value'],
                'required' => $field['required'] ?? false,
                'choices' => $field['choices'] ?? null,
                'default_value' => $field['default_value'] ?? null,
                'placeholder' => $field['placeholder'] ?? null,
                'instructions' => $field['instructions'] ?? null,
            );
            
            // Handle specific field types
            switch ($field['type']) {
                case 'image':
                case 'file':
                    if (is_numeric($field['value'])) {
                        $result[$name]['url'] = wp_get_attachment_url($field['value']);
                    } elseif (is_array($field['value'])) {
                        $result[$name]['url'] = $field['value']['url'] ?? null;
                    }
                    break;
                    
                case 'gallery':
                    if (is_array($field['value'])) {
                        $result[$name]['images'] = array_map(function($img) {
                            if (is_numeric($img)) {
                                return array(
                                    'id' => $img,
                                    'url' => wp_get_attachment_url($img),
                                );
                            }
                            return $img;
                        }, $field['value']);
                    }
                    break;
                    
                case 'repeater':
                case 'flexible_content':
                case 'group':
                    // Keep complex values as-is
                    break;
                    
                case 'relationship':
                case 'post_object':
                    if (is_array($field['value'])) {
                        $result[$name]['posts'] = array_map(function($p) {
                            if (is_object($p)) {
                                return array(
                                    'id' => $p->ID,
                                    'title' => $p->post_title,
                                    'type' => $p->post_type,
                                );
                            }
                            return $p;
                        }, (array) $field['value']);
                    }
                    break;
            }
        }
        
        return $result;
    }
    
    /**
     * Get all ACF field groups (for site info)
     * 
     * @return array
     */
    public function get_all_field_groups() {
        if (!function_exists('acf_get_field_groups')) {
            return array();
        }
        
        $groups = acf_get_field_groups();
        $result = array();
        
        foreach ($groups as $group) {
            $fields = acf_get_fields($group['key']);
            
            $result[] = array(
                'key' => $group['key'],
                'title' => $group['title'],
                'active' => $group['active'],
                'location' => $group['location'],
                'fields' => array_map(function($field) {
                    return array(
                        'key' => $field['key'],
                        'name' => $field['name'],
                        'label' => $field['label'],
                        'type' => $field['type'],
                        'required' => $field['required'] ?? false,
                    );
                }, $fields ?: array()),
            );
        }
        
        return $result;
    }
}
`;
}

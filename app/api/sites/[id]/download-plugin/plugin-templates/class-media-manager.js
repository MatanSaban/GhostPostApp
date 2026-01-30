/**
 * Generate Media Manager class
 */
export function getClassMediaManager() {
  return `<?php
/**
 * Ghost Post Media Manager
 * 
 * Handles media upload and management
 */

if (!defined('ABSPATH')) {
    exit;
}

class GP_Media_Manager {
    
    /**
     * Get list of media items
     * 
     * @param array $params Query parameters
     * @return WP_REST_Response
     */
    public function get_items($params) {
        $args = array(
            'post_type' => 'attachment',
            'post_status' => 'inherit',
            'posts_per_page' => isset($params['per_page']) ? (int) $params['per_page'] : 20,
            'paged' => isset($params['page']) ? (int) $params['page'] : 1,
            'orderby' => 'date',
            'order' => 'DESC',
        );
        
        if (!empty($params['mime_type'])) {
            $args['post_mime_type'] = $params['mime_type'];
        }
        
        if (!empty($params['search'])) {
            $args['s'] = $params['search'];
        }
        
        $query = new WP_Query($args);
        $items = array();
        
        foreach ($query->posts as $attachment) {
            $items[] = $this->format_attachment($attachment);
        }
        
        return new WP_REST_Response(array(
            'items' => $items,
            'total' => $query->found_posts,
            'pages' => $query->max_num_pages,
        ), 200);
    }
    
    /**
     * Get single media item
     * 
     * @param int $id Attachment ID
     * @return WP_REST_Response
     */
    public function get_item($id) {
        $attachment = get_post($id);
        
        if (!$attachment || $attachment->post_type !== 'attachment') {
            return new WP_REST_Response(array('error' => 'Attachment not found'), 404);
        }
        
        return new WP_REST_Response($this->format_attachment($attachment), 200);
    }
    
    /**
     * Update media metadata
     * 
     * @param int $id Attachment ID
     * @param array $data Data to update
     * @return WP_REST_Response
     */
    public function update($id, $data) {
        $attachment = get_post($id);
        
        if (!$attachment || $attachment->post_type !== 'attachment') {
            return new WP_REST_Response(array('error' => 'Attachment not found'), 404);
        }
        
        $update_data = array('ID' => $id);
        
        // Update title
        if (isset($data['title'])) {
            $update_data['post_title'] = sanitize_text_field($data['title']);
        }
        
        // Update caption
        if (isset($data['caption'])) {
            $update_data['post_excerpt'] = sanitize_textarea_field($data['caption']);
        }
        
        // Update description
        if (isset($data['description'])) {
            $update_data['post_content'] = sanitize_textarea_field($data['description']);
        }
        
        // Update post if there are changes
        if (count($update_data) > 1) {
            $result = wp_update_post($update_data, true);
            if (is_wp_error($result)) {
                return new WP_REST_Response(array('error' => $result->get_error_message()), 500);
            }
        }
        
        // Update alt text
        if (isset($data['alt'])) {
            update_post_meta($id, '_wp_attachment_image_alt', sanitize_text_field($data['alt']));
        }
        
        // Refresh the attachment data
        $attachment = get_post($id);
        
        return new WP_REST_Response(array(
            'message' => 'Media updated',
            'attachment' => $this->format_attachment($attachment),
        ), 200);
    }
    
    /**
     * Upload media from request
     * 
     * @param WP_REST_Request $request
     * @return WP_REST_Response
     */
    public function upload(WP_REST_Request $request) {
        require_once ABSPATH . 'wp-admin/includes/image.php';
        require_once ABSPATH . 'wp-admin/includes/file.php';
        require_once ABSPATH . 'wp-admin/includes/media.php';
        
        $data = $request->get_json_params();
        
        // Upload from URL
        if (!empty($data['url'])) {
            $post_id = !empty($data['post_id']) ? (int) $data['post_id'] : 0;
            $attachment_id = $this->upload_from_url($data['url'], $post_id, $data);
            
            if (is_wp_error($attachment_id)) {
                return new WP_REST_Response(array('error' => $attachment_id->get_error_message()), 400);
            }
            
            return new WP_REST_Response(array(
                'id' => $attachment_id,
                'url' => wp_get_attachment_url($attachment_id),
                'attachment' => $this->format_attachment(get_post($attachment_id)),
            ), 201);
        }
        
        // Upload from base64
        if (!empty($data['base64'])) {
            $attachment_id = $this->upload_from_base64(
                $data['base64'],
                $data['filename'] ?? 'upload.jpg',
                $data['post_id'] ?? 0,
                $data
            );
            
            if (is_wp_error($attachment_id)) {
                return new WP_REST_Response(array('error' => $attachment_id->get_error_message()), 400);
            }
            
            return new WP_REST_Response(array(
                'id' => $attachment_id,
                'url' => wp_get_attachment_url($attachment_id),
                'attachment' => $this->format_attachment(get_post($attachment_id)),
            ), 201);
        }
        
        return new WP_REST_Response(array('error' => 'No file data provided'), 400);
    }
    
    /**
     * Upload media from URL
     * 
     * @param string $url Image URL
     * @param int $post_id Parent post ID
     * @param array $data Additional data
     * @return int|WP_Error Attachment ID or error
     */
    public function upload_from_url($url, $post_id = 0, $data = array()) {
        require_once ABSPATH . 'wp-admin/includes/image.php';
        require_once ABSPATH . 'wp-admin/includes/file.php';
        require_once ABSPATH . 'wp-admin/includes/media.php';
        
        // Download file to temp location
        $temp_file = download_url($url, 30);
        
        if (is_wp_error($temp_file)) {
            return $temp_file;
        }
        
        // Get file info
        $file_name = basename(parse_url($url, PHP_URL_PATH));
        if (empty($file_name)) {
            $file_name = 'image-' . time() . '.jpg';
        }
        
        // Override filename if provided
        if (!empty($data['filename'])) {
            $file_name = sanitize_file_name($data['filename']);
        }
        
        $file_array = array(
            'name' => $file_name,
            'tmp_name' => $temp_file,
        );
        
        // Upload to media library
        $attachment_id = media_handle_sideload($file_array, $post_id);
        
        // Clean up temp file
        if (file_exists($temp_file)) {
            @unlink($temp_file);
        }
        
        if (is_wp_error($attachment_id)) {
            return $attachment_id;
        }
        
        // Set alt text
        if (!empty($data['alt'])) {
            update_post_meta($attachment_id, '_wp_attachment_image_alt', sanitize_text_field($data['alt']));
        }
        
        // Set title
        if (!empty($data['title'])) {
            wp_update_post(array(
                'ID' => $attachment_id,
                'post_title' => sanitize_text_field($data['title']),
            ));
        }
        
        // Set caption
        if (!empty($data['caption'])) {
            wp_update_post(array(
                'ID' => $attachment_id,
                'post_excerpt' => sanitize_textarea_field($data['caption']),
            ));
        }
        
        // Set description
        if (!empty($data['description'])) {
            wp_update_post(array(
                'ID' => $attachment_id,
                'post_content' => sanitize_textarea_field($data['description']),
            ));
        }
        
        return $attachment_id;
    }
    
    /**
     * Upload media from base64
     * 
     * @param string $base64 Base64 encoded file
     * @param string $filename File name
     * @param int $post_id Parent post ID
     * @param array $data Additional data
     * @return int|WP_Error Attachment ID or error
     */
    public function upload_from_base64($base64, $filename, $post_id = 0, $data = array()) {
        require_once ABSPATH . 'wp-admin/includes/image.php';
        require_once ABSPATH . 'wp-admin/includes/file.php';
        require_once ABSPATH . 'wp-admin/includes/media.php';
        
        // Decode base64
        $decoded = base64_decode($base64);
        if ($decoded === false) {
            return new WP_Error('invalid_base64', 'Invalid base64 data');
        }
        
        // Create temp file
        $upload_dir = wp_upload_dir();
        $temp_file = $upload_dir['basedir'] . '/' . wp_unique_filename($upload_dir['basedir'], $filename);
        
        // Write to temp file
        if (file_put_contents($temp_file, $decoded) === false) {
            return new WP_Error('write_failed', 'Failed to write temp file');
        }
        
        $file_array = array(
            'name' => $filename,
            'tmp_name' => $temp_file,
        );
        
        // Upload to media library
        $attachment_id = media_handle_sideload($file_array, $post_id);
        
        // Clean up temp file
        if (file_exists($temp_file)) {
            @unlink($temp_file);
        }
        
        if (is_wp_error($attachment_id)) {
            return $attachment_id;
        }
        
        // Set metadata
        if (!empty($data['alt'])) {
            update_post_meta($attachment_id, '_wp_attachment_image_alt', sanitize_text_field($data['alt']));
        }
        
        return $attachment_id;
    }
    
    /**
     * Delete media
     * 
     * @param int $id Attachment ID
     * @return WP_REST_Response
     */
    public function delete($id) {
        $attachment = get_post($id);
        
        if (!$attachment || $attachment->post_type !== 'attachment') {
            return new WP_REST_Response(array('error' => 'Attachment not found'), 404);
        }
        
        $result = wp_delete_attachment($id, true);
        
        if (!$result) {
            return new WP_REST_Response(array('error' => 'Failed to delete attachment'), 500);
        }
        
        return new WP_REST_Response(array('message' => 'Attachment deleted'), 200);
    }
    
    /**
     * Format attachment for response
     * 
     * @param WP_Post $attachment
     * @return array
     */
    private function format_attachment($attachment) {
        $metadata = wp_get_attachment_metadata($attachment->ID);
        
        return array(
            'id' => $attachment->ID,
            'title' => $attachment->post_title,
            'caption' => $attachment->post_excerpt,
            'description' => $attachment->post_content,
            'alt' => get_post_meta($attachment->ID, '_wp_attachment_image_alt', true),
            'url' => wp_get_attachment_url($attachment->ID),
            'mime_type' => $attachment->post_mime_type,
            'date' => $attachment->post_date,
            'modified' => $attachment->post_modified,
            'width' => $metadata['width'] ?? null,
            'height' => $metadata['height'] ?? null,
            'sizes' => $this->get_image_sizes($attachment->ID),
        );
    }
    
    /**
     * Get available image sizes
     * 
     * @param int $attachment_id
     * @return array
     */
    private function get_image_sizes($attachment_id) {
        $sizes = array();
        $available_sizes = get_intermediate_image_sizes();
        
        foreach ($available_sizes as $size) {
            $image = wp_get_attachment_image_src($attachment_id, $size);
            if ($image) {
                $sizes[$size] = array(
                    'url' => $image[0],
                    'width' => $image[1],
                    'height' => $image[2],
                );
            }
        }
        
        return $sizes;
    }
}
`;
}

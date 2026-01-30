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
     * Option name for auto-convert setting
     */
    const AUTO_CONVERT_OPTION = 'gp_auto_convert_webp';
    
    /**
     * Option name for conversion history
     */
    const CONVERSION_HISTORY_OPTION = 'gp_webp_conversion_history';
    
    /**
     * Option name for conversion queue
     */
    const CONVERSION_QUEUE_OPTION = 'gp_webp_conversion_queue';
    
    /**
     * Option name for AI optimization settings
     */
    const AI_OPTIMIZATION_OPTION = 'gp_ai_image_optimization';
    
    /**
     * Number of days to keep backups before auto-cleanup
     */
    const BACKUP_RETENTION_DAYS = 30;
    
    /**
     * Constructor - register hooks for auto-conversion
     */
    public function __construct() {
        // Hook into upload process to auto-convert to WebP
        add_filter('wp_handle_upload', array(\\$this, 'maybe_convert_upload_to_webp'), 10, 2);
        
        // Register cron hook for queue processing
        add_action('gp_process_webp_queue', array(\\$this, 'process_conversion_queue'));
        
        // Register cron hook for backup cleanup
        add_action('gp_cleanup_old_backups', array(\\$this, 'cleanup_old_backups'));
        
        // Schedule cron jobs if not already scheduled
        if (!wp_next_scheduled('gp_cleanup_old_backups')) {
            wp_schedule_event(time(), 'daily', 'gp_cleanup_old_backups');
        }
    }
    
    /**
     * Check if auto-convert is enabled
     */
    public function is_auto_convert_enabled() {
        return (bool) get_option(self::AUTO_CONVERT_OPTION, false);
    }
    
    /**
     * Set auto-convert setting
     */
    public function set_auto_convert(\\$enabled) {
        update_option(self::AUTO_CONVERT_OPTION, (bool) \\$enabled);
        return \\$this->is_auto_convert_enabled();
    }
    
    /**
     * Get settings
     */
    public function get_settings() {
        return new WP_REST_Response(array(
            'autoConvertToWebp' => \\$this->is_auto_convert_enabled(),
        ), 200);
    }
    
    /**
     * Update settings
     */
    public function update_settings(\\$params) {
        if (isset(\\$params['autoConvertToWebp'])) {
            \\$this->set_auto_convert(\\$params['autoConvertToWebp']);
        }
        
        return \\$this->get_settings();
    }
    
    /**
     * Maybe convert uploaded file to WebP
     */
    public function maybe_convert_upload_to_webp(\\$upload, \\$context = 'upload') {
        // Only process if auto-convert is enabled
        if (!\\$this->is_auto_convert_enabled()) {
            return \\$upload;
        }
        
        // Only process images that can be converted
        $convertible_types = array('image/jpeg', 'image/png', 'image/gif');
        if (!in_array($upload['type'], $convertible_types)) {
            return $upload;
        }
        
        // Check if GD or Imagick is available
        $has_gd = extension_loaded('gd') && function_exists('imagewebp');
        $has_imagick = extension_loaded('imagick') && class_exists('Imagick');
        
        if (!$has_gd && !$has_imagick) {
            return $upload;
        }
        
        $original_file = $upload['file'];
        $webp_file = preg_replace('/\\.(jpe?g|png|gif)$/i', '.webp', $original_file);
        
        try {
            // Convert to WebP
            if ($has_imagick) {
                $image = new Imagick($original_file);
                $image->setImageFormat('webp');
                $image->setImageCompressionQuality(85);
                $image->writeImage($webp_file);
                $image->destroy();
            } else {
                switch ($upload['type']) {
                    case 'image/jpeg':
                        $image = imagecreatefromjpeg($original_file);
                        break;
                    case 'image/png':
                        $image = imagecreatefrompng($original_file);
                        imagepalettetotruecolor($image);
                        imagealphablending($image, true);
                        imagesavealpha($image, true);
                        break;
                    case 'image/gif':
                        $image = imagecreatefromgif($original_file);
                        break;
                    default:
                        return $upload;
                }
                
                if (!$image) {
                    return $upload;
                }
                
                imagewebp($image, $webp_file, 85);
                imagedestroy($image);
            }
            
            // If WebP was created successfully, update upload data
            if (file_exists($webp_file)) {
                // Delete original file
                if (file_exists($original_file)) {
                    unlink($original_file);
                }
                
                // Update upload data to point to WebP file
                $upload['file'] = $webp_file;
                $upload['url'] = preg_replace('/\\.(jpe?g|png|gif)$/i', '.webp', $upload['url']);
                $upload['type'] = 'image/webp';
            }
        } catch (Exception $e) {
            // On error, return original upload unchanged
            error_log('GP WebP conversion failed: ' . $e->getMessage());
        }
        
        return $upload;
    }
    
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
    
    /**
     * Get media statistics
     * 
     * @return WP_REST_Response
     */
    public function get_stats() {
        global $wpdb;
        
        // Count total images
        $total = (int) $wpdb->get_var(
            "SELECT COUNT(*) FROM {$wpdb->posts} 
             WHERE post_type = 'attachment' 
             AND post_mime_type LIKE 'image/%'"
        );
        
        // Count WebP images
        $webp = (int) $wpdb->get_var(
            "SELECT COUNT(*) FROM {$wpdb->posts} 
             WHERE post_type = 'attachment' 
             AND post_mime_type = 'image/webp'"
        );
        
        $non_webp = $total - $webp;
        
        return new WP_REST_Response(array(
            'total' => $total,
            'webp' => $webp,
            'nonWebp' => $non_webp,
        ), 200);
    }
    
    /**
     * Get list of non-WebP images with thumbnails
     * 
     * @return WP_REST_Response
     */
    public function get_non_webp_images() {
        global $wpdb;
        
        $attachments = $wpdb->get_results("
            SELECT ID, post_title FROM {$wpdb->posts} 
            WHERE post_type = 'attachment' 
            AND post_mime_type IN ('image/jpeg', 'image/png', 'image/gif')
            AND post_status = 'inherit'
            ORDER BY post_date DESC
            LIMIT 100
        ");
        
        $images = array();
        foreach ($attachments as $attachment) {
            $file_path = get_attached_file($attachment->ID);
            $filesize = file_exists($file_path) ? filesize($file_path) : 0;
            
            $images[] = array(
                'id' => (int) $attachment->ID,
                'title' => $attachment->post_title,
                'thumbnail' => wp_get_attachment_image_url($attachment->ID, 'thumbnail'),
                'url' => wp_get_attachment_url($attachment->ID),
                'mimeType' => get_post_mime_type($attachment->ID),
                'filesize' => $filesize,
            );
        }
        
        return new WP_REST_Response(array(
            'images' => $images,
            'total' => count($images),
        ), 200);
    }
    
    /**
     * Get conversion history (images that have backups)
     * 
     * @return WP_REST_Response
     */
    public function get_conversion_history() {
        $history = get_option(self::CONVERSION_HISTORY_OPTION, array());
        
        // Filter out entries where backup no longer exists
        $valid_history = array();
        foreach ($history as $item) {
            if (!empty($item['backup_path']) && file_exists($item['backup_path'])) {
                // Get current attachment info
                $attachment = get_post($item['attachment_id']);
                if ($attachment) {
                    $valid_history[] = array(
                        'id' => (int) $item['attachment_id'],
                        'title' => $attachment->post_title,
                        'thumbnail' => wp_get_attachment_image_url($item['attachment_id'], 'thumbnail'),
                        'originalMimeType' => $item['original_mime_type'],
                        'convertedAt' => $item['converted_at'],
                        'hasBackup' => true,
                    );
                }
            }
        }
        
        return new WP_REST_Response(array(
            'items' => $valid_history,
            'total' => count($valid_history),
        ), 200);
    }
    
    /**
     * Revert a WebP conversion using backup
     * 
     * @param array $params Parameters: 'image_id' (int)
     * @return WP_REST_Response
     */
    public function revert_webp($params) {
        require_once ABSPATH . 'wp-admin/includes/image.php';
        
        $image_id = isset($params['image_id']) ? (int) $params['image_id'] : 0;
        
        if (!$image_id) {
            return new WP_REST_Response(array('error' => 'Image ID is required'), 400);
        }
        
        $history = get_option(self::CONVERSION_HISTORY_OPTION, array());
        $history_item = null;
        $history_key = null;
        
        foreach ($history as $key => $item) {
            if ((int) $item['attachment_id'] === $image_id) {
                $history_item = $item;
                $history_key = $key;
                break;
            }
        }
        
        if (!$history_item) {
            return new WP_REST_Response(array('error' => 'No backup found for this image'), 404);
        }
        
        if (!file_exists($history_item['backup_path'])) {
            // Remove from history since backup doesn't exist
            unset($history[$history_key]);
            update_option(self::CONVERSION_HISTORY_OPTION, array_values($history));
            return new WP_REST_Response(array('error' => 'Backup file no longer exists'), 404);
        }
        
        try {
            $current_file = get_attached_file($image_id);
            $backup_path = $history_item['backup_path'];
            $original_mime = $history_item['original_mime_type'];
            
            // Determine correct extension based on mime type
            $ext_map = array(
                'image/jpeg' => '.jpg',
                'image/png' => '.png',
                'image/gif' => '.gif',
            );
            $extension = isset($ext_map[$original_mime]) ? $ext_map[$original_mime] : '.jpg';
            $restored_path = preg_replace('/\\.(jpe?g|png|gif|webp)$/i', '', $current_file) . $extension;
            
            if (!copy($backup_path, $restored_path)) {
                return new WP_REST_Response(array('error' => 'Failed to restore backup'), 500);
            }
            
            // Update attachment to use restored file
            wp_update_post(array(
                'ID' => $image_id,
                'post_mime_type' => $original_mime,
            ));
            
            update_attached_file($image_id, $restored_path);
            
            // Regenerate metadata
            $metadata = wp_generate_attachment_metadata($image_id, $restored_path);
            wp_update_attachment_metadata($image_id, $metadata);
            
            // Delete the WebP file
            if (file_exists($current_file) && $current_file !== $restored_path) {
                unlink($current_file);
            }
            
            // Delete the backup file
            unlink($backup_path);
            
            // Remove from history
            unset($history[$history_key]);
            update_option(self::CONVERSION_HISTORY_OPTION, array_values($history));
            
            return new WP_REST_Response(array(
                'success' => true,
                'message' => 'Image reverted successfully',
                'id' => $image_id,
            ), 200);
            
        } catch (Exception $e) {
            return new WP_REST_Response(array('error' => $e->getMessage()), 500);
        }
    }
    
    /**
     * Convert images to WebP format
     * 
     * @param array $params Parameters (all: bool, ids: array, keep_backups: bool)
     * @return WP_REST_Response
     */
    public function convert_to_webp($params) {
        require_once ABSPATH . 'wp-admin/includes/image.php';
        require_once ABSPATH . 'wp-admin/includes/file.php';
        
        $all = !empty($params['all']);
        $ids = !empty($params['ids']) ? array_map('intval', $params['ids']) : array();
        $keep_backups = isset($params['keep_backups']) ? (bool) $params['keep_backups'] : true;
        
        // Get images to convert
        $args = array(
            'post_type' => 'attachment',
            'post_status' => 'inherit',
            'post_mime_type' => array('image/jpeg', 'image/png', 'image/gif'),
            'posts_per_page' => $all ? -1 : count($ids),
            'fields' => 'ids',
        );
        
        if (!$all && !empty($ids)) {
            $args['post__in'] = $ids;
        }
        
        $query = new WP_Query($args);
        $attachment_ids = $query->posts;
        
        $converted = 0;
        $failed = 0;
        $errors = array();
        $backups = array();
        
        foreach ($attachment_ids as $attachment_id) {
            $result = $this->convert_single_to_webp($attachment_id, $keep_backups);
            
            if (is_array($result) && isset($result['success']) && $result['success']) {
                $converted++;
                if (!empty($result['backup_path'])) {
                    $backups[] = array(
                        'id' => $attachment_id,
                        'backup_path' => $result['backup_path'],
                    );
                }
            } elseif ($result === true) {
                $converted++;
            } else {
                $failed++;
                $errors[] = array(
                    'id' => $attachment_id,
                    'error' => is_string($result) ? $result : 'Unknown error',
                );
            }
        }
        
        return new WP_REST_Response(array(
            'total' => count($attachment_ids),
            'converted' => $converted,
            'failed' => $failed,
            'errors' => $errors,
            'backups' => $backups,
        ), 200);
    }
    
    /**
     * Convert a single image to WebP
     * 
     * @param int $attachment_id
     * @param bool $keep_backup Whether to keep a backup of the original
     * @return bool|array|string True/array on success, error message on failure
     */
    private function convert_single_to_webp($attachment_id, $keep_backup = true) {
        $file_path = get_attached_file($attachment_id);
        
        if (!$file_path || !file_exists($file_path)) {
            return 'File not found';
        }
        
        $mime_type = get_post_mime_type($attachment_id);
        
        // Skip if already WebP
        if ($mime_type === 'image/webp') {
            return 'Already WebP';
        }
        
        // Check if GD or Imagick is available
        if (!function_exists('imagecreatefromstring') && !extension_loaded('imagick')) {
            return 'No image library available (GD or Imagick required)';
        }
        
        // Create WebP path
        $path_info = pathinfo($file_path);
        $webp_path = $path_info['dirname'] . '/' . $path_info['filename'] . '.webp';
        
        $backup_path = null;
        
        try {
            // Create backup if requested
            if ($keep_backup) {
                $upload_dir = wp_upload_dir();
                $backup_dir = $upload_dir['basedir'] . '/gp-backups';
                
                if (!file_exists($backup_dir)) {
                    wp_mkdir_p($backup_dir);
                    // Add .htaccess to protect backup folder
                    file_put_contents($backup_dir . '/.htaccess', 'Deny from all');
                }
                
                $backup_filename = $attachment_id . '_' . time() . '_' . basename($file_path);
                $backup_path = $backup_dir . '/' . $backup_filename;
                
                if (!copy($file_path, $backup_path)) {
                    return 'Failed to create backup';
                }
            }
            
            // Use Imagick if available (better quality)
            if (extension_loaded('imagick')) {
                $image = new Imagick($file_path);
                $image->setImageFormat('webp');
                $image->setImageCompressionQuality(82);
                $image->writeImage($webp_path);
                $image->destroy();
            } else {
                // Use GD library
                $image = imagecreatefromstring(file_get_contents($file_path));
                if (!$image) {
                    if ($backup_path && file_exists($backup_path)) {
                        unlink($backup_path);
                    }
                    return 'Failed to create image from file';
                }
                
                // Preserve transparency for PNG
                if ($mime_type === 'image/png') {
                    imagepalettetotruecolor($image);
                    imagealphablending($image, true);
                    imagesavealpha($image, true);
                }
                
                if (!imagewebp($image, $webp_path, 82)) {
                    imagedestroy($image);
                    if ($backup_path && file_exists($backup_path)) {
                        unlink($backup_path);
                    }
                    return 'Failed to save WebP image';
                }
                imagedestroy($image);
            }
            
            if (!file_exists($webp_path)) {
                if ($backup_path && file_exists($backup_path)) {
                    unlink($backup_path);
                }
                return 'WebP file was not created';
            }
            
            // Delete original file
            @unlink($file_path);
            
            // Update attachment file path
            update_attached_file($attachment_id, $webp_path);
            
            // Update post mime type
            wp_update_post(array(
                'ID' => $attachment_id,
                'post_mime_type' => 'image/webp',
            ));
            
            // Regenerate metadata
            $metadata = wp_generate_attachment_metadata($attachment_id, $webp_path);
            wp_update_attachment_metadata($attachment_id, $metadata);
            
            // Add to conversion history if backup was created
            if ($backup_path && file_exists($backup_path)) {
                $history = get_option(self::CONVERSION_HISTORY_OPTION, array());
                $history[] = array(
                    'attachment_id' => $attachment_id,
                    'original_mime_type' => $mime_type,
                    'original_path' => $file_path,
                    'backup_path' => $backup_path,
                    'webp_path' => $webp_path,
                    'converted_at' => current_time('mysql'),
                );
                update_option(self::CONVERSION_HISTORY_OPTION, $history);
                
                return array(
                    'success' => true,
                    'backup_path' => $backup_path,
                );
            }
            
            return true;
            
        } catch (Exception $e) {
            if ($backup_path && file_exists($backup_path)) {
                unlink($backup_path);
            }
            return $e->getMessage();
        }
    }
    
    /**
     * Add images to conversion queue (for batch processing)
     * 
     * @param array $params Parameters: 'ids' (array), 'keep_backups' (bool), 'flush_cache' (bool), 'replace_urls' (bool)
     */
    public function queue_for_webp($params) {
        $ids = isset($params['ids']) && is_array($params['ids']) ? array_map('intval', $params['ids']) : array();
        $keep_backups = isset($params['keep_backups']) ? (bool) $params['keep_backups'] : true;
        $flush_cache = isset($params['flush_cache']) ? (bool) $params['flush_cache'] : true;
        $replace_urls = isset($params['replace_urls']) ? (bool) $params['replace_urls'] : true;
        
        if (empty($ids)) {
            return new WP_REST_Response(array('error' => 'No image IDs provided'), 400);
        }
        
        // Get existing queue
        $queue = get_option(self::CONVERSION_QUEUE_OPTION, array());
        
        // Add new items to queue
        foreach ($ids as $id) {
            // Check if not already in queue
            $already_queued = false;
            foreach ($queue as $item) {
                if ($item['id'] === $id && $item['status'] === 'pending') {
                    $already_queued = true;
                    break;
                }
            }
            
            if (!$already_queued) {
                $queue[] = array(
                    'id' => $id,
                    'status' => 'pending',
                    'keep_backup' => $keep_backups,
                    'flush_cache' => $flush_cache,
                    'replace_urls' => $replace_urls,
                    'added_at' => current_time('mysql'),
                );
            }
        }
        
        update_option(self::CONVERSION_QUEUE_OPTION, $queue);
        
        // Schedule immediate cron run if not already running
        if (!wp_next_scheduled('gp_process_webp_queue')) {
            wp_schedule_single_event(time(), 'gp_process_webp_queue');
        }
        
        return new WP_REST_Response(array(
            'success' => true,
            'message' => sprintf('%d images added to conversion queue', count($ids)),
            'queue_size' => count(array_filter($queue, function($item) {
                return $item['status'] === 'pending';
            })),
        ), 200);
    }
    
    /**
     * Get queue status
     */
    public function get_queue_status() {
        $queue = get_option(self::CONVERSION_QUEUE_OPTION, array());
        
        $pending = 0;
        $completed = 0;
        $failed = 0;
        
        foreach ($queue as $item) {
            switch ($item['status']) {
                case 'pending':
                    $pending++;
                    break;
                case 'completed':
                    $completed++;
                    break;
                case 'failed':
                    $failed++;
                    break;
            }
        }
        
        return new WP_REST_Response(array(
            'pending' => $pending,
            'completed' => $completed,
            'failed' => $failed,
            'total' => count($queue),
            'is_processing' => (bool) get_transient('gp_webp_queue_processing'),
        ), 200);
    }
    
    /**
     * Clear completed/failed items from queue
     */
    public function clear_queue() {
        $queue = get_option(self::CONVERSION_QUEUE_OPTION, array());
        
        // Keep only pending items
        $queue = array_filter($queue, function($item) {
            return $item['status'] === 'pending';
        });
        
        update_option(self::CONVERSION_QUEUE_OPTION, array_values($queue));
        
        return new WP_REST_Response(array(
            'success' => true,
            'message' => 'Queue cleared',
            'pending' => count($queue),
        ), 200);
    }
    
    /**
     * Process conversion queue (called by cron)
     * Processes one image at a time to prevent server overload
     */
    public function process_conversion_queue() {
        // Prevent concurrent processing
        if (get_transient('gp_webp_queue_processing')) {
            return;
        }
        
        set_transient('gp_webp_queue_processing', true, 5 * MINUTE_IN_SECONDS);
        
        $queue = get_option(self::CONVERSION_QUEUE_OPTION, array());
        
        // Find first pending item
        $item_key = null;
        $item = null;
        foreach ($queue as $key => $queue_item) {
            if ($queue_item['status'] === 'pending') {
                $item_key = $key;
                $item = $queue_item;
                break;
            }
        }
        
        if ($item === null) {
            // No pending items, clear the transient and stop
            delete_transient('gp_webp_queue_processing');
            return;
        }
        
        // Mark as processing
        $queue[$item_key]['status'] = 'processing';
        update_option(self::CONVERSION_QUEUE_OPTION, $queue);
        
        // Get old URL before conversion (for URL replacement)
        $old_url = wp_get_attachment_url($item['id']);
        
        // Convert the image
        $result = $this->convert_single_to_webp($item['id'], $item['keep_backup']);
        
        if ((is_array($result) && isset($result['success']) && $result['success']) || $result === true) {
            $queue[$item_key]['status'] = 'completed';
            $queue[$item_key]['completed_at'] = current_time('mysql');
            
            // Get new URL after conversion
            $new_url = wp_get_attachment_url($item['id']);
            
            // Replace URLs in database if requested
            if (!empty($item['replace_urls']) && $old_url !== $new_url) {
                $this->replace_image_urls_in_content($old_url, $new_url);
            }
            
            // Flush cache if requested
            if (!empty($item['flush_cache'])) {
                $this->flush_caches($item['id']);
            }
        } else {
            $queue[$item_key]['status'] = 'failed';
            $queue[$item_key]['error'] = is_string($result) ? $result : 'Conversion failed';
            $queue[$item_key]['failed_at'] = current_time('mysql');
        }
        
        update_option(self::CONVERSION_QUEUE_OPTION, $queue);
        delete_transient('gp_webp_queue_processing');
        
        // Schedule next item processing if there are more pending items
        $has_pending = false;
        foreach ($queue as $queue_item) {
            if ($queue_item['status'] === 'pending') {
                $has_pending = true;
                break;
            }
        }
        
        if ($has_pending) {
            // Schedule next processing in 5 seconds to give server breathing room
            wp_schedule_single_event(time() + 5, 'gp_process_webp_queue');
        }
    }
    
    /**
     * Cleanup old backups (older than BACKUP_RETENTION_DAYS)
     * Called by daily cron job
     */
    public function cleanup_old_backups() {
        $history = get_option(self::CONVERSION_HISTORY_OPTION, array());
        $retention_seconds = self::BACKUP_RETENTION_DAYS * DAY_IN_SECONDS;
        $now = current_time('timestamp');
        $cleaned = 0;
        
        foreach ($history as $key => $item) {
            if (empty($item['converted_at'])) {
                continue;
            }
            
            $converted_time = strtotime($item['converted_at']);
            $age = $now - $converted_time;
            
            if ($age > $retention_seconds) {
                // Delete the backup file
                if (!empty($item['backup_path']) && file_exists($item['backup_path'])) {
                    unlink($item['backup_path']);
                }
                
                // Remove from history
                unset($history[$key]);
                $cleaned++;
            }
        }
        
        if ($cleaned > 0) {
            update_option(self::CONVERSION_HISTORY_OPTION, array_values($history));
            
            // Log cleanup
            error_log(sprintf('Ghost Post: Cleaned up %d old WebP backups', $cleaned));
        }
    }
    
    /**
     * Replace old image URLs with new URLs in post content
     * 
     * @param string $old_url Old image URL
     * @param string $new_url New image URL
     */
    private function replace_image_urls_in_content($old_url, $new_url) {
        global $wpdb;
        
        // Extract just the path parts for more reliable replacement
        $old_path = parse_url($old_url, PHP_URL_PATH);
        $new_path = parse_url($new_url, PHP_URL_PATH);
        
        if (!$old_path || !$new_path) {
            return;
        }
        
        // Replace in post content
        $wpdb->query($wpdb->prepare(
            "UPDATE {$wpdb->posts} 
             SET post_content = REPLACE(post_content, %s, %s) 
             WHERE post_content LIKE %s",
            $old_path,
            $new_path,
            '%' . $wpdb->esc_like($old_path) . '%'
        ));
        
        // Replace in post meta (for page builders, ACF, etc.)
        $wpdb->query($wpdb->prepare(
            "UPDATE {$wpdb->postmeta} 
             SET meta_value = REPLACE(meta_value, %s, %s) 
             WHERE meta_value LIKE %s",
            $old_path,
            $new_path,
            '%' . $wpdb->esc_like($old_path) . '%'
        ));
        
        // Replace in options (for theme settings, widgets, etc.)
        $wpdb->query($wpdb->prepare(
            "UPDATE {$wpdb->options} 
             SET option_value = REPLACE(option_value, %s, %s) 
             WHERE option_value LIKE %s 
             AND option_name NOT LIKE %s",
            $old_path,
            $new_path,
            '%' . $wpdb->esc_like($old_path) . '%',
            '\\_%' // Skip private options
        ));
    }
    
    /**
     * Flush various caches after conversion
     * 
     * @param int $attachment_id The attachment that was converted
     */
    private function flush_caches($attachment_id) {
        // Clear WordPress object cache
        wp_cache_flush();
        
        // WP Rocket
        if (function_exists('rocket_clean_domain')) {
            rocket_clean_domain();
        }
        
        // W3 Total Cache
        if (function_exists('w3tc_flush_all')) {
            w3tc_flush_all();
        }
        
        // WP Super Cache
        if (function_exists('wp_cache_clear_cache')) {
            wp_cache_clear_cache();
        }
        
        // LiteSpeed Cache
        if (class_exists('LiteSpeed_Cache_API') && method_exists('LiteSpeed_Cache_API', 'purge_all')) {
            LiteSpeed_Cache_API::purge_all();
        }
        
        // WP Fastest Cache
        if (function_exists('wpfc_clear_all_cache')) {
            wpfc_clear_all_cache(true);
        }
        
        // Autoptimize
        if (class_exists('autoptimizeCache') && method_exists('autoptimizeCache', 'clearall')) {
            autoptimizeCache::clearall();
        }
        
        // Cloudflare (via official plugin)
        if (class_exists('CF\\WordPress\\Hooks') && method_exists('CF\\WordPress\\Hooks', 'purgeCacheEverything')) {
            do_action('cloudflare_purge_everything');
        }
        
        // SG Optimizer (SiteGround)
        if (function_exists('sg_cachepress_purge_everything')) {
            sg_cachepress_purge_everything();
        }
        
        // Kinsta Cache
        if (class_exists('Kinsta\\Cache') && method_exists('Kinsta\\Cache', 'purge_complete_caches')) {
            wp_remote_get(home_url() . '/kinsta-clear-cache-all');
        }
        
        // WP Engine
        if (class_exists('WpeCommon')) {
            if (method_exists('WpeCommon', 'purge_memcached')) {
                WpeCommon::purge_memcached();
            }
            if (method_exists('WpeCommon', 'clear_maxcdn_cache')) {
                WpeCommon::clear_maxcdn_cache();
            }
            if (method_exists('WpeCommon', 'purge_varnish_cache')) {
                WpeCommon::purge_varnish_cache();
            }
        }
        
        // Clear specific attachment cache
        clean_attachment_cache($attachment_id);
    }
    
    /**
     * Optimize image with AI (filename and alt text)
     * 
     * @param array $params Parameters: 'image_id', 'apply_filename', 'apply_alt_text', 'page_context', 'language'
     * @return WP_REST_Response
     */
    public function ai_optimize_image($params) {
        $image_id = isset($params['image_id']) ? (int) $params['image_id'] : 0;
        $apply_filename = isset($params['apply_filename']) ? (bool) $params['apply_filename'] : false;
        $apply_alt_text = isset($params['apply_alt_text']) ? (bool) $params['apply_alt_text'] : false;
        $page_context = isset($params['page_context']) ? sanitize_text_field($params['page_context']) : '';
        $language = isset($params['language']) ? sanitize_text_field($params['language']) : 'en';
        
        if (!$image_id) {
            return new WP_REST_Response(array('error' => 'Image ID is required'), 400);
        }
        
        $attachment = get_post($image_id);
        if (!$attachment || $attachment->post_type !== 'attachment') {
            return new WP_REST_Response(array('error' => 'Image not found'), 404);
        }
        
        $image_url = wp_get_attachment_url($image_id);
        $current_filename = basename(get_attached_file($image_id));
        
        // Call Ghost Post AI API
        $ai_result = \\$this->call_ghost_post_ai($image_url, $current_filename, $page_context, $language);
        
        if (is_wp_error($ai_result)) {
            return new WP_REST_Response(array('error' => $ai_result->get_error_message()), 500);
        }
        
        $result = array(
            'success' => true,
            'image_id' => $image_id,
            'suggested_filename' => $ai_result['suggestedFilename'],
            'suggested_alt_text' => $ai_result['altText'],
            'confidence' => $ai_result['confidence'],
            'reasoning' => $ai_result['reasoning'],
            'applied' => array(),
        );
        
        // Apply filename if requested
        if ($apply_filename && !empty($ai_result['suggestedFilename'])) {
            $rename_result = \\$this->rename_attachment($image_id, $ai_result['suggestedFilename']);
            if (!is_wp_error($rename_result)) {
                $result['applied']['filename'] = true;
                $result['new_url'] = $rename_result['new_url'];
                $result['redirect_created'] = $rename_result['redirect_created'];
            } else {
                $result['applied']['filename'] = false;
                $result['filename_error'] = $rename_result->get_error_message();
            }
        }
        
        // Apply alt text if requested
        if ($apply_alt_text && !empty($ai_result['altText'])) {
            update_post_meta($image_id, '_wp_attachment_image_alt', sanitize_text_field($ai_result['altText']));
            $result['applied']['alt_text'] = true;
        }
        
        return new WP_REST_Response($result, 200);
    }
    
    /**
     * Batch AI optimize multiple images
     * 
     * @param array $params Parameters: 'image_ids', 'apply_filename', 'apply_alt_text', 'language'
     * @return WP_REST_Response
     */
    public function ai_optimize_batch($params) {
        $image_ids = isset($params['image_ids']) && is_array($params['image_ids']) ? array_map('intval', $params['image_ids']) : array();
        $apply_filename = isset($params['apply_filename']) ? (bool) $params['apply_filename'] : false;
        $apply_alt_text = isset($params['apply_alt_text']) ? (bool) $params['apply_alt_text'] : false;
        $language = isset($params['language']) ? sanitize_text_field($params['language']) : 'en';
        
        if (empty($image_ids)) {
            return new WP_REST_Response(array('error' => 'No image IDs provided'), 400);
        }
        
        // Limit batch size
        if (count($image_ids) > 10) {
            return new WP_REST_Response(array('error' => 'Maximum 10 images per batch'), 400);
        }
        
        $results = array();
        $success_count = 0;
        $failed_count = 0;
        
        foreach ($image_ids as $image_id) {
            $result = \\$this->ai_optimize_image(array(
                'image_id' => $image_id,
                'apply_filename' => $apply_filename,
                'apply_alt_text' => $apply_alt_text,
                'language' => $language,
            ));
            
            if ($result->get_status() === 200) {
                $success_count++;
                $results[] = $result->get_data();
            } else {
                $failed_count++;
                $results[] = array(
                    'image_id' => $image_id,
                    'error' => $result->get_data()['error'] ?? 'Unknown error',
                );
            }
        }
        
        return new WP_REST_Response(array(
            'success' => $failed_count === 0,
            'total' => count($image_ids),
            'succeeded' => $success_count,
            'failed' => $failed_count,
            'results' => $results,
        ), 200);
    }
    
    /**
     * Call Ghost Post AI API for image optimization
     * 
     * @param string $image_url
     * @param string $current_filename
     * @param string $page_context
     * @param string $language
     * @return array|WP_Error
     */
    private function call_ghost_post_ai($image_url, $current_filename, $page_context = '', $language = 'en') {
        $config = get_option('ghost_post_config', array());
        $platform_url = isset($config['platform_url']) ? rtrim($config['platform_url'], '/') : '';
        $site_id = isset($config['site_id']) ? $config['site_id'] : '';
        $secret = isset($config['secret']) ? $config['secret'] : '';
        
        if (empty($platform_url) || empty($site_id) || empty($secret)) {
            return new WP_Error('config_error', 'Ghost Post configuration incomplete');
        }
        
        $endpoint = $platform_url . '/api/sites/' . $site_id . '/tools/ai-image-optimize';
        
        // Create HMAC signature for authentication
        $timestamp = time();
        $signature = hash_hmac('sha256', $timestamp . $site_id, $secret);
        
        $response = wp_remote_post($endpoint, array(
            'headers' => array(
                'Content-Type' => 'application/json',
                'X-GP-Timestamp' => $timestamp,
                'X-GP-Signature' => $signature,
                'X-GP-Site-ID' => $site_id,
            ),
            'body' => json_encode(array(
                'imageUrl' => $image_url,
                'currentFilename' => $current_filename,
                'pageContext' => $page_context,
                'language' => $language,
            )),
            'timeout' => 30,
        ));
        
        if (is_wp_error($response)) {
            return $response;
        }
        
        $status_code = wp_remote_retrieve_response_code($response);
        $body = json_decode(wp_remote_retrieve_body($response), true);
        
        if ($status_code !== 200) {
            return new WP_Error('api_error', $body['error'] ?? 'AI API request failed');
        }
        
        return $body;
    }
    
    /**
     * Rename an attachment file with SEO-friendly name
     * 
     * @param int $attachment_id
     * @param string $new_name New filename without extension
     * @return array|WP_Error Result with new URL and redirect info
     */
    private function rename_attachment($attachment_id, $new_name) {
        $file_path = get_attached_file($attachment_id);
        if (!$file_path || !file_exists($file_path)) {
            return new WP_Error('file_not_found', 'Attachment file not found');
        }
        
        $path_info = pathinfo($file_path);
        $old_filename = $path_info['basename'];
        $extension = $path_info['extension'];
        $directory = $path_info['dirname'];
        
        // Sanitize the new name
        $new_name = sanitize_file_name($new_name);
        $new_name = preg_replace('/[^a-z0-9\\-]/', '-', strtolower($new_name));
        $new_name = preg_replace('/-+/', '-', $new_name); // Remove multiple hyphens
        $new_name = trim($new_name, '-');
        
        if (empty($new_name)) {
            return new WP_Error('invalid_name', 'Invalid filename');
        }
        
        $new_filename = $new_name . '.' . $extension;
        $new_path = $directory . '/' . $new_filename;
        
        // Check if file already exists with that name
        $counter = 1;
        while (file_exists($new_path) && $new_path !== $file_path) {
            $new_filename = $new_name . '-' . $counter . '.' . $extension;
            $new_path = $directory . '/' . $new_filename;
            $counter++;
        }
        
        // Get old URL before rename
        $old_url = wp_get_attachment_url($attachment_id);
        
        // Rename the main file
        if ($file_path !== $new_path) {
            if (!rename($file_path, $new_path)) {
                return new WP_Error('rename_failed', 'Failed to rename file');
            }
        }
        
        // Update attachment file path
        update_attached_file($attachment_id, $new_path);
        
        // Update post title
        wp_update_post(array(
            'ID' => $attachment_id,
            'post_title' => str_replace('-', ' ', $new_name),
            'post_name' => $new_name,
        ));
        
        // Regenerate thumbnails with new names
        require_once(ABSPATH . 'wp-admin/includes/image.php');
        
        // Delete old thumbnails
        $metadata = wp_get_attachment_metadata($attachment_id);
        if (!empty($metadata['sizes'])) {
            foreach ($metadata['sizes'] as $size => $size_data) {
                $thumb_path = $directory . '/' . $size_data['file'];
                if (file_exists($thumb_path)) {
                    @unlink($thumb_path);
                }
            }
        }
        
        // Generate new thumbnails
        $new_metadata = wp_generate_attachment_metadata($attachment_id, $new_path);
        wp_update_attachment_metadata($attachment_id, $new_metadata);
        
        // Get new URL
        $new_url = wp_get_attachment_url($attachment_id);
        
        // Replace old URLs in content
        if ($old_url !== $new_url) {
            \\$this->replace_image_urls_in_content($old_url, $new_url);
        }
        
        // Create redirect if old URL is different
        $redirect_created = false;
        if ($old_url !== $new_url) {
            $redirect_created = \\$this->create_redirect($old_url, $new_url);
        }
        
        return array(
            'success' => true,
            'old_url' => $old_url,
            'new_url' => $new_url,
            'redirect_created' => $redirect_created,
        );
    }
    
    /**
     * Create a redirect rule for renamed image
     * 
     * @param string $old_url
     * @param string $new_url
     * @return bool
     */
    private function create_redirect($old_url, $new_url) {
        // Store redirects in options for plugins like Redirection to pick up
        // or for our own htaccess generation
        $redirects = get_option('gp_image_redirects', array());
        
        $old_path = parse_url($old_url, PHP_URL_PATH);
        $new_path = parse_url($new_url, PHP_URL_PATH);
        
        if ($old_path && $new_path) {
            $redirects[$old_path] = array(
                'target' => $new_path,
                'created' => current_time('mysql'),
            );
            
            update_option('gp_image_redirects', $redirects);
            
            // Try to add to Redirection plugin if available
            if (class_exists('Red_Item')) {
                try {
                    Red_Item::create(array(
                        'source' => $old_path,
                        'target' => $new_path,
                        'match' => 'url',
                        'action' => 'url',
                        'group_id' => 1, // Default group
                    ));
                } catch (Exception $e) {
                    // Redirection plugin not configured properly, continue without it
                }
            }
            
            // Update .htaccess with redirect rules
            \\$this->update_htaccess_redirects();
            
            return true;
        }
        
        return false;
    }
    
    /**
     * Update .htaccess with image redirect rules
     */
    private function update_htaccess_redirects() {
        $redirects = get_option('gp_image_redirects', array());
        
        if (empty($redirects)) {
            return;
        }
        
        $htaccess_file = ABSPATH . '.htaccess';
        
        if (!file_exists($htaccess_file) || !is_writable($htaccess_file)) {
            return;
        }
        
        $content = file_get_contents($htaccess_file);
        
        // Remove existing GP redirects block
        $content = preg_replace('/# BEGIN Ghost Post Image Redirects.*?# END Ghost Post Image Redirects\\s*/s', '', $content);
        
        // Build new redirect rules
        $redirect_rules = "# BEGIN Ghost Post Image Redirects\\n";
        $redirect_rules .= "<IfModule mod_rewrite.c>\\n";
        $redirect_rules .= "RewriteEngine On\\n";
        
        foreach ($redirects as $old_path => $redirect) {
            $redirect_rules .= "RewriteRule ^" . ltrim(preg_quote($old_path, '/'), '/') . "$ " . $redirect['target'] . " [R=301,L]\\n";
        }
        
        $redirect_rules .= "</IfModule>\\n";
        $redirect_rules .= "# END Ghost Post Image Redirects\\n\\n";
        
        // Insert before WordPress rules
        if (strpos($content, '# BEGIN WordPress') !== false) {
            $content = $redirect_rules . $content;
        } else {
            $content = $redirect_rules . $content;
        }
        
        file_put_contents($htaccess_file, $content);
    }
    
    /**
     * Get AI optimization settings
     */
    public function get_ai_settings() {
        $settings = get_option(self::AI_OPTIMIZATION_OPTION, array(
            'enabled' => false,
            'auto_alt_text' => false,
            'auto_filename' => false,
            'language' => 'en',
        ));
        
        return new WP_REST_Response($settings, 200);
    }
    
    /**
     * Update AI optimization settings
     * 
     * @param array $params
     */
    public function update_ai_settings($params) {
        $settings = array(
            'enabled' => isset($params['enabled']) ? (bool) $params['enabled'] : false,
            'auto_alt_text' => isset($params['auto_alt_text']) ? (bool) $params['auto_alt_text'] : false,
            'auto_filename' => isset($params['auto_filename']) ? (bool) $params['auto_filename'] : false,
            'language' => isset($params['language']) ? sanitize_text_field($params['language']) : 'en',
        );
        
        update_option(self::AI_OPTIMIZATION_OPTION, $settings);
        
        return new WP_REST_Response($settings, 200);
    }
    
    /**
     * Get image redirects
     */
    public function get_image_redirects() {
        $redirects = get_option('gp_image_redirects', array());
        
        return new WP_REST_Response(array(
            'redirects' => $redirects,
            'count' => count($redirects),
        ), 200);
    }
    
    /**
     * Clear image redirects
     */
    public function clear_image_redirects() {
        delete_option('gp_image_redirects');
        \\$this->update_htaccess_redirects();
        
        return new WP_REST_Response(array(
            'success' => true,
            'message' => 'Redirects cleared',
        ), 200);
    }
}
`;
}

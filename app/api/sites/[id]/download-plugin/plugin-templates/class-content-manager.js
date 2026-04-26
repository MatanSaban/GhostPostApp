/**
 * Generate Content Manager class
 */
export function getClassContentManager() {
  return `<?php
/**
 * GhostSEO Content Manager
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
        
        // Mark as gp-platform origin BEFORE insert (save_post fires during wp_insert_post)
        GP_Entity_Sync::mark_gp_origin();
        
        $post_id = wp_insert_post($post_data, true);
        
        if (is_wp_error($post_id)) {
            GP_Entity_Sync::clear_gp_origin();
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
        
        // Mark as gp-platform origin BEFORE update (save_post fires during wp_update_post)
        GP_Entity_Sync::mark_gp_origin();
        
        // Only call wp_update_post if there are actual post fields to update (not just meta/taxonomy/featured_image)
        if (count($post_data) > 1) {
            $result = wp_update_post($post_data, true);
            
            if (is_wp_error($result)) {
                GP_Entity_Sync::clear_gp_origin();
                return new WP_REST_Response(array('error' => $result->get_error_message()), 400);
            }
        }
        
        // Handle H1 replacement in page builders (Elementor, shortcodes, raw HTML)
        $response_data_h1 = null;
        if (!empty($data['old_h1']) && !empty($data['new_h1'])) {
            $h1_result = $this->update_h1_in_builders($id, $data['old_h1'], $data['new_h1']);
            if (!empty($h1_result['updated'])) {
                $response_data_h1 = $h1_result;
            }
        }
        
        // Handle adding new H1 (when page has no H1)
        if (!empty($data['add_h1'])) {
            $hint = !empty($data['insert_before_text']) ? $data['insert_before_text'] : null;
            $add_h1_result = $this->add_h1_to_builders($id, $data['add_h1'], $hint);
            if (!empty($add_h1_result['added'])) {
                $response_data_h1 = $add_h1_result;
            }
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
        
        $response_data = array(
            'id' => $id,
            'message' => 'Post updated successfully',
            'post' => $this->format_post(get_post($id), true),
        );
        
        if (!empty($response_data_h1)) {
            $response_data['h1_update'] = $response_data_h1;
        }
        
        return new WP_REST_Response($response_data, 200);
    }
    
    /**
     * Update H1 heading in page builder data and raw HTML content.
     * Handles Elementor, Beaver Builder, shortcodes, and raw <h1> tags.
     */
    private function update_h1_in_builders($post_id, $old_h1, $new_h1) {
        $old_h1 = sanitize_text_field($old_h1);
        $new_h1 = sanitize_text_field($new_h1);
        $updated = array();
        
        // 1. Elementor: _elementor_data (JSON in post meta)
        $elementor_data = get_post_meta($post_id, '_elementor_data', true);
        if (!empty($elementor_data)) {
            $is_json = is_string($elementor_data);
            $elements = $is_json ? json_decode($elementor_data, true) : $elementor_data;
            
            if (is_array($elements)) {
                $elementor_changed = false;
                $elements = $this->replace_h1_in_elementor($elements, $old_h1, $new_h1, $elementor_changed);
                
                if ($elementor_changed) {
                    $new_json = wp_json_encode($elements, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
                    update_post_meta($post_id, '_elementor_data', wp_slash($new_json));
                    delete_post_meta($post_id, '_elementor_css');
                    $updated[] = 'elementor';
                }
            }
        }
        
        // 2. Raw HTML <h1> tags in post_content
        $post = get_post($post_id);
        if ($post && !empty($post->post_content)) {
            $content = $post->post_content;
            $new_content = $content;
            
            $pattern = '/(<h1[^>]*>)\\s*' . preg_quote($old_h1, '/') . '\\s*(<\\/h1>)/i';
            $replacement = '\${1}' . str_replace('$', '\\\\$', $new_h1) . '\${2}';
            $new_content = preg_replace($pattern, $replacement, $new_content);
            
            if ($new_content !== $content) {
                GP_Entity_Sync::mark_gp_origin();
                wp_update_post(array(
                    'ID' => $post_id,
                    'post_content' => $new_content,
                ));
                $updated[] = 'html_h1';
            }
        }
        
        // 3. Beaver Builder: fl_builder_data (serialized in post meta)
        $bb_data = get_post_meta($post_id, '_fl_builder_data', true);
        if (!empty($bb_data) && is_array($bb_data)) {
            $bb_serialized = serialize($bb_data);
            $new_bb_serialized = str_replace($old_h1, $new_h1, $bb_serialized);
            
            if ($new_bb_serialized !== $bb_serialized) {
                $new_bb_data = unserialize($new_bb_serialized);
                if ($new_bb_data !== false) {
                    update_post_meta($post_id, '_fl_builder_data', $new_bb_data);
                    $updated[] = 'beaver_builder';
                }
            }
        }
        
        return array(
            'updated' => $updated,
            'old_h1' => $old_h1,
            'new_h1' => $new_h1,
        );
    }
    
    /**
     * Recursively traverse Elementor elements and replace H1 heading text.
     */
    private function replace_h1_in_elementor($elements, $old_h1, $new_h1, &$changed) {
        foreach ($elements as &$element) {
            if (
                isset($element['widgetType']) &&
                $element['widgetType'] === 'heading' &&
                isset($element['settings']['title']) &&
                isset($element['settings']['header_size']) &&
                $element['settings']['header_size'] === 'h1'
            ) {
                if (trim($element['settings']['title']) === trim($old_h1)) {
                    $element['settings']['title'] = $new_h1;
                    $changed = true;
                }
            }
            
            if (
                isset($element['widgetType']) &&
                $element['widgetType'] === 'theme-post-title' &&
                isset($element['settings']['title']) &&
                trim($element['settings']['title']) === trim($old_h1)
            ) {
                $element['settings']['title'] = $new_h1;
                $changed = true;
            }
            
            if (!empty($element['elements']) && is_array($element['elements'])) {
                $element['elements'] = $this->replace_h1_in_elementor(
                    $element['elements'], $old_h1, $new_h1, $changed
                );
            }
        }
        unset($element);
        
        return $elements;
    }
    
    /**
     * Add a new H1 heading to a page that doesn't have one.
     * Handles Elementor (inserts heading widget) and raw HTML.
     *
     * @param int    $post_id
     * @param string $h1_text
     * @param string|null $insert_before_text Optional text snippet of an existing widget.
     *                    If provided, the new H1 is inserted immediately before the matching widget.
     *                    If no match is found, falls back to top-of-page insertion.
     */
    public function add_h1_to_builders($post_id, $h1_text, $insert_before_text = null) {
        $h1_text = sanitize_text_field($h1_text);
        $hint = $insert_before_text ? sanitize_text_field($insert_before_text) : null;
        $added = array();

        // Detect active builder up front so the platform can tell whether the
        // html_prepend fallback actually rendered on the live page.
        $elementor_present = (
            get_post_meta($post_id, '_elementor_edit_mode', true) === 'builder'
            || !empty(get_post_meta($post_id, '_elementor_data', true))
        );
        $beaver_present = !empty(get_post_meta($post_id, '_fl_builder_data', true));

        // 1. Elementor
        $elementor_data = get_post_meta($post_id, '_elementor_data', true);
        if (!empty($elementor_data)) {
            $is_json = is_string($elementor_data);
            $elements = $is_json ? json_decode($elementor_data, true) : $elementor_data;

            if (is_array($elements) && !empty($elements)) {
                $h1_widget = array(
                    'id' => wp_generate_uuid4(),
                    'elType' => 'widget',
                    'widgetType' => 'heading',
                    'settings' => array(
                        'title' => $h1_text,
                        'header_size' => 'h1',
                    ),
                    'elements' => array(),
                );

                $inserted = false;

                // 1a. Try hint-based placement (insert before the widget whose text matches)
                if ($hint) {
                    $inserted = $this->insert_before_matching_widget($elements, $h1_widget, $hint);
                }

                // 1b. Fall back: find the deepest first column/container and prepend there
                if (!$inserted) {
                    $inserted = $this->insert_at_first_leaf($elements, $h1_widget);
                }

                // 1c. Last resort: synthesize a new container at the top
                if (!$inserted) {
                    $container = array(
                        'id' => wp_generate_uuid4(),
                        'elType' => 'container',
                        'settings' => array(),
                        'elements' => array($h1_widget),
                    );
                    array_unshift($elements, $container);
                    $inserted = true;
                }

                if ($inserted) {
                    $new_json = wp_json_encode($elements, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
                    update_post_meta($post_id, '_elementor_data', wp_slash($new_json));
                    delete_post_meta($post_id, '_elementor_css');
                    // Ask Elementor to regenerate CSS files on next render
                    if (class_exists('\\Elementor\\Plugin')) {
                        try {
                            $elementor = \\Elementor\\Plugin::$instance;
                            if ($elementor && isset($elementor->files_manager)) {
                                $elementor->files_manager->clear_cache();
                            }
                        } catch (Exception $e) { /* best effort */ }
                    }
                    $added[] = 'elementor';
                }
            }
        }

        // 2. Beaver Builder - insert a heading node at the top of the first row
        if (empty($added)) {
            $bb_data = get_post_meta($post_id, '_fl_builder_data', true);
            if (!empty($bb_data) && is_array($bb_data)) {
                $heading_node_id = wp_generate_uuid4();
                $parent_id = null;
                foreach ($bb_data as $node_id => $node) {
                    if (isset($node->type) && $node->type === 'column') { $parent_id = $node_id; break; }
                    if (isset($node['type']) && $node['type'] === 'column') { $parent_id = $node_id; break; }
                }
                if ($parent_id) {
                    $heading_node = (object) array(
                        'node' => $heading_node_id,
                        'type' => 'module',
                        'parent' => $parent_id,
                        'position' => 0,
                        'settings' => (object) array('heading' => $h1_text, 'tag' => 'h1'),
                        'slug' => 'heading',
                    );
                    $bb_data[$heading_node_id] = $heading_node;
                    update_post_meta($post_id, '_fl_builder_data', $bb_data);
                    $added[] = 'beaver_builder';
                }
            }
        }

        // 3. Fall back to prepending raw HTML to post_content (classic / Gutenberg)
        if (empty($added)) {
            $post = get_post($post_id);
            if ($post && $post->post_content !== null) {
                $h1_html = '<h1>' . esc_html($h1_text) . '</h1>';
                $new_content = $h1_html . "\\n" . $post->post_content;

                GP_Entity_Sync::mark_gp_origin();
                wp_update_post(array(
                    'ID' => $post_id,
                    'post_content' => $new_content,
                ));
                $added[] = 'html_prepend';
            }
        }

        return array(
            'added'              => $added,
            'h1_text'            => $h1_text,
            'hint'               => $hint,
            'elementor_present'  => $elementor_present,
            'beaver_present'     => $beaver_present,
            'fallback_used'      => in_array('html_prepend', $added, true),
            'fallback_invisible' => in_array('html_prepend', $added, true) && $elementor_present,
        );
    }

    /**
     * Recursively search Elementor tree for a widget whose rendered text contains the hint,
     * and insert the new widget immediately before it in the same parent.
     */
    private function insert_before_matching_widget(&$elements, $new_widget, $hint) {
        $hint_lower = mb_strtolower($hint);
        for ($i = 0; $i < count($elements); $i++) {
            $el = &$elements[$i];

            // Compare against common text-bearing settings
            $candidates = array();
            if (isset($el['settings']) && is_array($el['settings'])) {
                foreach (array('title', 'text', 'editor', 'heading') as $k) {
                    if (isset($el['settings'][$k]) && is_string($el['settings'][$k])) {
                        $candidates[] = $el['settings'][$k];
                    }
                }
            }
            foreach ($candidates as $txt) {
                $stripped = mb_strtolower(trim(wp_strip_all_tags($txt)));
                if ($stripped !== '' && strpos($stripped, $hint_lower) !== false) {
                    array_splice($elements, $i, 0, array($new_widget));
                    return true;
                }
            }

            if (!empty($el['elements']) && is_array($el['elements'])) {
                if ($this->insert_before_matching_widget($el['elements'], $new_widget, $hint)) {
                    return true;
                }
            }
            unset($el);
        }
        return false;
    }

    /**
     * Insert into the first viable leaf container (container / column), prepending.
     */
    private function insert_at_first_leaf(&$elements, $new_widget) {
        foreach ($elements as &$el) {
            if (!isset($el['elType'])) continue;
            if ($el['elType'] === 'container') {
                // If this container has nested containers, recurse; else prepend here
                $has_nested_container = false;
                if (!empty($el['elements'])) {
                    foreach ($el['elements'] as $child) {
                        if (isset($child['elType']) && ($child['elType'] === 'container' || $child['elType'] === 'column')) {
                            $has_nested_container = true; break;
                        }
                    }
                }
                if ($has_nested_container) {
                    if ($this->insert_at_first_leaf($el['elements'], $new_widget)) return true;
                }
                if (!isset($el['elements'])) $el['elements'] = array();
                array_unshift($el['elements'], $new_widget);
                return true;
            }
            if ($el['elType'] === 'section' && !empty($el['elements'])) {
                foreach ($el['elements'] as &$col) {
                    if (isset($col['elType']) && $col['elType'] === 'column') {
                        if (!isset($col['elements'])) $col['elements'] = array();
                        array_unshift($col['elements'], $new_widget);
                        return true;
                    }
                }
                unset($col);
            }
        }
        unset($el);
        return false;
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
            'featuredImageId' => get_post_thumbnail_id($post->ID) ?: null,
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
            // Use update_post_meta directly instead of set_post_thumbnail
            // set_post_thumbnail can silently fail when image metadata is incomplete
            $thumb_id = (int) $image;
            $attachment = get_post($thumb_id);
            if (!$attachment || $attachment->post_type !== 'attachment') {
                error_log("GP set_featured_image: attachment $thumb_id not found for post $post_id");
                return;
            }
            update_post_meta($post_id, '_thumbnail_id', $thumb_id);
            // Verify it was set
            $verify = get_post_meta($post_id, '_thumbnail_id', true);
            if ((int) $verify !== $thumb_id) {
                error_log("GP set_featured_image: verification failed for post $post_id - expected $thumb_id, got $verify");
            }
        } elseif (filter_var($image, FILTER_VALIDATE_URL)) {
            // Download and attach image
            $media_manager = new GP_Media_Manager();
            $attachment_id = $media_manager->upload_from_url($image, $post_id);
            if ($attachment_id && !is_wp_error($attachment_id)) {
                update_post_meta($post_id, '_thumbnail_id', (int) $attachment_id);
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

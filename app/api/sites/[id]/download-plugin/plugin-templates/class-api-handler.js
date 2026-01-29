/**
 * Generate API Handler class
 */
export function getClassApiHandler() {
  return `<?php
/**
 * Ghost Post API Handler
 * 
 * Handles incoming REST API requests from Ghost Post platform
 */

if (!defined('ABSPATH')) {
    exit;
}

class GP_API_Handler {
    
    /**
     * @var GP_Request_Validator
     */
    private $validator;
    
    /**
     * @var GP_Content_Manager
     */
    private $content_manager;
    
    /**
     * @var GP_Media_Manager
     */
    private $media_manager;
    
    /**
     * @var GP_SEO_Manager
     */
    private $seo_manager;
    
    /**
     * @var GP_CPT_Manager
     */
    private $cpt_manager;
    
    /**
     * @var GP_ACF_Manager
     */
    private $acf_manager;
    
    /**
     * Constructor
     */
    public function __construct(GP_Request_Validator $validator) {
        $this->validator = $validator;
        $this->content_manager = new GP_Content_Manager();
        $this->media_manager = new GP_Media_Manager();
        $this->seo_manager = new GP_SEO_Manager();
        $this->cpt_manager = new GP_CPT_Manager();
        $this->acf_manager = new GP_ACF_Manager();
    }
    
    /**
     * Register REST API routes
     */
    public function register_routes() {
        $namespace = 'ghost-post/v1';
        
        // Verify endpoint
        register_rest_route($namespace, '/verify', array(
            'methods' => 'POST',
            'callback' => array($this, 'handle_verify'),
            'permission_callback' => array($this, 'validate_request'),
        ));
        
        // Site info
        register_rest_route($namespace, '/site-info', array(
            'methods' => 'GET',
            'callback' => array($this, 'get_site_info'),
            'permission_callback' => array($this, 'validate_request'),
        ));
        
        // Posts
        register_rest_route($namespace, '/posts', array(
            array(
                'methods' => 'GET',
                'callback' => array($this, 'get_posts'),
                'permission_callback' => array($this, 'validate_request'),
            ),
            array(
                'methods' => 'POST',
                'callback' => array($this, 'create_post'),
                'permission_callback' => array($this, 'validate_request'),
            ),
        ));
        
        register_rest_route($namespace, '/posts/(?P<id>\\d+)', array(
            array(
                'methods' => 'GET',
                'callback' => array($this, 'get_post'),
                'permission_callback' => array($this, 'validate_request'),
            ),
            array(
                'methods' => 'PUT',
                'callback' => array($this, 'update_post'),
                'permission_callback' => array($this, 'validate_request'),
            ),
            array(
                'methods' => 'DELETE',
                'callback' => array($this, 'delete_post'),
                'permission_callback' => array($this, 'validate_request'),
            ),
        ));
        
        // Pages
        register_rest_route($namespace, '/pages', array(
            array(
                'methods' => 'GET',
                'callback' => array($this, 'get_pages'),
                'permission_callback' => array($this, 'validate_request'),
            ),
            array(
                'methods' => 'POST',
                'callback' => array($this, 'create_page'),
                'permission_callback' => array($this, 'validate_request'),
            ),
        ));
        
        register_rest_route($namespace, '/pages/(?P<id>\\d+)', array(
            array(
                'methods' => 'GET',
                'callback' => array($this, 'get_page'),
                'permission_callback' => array($this, 'validate_request'),
            ),
            array(
                'methods' => 'PUT',
                'callback' => array($this, 'update_page'),
                'permission_callback' => array($this, 'validate_request'),
            ),
            array(
                'methods' => 'DELETE',
                'callback' => array($this, 'delete_page'),
                'permission_callback' => array($this, 'validate_request'),
            ),
        ));
        
        // Custom Post Types
        register_rest_route($namespace, '/cpt/(?P<post_type>[a-z0-9_-]+)', array(
            array(
                'methods' => 'GET',
                'callback' => array($this, 'get_cpt_items'),
                'permission_callback' => array($this, 'validate_request'),
            ),
            array(
                'methods' => 'POST',
                'callback' => array($this, 'create_cpt_item'),
                'permission_callback' => array($this, 'validate_request'),
            ),
        ));
        
        register_rest_route($namespace, '/cpt/(?P<post_type>[a-z0-9_-]+)/(?P<id>\\d+)', array(
            array(
                'methods' => 'GET',
                'callback' => array($this, 'get_cpt_item'),
                'permission_callback' => array($this, 'validate_request'),
            ),
            array(
                'methods' => 'PUT',
                'callback' => array($this, 'update_cpt_item'),
                'permission_callback' => array($this, 'validate_request'),
            ),
            array(
                'methods' => 'DELETE',
                'callback' => array($this, 'delete_cpt_item'),
                'permission_callback' => array($this, 'validate_request'),
            ),
        ));
        
        // Media
        register_rest_route($namespace, '/media', array(
            array(
                'methods' => 'GET',
                'callback' => array($this, 'get_media'),
                'permission_callback' => array($this, 'validate_request'),
            ),
            array(
                'methods' => 'POST',
                'callback' => array($this, 'upload_media'),
                'permission_callback' => array($this, 'validate_request'),
            ),
        ));
        
        register_rest_route($namespace, '/media/(?P<id>\\d+)', array(
            'methods' => 'DELETE',
            'callback' => array($this, 'delete_media'),
            'permission_callback' => array($this, 'validate_request'),
        ));
        
        // SEO
        register_rest_route($namespace, '/seo/(?P<id>\\d+)', array(
            array(
                'methods' => 'GET',
                'callback' => array($this, 'get_seo'),
                'permission_callback' => array($this, 'validate_request'),
            ),
            array(
                'methods' => 'PUT',
                'callback' => array($this, 'update_seo'),
                'permission_callback' => array($this, 'validate_request'),
            ),
        ));
        
        // ACF
        register_rest_route($namespace, '/acf/(?P<id>\\d+)', array(
            array(
                'methods' => 'GET',
                'callback' => array($this, 'get_acf_fields'),
                'permission_callback' => array($this, 'validate_request'),
            ),
            array(
                'methods' => 'PUT',
                'callback' => array($this, 'update_acf_fields'),
                'permission_callback' => array($this, 'validate_request'),
            ),
        ));
        
        // Taxonomies
        register_rest_route($namespace, '/taxonomies', array(
            'methods' => 'GET',
            'callback' => array($this, 'get_taxonomies'),
            'permission_callback' => array($this, 'validate_request'),
        ));
        
        register_rest_route($namespace, '/taxonomies/(?P<taxonomy>[a-z0-9_-]+)/terms', array(
            array(
                'methods' => 'GET',
                'callback' => array($this, 'get_terms'),
                'permission_callback' => array($this, 'validate_request'),
            ),
            array(
                'methods' => 'POST',
                'callback' => array($this, 'create_term'),
                'permission_callback' => array($this, 'validate_request'),
            ),
        ));
        
        // Menus
        register_rest_route($namespace, '/menus', array(
            'methods' => 'GET',
            'callback' => array($this, 'get_menus'),
            'permission_callback' => array($this, 'validate_request'),
        ));
        
        // Redirects
        register_rest_route($namespace, '/redirects', array(
            array(
                'methods' => 'GET',
                'callback' => array($this, 'get_redirects'),
                'permission_callback' => array($this, 'validate_request'),
            ),
            array(
                'methods' => 'POST',
                'callback' => array($this, 'create_redirect'),
                'permission_callback' => array($this, 'validate_request'),
            ),
        ));
    }
    
    /**
     * Validate incoming request
     */
    public function validate_request(WP_REST_Request $request) {
        return $this->validator->validate($request);
    }
    
    // ==========================================
    // VERIFY
    // ==========================================
    
    public function handle_verify(WP_REST_Request $request) {
        return new WP_REST_Response(array(
            'success' => true,
            'message' => 'Connection verified',
            'wpVersion' => get_bloginfo('version'),
            'phpVersion' => phpversion(),
            'pluginVersion' => GP_CONNECTOR_VERSION,
        ), 200);
    }
    
    // ==========================================
    // SITE INFO
    // ==========================================
    
    public function get_site_info(WP_REST_Request $request) {
        if (!gp_has_permission('SITE_INFO_READ')) {
            return new WP_REST_Response(array('error' => 'Permission denied'), 403);
        }
        
        $post_types = get_post_types(array('public' => true), 'objects');
        $taxonomies = get_taxonomies(array('public' => true), 'objects');
        
        $cpt_list = array();
        foreach ($post_types as $pt) {
            // Skip internal types
            if (in_array($pt->name, array('attachment', 'revision', 'nav_menu_item', 'wp_block', 'wp_template', 'wp_template_part', 'wp_navigation'))) {
                continue;
            }
            
            $cpt_list[] = array(
                'slug' => $pt->name,
                'name' => $pt->label,
                'singularName' => $pt->labels->singular_name,
                'restBase' => $pt->rest_base ?: $pt->name,
                'hasArchive' => $pt->has_archive,
                'hierarchical' => $pt->hierarchical,
                'supports' => get_all_post_type_supports($pt->name),
                'isBuiltin' => $pt->_builtin,
            );
        }
        
        $tax_list = array();
        foreach ($taxonomies as $tax) {
            $tax_list[] = array(
                'slug' => $tax->name,
                'name' => $tax->label,
                'hierarchical' => $tax->hierarchical,
                'objectType' => $tax->object_type,
                'restBase' => $tax->rest_base ?: $tax->name,
            );
        }
        
        // Get theme info
        $theme = wp_get_theme();
        
        return new WP_REST_Response(array(
            'siteUrl' => get_site_url(),
            'homeUrl' => get_home_url(),
            'siteName' => get_bloginfo('name'),
            'siteDescription' => get_bloginfo('description'),
            'wpVersion' => get_bloginfo('version'),
            'phpVersion' => phpversion(),
            'timezone' => wp_timezone_string(),
            'locale' => get_locale(),
            'postTypes' => $cpt_list,
            'taxonomies' => $tax_list,
            'theme' => array(
                'name' => $theme->get('Name'),
                'version' => $theme->get('Version'),
            ),
            'hasYoast' => defined('WPSEO_VERSION'),
            'yoastVersion' => defined('WPSEO_VERSION') ? WPSEO_VERSION : null,
            'hasRankMath' => defined('RANK_MATH_VERSION'),
            'rankMathVersion' => defined('RANK_MATH_VERSION') ? RANK_MATH_VERSION : null,
            'hasACF' => class_exists('ACF'),
            'acfVersion' => defined('ACF_VERSION') ? ACF_VERSION : null,
        ), 200);
    }
    
    // ==========================================
    // POSTS
    // ==========================================
    
    public function get_posts(WP_REST_Request $request) {
        if (!gp_has_permission('CONTENT_READ')) {
            return new WP_REST_Response(array('error' => 'Permission denied'), 403);
        }
        return $this->content_manager->get_items('post', $request->get_params());
    }
    
    public function get_post(WP_REST_Request $request) {
        if (!gp_has_permission('CONTENT_READ')) {
            return new WP_REST_Response(array('error' => 'Permission denied'), 403);
        }
        return $this->content_manager->get_item('post', $request['id']);
    }
    
    public function create_post(WP_REST_Request $request) {
        if (!gp_has_permission('CONTENT_CREATE')) {
            return new WP_REST_Response(array('error' => 'Permission denied'), 403);
        }
        return $this->content_manager->create_item('post', $request->get_json_params());
    }
    
    public function update_post(WP_REST_Request $request) {
        if (!gp_has_permission('CONTENT_UPDATE')) {
            return new WP_REST_Response(array('error' => 'Permission denied'), 403);
        }
        return $this->content_manager->update_item('post', $request['id'], $request->get_json_params());
    }
    
    public function delete_post(WP_REST_Request $request) {
        if (!gp_has_permission('CONTENT_DELETE')) {
            return new WP_REST_Response(array('error' => 'Permission denied'), 403);
        }
        return $this->content_manager->delete_item('post', $request['id']);
    }
    
    // ==========================================
    // PAGES
    // ==========================================
    
    public function get_pages(WP_REST_Request $request) {
        if (!gp_has_permission('CONTENT_READ')) {
            return new WP_REST_Response(array('error' => 'Permission denied'), 403);
        }
        return $this->content_manager->get_items('page', $request->get_params());
    }
    
    public function get_page(WP_REST_Request $request) {
        if (!gp_has_permission('CONTENT_READ')) {
            return new WP_REST_Response(array('error' => 'Permission denied'), 403);
        }
        return $this->content_manager->get_item('page', $request['id']);
    }
    
    public function create_page(WP_REST_Request $request) {
        if (!gp_has_permission('CONTENT_CREATE')) {
            return new WP_REST_Response(array('error' => 'Permission denied'), 403);
        }
        return $this->content_manager->create_item('page', $request->get_json_params());
    }
    
    public function update_page(WP_REST_Request $request) {
        if (!gp_has_permission('CONTENT_UPDATE')) {
            return new WP_REST_Response(array('error' => 'Permission denied'), 403);
        }
        return $this->content_manager->update_item('page', $request['id'], $request->get_json_params());
    }
    
    public function delete_page(WP_REST_Request $request) {
        if (!gp_has_permission('CONTENT_DELETE')) {
            return new WP_REST_Response(array('error' => 'Permission denied'), 403);
        }
        return $this->content_manager->delete_item('page', $request['id']);
    }
    
    // ==========================================
    // CUSTOM POST TYPES
    // ==========================================
    
    public function get_cpt_items(WP_REST_Request $request) {
        if (!gp_has_permission('CPT_READ')) {
            return new WP_REST_Response(array('error' => 'Permission denied'), 403);
        }
        return $this->cpt_manager->get_items($request['post_type'], $request->get_params());
    }
    
    public function get_cpt_item(WP_REST_Request $request) {
        if (!gp_has_permission('CPT_READ')) {
            return new WP_REST_Response(array('error' => 'Permission denied'), 403);
        }
        return $this->cpt_manager->get_item($request['post_type'], $request['id']);
    }
    
    public function create_cpt_item(WP_REST_Request $request) {
        if (!gp_has_permission('CPT_CREATE')) {
            return new WP_REST_Response(array('error' => 'Permission denied'), 403);
        }
        return $this->cpt_manager->create_item($request['post_type'], $request->get_json_params());
    }
    
    public function update_cpt_item(WP_REST_Request $request) {
        if (!gp_has_permission('CPT_UPDATE')) {
            return new WP_REST_Response(array('error' => 'Permission denied'), 403);
        }
        return $this->cpt_manager->update_item($request['post_type'], $request['id'], $request->get_json_params());
    }
    
    public function delete_cpt_item(WP_REST_Request $request) {
        if (!gp_has_permission('CPT_DELETE')) {
            return new WP_REST_Response(array('error' => 'Permission denied'), 403);
        }
        return $this->cpt_manager->delete_item($request['post_type'], $request['id']);
    }
    
    // ==========================================
    // MEDIA
    // ==========================================
    
    public function get_media(WP_REST_Request $request) {
        if (!gp_has_permission('CONTENT_READ')) {
            return new WP_REST_Response(array('error' => 'Permission denied'), 403);
        }
        return $this->media_manager->get_items($request->get_params());
    }
    
    public function upload_media(WP_REST_Request $request) {
        if (!gp_has_permission('MEDIA_UPLOAD')) {
            return new WP_REST_Response(array('error' => 'Permission denied'), 403);
        }
        return $this->media_manager->upload($request);
    }
    
    public function delete_media(WP_REST_Request $request) {
        if (!gp_has_permission('MEDIA_DELETE')) {
            return new WP_REST_Response(array('error' => 'Permission denied'), 403);
        }
        return $this->media_manager->delete($request['id']);
    }
    
    // ==========================================
    // SEO
    // ==========================================
    
    public function get_seo(WP_REST_Request $request) {
        if (!gp_has_permission('SEO_UPDATE')) {
            return new WP_REST_Response(array('error' => 'Permission denied'), 403);
        }
        return $this->seo_manager->get_meta($request['id']);
    }
    
    public function update_seo(WP_REST_Request $request) {
        if (!gp_has_permission('SEO_UPDATE')) {
            return new WP_REST_Response(array('error' => 'Permission denied'), 403);
        }
        return $this->seo_manager->update_meta($request['id'], $request->get_json_params());
    }
    
    // ==========================================
    // ACF
    // ==========================================
    
    public function get_acf_fields(WP_REST_Request $request) {
        if (!gp_has_permission('ACF_READ')) {
            return new WP_REST_Response(array('error' => 'Permission denied'), 403);
        }
        return $this->acf_manager->get_fields($request['id']);
    }
    
    public function update_acf_fields(WP_REST_Request $request) {
        if (!gp_has_permission('ACF_UPDATE')) {
            return new WP_REST_Response(array('error' => 'Permission denied'), 403);
        }
        return $this->acf_manager->update_fields($request['id'], $request->get_json_params());
    }
    
    // ==========================================
    // TAXONOMIES
    // ==========================================
    
    public function get_taxonomies(WP_REST_Request $request) {
        if (!gp_has_permission('TAXONOMY_READ')) {
            return new WP_REST_Response(array('error' => 'Permission denied'), 403);
        }
        
        $taxonomies = get_taxonomies(array('public' => true), 'objects');
        $result = array();
        
        foreach ($taxonomies as $tax) {
            $result[] = array(
                'name' => $tax->name,
                'label' => $tax->label,
                'hierarchical' => $tax->hierarchical,
                'object_type' => $tax->object_type,
            );
        }
        
        return new WP_REST_Response($result, 200);
    }
    
    public function get_terms(WP_REST_Request $request) {
        if (!gp_has_permission('TAXONOMY_READ')) {
            return new WP_REST_Response(array('error' => 'Permission denied'), 403);
        }
        
        $terms = get_terms(array(
            'taxonomy' => $request['taxonomy'],
            'hide_empty' => false,
        ));
        
        if (is_wp_error($terms)) {
            return new WP_REST_Response(array('error' => $terms->get_error_message()), 400);
        }
        
        return new WP_REST_Response($terms, 200);
    }
    
    public function create_term(WP_REST_Request $request) {
        if (!gp_has_permission('TAXONOMY_MANAGE')) {
            return new WP_REST_Response(array('error' => 'Permission denied'), 403);
        }
        
        $data = $request->get_json_params();
        $term = wp_insert_term(
            $data['name'],
            $request['taxonomy'],
            array(
                'description' => $data['description'] ?? '',
                'slug' => $data['slug'] ?? '',
                'parent' => $data['parent'] ?? 0,
            )
        );
        
        if (is_wp_error($term)) {
            return new WP_REST_Response(array('error' => $term->get_error_message()), 400);
        }
        
        return new WP_REST_Response(get_term($term['term_id']), 201);
    }
    
    // ==========================================
    // MENUS
    // ==========================================
    
    public function get_menus(WP_REST_Request $request) {
        if (!gp_has_permission('SITE_INFO_READ')) {
            return new WP_REST_Response(array('error' => 'Permission denied'), 403);
        }
        
        $menus = array();
        $locations = get_nav_menu_locations();
        $registered_menus = get_registered_nav_menus();
        
        // Get all menus
        $nav_menus = wp_get_nav_menus();
        
        foreach ($nav_menus as $menu) {
            $menu_items = wp_get_nav_menu_items($menu->term_id);
            $items = array();
            
            if ($menu_items) {
                foreach ($menu_items as $item) {
                    $items[] = array(
                        'id' => $item->ID,
                        'title' => $item->title,
                        'url' => $item->url,
                        'target' => $item->target,
                        'parent' => intval($item->menu_item_parent),
                        'order' => $item->menu_order,
                        'type' => $item->type,
                        'objectType' => $item->object,
                        'objectId' => $item->object_id,
                        'classes' => $item->classes,
                    );
                }
            }
            
            // Find which location(s) this menu is assigned to
            $menu_locations = array();
            foreach ($locations as $location => $menu_id) {
                if ($menu_id === $menu->term_id) {
                    $menu_locations[] = array(
                        'slug' => $location,
                        'name' => $registered_menus[$location] ?? $location,
                    );
                }
            }
            
            $menus[] = array(
                'id' => $menu->term_id,
                'name' => $menu->name,
                'slug' => $menu->slug,
                'locations' => $menu_locations,
                'itemCount' => count($items),
                'items' => $this->build_menu_tree($items),
            );
        }
        
        return new WP_REST_Response(array(
            'menus' => $menus,
            'registeredLocations' => $registered_menus,
        ), 200);
    }
    
    /**
     * Build hierarchical menu tree from flat items
     */
    private function build_menu_tree($items, $parent_id = 0) {
        $tree = array();
        
        foreach ($items as $item) {
            if ($item['parent'] == $parent_id) {
                $children = $this->build_menu_tree($items, $item['id']);
                if ($children) {
                    $item['children'] = $children;
                }
                $tree[] = $item;
            }
        }
        
        // Sort by order
        usort($tree, function($a, $b) {
            return $a['order'] - $b['order'];
        });
        
        return $tree;
    }
    
    // ==========================================
    // REDIRECTS
    // ==========================================
    
    public function get_redirects(WP_REST_Request $request) {
        if (!gp_has_permission('REDIRECTS_MANAGE')) {
            return new WP_REST_Response(array('error' => 'Permission denied'), 403);
        }
        
        // Check for common redirect plugins
        if (defined('WPSEO_VERSION')) {
            // Yoast SEO Premium redirects
            return $this->get_yoast_redirects();
        }
        
        if (defined('RANK_MATH_VERSION')) {
            // RankMath redirects
            return $this->get_rankmath_redirects();
        }
        
        // Custom redirects stored in options
        $redirects = get_option('gp_connector_redirects', array());
        return new WP_REST_Response($redirects, 200);
    }
    
    public function create_redirect(WP_REST_Request $request) {
        if (!gp_has_permission('REDIRECTS_MANAGE')) {
            return new WP_REST_Response(array('error' => 'Permission denied'), 403);
        }
        
        $data = $request->get_json_params();
        
        // Store in custom option for now
        $redirects = get_option('gp_connector_redirects', array());
        $redirects[] = array(
            'source' => $data['source'],
            'target' => $data['target'],
            'type' => $data['type'] ?? 301,
            'created_at' => current_time('mysql'),
        );
        
        update_option('gp_connector_redirects', $redirects);
        
        return new WP_REST_Response(array('success' => true), 201);
    }
    
    private function get_yoast_redirects() {
        // Yoast SEO Premium redirect implementation
        return new WP_REST_Response(array(), 200);
    }
    
    private function get_rankmath_redirects() {
        // RankMath redirect implementation
        global $wpdb;
        $table = $wpdb->prefix . 'rank_math_redirections';
        
        if ($wpdb->get_var("SHOW TABLES LIKE '$table'") !== $table) {
            return new WP_REST_Response(array(), 200);
        }
        
        $redirects = $wpdb->get_results("SELECT * FROM $table ORDER BY id DESC LIMIT 100");
        return new WP_REST_Response($redirects, 200);
    }
}
`;
}

/**
 * Generate API Handler class
 */
export function getClassApiHandler() {
  return `<?php
/**
 * GhostSEO API Handler
 * 
 * Handles incoming REST API requests from GhostSEO platform
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
     * @var GP_Redirections_Manager
     */
    private $redirections_manager;
    
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
        $this->redirections_manager = new GP_Redirections_Manager();
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
            array(
                'methods' => 'GET',
                'callback' => array($this, 'get_media_item'),
                'permission_callback' => array($this, 'validate_request'),
            ),
            array(
                'methods' => 'PUT',
                'callback' => array($this, 'update_media'),
                'permission_callback' => array($this, 'validate_request'),
            ),
            array(
                'methods' => 'DELETE',
                'callback' => array($this, 'delete_media'),
                'permission_callback' => array($this, 'validate_request'),
            ),
        ));
        
        // Media Stats
        register_rest_route($namespace, '/media/stats', array(
            'methods' => 'GET',
            'callback' => array($this, 'get_media_stats'),
            'permission_callback' => array($this, 'validate_request'),
        ));
        
        // Convert to WebP
        register_rest_route($namespace, '/media/convert-to-webp', array(
            'methods' => 'POST',
            'callback' => array($this, 'convert_to_webp'),
            'permission_callback' => array($this, 'validate_request'),
        ));
        
        // Media Settings (auto-convert to WebP)
        register_rest_route($namespace, '/media/settings', array(
            array(
                'methods' => 'GET',
                'callback' => array($this, 'get_media_settings'),
                'permission_callback' => array($this, 'validate_request'),
            ),
            array(
                'methods' => 'PUT',
                'callback' => array($this, 'update_media_settings'),
                'permission_callback' => array($this, 'validate_request'),
            ),
        ));
        
        // Non-WebP Images List
        register_rest_route($namespace, '/media/non-webp-images', array(
            'methods' => 'GET',
            'callback' => array($this, 'get_non_webp_images'),
            'permission_callback' => array($this, 'validate_request'),
        ));
        
        // Conversion History
        register_rest_route($namespace, '/media/conversion-history', array(
            'methods' => 'GET',
            'callback' => array($this, 'get_conversion_history'),
            'permission_callback' => array($this, 'validate_request'),
        ));
        
        // Revert WebP
        register_rest_route($namespace, '/media/revert-webp', array(
            'methods' => 'POST',
            'callback' => array($this, 'revert_webp'),
            'permission_callback' => array($this, 'validate_request'),
        ));
        
        // Queue for WebP Conversion
        register_rest_route($namespace, '/media/queue-webp', array(
            'methods' => 'POST',
            'callback' => array($this, 'queue_for_webp'),
            'permission_callback' => array($this, 'validate_request'),
        ));
        
        // Queue Status
        register_rest_route($namespace, '/media/queue-status', array(
            'methods' => 'GET',
            'callback' => array($this, 'get_queue_status'),
            'permission_callback' => array($this, 'validate_request'),
        ));
        
        // Clear Queue
        register_rest_route($namespace, '/media/clear-queue', array(
            'methods' => 'POST',
            'callback' => array($this, 'clear_queue'),
            'permission_callback' => array($this, 'validate_request'),
        ));
        
        // Process next queue item (platform-driven, replaces WP-Cron dependency)
        register_rest_route($namespace, '/media/process-queue-item', array(
            'methods' => 'POST',
            'callback' => array($this, 'process_queue_item'),
            'permission_callback' => array($this, 'validate_request'),
        ));
        
        // AI Optimize Single Image
        register_rest_route($namespace, '/media/ai-optimize', array(
            'methods' => 'POST',
            'callback' => array($this, 'ai_optimize_image'),
            'permission_callback' => array($this, 'validate_request'),
        ));
        
        // Apply AI optimization results (platform-driven, no plugin-to-platform callback)
        register_rest_route($namespace, '/media/apply-ai-optimization', array(
            'methods' => 'POST',
            'callback' => array($this, 'apply_ai_optimization'),
            'permission_callback' => array($this, 'validate_request'),
        ));
        
        // AI Optimize Batch
        register_rest_route($namespace, '/media/ai-optimize-batch', array(
            'methods' => 'POST',
            'callback' => array($this, 'ai_optimize_batch'),
            'permission_callback' => array($this, 'validate_request'),
        ));
        
        // AI Settings
        register_rest_route($namespace, '/media/ai-settings', array(
            array(
                'methods' => 'GET',
                'callback' => array($this, 'get_ai_settings'),
                'permission_callback' => array($this, 'validate_request'),
            ),
            array(
                'methods' => 'PUT',
                'callback' => array($this, 'update_ai_settings'),
                'permission_callback' => array($this, 'validate_request'),
            ),
        ));
        
        // Image Redirects
        register_rest_route($namespace, '/media/redirects', array(
            array(
                'methods' => 'GET',
                'callback' => array($this, 'get_image_redirects'),
                'permission_callback' => array($this, 'validate_request'),
            ),
            array(
                'methods' => 'DELETE',
                'callback' => array($this, 'clear_image_redirects'),
                'permission_callback' => array($this, 'validate_request'),
            ),
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
        
        register_rest_route($namespace, '/redirects/(?P<id>[a-zA-Z0-9_-]+)', array(
            array(
                'methods' => 'PUT',
                'callback' => array($this, 'update_redirect'),
                'permission_callback' => array($this, 'validate_request'),
            ),
            array(
                'methods' => 'DELETE',
                'callback' => array($this, 'delete_redirect'),
                'permission_callback' => array($this, 'validate_request'),
            ),
        ));
        
        register_rest_route($namespace, '/redirects/bulk-sync', array(
            'methods' => 'POST',
            'callback' => array($this, 'bulk_sync_redirects'),
            'permission_callback' => array($this, 'validate_request'),
        ));
        
        register_rest_route($namespace, '/redirects/import', array(
            'methods' => 'POST',
            'callback' => array($this, 'import_redirects'),
            'permission_callback' => array($this, 'validate_request'),
        ));
        
        register_rest_route($namespace, '/redirects/detected-plugins', array(
            'methods' => 'GET',
            'callback' => array($this, 'get_detected_redirect_plugins'),
            'permission_callback' => array($this, 'validate_request'),
        ));
        
        // Resolve URL to post ID
        register_rest_route($namespace, '/resolve-url', array(
            'methods' => 'POST',
            'callback' => array($this, 'resolve_url'),
            'permission_callback' => array($this, 'validate_request'),
        ));
        
        // Resolve media/image URLs to attachment IDs
        register_rest_route($namespace, '/resolve-media-urls', array(
            'methods' => 'POST',
            'callback' => array($this, 'resolve_media_urls'),
            'permission_callback' => array($this, 'validate_request'),
        ));
        
        // Set site favicon
        register_rest_route($namespace, '/set-favicon', array(
            'methods' => 'POST',
            'callback' => array($this, 'set_favicon'),
            'permission_callback' => array($this, 'validate_request'),
        ));

        // Clear caches (WordPress core + Elementor + third-party plugins)
        register_rest_route($namespace, '/cache/clear', array(
            'methods' => 'POST',
            'callback' => array($this, 'clear_cache'),
            'permission_callback' => array($this, 'validate_request'),
        ));

        // Unified element manipulator (insert / update / delete across Elementor, BB, raw HTML)
        register_rest_route($namespace, '/elements/manipulate/(?P<id>\\d+)', array(
            'methods' => 'POST',
            'callback' => array($this, 'manipulate_element'),
            'permission_callback' => array($this, 'validate_request'),
        ));

        // Fetch a structural preview of a post - the unified manipulator spec the AI needs
        // to locate targets without leaking raw WP meta around the chat context.
        register_rest_route($namespace, '/elements/structure/(?P<id>\\d+)', array(
            'methods' => 'GET',
            'callback' => array($this, 'get_element_structure'),
            'permission_callback' => array($this, 'validate_request'),
        ));
        
        // Security headers
        register_rest_route($namespace, '/security-headers', array(
            array(
                'methods' => 'GET',
                'callback' => array($this, 'get_security_headers'),
                'permission_callback' => array($this, 'validate_request'),
            ),
            array(
                'methods' => 'PUT',
                'callback' => array($this, 'update_security_headers'),
                'permission_callback' => array($this, 'validate_request'),
            ),
        ));
        
        // Search engine visibility (blog_public option)
        register_rest_route($namespace, '/search-engine-visibility', array(
            array(
                'methods' => 'GET',
                'callback' => array($this, 'get_search_engine_visibility'),
                'permission_callback' => array($this, 'validate_request'),
            ),
            array(
                'methods' => 'PUT',
                'callback' => array($this, 'set_search_engine_visibility'),
                'permission_callback' => array($this, 'validate_request'),
            ),
        ));
        
        // Search & replace internal links across all content
        register_rest_route($namespace, '/search-replace-links', array(
            'methods' => 'POST',
            'callback' => array($this, 'search_replace_links'),
            'permission_callback' => array($this, 'validate_request'),
        ));
        
        // Media stats (for WebP conversion tool)
        register_rest_route($namespace, '/media/stats', array(
            'methods' => 'GET',
            'callback' => array($this, 'get_media_stats'),
            'permission_callback' => array($this, 'validate_request'),
        ));
        
        // Convert images to WebP
        register_rest_route($namespace, '/media/convert-to-webp', array(
            'methods' => 'POST',
            'callback' => array($this, 'convert_to_webp'),
            'permission_callback' => array($this, 'validate_request'),
        ));
        
        // Widget data push (platform → plugin)
        register_rest_route($namespace, '/widget-data', array(
            'methods' => 'POST',
            'callback' => array($this, 'update_widget_data'),
            'permission_callback' => array($this, 'validate_request'),
        ));

        // Code snippet management - create a PHP/JS/CSS snippet and keep track
        // of it for rollback. Uses the Code Snippets plugin if active,
        // otherwise falls back to a mu-plugin drop-in file we write ourselves.
        register_rest_route($namespace, '/code-snippets', array(
            'methods' => 'POST',
            'callback' => array($this, 'create_code_snippet'),
            'permission_callback' => array($this, 'validate_request'),
        ));
        register_rest_route($namespace, '/code-snippets/(?P<id>[a-zA-Z0-9_-]+)', array(
            'methods' => 'DELETE',
            'callback' => array($this, 'delete_code_snippet'),
            'permission_callback' => array($this, 'validate_request'),
        ));

        // Menu management - create / update / delete nav menus and items.
        register_rest_route($namespace, '/menus/(?P<id>\\d+)/items', array(
            array(
                'methods' => 'POST',
                'callback' => array($this, 'add_menu_item'),
                'permission_callback' => array($this, 'validate_request'),
            ),
        ));
        register_rest_route($namespace, '/menus/items/(?P<item_id>\\d+)', array(
            array(
                'methods' => 'PUT',
                'callback' => array($this, 'update_menu_item'),
                'permission_callback' => array($this, 'validate_request'),
            ),
            array(
                'methods' => 'DELETE',
                'callback' => array($this, 'delete_menu_item'),
                'permission_callback' => array($this, 'validate_request'),
            ),
        ));

        // Terms (categories / tags / any taxonomy) - list / create / update / delete.
        // Names are gp_-prefixed to avoid collision with the pre-existing
        // create_term() on /taxonomies/{taxonomy}/terms which returns a
        // different JSON shape (full term object) than what our executor
        // expects (success + termId).
        register_rest_route($namespace, '/terms/(?P<taxonomy>[a-zA-Z0-9_-]+)', array(
            array('methods' => 'GET',  'callback' => array($this, 'gp_list_terms'),   'permission_callback' => array($this, 'validate_request')),
            array('methods' => 'POST', 'callback' => array($this, 'gp_create_term'),  'permission_callback' => array($this, 'validate_request')),
        ));
        register_rest_route($namespace, '/terms/(?P<taxonomy>[a-zA-Z0-9_-]+)/(?P<term_id>\\d+)', array(
            array('methods' => 'PUT',    'callback' => array($this, 'gp_update_term'), 'permission_callback' => array($this, 'validate_request')),
            array('methods' => 'DELETE', 'callback' => array($this, 'gp_delete_term'), 'permission_callback' => array($this, 'validate_request')),
        ));

        // Comments - list / update status / reply / edit / delete.
        register_rest_route($namespace, '/comments', array(
            array('methods' => 'GET',  'callback' => array($this, 'list_comments'),  'permission_callback' => array($this, 'validate_request')),
            array('methods' => 'POST', 'callback' => array($this, 'reply_comment'),  'permission_callback' => array($this, 'validate_request')),
        ));
        register_rest_route($namespace, '/comments/(?P<id>\\d+)', array(
            array('methods' => 'PUT',    'callback' => array($this, 'update_comment'), 'permission_callback' => array($this, 'validate_request')),
            array('methods' => 'DELETE', 'callback' => array($this, 'delete_comment'), 'permission_callback' => array($this, 'validate_request')),
        ));

        // WP Options - whitelisted read/write for common site settings.
        register_rest_route($namespace, '/options', array(
            array('methods' => 'GET', 'callback' => array($this, 'get_options'),    'permission_callback' => array($this, 'validate_request')),
            array('methods' => 'PUT', 'callback' => array($this, 'update_options'), 'permission_callback' => array($this, 'validate_request')),
        ));

        // Self-update - force the GhostSEO plugin to update to the latest version.
        register_rest_route($namespace, '/self-update', array(
            'methods' => 'POST',
            'callback' => array($this, 'self_update'),
            'permission_callback' => array($this, 'validate_request'),
        ));

        // Generic REST passthrough - lets the AI call ANY WordPress / plugin REST
        // route (WooCommerce, Yoast, RankMath, Elementor, Contact Form 7, etc.)
        // as an administrator. This is the escape hatch that gives the bot full
        // access to plugins we don't have dedicated tools for.
        register_rest_route($namespace, '/wp-passthrough', array(
            'methods' => 'POST',
            'callback' => array($this, 'wp_passthrough'),
            'permission_callback' => array($this, 'validate_request'),
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
        
        // Active plugins (names and versions)
        $active_plugins = get_option('active_plugins', array());
        $plugin_names = array();
        foreach ($active_plugins as $plugin_file) {
            $plugin_data = get_plugin_data(WP_PLUGIN_DIR . '/' . $plugin_file, false, false);
            if (!empty($plugin_data['Name'])) {
                $plugin_names[] = array(
                    'name' => $plugin_data['Name'],
                    'version' => $plugin_data['Version'] ?? '',
                );
            }
        }
        
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
                'parent' => $theme->parent() ? $theme->parent()->get('Name') : null,
            ),
            'activePlugins' => $plugin_names,
            'hasYoast' => defined('WPSEO_VERSION'),
            'yoastVersion' => defined('WPSEO_VERSION') ? WPSEO_VERSION : null,
            'hasRankMath' => defined('RANK_MATH_VERSION'),
            'rankMathVersion' => defined('RANK_MATH_VERSION') ? RANK_MATH_VERSION : null,
            'hasACF' => class_exists('ACF'),
            'acfVersion' => defined('ACF_VERSION') ? ACF_VERSION : null,
            'hasElementor' => defined('ELEMENTOR_VERSION'),
            'hasWooCommerce' => class_exists('WooCommerce'),
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
        $result = $this->content_manager->create_item('post', $request->get_json_params());
        Ghost_Post::log_activity('content_created', 'Post created via API');
        return $result;
    }
    
    public function update_post(WP_REST_Request $request) {
        if (!gp_has_permission('CONTENT_UPDATE')) {
            return new WP_REST_Response(array('error' => 'Permission denied'), 403);
        }
        $result = $this->content_manager->update_item('post', $request['id'], $request->get_json_params());
        Ghost_Post::log_activity('content_updated', 'Post #' . $request['id'] . ' updated via API');
        return $result;
    }
    
    public function delete_post(WP_REST_Request $request) {
        if (!gp_has_permission('CONTENT_DELETE')) {
            return new WP_REST_Response(array('error' => 'Permission denied'), 403);
        }
        $result = $this->content_manager->delete_item('post', $request['id']);
        Ghost_Post::log_activity('content_deleted', 'Post #' . $request['id'] . ' deleted via API');
        return $result;
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
        $result = $this->content_manager->create_item('page', $request->get_json_params());
        Ghost_Post::log_activity('content_created', 'Page created via API');
        return $result;
    }
    
    public function update_page(WP_REST_Request $request) {
        if (!gp_has_permission('CONTENT_UPDATE')) {
            return new WP_REST_Response(array('error' => 'Permission denied'), 403);
        }
        $result = $this->content_manager->update_item('page', $request['id'], $request->get_json_params());
        Ghost_Post::log_activity('content_updated', 'Page #' . $request['id'] . ' updated via API');
        return $result;
    }
    
    public function delete_page(WP_REST_Request $request) {
        if (!gp_has_permission('CONTENT_DELETE')) {
            return new WP_REST_Response(array('error' => 'Permission denied'), 403);
        }
        $result = $this->content_manager->delete_item('page', $request['id']);
        Ghost_Post::log_activity('content_deleted', 'Page #' . $request['id'] . ' deleted via API');
        return $result;
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
        $result = $this->media_manager->upload($request);
        Ghost_Post::log_activity('media_uploaded', 'Media uploaded via API');
        return $result;
    }
    
    public function delete_media(WP_REST_Request $request) {
        if (!gp_has_permission('MEDIA_DELETE')) {
            return new WP_REST_Response(array('error' => 'Permission denied'), 403);
        }
        $result = $this->media_manager->delete($request['id']);
        Ghost_Post::log_activity('media_deleted', 'Media #' . $request['id'] . ' deleted via API');
        return $result;
    }
    
    public function get_media_item(WP_REST_Request $request) {
        if (!gp_has_permission('CONTENT_READ')) {
            return new WP_REST_Response(array('error' => 'Permission denied'), 403);
        }
        return $this->media_manager->get_item($request['id']);
    }
    
    public function update_media(WP_REST_Request $request) {
        if (!gp_has_permission('MEDIA_UPLOAD')) {
            return new WP_REST_Response(array('error' => 'Permission denied'), 403);
        }
        return $this->media_manager->update($request['id'], $request->get_json_params());
    }
    
    public function get_media_stats(WP_REST_Request $request) {
        if (!gp_has_permission('CONTENT_READ')) {
            return new WP_REST_Response(array('error' => 'Permission denied'), 403);
        }
        return $this->media_manager->get_stats();
    }
    
    public function convert_to_webp(WP_REST_Request $request) {
        if (!gp_has_permission('MEDIA_UPLOAD')) {
            return new WP_REST_Response(array('error' => 'Permission denied'), 403);
        }
        return $this->media_manager->convert_to_webp($request->get_json_params());
    }
    
    public function get_media_settings(WP_REST_Request $request) {
        if (!gp_has_permission('CONTENT_READ')) {
            return new WP_REST_Response(array('error' => 'Permission denied'), 403);
        }
        return $this->media_manager->get_settings();
    }
    
    public function update_media_settings(WP_REST_Request $request) {
        if (!gp_has_permission('MEDIA_UPLOAD')) {
            return new WP_REST_Response(array('error' => 'Permission denied'), 403);
        }
        return $this->media_manager->update_settings($request->get_json_params());
    }
    
    public function get_non_webp_images(WP_REST_Request $request) {
        if (!gp_has_permission('CONTENT_READ')) {
            return new WP_REST_Response(array('error' => 'Permission denied'), 403);
        }
        return $this->media_manager->get_non_webp_images();
    }
    
    public function get_conversion_history(WP_REST_Request $request) {
        if (!gp_has_permission('CONTENT_READ')) {
            return new WP_REST_Response(array('error' => 'Permission denied'), 403);
        }
        return $this->media_manager->get_conversion_history();
    }
    
    public function revert_webp(WP_REST_Request $request) {
        if (!gp_has_permission('MEDIA_UPLOAD')) {
            return new WP_REST_Response(array('error' => 'Permission denied'), 403);
        }
        return $this->media_manager->revert_webp($request->get_json_params());
    }
    
    public function queue_for_webp(WP_REST_Request $request) {
        if (!gp_has_permission('MEDIA_UPLOAD')) {
            return new WP_REST_Response(array('error' => 'Permission denied'), 403);
        }
        return $this->media_manager->queue_for_webp($request->get_json_params());
    }
    
    public function get_queue_status(WP_REST_Request $request) {
        if (!gp_has_permission('CONTENT_READ')) {
            return new WP_REST_Response(array('error' => 'Permission denied'), 403);
        }
        return $this->media_manager->get_queue_status();
    }
    
    public function clear_queue(WP_REST_Request $request) {
        if (!gp_has_permission('MEDIA_UPLOAD')) {
            return new WP_REST_Response(array('error' => 'Permission denied'), 403);
        }
        return $this->media_manager->clear_queue();
    }
    
    public function process_queue_item(WP_REST_Request $request) {
        if (!gp_has_permission('MEDIA_UPLOAD')) {
            return new WP_REST_Response(array('error' => 'Permission denied'), 403);
        }
        return $this->media_manager->process_queue_item();
    }
    
    public function ai_optimize_image(WP_REST_Request $request) {
        if (!gp_has_permission('MEDIA_UPLOAD')) {
            return new WP_REST_Response(array('error' => 'Permission denied'), 403);
        }
        return $this->media_manager->ai_optimize_image($request->get_json_params());
    }
    
    public function apply_ai_optimization(WP_REST_Request $request) {
        if (!gp_has_permission('MEDIA_UPLOAD')) {
            return new WP_REST_Response(array('error' => 'Permission denied'), 403);
        }
        return $this->media_manager->apply_ai_optimization($request->get_json_params());
    }
    
    public function ai_optimize_batch(WP_REST_Request $request) {
        if (!gp_has_permission('MEDIA_UPLOAD')) {
            return new WP_REST_Response(array('error' => 'Permission denied'), 403);
        }
        return $this->media_manager->ai_optimize_batch($request->get_json_params());
    }
    
    public function get_ai_settings(WP_REST_Request $request) {
        if (!gp_has_permission('MEDIA_UPLOAD')) {
            return new WP_REST_Response(array('error' => 'Permission denied'), 403);
        }
        return $this->media_manager->get_ai_settings();
    }
    
    public function update_ai_settings(WP_REST_Request $request) {
        if (!gp_has_permission('MEDIA_UPLOAD')) {
            return new WP_REST_Response(array('error' => 'Permission denied'), 403);
        }
        return $this->media_manager->update_ai_settings($request->get_json_params());
    }
    
    public function get_image_redirects(WP_REST_Request $request) {
        if (!gp_has_permission('MEDIA_UPLOAD')) {
            return new WP_REST_Response(array('error' => 'Permission denied'), 403);
        }
        return $this->media_manager->get_image_redirects();
    }
    
    public function clear_image_redirects(WP_REST_Request $request) {
        if (!gp_has_permission('MEDIA_UPLOAD')) {
            return new WP_REST_Response(array('error' => 'Permission denied'), 403);
        }
        return $this->media_manager->clear_image_redirects();
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
        $result = $this->seo_manager->update_meta($request['id'], $request->get_json_params());
        Ghost_Post::log_activity('seo_updated', 'SEO meta updated for post #' . $request['id']);
        return $result;
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
        
        $redirects = $this->redirections_manager->get_all_redirects();
        return new WP_REST_Response($redirects, 200);
    }
    
    public function create_redirect(WP_REST_Request $request) {
        if (!gp_has_permission('REDIRECTS_MANAGE')) {
            return new WP_REST_Response(array('error' => 'Permission denied'), 403);
        }
        
        GP_Redirections_Manager::mark_gp_origin();
        $data = $request->get_json_params();
        $result = $this->redirections_manager->create_redirect($data);
        GP_Redirections_Manager::clear_gp_origin();
        
        if (is_wp_error($result)) {
            return new WP_REST_Response(array('error' => $result->get_error_message()), 400);
        }
        
        return new WP_REST_Response($result, 201);
    }
    
    public function update_redirect(WP_REST_Request $request) {
        if (!gp_has_permission('REDIRECTS_MANAGE')) {
            return new WP_REST_Response(array('error' => 'Permission denied'), 403);
        }
        
        GP_Redirections_Manager::mark_gp_origin();
        $data = $request->get_json_params();
        $result = $this->redirections_manager->update_redirect($request['id'], $data);
        GP_Redirections_Manager::clear_gp_origin();
        
        if (is_wp_error($result)) {
            return new WP_REST_Response(array('error' => $result->get_error_message()), 400);
        }
        
        return new WP_REST_Response($result, 200);
    }
    
    public function delete_redirect(WP_REST_Request $request) {
        if (!gp_has_permission('REDIRECTS_MANAGE')) {
            return new WP_REST_Response(array('error' => 'Permission denied'), 403);
        }
        
        GP_Redirections_Manager::mark_gp_origin();
        $result = $this->redirections_manager->delete_redirect($request['id']);
        GP_Redirections_Manager::clear_gp_origin();
        
        if (is_wp_error($result)) {
            return new WP_REST_Response(array('error' => $result->get_error_message()), 400);
        }
        
        return new WP_REST_Response(array('deleted' => true), 200);
    }
    
    public function bulk_sync_redirects(WP_REST_Request $request) {
        if (!gp_has_permission('REDIRECTS_MANAGE')) {
            return new WP_REST_Response(array('error' => 'Permission denied'), 403);
        }
        
        GP_Redirections_Manager::mark_gp_origin();
        $data = $request->get_json_params();
        $redirects = isset($data['redirects']) ? $data['redirects'] : array();
        $result = $this->redirections_manager->bulk_sync($redirects);
        GP_Redirections_Manager::clear_gp_origin();
        
        return new WP_REST_Response($result, 200);
    }
    
    public function import_redirects(WP_REST_Request $request) {
        if (!gp_has_permission('REDIRECTS_MANAGE')) {
            return new WP_REST_Response(array('error' => 'Permission denied'), 403);
        }
        
        $result = $this->redirections_manager->import_from_detected_plugin();
        return new WP_REST_Response($result, 200);
    }
    
    public function get_detected_redirect_plugins(WP_REST_Request $request) {
        if (!gp_has_permission('REDIRECTS_MANAGE')) {
            return new WP_REST_Response(array('error' => 'Permission denied'), 403);
        }
        
        $plugins = $this->redirections_manager->detect_plugins();
        return new WP_REST_Response($plugins, 200);
    }
    
    // ==========================================
    // RESOLVE URL
    // ==========================================
    
    public function resolve_url(WP_REST_Request $request) {
        $url = $request->get_param('url');
        if (empty($url)) {
            return new WP_REST_Response(array(
                'error' => 'url parameter is required',
            ), 400);
        }

        // url_to_postid handles permalink rewrites, custom structures, etc.
        $post_id = url_to_postid($url);

        // Fallback: try with/without trailing slash
        if (!$post_id) {
            $alt_url = str_ends_with($url, '/') ? rtrim($url, '/') : $url . '/';
            $post_id = url_to_postid($alt_url);
        }

        // Fallback: try to find by the last path segment as slug
        if (!$post_id) {
            $path = wp_parse_url($url, PHP_URL_PATH);
            $segments = array_filter(explode('/', trim($path, '/')));
            $slug = end($segments);
            if ($slug) {
                $decoded_slug = urldecode($slug);
                $post_types = get_post_types(array('public' => true));
                $query = new WP_Query(array(
                    'name' => $decoded_slug,
                    'post_type' => array_values($post_types),
                    'posts_per_page' => 1,
                    'post_status' => 'publish',
                    'fields' => 'ids',
                ));
                if ($query->have_posts()) {
                    $post_id = $query->posts[0];
                }
                wp_reset_postdata();
            }
        }

        if (!$post_id) {
            return new WP_REST_Response(array(
                'found' => false,
                'postId' => null,
            ), 200);
        }

        $post = get_post($post_id);
        return new WP_REST_Response(array(
            'found' => true,
            'postId' => $post_id,
            'postType' => $post ? $post->post_type : null,
            'slug' => $post ? $post->post_name : null,
            'permalink' => get_permalink($post_id),
        ), 200);
    }
    
    // ==========================================
    // RESOLVE MEDIA URLS
    // ==========================================
    
    /**
     * Resolve image src URLs to WordPress attachment IDs.
     * Uses attachment_url_to_postid() and falls back to guid query.
     *
     * Body: { urls: string[] }
     * Returns: { results: { [url]: { found: bool, attachmentId: int|null } } }
     */
    public function resolve_media_urls(WP_REST_Request $request) {
        $urls = $request->get_param('urls');
        if (empty($urls) || !is_array($urls)) {
            return new WP_REST_Response(array(
                'error' => 'urls array is required',
            ), 400);
        }

        $results = array();
        foreach (array_slice($urls, 0, 50) as $url) {
            $url = esc_url_raw($url);
            $attachment_id = attachment_url_to_postid($url);

            // Fallback: try without size suffix (-300x200 etc)
            if (!$attachment_id) {
                $clean_url = preg_replace('/-\\d+x\\d+(?=\\.[a-z]+$)/i', '', $url);
                if ($clean_url !== $url) {
                    $attachment_id = attachment_url_to_postid($clean_url);
                }
            }

            // Fallback: query by guid (full URL stored in posts table)
            if (!$attachment_id) {
                global $wpdb;
                $attachment_id = (int) $wpdb->get_var($wpdb->prepare(
                    "SELECT ID FROM {$wpdb->posts} WHERE post_type = 'attachment' AND guid = %s LIMIT 1",
                    $url
                ));
            }

            $results[$url] = array(
                'found' => $attachment_id > 0,
                'attachmentId' => $attachment_id > 0 ? $attachment_id : null,
            );
        }

        return new WP_REST_Response(array('results' => $results), 200);
    }
    
    // ==========================================
    // SET FAVICON
    // ==========================================
    
    public function set_favicon(WP_REST_Request $request) {
        $attachment_id = absint($request->get_param('attachmentId'));
        if (!$attachment_id) {
            return new WP_REST_Response(array(
                'error' => 'attachmentId parameter is required',
            ), 400);
        }

        $attachment = get_post($attachment_id);
        if (!$attachment || $attachment->post_type !== 'attachment') {
            return new WP_REST_Response(array(
                'error' => 'Attachment not found',
            ), 404);
        }

        if (!wp_attachment_is_image($attachment_id)) {
            return new WP_REST_Response(array(
                'error' => 'Attachment must be an image',
            ), 422);
        }

        update_option('site_icon', $attachment_id);
        $icon_url = get_site_icon_url(512, '', get_current_blog_id());

        return new WP_REST_Response(array(
            'success' => true,
            'attachmentId' => $attachment_id,
            'faviconUrl' => $icon_url,
        ), 200);
    }
    
    // ==========================================
    // SEARCH ENGINE VISIBILITY
    // ==========================================
    
    public function get_search_engine_visibility(WP_REST_Request $request) {
        $blog_public = get_option('blog_public', '1');
        
        return new WP_REST_Response(array(
            'discouraged' => $blog_public === '0',
            'blogPublic'  => $blog_public,
        ), 200);
    }
    
    public function set_search_engine_visibility(WP_REST_Request $request) {
        $params = $request->get_json_params();
        
        if (!isset($params['discouraged'])) {
            return new WP_REST_Response(array(
                'error' => '"discouraged" parameter is required (boolean)',
            ), 400);
        }
        
        $new_value = $params['discouraged'] ? '0' : '1';
        update_option('blog_public', $new_value);
        
        return new WP_REST_Response(array(
            'success'     => true,
            'discouraged' => (bool) $params['discouraged'],
            'blogPublic'  => $new_value,
        ), 200);
    }
    
    // ==========================================
    // SECURITY HEADERS
    // ==========================================
    
    public function clear_cache(WP_REST_Request $request) {
        $body = $request->get_json_params();
        $post_ids = array();
        if (isset($body['post_ids']) && is_array($body['post_ids'])) {
            $post_ids = array_map('intval', $body['post_ids']);
        } elseif (isset($body['postId'])) {
            $post_ids = array(intval($body['postId']));
        }
        if (!class_exists('GP_Cache_Manager')) {
            return new WP_REST_Response(array('error' => 'GP_Cache_Manager not loaded'), 500);
        }
        $result = GP_Cache_Manager::clear_all($post_ids);
        return new WP_REST_Response($result, 200);
    }

    public function manipulate_element(WP_REST_Request $request) {
        if (!gp_has_permission('CONTENT_UPDATE')) {
            return new WP_REST_Response(array('error' => 'Permission denied'), 403);
        }
        if (!class_exists('GP_Element_Manipulator')) {
            return new WP_REST_Response(array('error' => 'GP_Element_Manipulator not loaded'), 500);
        }
        $post_id = intval($request['id']);
        $spec    = $request->get_json_params();
        $result  = GP_Element_Manipulator::run($post_id, $spec);
        if (is_wp_error($result)) {
            $data   = $result->get_error_data();
            $status = is_array($data) && isset($data['status']) ? intval($data['status']) : 500;
            return new WP_REST_Response(array('error' => $result->get_error_message()), $status);
        }
        // Flush caches for this post so the next platform fetch reflects the mutation
        if (class_exists('GP_Cache_Manager')) {
            GP_Cache_Manager::clear_all(array($post_id));
        }
        Ghost_Post::log_activity('element_manipulated', 'Post #' . $post_id . ' ' . (isset($spec['operation']) ? $spec['operation'] : 'modified'));
        return new WP_REST_Response($result, 200);
    }

    public function get_element_structure(WP_REST_Request $request) {
        if (!gp_has_permission('CONTENT_READ')) {
            return new WP_REST_Response(array('error' => 'Permission denied'), 403);
        }
        $post_id = intval($request['id']);
        $post = get_post($post_id);
        if (!$post) {
            return new WP_REST_Response(array('error' => 'Post not found'), 404);
        }
        $elementor_raw = get_post_meta($post_id, '_elementor_data', true);
        $bb_raw = get_post_meta($post_id, '_fl_builder_data', true);
        $builder = 'html';
        $structure = array();
        // Theme Builder / Loop / Header / Footer templates that actually render
        // on this page's frontend URL. Populated by scanning the page HTML for
        // data-elementor-id attributes. When non-empty, the AI must target
        // widgets by their IDs in the template - writing to the page itself is
        // a silent no-op because Elementor Pro's Theme Builder takes over.
        $theme_templates = array();

        if (!empty($elementor_raw)) {
            $builder = 'elementor';
            $elements = is_string($elementor_raw) ? json_decode($elementor_raw, true) : $elementor_raw;
            if (is_array($elements)) {
                $structure = self::summarize_elementor($elements);
            }
        } elseif (!empty($bb_raw) && is_array($bb_raw)) {
            $builder = 'beaver_builder';
            foreach ($bb_raw as $node_id => $node) {
                $is_obj = is_object($node);
                $type = $is_obj ? ($node->type ?? '') : ($node['type'] ?? '');
                if ($type !== 'module') continue;
                $slug = $is_obj ? ($node->slug ?? '') : ($node['slug'] ?? '');
                $settings = $is_obj ? ($node->settings ?? null) : ($node['settings'] ?? null);
                $heading = '';
                $node_tag = '';
                if ($settings) {
                    $heading = is_object($settings) ? ($settings->heading ?? '') : ($settings['heading'] ?? '');
                    $node_tag = is_object($settings) ? ($settings->tag ?? '') : ($settings['tag'] ?? '');
                }
                $structure[] = array(
                    'id' => $node_id, 'slug' => $slug, 'tag' => $node_tag,
                    'text' => mb_substr((string)$heading, 0, 200),
                );
            }
        } else {
            // HTML: parse post_content for headings + top-level blocks
            $content = $post->post_content ?: '';
            if (class_exists('DOMDocument') && trim($content) !== '') {
                $dom = new DOMDocument('1.0', 'UTF-8');
                libxml_use_internal_errors(true);
                $dom->loadHTML('<?xml encoding="UTF-8"?><div id="gp-root">' . $content . '</div>', LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD);
                libxml_clear_errors();
                $root = $dom->getElementById('gp-root');
                if ($root) {
                    foreach (array('h1','h2','h3','p','a','img') as $t) {
                        $nodes = $dom->getElementsByTagName($t);
                        foreach ($nodes as $n) {
                            if (count($structure) >= 80) break 2;
                            $structure[] = array(
                                'id' => $n->getAttribute('id') ?: null,
                                'tag' => strtolower($n->nodeName),
                                'text' => mb_substr(trim((string)$n->textContent), 0, 200),
                            );
                        }
                    }
                }
            }
        }

        // Detect Elementor Pro Theme Builder templates that render this page.
        // We fetch the permalink once and extract every data-elementor-id
        // value; any id that is NOT $post_id points at a template whose
        // widgets appear in the rendered HTML. Then we include each template's
        // widget structure so the AI can target widgets by id - whether they
        // live on the page itself or in a Single/Header/Footer/Loop template.
        if ($builder === 'elementor' || (empty($elementor_raw) && empty($bb_raw))) {
            $permalink = get_permalink($post_id);
            if ($permalink) {
                $resp = wp_remote_get(add_query_arg(array('gp_cb' => time()), $permalink), array(
                    'timeout'     => 10,
                    'sslverify'   => false,
                    'redirection' => 3,
                    'headers'     => array(
                        'Cache-Control' => 'no-cache',
                        'User-Agent'    => 'GhostSEO-StructureScan/1.0',
                    ),
                ));
                if (!is_wp_error($resp) && (int) wp_remote_retrieve_response_code($resp) < 400) {
                    $body = (string) wp_remote_retrieve_body($resp);
                    if (preg_match_all('/data-elementor-id="(\\d+)"/', $body, $m)) {
                        $seen = array();
                        foreach ($m[1] as $tid) {
                            $tid = (int) $tid;
                            if ($tid === (int) $post_id) continue;
                            if (isset($seen[$tid])) continue;
                            $seen[$tid] = true;
                            $tpost = get_post($tid);
                            if (!$tpost || $tpost->post_type !== 'elementor_library') continue;
                            $traw = get_post_meta($tid, '_elementor_data', true);
                            if (empty($traw)) continue;
                            $tels = is_string($traw) ? json_decode($traw, true) : $traw;
                            if (!is_array($tels)) continue;
                            $theme_templates[] = array(
                                'template_id'       => $tid,
                                'template_type'     => get_post_meta($tid, '_elementor_template_type', true) ?: '',
                                'title'             => get_the_title($tid),
                                'structure'         => self::summarize_elementor($tels),
                            );
                        }
                        if (!empty($theme_templates) && $builder !== 'elementor') {
                            // Page has no _elementor_data of its own, but is
                            // clearly rendered by Elementor templates - the
                            // manipulator's widget_id path will route there.
                            $builder = 'elementor';
                        }
                    }
                }
            }
        }

        return new WP_REST_Response(array(
            'post_id'         => $post_id,
            'builder'         => $builder,
            'structure'       => $structure,
            'theme_templates' => $theme_templates,
            'hint'            => !empty($theme_templates)
                ? 'This page is rendered in part by Elementor Pro Theme Builder templates. Widget IDs visible in the editor may live in the templates under theme_templates[]. manipulate_element with a widget_id will auto-route to the correct template.'
                : '',
        ), 200);
    }

    private static function summarize_elementor($elements, &$out = null, $depth = 0) {
        if ($out === null) $out = array();
        foreach ($elements as $el) {
            if (!is_array($el)) continue;
            if (count($out) >= 120) return $out;
            $is_widget = isset($el['elType']) && $el['elType'] === 'widget';
            if ($is_widget) {
                $widgetType = isset($el['widgetType']) ? $el['widgetType'] : 'unknown';
                $entry = array(
                    'id'         => isset($el['id']) ? $el['id'] : null,
                    'widgetType' => $widgetType,
                    'depth'      => $depth,
                );
                if ($widgetType === 'heading') {
                    $entry['tag']  = isset($el['settings']['header_size']) ? strtolower($el['settings']['header_size']) : 'h2';
                    $entry['text'] = isset($el['settings']['title']) ? mb_substr($el['settings']['title'], 0, 200) : '';
                } else {
                    foreach (array('title','text','editor','heading','description') as $k) {
                        if (isset($el['settings'][$k]) && is_string($el['settings'][$k])) {
                            $entry['text'] = mb_substr(wp_strip_all_tags($el['settings'][$k]), 0, 200);
                            break;
                        }
                    }
                }
                $out[] = $entry;
            }
            if (!empty($el['elements']) && is_array($el['elements'])) {
                self::summarize_elementor($el['elements'], $out, $depth + 1);
            }
        }
        return $out;
    }

    private static $default_security_headers = array(
        'strict-transport-security' => 'max-age=31536000; includeSubDomains; preload',
        'x-frame-options'           => 'SAMEORIGIN',
        'x-content-type-options'    => 'nosniff',
        'referrer-policy'           => 'strict-origin-when-cross-origin',
        'permissions-policy'        => 'geolocation=(), microphone=(), camera=()',
        'content-security-policy'   => "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https:; style-src 'self' 'unsafe-inline' https:; img-src 'self' data: https:; font-src 'self' https: data:; connect-src 'self' https:; frame-ancestors 'self';",
    );
    
    public function get_security_headers(WP_REST_Request $request) {
        $option = get_option('gp_security_headers', array());
        $enabled = !empty($option['enabled']);
        $headers = isset($option['headers']) ? $option['headers'] : array();
        
        return new WP_REST_Response(array(
            'enabled' => $enabled,
            'headers' => $headers,
            'defaults' => self::$default_security_headers,
        ), 200);
    }
    
    public function update_security_headers(WP_REST_Request $request) {
        $params = $request->get_json_params();
        
        $enable = isset($params['enable']) ? (bool) $params['enable'] : true;
        $custom_headers = isset($params['headers']) && is_array($params['headers'])
            ? $params['headers']
            : null;
        
        // Read existing option so we can merge
        $existing = get_option('gp_security_headers', array());
        $existing_headers = isset($existing['headers']) ? $existing['headers'] : array();
        
        // If no custom headers provided, use defaults for all
        if ($custom_headers === null) {
            $custom_headers = self::$default_security_headers;
        }
        
        // Sanitize incoming header values
        $allowed_keys = array_keys(self::$default_security_headers);
        $incoming = array();
        foreach ($allowed_keys as $key) {
            if (isset($custom_headers[$key]) && is_string($custom_headers[$key])) {
                $incoming[$key] = sanitize_text_field($custom_headers[$key]);
            }
        }
        
        // Merge: keep existing headers, overlay with incoming
        $merged = $existing_headers;
        foreach ($incoming as $key => $value) {
            $merged[$key] = $value;
        }
        
        // If enable=true and incoming is a subset, fill in missing with defaults
        if ($enable) {
            foreach ($allowed_keys as $key) {
                if (!isset($merged[$key])) {
                    $merged[$key] = self::$default_security_headers[$key];
                }
            }
        }
        
        update_option('gp_security_headers', array(
            'enabled' => $enable,
            'headers' => $merged,
        ));
        
        return new WP_REST_Response(array(
            'success' => true,
            'enabled' => $enable,
            'headers' => $merged,
        ), 200);
    }

    // ==========================================
    // SEARCH & REPLACE INTERNAL LINKS
    // ==========================================

    /**
     * Search and replace internal links across all published posts and pages.
     * Used after cannibalization merges to fix orphaned internal links.
     */
    public function search_replace_links(WP_REST_Request $request) {
        $params = $request->get_json_params();
        $search  = isset($params['search'])  ? trim($params['search'])  : '';
        $replace = isset($params['replace']) ? trim($params['replace']) : '';

        if (empty($search) || empty($replace)) {
            return new WP_REST_Response(array(
                'error' => '"search" and "replace" parameters are required',
            ), 400);
        }

        if ($search === $replace) {
            return new WP_REST_Response(array(
                'updated' => 0,
                'posts'   => array(),
                'message' => 'Search and replace values are identical',
            ), 200);
        }

        global $wpdb;

        $escaped_search = $wpdb->esc_like($search);

        $post_ids = $wpdb->get_col($wpdb->prepare(
            "SELECT ID FROM {$wpdb->posts}
             WHERE post_status = 'publish'
               AND post_content LIKE %s",
            '%' . $escaped_search . '%'
        ));

        if (empty($post_ids)) {
            return new WP_REST_Response(array(
                'updated' => 0,
                'posts'   => array(),
            ), 200);
        }

        $updated_posts = array();

        foreach ($post_ids as $post_id) {
            $post = get_post($post_id);
            if (!$post) continue;

            $old_content = $post->post_content;
            $new_content = $this->replace_in_href($old_content, $search, $replace);

            if ($new_content !== $old_content) {
                wp_update_post(array(
                    'ID'           => $post_id,
                    'post_content' => $new_content,
                ));

                $updated_posts[] = array(
                    'id'    => (int) $post_id,
                    'title' => $post->post_title,
                );
            }
        }

        return new WP_REST_Response(array(
            'updated' => count($updated_posts),
            'posts'   => $updated_posts,
        ), 200);
    }

    /**
     * Replace a URL path only inside href attributes.
     */
    private function replace_in_href($content, $search, $replace) {
        return preg_replace_callback(
            '/(<a\\s[^>]*href=["\\'\\'])([^"\\'\\']*?)(["\\'\\'])/i',
            function ($matches) use ($search, $replace) {
                $prefix  = $matches[1];
                $href    = $matches[2];
                $suffix  = $matches[3];
                $new_href = str_replace($search, $replace, $href);
                return $prefix . $new_href . $suffix;
            },
            $content
        );
    }
    
    // ==========================================
    // WIDGET DATA (platform push)
    // ==========================================
    
    /**
     * Receive widget data pushed from the platform
     * Stores in wp_option for the dashboard widget to display
     */
    public function update_widget_data(WP_REST_Request $request) {
        $body = $request->get_json_params();
        
        $widget_data = array();
        if (isset($body['auditScore'])) {
            $widget_data['auditScore'] = intval($body['auditScore']);
        }
        if (isset($body['pendingInsights'])) {
            $widget_data['pendingInsights'] = intval($body['pendingInsights']);
        }
        if (isset($body['recentActivity'])) {
            $widget_data['recentActivity'] = sanitize_text_field($body['recentActivity']);
        }
        
        if (!empty($widget_data)) {
            // Merge with existing data so partial pushes don't wipe other fields
            $existing = get_option('gp_dashboard_widget_data', array());
            $merged = array_merge($existing, $widget_data);
            update_option('gp_dashboard_widget_data', $merged);
        }

        return new WP_REST_Response(array('success' => true), 200);
    }

    /**
     * Create a code snippet. Tries three backends in order so the bot can always
     * add PHP/JS/CSS regardless of which snippet plugin (if any) the site runs.
     * Backends:
     *   1. "Code Snippets" plugin (wp-snippets table) - most common
     *   2. WPCode (code-snippets-pro) - second most common
     *   3. mu-plugin drop-in we write ourselves - always works (last resort)
     * Each created snippet is tracked in the 'gp_created_snippets' option so
     * delete_code_snippet can dispatch to the correct backend for rollback.
     */
    public function create_code_snippet(WP_REST_Request $request) {
        $body   = $request->get_json_params();
        $name   = isset($body['name']) ? sanitize_text_field($body['name']) : 'GhostSEO Snippet';
        $code   = isset($body['code']) ? (string) $body['code'] : '';
        $type   = isset($body['type']) ? strtolower(sanitize_key($body['type'])) : 'php'; // php|js|css|html
        $scope  = isset($body['scope']) ? strtolower(sanitize_key($body['scope'])) : 'everywhere'; // everywhere|frontend|admin|header|footer
        $active = isset($body['active']) ? (bool) $body['active'] : true;

        if (empty($code)) {
            return new WP_Error('empty_code', 'Snippet code is required', array('status' => 400));
        }

        $registry = get_option('gp_created_snippets', array());
        if (!is_array($registry)) { $registry = array(); }

        // --- Backend 1: Code Snippets plugin ---
        global $wpdb;
        $cs_table = $wpdb->prefix . 'snippets';
        $has_code_snippets = false;
        if (function_exists('code_snippets') || defined('CODE_SNIPPETS_VERSION')) {
            $has_code_snippets = true;
        } else {
            $row = $wpdb->get_var($wpdb->prepare('SHOW TABLES LIKE %s', $cs_table));
            if ($row === $cs_table) { $has_code_snippets = true; }
        }
        if ($has_code_snippets && $type === 'php') {
            $cs_scope = self::map_snippet_scope($scope, $type);
            $result = $wpdb->insert($cs_table, array(
                'name'        => $name,
                'description' => 'Created by GhostSEO AI',
                'code'        => $code,
                'tags'        => 'ghostpost',
                'scope'       => $cs_scope,
                'priority'    => 10,
                'active'      => $active ? 1 : 0,
                'modified'    => current_time('mysql'),
            ));
            if ($result) {
                $id = $wpdb->insert_id;
                $registry[$id] = array('backend' => 'code-snippets', 'table_id' => $id, 'name' => $name, 'type' => $type);
                update_option('gp_created_snippets', $registry, false);
                return new WP_REST_Response(array('success' => true, 'snippetId' => (string) $id, 'backend' => 'code-snippets'), 200);
            }
        }

        // --- Backend 2: WPCode ---
        if (function_exists('wpcode') || class_exists('WPCode_Snippet')) {
            if (class_exists('WPCode_Snippet')) {
                try {
                    $snippet = new WPCode_Snippet(array(
                        'title'    => $name,
                        'code'     => $code,
                        'code_type' => $type === 'js' ? 'js' : ($type === 'css' ? 'css' : ($type === 'html' ? 'html' : 'php')),
                        'active'   => $active,
                        'location' => $scope === 'header' ? 'site_wide_header' : ($scope === 'footer' ? 'site_wide_footer' : 'site_wide_body'),
                    ));
                    $sid = $snippet->save();
                    if ($sid) {
                        $registry[(string) $sid] = array('backend' => 'wpcode', 'post_id' => $sid, 'name' => $name, 'type' => $type);
                        update_option('gp_created_snippets', $registry, false);
                        return new WP_REST_Response(array('success' => true, 'snippetId' => (string) $sid, 'backend' => 'wpcode'), 200);
                    }
                } catch (Exception $e) { /* fall through */ }
            }
        }

        // --- Backend 3: mu-plugin drop-in (always works) ---
        $mu_dir = trailingslashit(WPMU_PLUGIN_DIR);
        if (!file_exists($mu_dir)) { wp_mkdir_p($mu_dir); }
        $slug = 'gp-snippet-' . substr(md5($name . microtime(true)), 0, 10);
        $file = $mu_dir . $slug . '.php';

        if ($type === 'php') {
            $file_content = "<?php\n/**\n * Plugin Name: GP Snippet - " . esc_html($name) . "\n * Description: Auto-generated by GhostSEO. Do not edit manually.\n */\nif (!defined('ABSPATH')) exit;\n" . (strpos(ltrim($code), '<?php') === 0 ? preg_replace('/^\s*<\?php/', '', $code) : $code) . "\n";
        } elseif ($type === 'js') {
            $hook = $scope === 'admin' ? 'admin_print_footer_scripts' : 'wp_footer';
            $file_content = "<?php\n/** Plugin Name: GP Snippet - " . esc_html($name) . " */\nif (!defined('ABSPATH')) exit;\nadd_action('" . $hook . "', function(){\n    echo '<script>' . " . var_export($code, true) . " . '</script>';\n});\n";
        } elseif ($type === 'css') {
            $hook = $scope === 'admin' ? 'admin_head' : 'wp_head';
            $file_content = "<?php\n/** Plugin Name: GP Snippet - " . esc_html($name) . " */\nif (!defined('ABSPATH')) exit;\nadd_action('" . $hook . "', function(){\n    echo '<style>' . " . var_export($code, true) . " . '</style>';\n});\n";
        } else {
            $hook = $scope === 'header' ? 'wp_head' : 'wp_footer';
            $file_content = "<?php\n/** Plugin Name: GP Snippet - " . esc_html($name) . " */\nif (!defined('ABSPATH')) exit;\nadd_action('" . $hook . "', function(){\n    echo " . var_export($code, true) . ";\n});\n";
        }

        $written = @file_put_contents($file, $file_content);
        if ($written === false) {
            return new WP_Error('write_failed', 'Could not write mu-plugin file: ' . $file, array('status' => 500));
        }
        $registry[$slug] = array('backend' => 'mu-plugin', 'file' => $file, 'name' => $name, 'type' => $type);
        update_option('gp_created_snippets', $registry, false);
        return new WP_REST_Response(array('success' => true, 'snippetId' => $slug, 'backend' => 'mu-plugin'), 200);
    }

    /**
     * Delete a previously-created snippet by ID. Looks the ID up in the
     * gp_created_snippets registry so we know which backend to hit.
     */
    public function delete_code_snippet(WP_REST_Request $request) {
        $id = $request->get_param('id');
        $registry = get_option('gp_created_snippets', array());
        if (!is_array($registry) || !isset($registry[$id])) {
            return new WP_Error('not_found', 'Snippet not found in registry', array('status' => 404));
        }
        $entry = $registry[$id];
        $backend = isset($entry['backend']) ? $entry['backend'] : '';

        if ($backend === 'code-snippets') {
            global $wpdb;
            $wpdb->delete($wpdb->prefix . 'snippets', array('id' => intval($entry['table_id'])));
        } elseif ($backend === 'wpcode') {
            wp_delete_post(intval($entry['post_id']), true);
        } elseif ($backend === 'mu-plugin' && !empty($entry['file']) && file_exists($entry['file'])) {
            @unlink($entry['file']);
        }

        unset($registry[$id]);
        update_option('gp_created_snippets', $registry, false);
        return new WP_REST_Response(array('success' => true), 200);
    }

    /**
     * Map our generic scope strings to the Code Snippets plugin's scope names.
     */
    private static function map_snippet_scope($scope, $type) {
        if ($type !== 'php') { return 'global'; }
        switch ($scope) {
            case 'admin':    return 'admin';
            case 'frontend': return 'front-end';
            case 'header':   return 'front-end';
            case 'footer':   return 'front-end';
            default:         return 'global';
        }
    }

    /**
     * Add a new item to a nav menu. Thin wrapper around wp_update_nav_menu_item.
     */
    public function add_menu_item(WP_REST_Request $request) {
        $menu_id = intval($request->get_param('id'));
        $body    = $request->get_json_params();

        if (!$menu_id || !wp_get_nav_menu_object($menu_id)) {
            return new WP_Error('bad_menu', 'Menu not found', array('status' => 404));
        }

        $args = array(
            'menu-item-title'     => isset($body['title']) ? sanitize_text_field($body['title']) : '',
            'menu-item-url'       => isset($body['url']) ? esc_url_raw($body['url']) : '',
            'menu-item-status'    => 'publish',
            'menu-item-type'      => isset($body['type']) ? sanitize_key($body['type']) : 'custom',
            'menu-item-object'    => isset($body['object']) ? sanitize_key($body['object']) : '',
            'menu-item-object-id' => isset($body['objectId']) ? intval($body['objectId']) : 0,
            'menu-item-parent-id' => isset($body['parentId']) ? intval($body['parentId']) : 0,
            'menu-item-position'  => isset($body['position']) ? intval($body['position']) : 0,
            'menu-item-target'    => isset($body['target']) ? sanitize_text_field($body['target']) : '',
            'menu-item-classes'   => isset($body['classes']) ? sanitize_text_field($body['classes']) : '',
        );

        $item_id = wp_update_nav_menu_item($menu_id, 0, $args);
        if (is_wp_error($item_id)) {
            return new WP_Error('insert_failed', $item_id->get_error_message(), array('status' => 500));
        }
        return new WP_REST_Response(array('success' => true, 'itemId' => $item_id), 200);
    }

    /**
     * Update an existing nav menu item.
     */
    public function update_menu_item(WP_REST_Request $request) {
        $item_id = intval($request->get_param('item_id'));
        $body    = $request->get_json_params();
        $item    = get_post($item_id);
        if (!$item || $item->post_type !== 'nav_menu_item') {
            return new WP_Error('bad_item', 'Menu item not found', array('status' => 404));
        }

        $menus = wp_get_post_terms($item_id, 'nav_menu');
        $menu_id = (!empty($menus) && !is_wp_error($menus)) ? intval($menus[0]->term_id) : 0;
        if (!$menu_id) {
            return new WP_Error('no_menu', 'Item is not attached to a menu', array('status' => 500));
        }

        $existing = wp_setup_nav_menu_item($item);
        $args = array(
            'menu-item-title'     => isset($body['title']) ? sanitize_text_field($body['title']) : $existing->title,
            'menu-item-url'       => isset($body['url']) ? esc_url_raw($body['url']) : $existing->url,
            'menu-item-status'    => 'publish',
            'menu-item-type'      => isset($body['type']) ? sanitize_key($body['type']) : $existing->type,
            'menu-item-object'    => isset($body['object']) ? sanitize_key($body['object']) : $existing->object,
            'menu-item-object-id' => isset($body['objectId']) ? intval($body['objectId']) : intval($existing->object_id),
            'menu-item-parent-id' => isset($body['parentId']) ? intval($body['parentId']) : intval($existing->menu_item_parent),
            'menu-item-position'  => isset($body['position']) ? intval($body['position']) : intval($existing->menu_order),
            'menu-item-target'    => isset($body['target']) ? sanitize_text_field($body['target']) : $existing->target,
            'menu-item-classes'   => isset($body['classes']) ? sanitize_text_field($body['classes']) : (is_array($existing->classes) ? implode(' ', $existing->classes) : ''),
        );

        $result = wp_update_nav_menu_item($menu_id, $item_id, $args);
        if (is_wp_error($result)) {
            return new WP_Error('update_failed', $result->get_error_message(), array('status' => 500));
        }
        return new WP_REST_Response(array('success' => true, 'itemId' => $result), 200);
    }

    /**
     * Delete a nav menu item.
     */
    public function delete_menu_item(WP_REST_Request $request) {
        $item_id = intval($request->get_param('item_id'));
        $item    = get_post($item_id);
        if (!$item || $item->post_type !== 'nav_menu_item') {
            return new WP_Error('bad_item', 'Menu item not found', array('status' => 404));
        }
        $deleted = wp_delete_post($item_id, true);
        if (!$deleted) {
            return new WP_Error('delete_failed', 'Could not delete menu item', array('status' => 500));
        }
        return new WP_REST_Response(array('success' => true), 200);
    }

    /**
     * List terms (categories / tags / any taxonomy).
     */
    public function gp_list_terms(WP_REST_Request $request) {
        $taxonomy = sanitize_key($request->get_param('taxonomy'));
        if (!taxonomy_exists($taxonomy)) {
            return new WP_Error('bad_taxonomy', 'Taxonomy does not exist: ' . $taxonomy, array('status' => 404));
        }
        $search = $request->get_param('search');
        $args = array(
            'taxonomy'   => $taxonomy,
            'hide_empty' => false,
            'number'     => intval($request->get_param('limit')) ?: 200,
        );
        if ($search) { $args['search'] = sanitize_text_field($search); }
        $terms = get_terms($args);
        if (is_wp_error($terms)) {
            return new WP_Error('query_failed', $terms->get_error_message(), array('status' => 500));
        }
        $out = array();
        foreach ($terms as $t) {
            $out[] = array(
                'id'          => $t->term_id,
                'name'        => $t->name,
                'slug'        => $t->slug,
                'description' => $t->description,
                'parent'      => $t->parent,
                'count'       => $t->count,
            );
        }
        return new WP_REST_Response($out, 200);
    }

    /**
     * Create a term.
     */
    public function gp_create_term(WP_REST_Request $request) {
        $taxonomy = sanitize_key($request->get_param('taxonomy'));
        if (!taxonomy_exists($taxonomy)) {
            return new WP_Error('bad_taxonomy', 'Taxonomy does not exist: ' . $taxonomy, array('status' => 404));
        }
        $body = $request->get_json_params();
        $name = isset($body['name']) ? sanitize_text_field($body['name']) : '';
        if ($name === '') {
            return new WP_Error('no_name', 'Term name is required', array('status' => 400));
        }
        $args = array();
        if (!empty($body['slug']))        { $args['slug'] = sanitize_title($body['slug']); }
        if (!empty($body['description'])) { $args['description'] = wp_kses_post($body['description']); }
        if (!empty($body['parent']))      { $args['parent'] = intval($body['parent']); }

        $result = wp_insert_term($name, $taxonomy, $args);
        if (is_wp_error($result)) {
            return new WP_Error('insert_failed', $result->get_error_message(), array('status' => 500));
        }
        return new WP_REST_Response(array('success' => true, 'termId' => $result['term_id']), 200);
    }

    /**
     * Update a term.
     */
    public function gp_update_term(WP_REST_Request $request) {
        $taxonomy = sanitize_key($request->get_param('taxonomy'));
        $term_id  = intval($request->get_param('term_id'));
        if (!taxonomy_exists($taxonomy)) {
            return new WP_Error('bad_taxonomy', 'Taxonomy does not exist', array('status' => 404));
        }
        $body = $request->get_json_params();
        $args = array();
        if (isset($body['name']))        { $args['name'] = sanitize_text_field($body['name']); }
        if (isset($body['slug']))        { $args['slug'] = sanitize_title($body['slug']); }
        if (isset($body['description'])) { $args['description'] = wp_kses_post($body['description']); }
        if (isset($body['parent']))      { $args['parent'] = intval($body['parent']); }

        $result = wp_update_term($term_id, $taxonomy, $args);
        if (is_wp_error($result)) {
            return new WP_Error('update_failed', $result->get_error_message(), array('status' => 500));
        }
        return new WP_REST_Response(array('success' => true, 'termId' => $result['term_id']), 200);
    }

    /**
     * Delete a term.
     */
    public function gp_delete_term(WP_REST_Request $request) {
        $taxonomy = sanitize_key($request->get_param('taxonomy'));
        $term_id  = intval($request->get_param('term_id'));
        $result = wp_delete_term($term_id, $taxonomy);
        if (is_wp_error($result) || $result === 0 || $result === false) {
            $msg = is_wp_error($result) ? $result->get_error_message() : 'term not found';
            return new WP_Error('delete_failed', $msg, array('status' => 500));
        }
        return new WP_REST_Response(array('success' => true), 200);
    }

    /**
     * List comments.
     */
    public function list_comments(WP_REST_Request $request) {
        $args = array(
            'number' => intval($request->get_param('limit')) ?: 50,
            'status' => $request->get_param('status') ?: 'all',
        );
        if ($post_id = intval($request->get_param('postId'))) { $args['post_id'] = $post_id; }

        $comments = get_comments($args);
        $out = array();
        foreach ($comments as $c) {
            $out[] = array(
                'id'         => intval($c->comment_ID),
                'postId'     => intval($c->comment_post_ID),
                'author'     => $c->comment_author,
                'authorEmail'=> $c->comment_author_email,
                'authorUrl'  => $c->comment_author_url,
                'content'    => $c->comment_content,
                'date'       => $c->comment_date,
                'approved'   => $c->comment_approved,
                'parent'     => intval($c->comment_parent),
            );
        }
        return new WP_REST_Response($out, 200);
    }

    /**
     * Update (approve / hold / trash / spam / edit) a comment.
     */
    public function update_comment(WP_REST_Request $request) {
        $id = intval($request->get_param('id'));
        $comment = get_comment($id);
        if (!$comment) {
            return new WP_Error('not_found', 'Comment not found', array('status' => 404));
        }
        $body = $request->get_json_params();

        // Status update
        if (!empty($body['status'])) {
            $status = sanitize_key($body['status']);
            $map = array(
                'approve'  => 'approve',
                'approved' => 'approve',
                '1'        => 'approve',
                'hold'     => 'hold',
                'pending'  => 'hold',
                '0'        => 'hold',
                'spam'     => 'spam',
                'trash'    => 'trash',
            );
            if (isset($map[$status])) {
                wp_set_comment_status($id, $map[$status]);
            }
        }

        // Content / author edit
        $update_args = array('comment_ID' => $id);
        if (isset($body['content']))     { $update_args['comment_content'] = wp_kses_post($body['content']); }
        if (isset($body['author']))      { $update_args['comment_author']  = sanitize_text_field($body['author']); }
        if (isset($body['authorEmail'])) { $update_args['comment_author_email'] = sanitize_email($body['authorEmail']); }
        if (isset($body['authorUrl']))   { $update_args['comment_author_url'] = esc_url_raw($body['authorUrl']); }
        if (count($update_args) > 1) {
            wp_update_comment($update_args);
        }

        return new WP_REST_Response(array('success' => true), 200);
    }

    /**
     * Reply to a comment (or post a new top-level comment if parentId is 0).
     */
    public function reply_comment(WP_REST_Request $request) {
        $body = $request->get_json_params();
        $post_id = intval($body['postId'] ?? 0);
        $parent  = intval($body['parentId'] ?? 0);
        $content = isset($body['content']) ? wp_kses_post($body['content']) : '';
        if (!$post_id || $content === '') {
            return new WP_Error('bad_args', 'postId and content are required', array('status' => 400));
        }

        // Post the reply as the first administrator account (acts as site owner).
        $admin = get_users(array('role' => 'administrator', 'number' => 1));
        $admin_id = !empty($admin) ? intval($admin[0]->ID) : 0;
        $admin_data = $admin_id ? get_userdata($admin_id) : null;

        $comment_data = array(
            'comment_post_ID'  => $post_id,
            'comment_parent'   => $parent,
            'comment_author'   => $admin_data ? $admin_data->display_name : get_bloginfo('name'),
            'comment_author_email' => $admin_data ? $admin_data->user_email : get_option('admin_email'),
            'comment_author_url' => $admin_data ? $admin_data->user_url : home_url(),
            'comment_content'  => $content,
            'comment_approved' => 1,
            'user_id'          => $admin_id,
        );

        $comment_id = wp_insert_comment(wp_slash($comment_data));
        if (!$comment_id) {
            return new WP_Error('insert_failed', 'Could not insert comment', array('status' => 500));
        }
        return new WP_REST_Response(array('success' => true, 'commentId' => $comment_id), 200);
    }

    /**
     * Delete a comment (trash by default, force=true to permanently delete).
     */
    public function delete_comment(WP_REST_Request $request) {
        $id = intval($request->get_param('id'));
        $force = $request->get_param('force') ? true : false;
        $comment = get_comment($id);
        if (!$comment) {
            return new WP_Error('not_found', 'Comment not found', array('status' => 404));
        }
        $result = wp_delete_comment($id, $force);
        if (!$result) {
            return new WP_Error('delete_failed', 'Could not delete comment', array('status' => 500));
        }
        return new WP_REST_Response(array('success' => true), 200);
    }

    /**
     * Read a whitelist of common WP options (site settings the bot may need).
     */
    public function get_options(WP_REST_Request $request) {
        $keys = self::allowed_option_keys();
        $out = array();
        foreach ($keys as $k) {
            $out[$k] = get_option($k);
        }
        return new WP_REST_Response($out, 200);
    }

    /**
     * Update whitelisted WP options.
     */
    public function update_options(WP_REST_Request $request) {
        $body = $request->get_json_params();
        $allowed = array_flip(self::allowed_option_keys());
        $changed = array();
        $errors  = array();
        foreach ($body as $k => $v) {
            if (!isset($allowed[$k])) {
                $errors[] = 'option not allowed: ' . $k;
                continue;
            }
            $previous = get_option($k);
            $sanitized = self::sanitize_option_value($k, $v);
            update_option($k, $sanitized);
            $changed[$k] = array('previous' => $previous, 'new' => $sanitized);
        }

        // If permalink structure changed, flush rewrite rules.
        if (isset($changed['permalink_structure'])) {
            flush_rewrite_rules(false);
        }

        return new WP_REST_Response(array(
            'success' => empty($errors),
            'changed' => $changed,
            'errors'  => $errors,
        ), empty($errors) ? 200 : 207);
    }

    private static function allowed_option_keys() {
        return array(
            'blogname',
            'blogdescription',
            'admin_email',
            'timezone_string',
            'date_format',
            'time_format',
            'start_of_week',
            'WPLANG',
            'permalink_structure',
            'show_on_front',
            'page_on_front',
            'page_for_posts',
            'posts_per_page',
            'posts_per_rss',
            'default_comment_status',
            'default_ping_status',
            'comments_notify',
            'moderation_notify',
            'blog_public',
            'users_can_register',
            'default_role',
            'thumbnail_size_w',
            'thumbnail_size_h',
            'medium_size_w',
            'medium_size_h',
            'large_size_w',
            'large_size_h',
        );
    }

    private static function sanitize_option_value($key, $value) {
        $int_keys = array('page_on_front', 'page_for_posts', 'posts_per_page', 'posts_per_rss',
            'blog_public', 'users_can_register', 'comments_notify', 'moderation_notify',
            'start_of_week', 'thumbnail_size_w', 'thumbnail_size_h', 'medium_size_w',
            'medium_size_h', 'large_size_w', 'large_size_h');
        if (in_array($key, $int_keys, true)) return intval($value);
        if ($key === 'admin_email') return sanitize_email($value);
        if ($key === 'permalink_structure') return preg_replace('/[^a-zA-Z0-9\\-_\\/%]/', '', (string) $value);
        return sanitize_text_field((string) $value);
    }

    /**
     * Force this plugin to update itself to the latest version published by the
     * GhostSEO platform. Triggers WP's normal plugin upgrader.
     */
    public function self_update(WP_REST_Request $request) {
        if (!function_exists('get_plugins')) {
            require_once ABSPATH . 'wp-admin/includes/plugin.php';
        }
        require_once ABSPATH . 'wp-admin/includes/class-wp-upgrader.php';
        require_once ABSPATH . 'wp-admin/includes/plugin-install.php';
        require_once ABSPATH . 'wp-admin/includes/file.php';
        require_once ABSPATH . 'wp-admin/includes/misc.php';

        // Locate this plugin's slug (the directory/file path WP uses for plugin_basename).
        $plugin_slug = plugin_basename(dirname(dirname(__FILE__)) . '/ghost-post-connector.php');
        if (!file_exists(WP_PLUGIN_DIR . '/' . $plugin_slug)) {
            // Fallback: scan for our plugin header among installed plugins.
            $all = get_plugins();
            foreach ($all as $file => $meta) {
                if (stripos($meta['Name'], 'ghost post') !== false) { $plugin_slug = $file; break; }
            }
        }

        // Refresh plugin update transient so WP knows there's an update.
        delete_site_transient('update_plugins');
        wp_update_plugins();

        $updates = get_site_transient('update_plugins');
        $available = isset($updates->response[$plugin_slug]) ? $updates->response[$plugin_slug] : null;

        if (!$available) {
            return new WP_REST_Response(array(
                'success'        => true,
                'updateNeeded'   => false,
                'message'        => 'Already on latest version.',
                'currentVersion' => defined('GP_PLUGIN_VERSION') ? GP_PLUGIN_VERSION : '',
            ), 200);
        }

        $upgrader = new Plugin_Upgrader(new Automatic_Upgrader_Skin());
        $result = $upgrader->upgrade($plugin_slug);

        if (is_wp_error($result)) {
            return new WP_Error('upgrade_failed', $result->get_error_message(), array('status' => 500));
        }
        if ($result === false) {
            return new WP_Error('upgrade_failed', 'Plugin upgrader returned false', array('status' => 500));
        }

        return new WP_REST_Response(array(
            'success'    => true,
            'newVersion' => isset($available->new_version) ? $available->new_version : null,
        ), 200);
    }

    /**
     * Generic REST API passthrough. Runs the request AS AN ADMIN so any plugin
     * REST route that checks capabilities will see us. The AI uses this for
     * WooCommerce (/wc/v3/*), Yoast (/yoast/v1/*), Elementor REST endpoints,
     * Contact Form 7 (/contact-form-7/v1/*), and anything else not covered by
     * a dedicated tool.
     *
     * Body:
     *   method: GET | POST | PUT | PATCH | DELETE
     *   path:   string starting with "/" (e.g. "/wc/v3/products")
     *   params: object (query params for GET, body for others)
     *   headers: optional object of extra request headers
     */
    public function wp_passthrough(WP_REST_Request $request) {
        $body = $request->get_json_params();
        $method = isset($body['method']) ? strtoupper(sanitize_key($body['method'])) : 'GET';
        $path   = isset($body['path']) ? (string) $body['path'] : '';
        $params = isset($body['params']) && is_array($body['params']) ? $body['params'] : array();
        $headers = isset($body['headers']) && is_array($body['headers']) ? $body['headers'] : array();

        if ($path === '' || $path[0] !== '/') {
            return new WP_Error('bad_path', 'path must start with "/" (e.g. /wp/v2/posts)', array('status' => 400));
        }
        $allowed_methods = array('GET', 'POST', 'PUT', 'PATCH', 'DELETE');
        if (!in_array($method, $allowed_methods, true)) {
            return new WP_Error('bad_method', 'method must be GET/POST/PUT/PATCH/DELETE', array('status' => 400));
        }

        // Authenticate as the first administrator for the duration of this call.
        // The plugin's HMAC auth already proved the caller is the GhostSEO
        // platform - we just need WP to see an admin user for capability checks.
        $admin = get_users(array('role' => 'administrator', 'number' => 1));
        if (empty($admin)) {
            return new WP_Error('no_admin', 'No administrator user found on this site', array('status' => 500));
        }
        $previous_user = get_current_user_id();
        wp_set_current_user(intval($admin[0]->ID));

        try {
            $internal = new WP_REST_Request($method, $path);
            foreach ($headers as $hk => $hv) { $internal->set_header((string) $hk, (string) $hv); }

            if ($method === 'GET' || $method === 'DELETE') {
                $internal->set_query_params($params);
            } else {
                $internal->set_header('Content-Type', 'application/json');
                $internal->set_body(wp_json_encode($params));
                $internal->set_body_params($params);
            }

            $response = rest_do_request($internal);
            $data = rest_get_server()->response_to_data($response, false);
            $status = $response->get_status();
        } catch (Exception $e) {
            wp_set_current_user($previous_user);
            return new WP_Error('passthrough_failed', $e->getMessage(), array('status' => 500));
        }

        wp_set_current_user($previous_user);

        return new WP_REST_Response(array(
            'status' => $status,
            'data'   => $data,
        ), 200);
    }
}
`;
}

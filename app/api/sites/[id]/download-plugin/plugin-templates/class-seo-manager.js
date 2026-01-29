/**
 * Generate SEO Manager class
 */
export function getClassSeoManager() {
  return `<?php
/**
 * Ghost Post SEO Manager
 * 
 * Handles SEO meta for Yoast, RankMath, and custom meta
 */

if (!defined('ABSPATH')) {
    exit;
}

class GP_SEO_Manager {
    
    /**
     * Get SEO meta for a post
     * 
     * @param int $post_id
     * @return WP_REST_Response
     */
    public function get_meta($post_id) {
        $post = get_post($post_id);
        
        if (!$post) {
            return new WP_REST_Response(array('error' => 'Post not found'), 404);
        }
        
        $seo_data = array(
            'post_id' => $post_id,
            'plugins' => array(
                'yoast' => defined('WPSEO_VERSION'),
                'rankmath' => defined('RANK_MATH_VERSION'),
            ),
        );
        
        // Yoast SEO
        if (defined('WPSEO_VERSION')) {
            $seo_data['yoast'] = $this->get_yoast_meta($post_id);
        }
        
        // RankMath
        if (defined('RANK_MATH_VERSION')) {
            $seo_data['rankmath'] = $this->get_rankmath_meta($post_id);
        }
        
        // Custom meta fields (fallback)
        $seo_data['custom'] = array(
            'title' => get_post_meta($post_id, '_gp_seo_title', true),
            'description' => get_post_meta($post_id, '_gp_seo_description', true),
            'keywords' => get_post_meta($post_id, '_gp_seo_keywords', true),
            'canonical' => get_post_meta($post_id, '_gp_seo_canonical', true),
            'robots' => get_post_meta($post_id, '_gp_seo_robots', true),
            'og_title' => get_post_meta($post_id, '_gp_og_title', true),
            'og_description' => get_post_meta($post_id, '_gp_og_description', true),
            'og_image' => get_post_meta($post_id, '_gp_og_image', true),
            'twitter_title' => get_post_meta($post_id, '_gp_twitter_title', true),
            'twitter_description' => get_post_meta($post_id, '_gp_twitter_description', true),
            'twitter_image' => get_post_meta($post_id, '_gp_twitter_image', true),
        );
        
        return new WP_REST_Response($seo_data, 200);
    }
    
    /**
     * Update SEO meta for a post
     * 
     * @param int $post_id
     * @param array $data
     * @return WP_REST_Response
     */
    public function update_meta($post_id, $data) {
        $post = get_post($post_id);
        
        if (!$post) {
            return new WP_REST_Response(array('error' => 'Post not found'), 404);
        }
        
        $updated = array();
        
        // Update Yoast SEO
        if (defined('WPSEO_VERSION') && !empty($data['yoast'])) {
            $this->update_yoast_meta($post_id, $data['yoast']);
            $updated[] = 'yoast';
        }
        
        // Update RankMath
        if (defined('RANK_MATH_VERSION') && !empty($data['rankmath'])) {
            $this->update_rankmath_meta($post_id, $data['rankmath']);
            $updated[] = 'rankmath';
        }
        
        // Update custom meta
        if (!empty($data['custom'])) {
            $this->update_custom_meta($post_id, $data['custom']);
            $updated[] = 'custom';
        }
        
        // Auto-detect and update primary SEO plugin
        if (!empty($data['title']) || !empty($data['description'])) {
            if (defined('WPSEO_VERSION')) {
                $this->update_yoast_meta($post_id, $data);
            } elseif (defined('RANK_MATH_VERSION')) {
                $this->update_rankmath_meta($post_id, $data);
            } else {
                $this->update_custom_meta($post_id, $data);
            }
            $updated[] = 'auto';
        }
        
        return new WP_REST_Response(array(
            'success' => true,
            'updated' => $updated,
        ), 200);
    }
    
    /**
     * Get Yoast SEO meta
     * 
     * @param int $post_id
     * @return array
     */
    private function get_yoast_meta($post_id) {
        return array(
            'title' => get_post_meta($post_id, '_yoast_wpseo_title', true),
            'description' => get_post_meta($post_id, '_yoast_wpseo_metadesc', true),
            'canonical' => get_post_meta($post_id, '_yoast_wpseo_canonical', true),
            'robots_noindex' => get_post_meta($post_id, '_yoast_wpseo_meta-robots-noindex', true),
            'robots_nofollow' => get_post_meta($post_id, '_yoast_wpseo_meta-robots-nofollow', true),
            'og_title' => get_post_meta($post_id, '_yoast_wpseo_opengraph-title', true),
            'og_description' => get_post_meta($post_id, '_yoast_wpseo_opengraph-description', true),
            'og_image' => get_post_meta($post_id, '_yoast_wpseo_opengraph-image', true),
            'twitter_title' => get_post_meta($post_id, '_yoast_wpseo_twitter-title', true),
            'twitter_description' => get_post_meta($post_id, '_yoast_wpseo_twitter-description', true),
            'twitter_image' => get_post_meta($post_id, '_yoast_wpseo_twitter-image', true),
            'focus_keyword' => get_post_meta($post_id, '_yoast_wpseo_focuskw', true),
            'cornerstone' => get_post_meta($post_id, '_yoast_wpseo_is_cornerstone', true),
            'schema_type' => get_post_meta($post_id, '_yoast_wpseo_schema_article_type', true),
        );
    }
    
    /**
     * Update Yoast SEO meta
     * 
     * @param int $post_id
     * @param array $data
     */
    private function update_yoast_meta($post_id, $data) {
        $meta_map = array(
            'title' => '_yoast_wpseo_title',
            'description' => '_yoast_wpseo_metadesc',
            'canonical' => '_yoast_wpseo_canonical',
            'robots_noindex' => '_yoast_wpseo_meta-robots-noindex',
            'robots_nofollow' => '_yoast_wpseo_meta-robots-nofollow',
            'og_title' => '_yoast_wpseo_opengraph-title',
            'og_description' => '_yoast_wpseo_opengraph-description',
            'og_image' => '_yoast_wpseo_opengraph-image',
            'twitter_title' => '_yoast_wpseo_twitter-title',
            'twitter_description' => '_yoast_wpseo_twitter-description',
            'twitter_image' => '_yoast_wpseo_twitter-image',
            'focus_keyword' => '_yoast_wpseo_focuskw',
            'cornerstone' => '_yoast_wpseo_is_cornerstone',
            'schema_type' => '_yoast_wpseo_schema_article_type',
        );
        
        foreach ($meta_map as $key => $meta_key) {
            if (isset($data[$key])) {
                update_post_meta($post_id, $meta_key, sanitize_text_field($data[$key]));
            }
        }
    }
    
    /**
     * Get RankMath meta
     * 
     * @param int $post_id
     * @return array
     */
    private function get_rankmath_meta($post_id) {
        return array(
            'title' => get_post_meta($post_id, 'rank_math_title', true),
            'description' => get_post_meta($post_id, 'rank_math_description', true),
            'canonical' => get_post_meta($post_id, 'rank_math_canonical_url', true),
            'robots' => get_post_meta($post_id, 'rank_math_robots', true),
            'focus_keyword' => get_post_meta($post_id, 'rank_math_focus_keyword', true),
            'og_title' => get_post_meta($post_id, 'rank_math_facebook_title', true),
            'og_description' => get_post_meta($post_id, 'rank_math_facebook_description', true),
            'og_image' => get_post_meta($post_id, 'rank_math_facebook_image', true),
            'twitter_title' => get_post_meta($post_id, 'rank_math_twitter_title', true),
            'twitter_description' => get_post_meta($post_id, 'rank_math_twitter_description', true),
            'twitter_image' => get_post_meta($post_id, 'rank_math_twitter_image', true),
            'pillar_content' => get_post_meta($post_id, 'rank_math_pillar_content', true),
            'schema_type' => get_post_meta($post_id, 'rank_math_rich_snippet', true),
        );
    }
    
    /**
     * Update RankMath meta
     * 
     * @param int $post_id
     * @param array $data
     */
    private function update_rankmath_meta($post_id, $data) {
        $meta_map = array(
            'title' => 'rank_math_title',
            'description' => 'rank_math_description',
            'canonical' => 'rank_math_canonical_url',
            'robots' => 'rank_math_robots',
            'focus_keyword' => 'rank_math_focus_keyword',
            'og_title' => 'rank_math_facebook_title',
            'og_description' => 'rank_math_facebook_description',
            'og_image' => 'rank_math_facebook_image',
            'twitter_title' => 'rank_math_twitter_title',
            'twitter_description' => 'rank_math_twitter_description',
            'twitter_image' => 'rank_math_twitter_image',
            'pillar_content' => 'rank_math_pillar_content',
            'schema_type' => 'rank_math_rich_snippet',
        );
        
        foreach ($meta_map as $key => $meta_key) {
            if (isset($data[$key])) {
                update_post_meta($post_id, $meta_key, sanitize_text_field($data[$key]));
            }
        }
    }
    
    /**
     * Update custom meta fields
     * 
     * @param int $post_id
     * @param array $data
     */
    private function update_custom_meta($post_id, $data) {
        $meta_map = array(
            'title' => '_gp_seo_title',
            'description' => '_gp_seo_description',
            'keywords' => '_gp_seo_keywords',
            'canonical' => '_gp_seo_canonical',
            'robots' => '_gp_seo_robots',
            'og_title' => '_gp_og_title',
            'og_description' => '_gp_og_description',
            'og_image' => '_gp_og_image',
            'twitter_title' => '_gp_twitter_title',
            'twitter_description' => '_gp_twitter_description',
            'twitter_image' => '_gp_twitter_image',
        );
        
        foreach ($meta_map as $key => $meta_key) {
            if (isset($data[$key])) {
                update_post_meta($post_id, $meta_key, sanitize_text_field($data[$key]));
            }
        }
    }
}
`;
}

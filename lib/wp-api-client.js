/**
 * WordPress Plugin API Client
 * 
 * Handles secure communication with the Ghost Post WordPress plugin
 * using HMAC-SHA256 signed requests.
 */

import crypto from 'crypto';

/**
 * Create HMAC-SHA256 signature for request
 */
function createSignature(payload, timestamp, secret) {
  const data = `${timestamp}.${payload}`;
  return crypto.createHmac('sha256', secret).update(data).digest('hex');
}

/**
 * Make authenticated request to WordPress plugin
 */
async function makePluginRequest(site, endpoint, method = 'GET', body = null) {
  if (!site.siteKey || !site.siteSecret) {
    throw new Error('Site is not connected - missing siteKey or siteSecret');
  }

  // Normalize site URL — ensure protocol is present
  let baseUrl = site.url.replace(/\/$/, '');
  if (!/^https?:\/\//i.test(baseUrl)) {
    baseUrl = `https://${baseUrl}`;
  }
  const url = `${baseUrl}/wp-json/ghost-post/v1${endpoint}`;
  
  const timestamp = Math.floor(Date.now() / 1000);
  const payload = body ? JSON.stringify(body) : '';
  const signature = createSignature(payload, timestamp, site.siteSecret);

  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'X-GP-Site-Key': site.siteKey,
    'X-GP-Timestamp': timestamp.toString(),
    'X-GP-Signature': signature,
  };

  const options = {
    method,
    headers,
    signal: AbortSignal.timeout(30000), // 30 second timeout
  };

  if (body && method !== 'GET') {
    options.body = payload;
  }

  const response = await fetch(url, options);
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Plugin API error (${response.status}): ${errorText}`);
  }

  return response.json();
}

/**
 * Get site info from WordPress
 */
export async function getSiteInfo(site) {
  return makePluginRequest(site, '/site-info', 'GET');
}

/**
 * Get all post types from WordPress
 */
export async function getPostTypes(site) {
  try {
    // First try to get from our plugin endpoint
    const siteInfo = await getSiteInfo(site);
    return siteInfo.postTypes || [];
  } catch (error) {
    console.error('Failed to get post types from plugin:', error);
    
    // Fallback to public WP API
    const baseUrl = site.url.replace(/\/$/, '');
    const response = await fetch(`${baseUrl}/wp-json/wp/v2/types`, {
      signal: AbortSignal.timeout(10000),
    });
    
    if (response.ok) {
      const types = await response.json();
      return Object.entries(types).map(([slug, data]) => ({
        slug,
        name: data.name,
        restBase: data.rest_base,
        hasArchive: data.has_archive,
      }));
    }
    
    return [];
  }
}

/**
 * Get posts/pages/CPT items
 * @param {Object} site - Site object with connection details
 * @param {string} postType - The post type slug (post, page, or custom post type)
 * @param {number} page - Page number
 * @param {number} perPage - Items per page
 * @param {boolean} full - Include full content, ACF, SEO data
 */
export async function getPosts(site, postType = 'post', page = 1, perPage = 100, full = true) {
  // Normalize post type - WordPress uses singular slugs (post, page)
  // but REST base uses plural (posts, pages). Handle both.
  const normalizedType = postType.toLowerCase().trim();
  
  // Map post type to the correct plugin endpoint
  let endpoint;
  if (normalizedType === 'post' || normalizedType === 'posts') {
    endpoint = '/posts';
  } else if (normalizedType === 'page' || normalizedType === 'pages') {
    endpoint = '/pages';
  } else {
    // Custom post type
    endpoint = `/cpt/${normalizedType}`;
  }
  
  // Build query string with full parameter for sync operations
  const queryParams = `page=${page}&per_page=${perPage}&full=${full ? 'true' : 'false'}`;
  
  return makePluginRequest(site, `${endpoint}?${queryParams}`, 'GET');
}

/**
 * Get a single post with full data
 */
export async function getPost(site, postType, postId) {
  // Map post type to the correct plugin endpoint
  let endpoint;
  if (postType === 'post') {
    endpoint = `/posts/${postId}`;
  } else if (postType === 'page') {
    endpoint = `/pages/${postId}`;
  } else {
    endpoint = `/cpt/${postType}/${postId}`;
  }
  
  return makePluginRequest(site, endpoint, 'GET');
}

/**
 * Get a post by slug
 * @param {Object} site - Site object with connection details
 * @param {string} postType - The post type slug (post, page, or custom post type)
 * @param {string} slug - The post slug
 * @returns {Promise<Object|null>} - Post data or null if not found
 */
export async function getPostBySlug(site, postType, slug) {
  try {
    // Get posts filtered by slug using getPosts with slug filter
    // WordPress REST API supports slug parameter
    let endpoint;
    if (postType === 'post' || postType === 'posts') {
      endpoint = `/posts?slug=${encodeURIComponent(slug)}&per_page=1`;
    } else if (postType === 'page' || postType === 'pages') {
      endpoint = `/pages?slug=${encodeURIComponent(slug)}&per_page=1`;
    } else {
      endpoint = `/cpt/${postType}?slug=${encodeURIComponent(slug)}&per_page=1`;
    }
    
    const response = await makePluginRequest(site, endpoint, 'GET');
    
    // Response could be an array or object with posts property
    const posts = Array.isArray(response) ? response : (response.posts || response.data || []);
    
    return posts.length > 0 ? posts[0] : null;
  } catch (error) {
    console.error(`Failed to get post by slug "${slug}":`, error);
    return null;
  }
}

/**
 * Update a post/page/CPT in WordPress
 * @param {Object} site - Site object with connection details
 * @param {string} postType - The post type slug (post, page, or custom post type)
 * @param {number|string} postId - The WordPress post ID
 * @param {Object} data - The data to update
 * @returns {Promise<Object>} - Updated post data
 */
export async function updatePost(site, postType, postId, data) {
  // Map post type to the correct plugin endpoint
  let endpoint;
  if (postType === 'post' || postType === 'posts') {
    endpoint = `/posts/${postId}`;
  } else if (postType === 'page' || postType === 'pages') {
    endpoint = `/pages/${postId}`;
  } else {
    endpoint = `/cpt/${postType}/${postId}`;
  }
  
  return makePluginRequest(site, endpoint, 'PUT', data);
}

/**
 * Update SEO data for a post (Yoast/RankMath)
 * @param {Object} site - Site object with connection details
 * @param {number|string} postId - The WordPress post ID
 * @param {Object} seoData - The SEO data to update
 * @returns {Promise<Object>} - Updated SEO data
 */
export async function updateSeoData(site, postId, seoData) {
  return makePluginRequest(site, `/seo/${postId}`, 'PUT', seoData);
}

/**
 * Resolve a URL to a WordPress post ID via the plugin.
 * Uses WordPress url_to_postid() which handles rewrites, translated slugs, etc.
 * @param {Object} site - Site object with connection details
 * @param {string} url - The URL to resolve
 * @returns {Promise<{found: boolean, postId: number|null, postType?: string, slug?: string, permalink?: string}>}
 */
export async function resolveUrl(site, url) {
  try {
    return await makePluginRequest(site, '/resolve-url', 'POST', { url });
  } catch (error) {
    console.warn('[resolveUrl] Failed to resolve URL:', url, error.message);
    return { found: false, postId: null };
  }
}

/**
 * Set the site favicon (site icon) to a media attachment.
 * @param {Object} site - Site object with connection details
 * @param {number|string} attachmentId - The WordPress media attachment ID
 * @returns {Promise<{success: boolean, attachmentId: number, faviconUrl: string}>}
 */
export async function setFavicon(site, attachmentId) {
  return makePluginRequest(site, '/set-favicon', 'POST', { attachmentId });
}

/**
 * Update ACF fields for a post
 * @param {Object} site - Site object with connection details
 * @param {number|string} postId - The WordPress post ID
 * @param {Object} acfData - The ACF field values to update
 * @returns {Promise<Object>} - Updated ACF data
 */
export async function updateAcfFields(site, postId, acfData) {
  return makePluginRequest(site, `/acf/${postId}`, 'PUT', acfData);
}

/**
 * Get SEO data for a post (Yoast/RankMath)
 */
export async function getSeoData(site, postId) {
  return makePluginRequest(site, `/seo/${postId}`, 'GET');
}

/**
 * Get ACF fields for a post
 */
export async function getAcfFields(site, postId) {
  return makePluginRequest(site, `/acf/${postId}`, 'GET');
}

/**
 * Get all taxonomies
 */
export async function getTaxonomies(site) {
  return makePluginRequest(site, '/taxonomies', 'GET');
}

/**
 * Get terms for a taxonomy
 */
export async function getTaxonomyTerms(site, taxonomy) {
  return makePluginRequest(site, `/taxonomies/${taxonomy}/terms`, 'GET');
}

/**
 * Get menus from WordPress
 */
export async function getMenus(site) {
  try {
    // Try plugin endpoint first (if we add it)
    return makePluginRequest(site, '/menus', 'GET');
  } catch (error) {
    console.log('Menu endpoint not available, trying fallback');
    
    // Fallback: try WP REST API for menus (requires WP-REST-API extension or WP 5.9+)
    const baseUrl = site.url.replace(/\/$/, '');
    
    // Try WordPress 5.9+ menu endpoint
    const response = await fetch(`${baseUrl}/wp-json/wp/v2/menus`, {
      signal: AbortSignal.timeout(10000),
    });
    
    if (response.ok) {
      return response.json();
    }
    
    // Try older menu locations endpoint
    const locationsResponse = await fetch(`${baseUrl}/wp-json/wp/v2/menu-locations`, {
      signal: AbortSignal.timeout(10000),
    });
    
    if (locationsResponse.ok) {
      return locationsResponse.json();
    }
    
    return [];
  }
}

/**
 * Full entity sync - get all data for all post types
 */
export async function syncAllEntities(site, onProgress = null) {
  const result = {
    postTypes: [],
    entities: [],
    menus: [],
    taxonomies: [],
    errors: [],
  };

  try {
    // Step 1: Get site info and post types
    if (onProgress) onProgress('Fetching site info...', 5);
    
    let postTypes = [];
    try {
      const siteInfo = await getSiteInfo(site);
      postTypes = siteInfo.postTypes || [];
      result.siteInfo = siteInfo;
    } catch (e) {
      // Fallback to public API
      postTypes = await getPostTypes(site);
    }
    
    // Filter to usable post types
    const syncableTypes = postTypes.filter(pt => 
      pt.restBase && 
      !['attachment', 'revision', 'nav_menu_item', 'wp_block', 'wp_template', 'wp_template_part', 'wp_navigation'].includes(pt.slug)
    );
    
    result.postTypes = syncableTypes;
    
    // Step 2: Fetch entities for each post type
    const totalTypes = syncableTypes.length;
    let typesProcessed = 0;
    
    for (const postType of syncableTypes) {
      const progressPercent = 10 + Math.floor((typesProcessed / totalTypes) * 60);
      if (onProgress) onProgress(`Syncing ${postType.name}...`, progressPercent);
      
      try {
        const entities = await fetchAllEntitiesForType(site, postType);
        result.entities.push(...entities);
      } catch (error) {
        result.errors.push({
          type: 'post_type',
          slug: postType.slug,
          error: error.message,
        });
      }
      
      typesProcessed++;
    }

    // Step 3: Fetch menus
    if (onProgress) onProgress('Syncing menus...', 75);
    try {
      result.menus = await getMenus(site);
    } catch (error) {
      result.errors.push({
        type: 'menus',
        error: error.message,
      });
    }

    // Step 4: Fetch taxonomies
    if (onProgress) onProgress('Syncing taxonomies...', 85);
    try {
      result.taxonomies = await getTaxonomies(site);
    } catch (error) {
      result.errors.push({
        type: 'taxonomies',
        error: error.message,
      });
    }

    if (onProgress) onProgress('Sync complete!', 100);
    
  } catch (error) {
    result.errors.push({
      type: 'general',
      error: error.message,
    });
  }

  return result;
}

/**
 * Fetch all entities for a post type with pagination
 */
async function fetchAllEntitiesForType(site, postType) {
  const entities = [];
  const restBase = postType.restBase || postType.slug;
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    try {
      const response = await getPosts(site, restBase, page, 100);
      
      if (!response || response.length === 0) {
        hasMore = false;
        break;
      }

      // Enrich each entity with SEO and ACF data
      for (const post of response) {
        // Map WordPress status to our EntityStatus
        const statusMap = {
          'publish': 'PUBLISHED',
          'draft': 'DRAFT',
          'pending': 'PENDING',
          'future': 'SCHEDULED',
          'private': 'PRIVATE',
          'trash': 'TRASH',
        };
        const mappedStatus = statusMap[post.status] || 'DRAFT';
        
        const entity = {
          postType: postType.slug,
          postTypeName: postType.name,
          externalId: String(post.id),
          title: post.title?.rendered || post.title || 'Untitled',
          slug: post.slug,
          url: post.link,
          excerpt: cleanHtml(post.excerpt?.rendered),
          content: post.content?.rendered || null,
          status: mappedStatus,
          featuredImage: post._embedded?.['wp:featuredmedia']?.[0]?.source_url || null,
          publishedAt: post.date ? new Date(post.date) : null,
          scheduledAt: post.status === 'future' && post.date ? new Date(post.date) : null,
          modifiedAt: post.modified ? new Date(post.modified) : null,
          author: post._embedded?.author?.[0]?.name || null,
          categories: post._embedded?.['wp:term']?.[0]?.map(t => t.name) || [],
          tags: post._embedded?.['wp:term']?.[1]?.map(t => t.name) || [],
          seoData: null,
          acfData: null,
        };

        // Try to get SEO data
        try {
          entity.seoData = await getSeoData(site, post.id);
        } catch (e) {
          // SEO plugin might not be installed
        }

        // Try to get ACF data
        try {
          entity.acfData = await getAcfFields(site, post.id);
        } catch (e) {
          // ACF might not be installed
        }

        entities.push(entity);
      }

      // Check if there are more pages
      if (response.length < 100) {
        hasMore = false;
      } else {
        page++;
      }
      
    } catch (error) {
      console.error(`Error fetching ${restBase} page ${page}:`, error);
      hasMore = false;
    }
  }

  return entities;
}

/**
 * Clean HTML from a string
 */
function cleanHtml(html) {
  if (!html) return null;
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .trim();
}

// ============================================
// Media Functions
// ============================================

/**
 * Get media items from WordPress
 * @param {Object} site - Site object with connection details
 * @param {Object} options - Query options
 * @param {number} options.page - Page number (default: 1)
 * @param {number} options.perPage - Items per page (default: 20)
 * @param {string} options.mimeType - Filter by mime type (e.g., 'image', 'image/jpeg')
 * @param {string} options.search - Search query
 * @returns {Promise<Object>} - Media items with pagination info
 */
export async function getMedia(site, options = {}) {
  const { page = 1, perPage = 20, mimeType, search } = options;
  
  let queryParams = `page=${page}&per_page=${perPage}`;
  if (mimeType) queryParams += `&mime_type=${encodeURIComponent(mimeType)}`;
  if (search) queryParams += `&search=${encodeURIComponent(search)}`;
  
  return makePluginRequest(site, `/media?${queryParams}`, 'GET');
}

/**
 * Get a single media item by ID
 * @param {Object} site - Site object with connection details
 * @param {number|string} mediaId - The WordPress attachment ID
 * @returns {Promise<Object>} - Media item details
 */
export async function getMediaItem(site, mediaId) {
  const result = await getMedia(site, { perPage: 1 });
  // The API doesn't have a single item endpoint, so we'll need to filter
  // For now, we can use the standard WP API
  const baseUrl = site.url.replace(/\/$/, '');
  const response = await fetch(`${baseUrl}/wp-json/wp/v2/media/${mediaId}`, {
    signal: AbortSignal.timeout(10000),
  });
  
  if (!response.ok) {
    throw new Error(`Failed to get media item: ${response.status}`);
  }
  
  return response.json();
}

/**
 * Upload media to WordPress from a URL
 * @param {Object} site - Site object with connection details
 * @param {string} url - URL of the image to upload
 * @param {Object} options - Upload options
 * @param {string} options.filename - Custom filename
 * @param {string} options.title - Media title
 * @param {string} options.alt - Alt text
 * @param {string} options.caption - Caption
 * @param {string} options.description - Description
 * @param {number} options.postId - Parent post ID to attach to
 * @returns {Promise<Object>} - Uploaded media details
 */
export async function uploadMediaFromUrl(site, url, options = {}) {
  const data = {
    url,
    ...options,
    post_id: options.postId,
  };
  
  return makePluginRequest(site, '/media', 'POST', data);
}

/**
 * Upload media to WordPress from base64 data
 * @param {Object} site - Site object with connection details
 * @param {string} base64 - Base64 encoded file data (without data URI prefix)
 * @param {string} filename - Filename with extension
 * @param {Object} options - Upload options
 * @param {string} options.title - Media title
 * @param {string} options.alt - Alt text
 * @param {string} options.caption - Caption
 * @param {string} options.description - Description
 * @param {number} options.postId - Parent post ID to attach to
 * @returns {Promise<Object>} - Uploaded media details
 */
export async function uploadMediaFromBase64(site, base64, filename, options = {}) {
  // Strip data URI prefix if present
  const cleanBase64 = base64.replace(/^data:[^;]+;base64,/, '');
  
  const data = {
    base64: cleanBase64,
    filename,
    ...options,
    post_id: options.postId,
  };
  
  return makePluginRequest(site, '/media', 'POST', data);
}

/**
 * Upload media to WordPress from a Buffer
 * @param {Object} site - Site object with connection details
 * @param {Buffer} buffer - File buffer
 * @param {string} filename - Filename with extension
 * @param {Object} options - Upload options
 * @returns {Promise<Object>} - Uploaded media details
 */
export async function uploadMediaFromBuffer(site, buffer, filename, options = {}) {
  const base64 = buffer.toString('base64');
  return uploadMediaFromBase64(site, base64, filename, options);
}

/**
 * Delete media from WordPress
 * @param {Object} site - Site object with connection details
 * @param {number|string} mediaId - The WordPress attachment ID
 * @returns {Promise<Object>} - Deletion result
 */
export async function deleteMedia(site, mediaId) {
  return makePluginRequest(site, `/media/${mediaId}`, 'DELETE');
}

/**
 * Update media metadata in WordPress
 * @param {Object} site - Site object with connection details
 * @param {number|string} mediaId - The WordPress attachment ID
 * @param {Object} data - Metadata to update
 * @param {string} data.title - Media title
 * @param {string} data.alt - Alt text
 * @param {string} data.caption - Caption
 * @param {string} data.description - Description
 * @returns {Promise<Object>} - Updated media details
 */
export async function updateMedia(site, mediaId, data) {
  return makePluginRequest(site, `/media/${mediaId}`, 'PUT', data);
}

const wpApiClient = {
  getSiteInfo,
  getPostTypes,
  getPosts,
  getPost,
  getPostBySlug,
  updatePost,
  getSeoData,
  updateSeoData,
  getAcfFields,
  updateAcfFields,
  getTaxonomies,
  getTaxonomyTerms,
  getMenus,
  syncAllEntities,
  // Media functions
  getMedia,
  getMediaItem,
  uploadMediaFromUrl,
  uploadMediaFromBase64,
  uploadMediaFromBuffer,
  deleteMedia,
  updateMedia,
  // Generic request function for custom endpoints
  makePluginRequest,
};

export { makePluginRequest };
export default wpApiClient;

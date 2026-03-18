/**
 * Cloudinary Upload Utility
 * 
 * Shared Cloudinary configuration and upload helpers
 * for uploading AI-generated images and other assets.
 */

import { v2 as cloudinary } from 'cloudinary';

let _configured = false;

function ensureConfig() {
  if (_configured) return;
  const cUrl = process.env.CLOUDINARY_URL;
  if (cUrl) {
    const match = cUrl.match(/^cloudinary:\/\/([^:]+):([^@]+)@(.+)$/);
    if (match) {
      cloudinary.config({ cloud_name: match[3], api_key: match[1], api_secret: match[2], secure: true });
    }
  }
  if (!cloudinary.config().api_key) {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
      secure: true,
    });
  }
  _configured = true;
}

/**
 * Upload a base64 image to Cloudinary
 * @param {string} base64Data - Raw base64 string or data URI (data:image/...;base64,...)
 * @param {string} folder - Cloudinary folder path
 * @param {string} publicId - Public ID for the asset
 * @returns {Promise<string>} - Cloudinary secure URL
 */
export async function uploadBase64ToCloudinary(base64Data, folder, publicId) {
  ensureConfig();
  const dataUri = base64Data.startsWith('data:') ? base64Data : `data:image/png;base64,${base64Data}`;
  const result = await cloudinary.uploader.upload(dataUri, {
    folder,
    public_id: publicId,
    resource_type: 'image',
    overwrite: true,
  });
  return result.secure_url;
}

/**
 * Process HTML content: replace any base64-encoded images with Cloudinary URLs
 * @param {string} html - HTML content potentially containing base64 images
 * @param {string} folder - Cloudinary folder
 * @param {string} prefix - Public ID prefix for uploaded images
 * @returns {Promise<string>} - HTML with base64 images replaced by Cloudinary URLs
 */
export async function processBase64ImagesInHtml(html, folder, prefix) {
  if (!html || !html.includes('data:image')) return html;

  const base64ImgRegex = /<img([^>]*?)src="data:([^;]+);base64,([^"]+)"([^>]*?)>/gi;
  let match;
  const replacements = [];
  
  while ((match = base64ImgRegex.exec(html)) !== null) {
    const fullMatch = match[0];
    const beforeSrc = match[1];
    const base64Data = match[3];
    const afterSrc = match[4];
    const publicId = `${prefix}-${replacements.length + 1}-${Date.now()}`;
    
    try {
      const cdnUrl = await uploadBase64ToCloudinary(base64Data, folder, publicId);
      replacements.push({ from: fullMatch, to: `<img${beforeSrc}src="${cdnUrl}"${afterSrc}>` });
    } catch (err) {
      console.warn(`[Cloudinary] Image upload failed for ${publicId}:`, err.message);
      replacements.push({ from: fullMatch, to: '' });
    }
  }
  
  let result = html;
  for (const { from, to } of replacements) {
    result = result.replace(from, to);
  }
  
  if (replacements.length > 0) {
    console.log(`[Cloudinary] Processed ${replacements.length} base64 images: ${html.length} -> ${result.length} bytes`);
  }
  
  return result;
}

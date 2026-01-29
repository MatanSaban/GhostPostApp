import crypto from 'crypto';

/**
 * Generate a unique site key
 * Format: gp_site_{random_string}
 * @returns {string} The generated site key
 */
export function generateSiteKey() {
  const randomPart = crypto.randomBytes(16).toString('hex');
  return `gp_site_${randomPart}`;
}

/**
 * Generate a secure site secret for HMAC signing
 * @returns {string} The generated site secret (64 chars hex)
 */
export function generateSiteSecret() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Create HMAC-SHA256 signature for request validation
 * @param {string} payload - The request body as string
 * @param {number} timestamp - Unix timestamp
 * @param {string} secret - The site secret
 * @returns {string} The HMAC signature
 */
export function createSignature(payload, timestamp, secret) {
  const data = `${timestamp}.${payload}`;
  return crypto
    .createHmac('sha256', secret)
    .update(data)
    .digest('hex');
}

/**
 * Verify HMAC-SHA256 signature from WordPress plugin
 * @param {string} payload - The request body as string
 * @param {number} timestamp - Unix timestamp from header
 * @param {string} signature - The signature from header
 * @param {string} secret - The site secret
 * @param {number} maxAgeSeconds - Max age of request (default 5 minutes)
 * @returns {{ valid: boolean, error?: string }} Validation result
 */
export function verifySignature(payload, timestamp, signature, secret, maxAgeSeconds = 300) {
  // Check timestamp is recent (prevent replay attacks)
  const now = Math.floor(Date.now() / 1000);
  const age = now - timestamp;
  
  if (age > maxAgeSeconds) {
    return { valid: false, error: 'Request expired' };
  }
  
  if (age < -60) { // Allow 1 minute clock skew
    return { valid: false, error: 'Request timestamp is in the future' };
  }
  
  // Verify signature
  const expectedSignature = createSignature(payload, timestamp, secret);
  const isValid = crypto.timingSafeEqual(
    Buffer.from(signature, 'hex'),
    Buffer.from(expectedSignature, 'hex')
  );
  
  if (!isValid) {
    return { valid: false, error: 'Invalid signature' };
  }
  
  return { valid: true };
}

/**
 * Encrypt sensitive data (for temporary credential storage)
 * @param {string} text - Plain text to encrypt
 * @param {string} key - Encryption key (from env)
 * @returns {string} Encrypted text as base64
 */
export function encryptCredential(text, key = process.env.CREDENTIAL_ENCRYPTION_KEY) {
  if (!key) {
    throw new Error('CREDENTIAL_ENCRYPTION_KEY not set');
  }
  
  const iv = crypto.randomBytes(16);
  const keyBuffer = crypto.scryptSync(key, 'salt', 32);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyBuffer, iv);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  // Combine iv + authTag + encrypted data
  return Buffer.concat([iv, authTag, Buffer.from(encrypted, 'hex')]).toString('base64');
}

/**
 * Decrypt sensitive data
 * @param {string} encryptedBase64 - Encrypted text as base64
 * @param {string} key - Encryption key (from env)
 * @returns {string} Decrypted plain text
 */
export function decryptCredential(encryptedBase64, key = process.env.CREDENTIAL_ENCRYPTION_KEY) {
  if (!key) {
    throw new Error('CREDENTIAL_ENCRYPTION_KEY not set');
  }
  
  const data = Buffer.from(encryptedBase64, 'base64');
  
  const iv = data.subarray(0, 16);
  const authTag = data.subarray(16, 32);
  const encrypted = data.subarray(32);
  
  const keyBuffer = crypto.scryptSync(key, 'salt', 32);
  const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuffer, iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(encrypted, null, 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}

/**
 * Securely delete credentials from a site after plugin installation
 * @param {object} prisma - Prisma client
 * @param {string} siteId - Site ID
 */
export async function clearSiteCredentials(prisma, siteId) {
  await prisma.site.update({
    where: { id: siteId },
    data: {
      wpAdminUsername: null,
      wpAdminPassword: null,
      autoInstallExpiresAt: null,
    },
  });
}

/**
 * Generate a connection token for manual plugin setup
 * This is a short-lived token the user can paste in WP plugin settings
 * @param {string} siteId - Site ID
 * @param {string} siteKey - Site key
 * @returns {string} Connection token
 */
export function generateConnectionToken(siteId, siteKey) {
  const payload = {
    siteId,
    siteKey,
    exp: Date.now() + (30 * 60 * 1000), // 30 minutes
  };
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

/**
 * Validate and decode a connection token
 * @param {string} token - The connection token
 * @returns {{ valid: boolean, siteId?: string, siteKey?: string, error?: string }}
 */
export function validateConnectionToken(token) {
  try {
    const payload = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
    
    if (payload.exp < Date.now()) {
      return { valid: false, error: 'Token expired' };
    }
    
    return { 
      valid: true, 
      siteId: payload.siteId, 
      siteKey: payload.siteKey 
    };
  } catch (error) {
    return { valid: false, error: 'Invalid token format' };
  }
}

/**
 * Default site permissions for new sites
 */
export const DEFAULT_SITE_PERMISSIONS = [
  'CONTENT_READ',
  'CONTENT_CREATE',
  'CONTENT_UPDATE',
  'CONTENT_DELETE',
  'CONTENT_PUBLISH',
  'MEDIA_UPLOAD',
  'MEDIA_DELETE',
  'SEO_UPDATE',
  'REDIRECTS_MANAGE',
  'SITE_INFO_READ',
  'CPT_READ',
  'CPT_CREATE',
  'CPT_UPDATE',
  'CPT_DELETE',
  'ACF_READ',
  'ACF_UPDATE',
  'TAXONOMY_READ',
  'TAXONOMY_MANAGE',
];

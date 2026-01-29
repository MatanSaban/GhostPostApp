/**
 * Google OAuth utilities for Ghost Post platform
 * Handles OAuth URL generation and token exchange
 */

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';

/**
 * Get OAuth configuration from environment
 */
function getOAuthConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  
  if (!clientId || !clientSecret) {
    throw new Error('Google OAuth credentials not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env');
  }
  
  return {
    clientId,
    clientSecret,
    redirectUri: `${baseUrl}/api/auth/google/callback`,
  };
}

/**
 * Generate Google OAuth authorization URL
 * @param {Object} options
 * @param {string} options.mode - 'login' | 'register' | 'connect'
 * @param {string} options.locale - User's locale for consent page
 * @returns {string} Authorization URL
 */
export function getGoogleAuthUrl({ mode = 'login', locale = 'en' }) {
  const { clientId, redirectUri } = getOAuthConfig();
  
  // State parameter to pass mode and prevent CSRF
  const state = Buffer.from(JSON.stringify({ 
    mode, 
    timestamp: Date.now(),
    nonce: Math.random().toString(36).substring(7)
  })).toString('base64');
  
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'offline',
    prompt: 'consent',
    state,
    hl: locale, // Google UI language
  });
  
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

/**
 * Exchange authorization code for tokens
 * @param {string} code - Authorization code from Google
 * @returns {Promise<Object>} Token response
 */
export async function exchangeCodeForTokens(code) {
  const { clientId, clientSecret, redirectUri } = getOAuthConfig();
  
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
      code,
    }),
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error_description || 'Failed to exchange code for tokens');
  }
  
  return response.json();
}

/**
 * Get user info from Google
 * @param {string} accessToken - Google access token
 * @returns {Promise<Object>} User info
 */
export async function getGoogleUserInfo(accessToken) {
  const response = await fetch(GOOGLE_USERINFO_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  
  if (!response.ok) {
    throw new Error('Failed to get user info from Google');
  }
  
  const data = await response.json();
  
  return {
    id: data.id,
    email: data.email,
    emailVerified: data.verified_email,
    firstName: data.given_name || '',
    lastName: data.family_name || '',
    name: data.name,
    picture: data.picture,
  };
}

/**
 * Parse and validate state parameter
 * @param {string} stateParam - Base64 encoded state
 * @returns {Object} Parsed state
 */
export function parseState(stateParam) {
  try {
    const decoded = Buffer.from(stateParam, 'base64').toString('utf-8');
    const state = JSON.parse(decoded);
    
    // Validate timestamp (state should be less than 10 minutes old)
    const maxAge = 10 * 60 * 1000; // 10 minutes
    if (Date.now() - state.timestamp > maxAge) {
      throw new Error('State expired');
    }
    
    return state;
  } catch (error) {
    throw new Error('Invalid state parameter');
  }
}

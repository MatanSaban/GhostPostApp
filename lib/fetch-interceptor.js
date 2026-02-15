/**
 * Global fetch interceptor to handle 401 responses
 * Automatically logs out users when their token is invalid
 */

let autoLogoutHandler = null;
let originalFetch = null;

/**
 * Register a callback to be called when a 401 response is received
 * @param {Function} handler - Function to call on 401 (should handle logout)
 */
export function registerAutoLogoutHandler(handler) {
  autoLogoutHandler = handler;
}

/**
 * Enhanced fetch that intercepts 401 responses
 * Use this instead of native fetch for authenticated requests
 */
export async function authenticatedFetch(url, options = {}) {
  // Use originalFetch if available (when interceptor is set up), otherwise use global fetch
  const fetchFn = originalFetch || fetch;
  const response = await fetchFn(url, options);

  console.log(`Fetch interceptor: ${url} returned status ${response.status}`);

  // Only auto-logout on 401 (unauthenticated).
  // 403 (forbidden) means the user IS authenticated but lacks permission
  // (e.g. plan limit reached, billing permission) — do NOT log out.
  if (response.status === 401 && autoLogoutHandler) {
    console.log("Triggering auto logout from interceptor (401)");
    // Clone the response so we can still return it
    const clonedResponse = response.clone();

    // Trigger logout asynchronously to not block the response
    setTimeout(() => {
      autoLogoutHandler();
    }, 0);

    return clonedResponse;
  }

  return response;
}

/**
 * Setup global fetch interception for all API calls
 * This wraps the native fetch to automatically handle 401s
 */
export function setupGlobalFetchInterceptor() {
  if (typeof window === "undefined") return; // Only run on client

  // Only set up once - if originalFetch is already set, skip
  if (originalFetch) return;

  // Store original fetch
  originalFetch = window.fetch;

  // Override fetch
  window.fetch = async function (...args) {
    const [url, options] = args;

    // Only intercept API calls (starts with /api/)
    if (typeof url === "string" && url.startsWith("/api/")) {
      return authenticatedFetch(url, options);
    }

    // For non-API calls, use original fetch
    return originalFetch.apply(this, args);
  };
}

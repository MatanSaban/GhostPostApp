'use client';

import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { registerAutoLogoutHandler, setupGlobalFetchInterceptor } from '@/lib/fetch-interceptor';

const UserContext = createContext(undefined);

// Custom event name for credits updates
export const CREDITS_UPDATED_EVENT = 'ghostpost:credits-updated';

/**
 * Emit a credits updated event to notify all components
 * Call this after any API operation that charges credits
 * @param {number} newCreditsUsed - Optional: pass the new credits used value
 */
export function emitCreditsUpdated(newCreditsUsed = null) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(CREDITS_UPDATED_EVENT, { 
      detail: { creditsUsed: newCreditsUsed } 
    }));
  }
}

export function UserProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isVerified, setIsVerified] = useState(false); // Track if we've verified with server
  const isVerifiedRef = useRef(false); // Ref to avoid stale closure
  const router = useRouter();

  // Keep ref in sync with state
  useEffect(() => {
    isVerifiedRef.current = isVerified;
  }, [isVerified]);

  // Handle automatic logout when token is invalid
  const handleAutoLogout = useCallback(async () => {
    console.log('Auto logout triggered');

    // Prevent multiple logout calls - use localStorage check only to avoid dependency on user
    if (!localStorage.getItem('user')) {
      console.log('Already logged out, skipping');
      return;
    }

    try {
      // Call logout endpoint to clear server-side session
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (error) {
      console.error('Error during auto logout:', error);
    } finally {
      // Clear client-side data
      localStorage.removeItem('user');
      localStorage.removeItem('selectedSite');
      setUser(null);
      setIsVerified(false);
      isVerifiedRef.current = false;
      // Only redirect if not already on auth page
      if (!window.location.pathname.startsWith('/auth')) {
        router.push('/auth/login');
      }
    }
  }, [router]);

  // Keep handleAutoLogout ref updated for use in effect
  const handleAutoLogoutRef = useRef(handleAutoLogout);
  useEffect(() => {
    handleAutoLogoutRef.current = handleAutoLogout;
  }, [handleAutoLogout]);

  // Setup global fetch interceptor FIRST, before any fetch calls - runs only once
  useEffect(() => {
    console.log('Setting up fetch interceptor');
    setupGlobalFetchInterceptor();
    registerAutoLogoutHandler(() => handleAutoLogoutRef.current());

    // Initialize user from localStorage immediately (for faster UX)
    let initialUser = null;
    try {
      const storedUser = localStorage.getItem('user');
      if (storedUser) {
        initialUser = JSON.parse(storedUser);
        setUser(initialUser);
        console.log('Loaded user from localStorage:', initialUser.email);
      }
    } catch (e) {
      console.error('Error loading user from localStorage:', e);
    }

    // Fetch user after interceptor is ready (verify with server)
    async function fetchUser() {
      // Skip API verification only on auth pages with no stored user - 
      // avoids 401 spam. On other pages (e.g. /dashboard after OAuth redirect),
      // always try because a valid session cookie may exist without localStorage.
      if (!initialUser && window.location.pathname.startsWith('/auth')) {
        setIsLoading(false);
        return;
      }

      try {
        console.log('Fetching user from API...');
        const response = await fetch('/api/user/me');
        console.log('User fetch response status:', response.status);

        if (response.ok) {
          const data = await response.json();
          console.log('User verified from API:', data.user.email);
          // Merge with previous state to preserve credit data until
          // /api/credits/balance provides the authoritative values.
          setUser(prev => {
            const merged = { ...data.user };
            if (prev?.aiCreditsUsed !== undefined) {
              merged.aiCreditsUsed = prev.aiCreditsUsed;
            }
            if (prev?.aiCreditsLimit !== undefined) {
              merged.aiCreditsLimit = prev.aiCreditsLimit;
            }
            localStorage.setItem('user', JSON.stringify(merged));
            return merged;
          });
          setIsVerified(true);
          // Fetch addon-aware credit balance (authoritative source)
          try {
            const creditsRes = await fetch('/api/credits/balance');
            if (creditsRes.ok) {
              const { used, limit } = await creditsRes.json();
              if (used !== undefined) {
                setUser(prev => {
                  if (!prev) return prev;
                  const updated = { ...prev, aiCreditsUsed: used, aiCreditsLimit: limit === -1 ? null : limit };
                  localStorage.setItem('user', JSON.stringify(updated));
                  return updated;
                });
              }
            }
          } catch {
            // Non-critical - will be corrected by polling
          }
        } else if (response.status === 401 || response.status === 403) {
          // Only trigger logout if we don't have a localStorage user
          // or if we previously had a verified user
          console.log('Got 401/403 from API');
          if (!initialUser || isVerifiedRef.current) {
            console.log('Triggering logout');
            await handleAutoLogoutRef.current();
          } else {
            console.log('Keeping localStorage user, may be stale cookie');
          }
        } else {
          // Other error - clear user
          console.log('Other error, clearing user');
          setUser(null);
          localStorage.removeItem('user');
        }
      } catch (error) {
        console.error('Error fetching user:', error);
        // On network error, keep localStorage user if exists
        const storedUser = localStorage.getItem('user');
        if (storedUser && initialUser) {
          console.log('Network error, keeping localStorage user');
        } else {
          setUser(null);
        }
      } finally {
        setIsLoading(false);
      }
    }

    fetchUser();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update user in both state and localStorage
const updateUser = useCallback((userData) => {
  if (userData) {
    localStorage.setItem('user', JSON.stringify(userData));
    setUser(userData);
  } else {
    localStorage.removeItem('user');
    setUser(null);
  }
}, []);

// Clear user data (logout)
const clearUser = useCallback(() => {
  localStorage.removeItem('user');
  localStorage.removeItem('selectedSite');
  setUser(null);
}, []);

// Refresh credits from the lightweight balance endpoint (period-based, addon-aware)
const refreshCredits = useCallback(async () => {
  try {
    const res = await fetch('/api/credits/balance');
    if (res.ok) {
      const { used, limit } = await res.json();
      if (used !== undefined) {
        setUser(prev => {
          if (!prev) return prev;
          const updated = {
            ...prev,
            aiCreditsUsed: used,
            aiCreditsLimit: limit === -1 ? null : limit,
          };
          localStorage.setItem('user', JSON.stringify(updated));
          return updated;
        });
      }
    }
  } catch (error) {
    console.error('Error refreshing credits:', error);
  }
}, []);

// Listen for credits update events
useEffect(() => {
  const handleCreditsUpdated = () => {
    // Always refresh from the balance API for accurate period-based data
    refreshCredits();
  };

  window.addEventListener(CREDITS_UPDATED_EVENT, handleCreditsUpdated);
  return () => {
    window.removeEventListener(CREDITS_UPDATED_EVENT, handleCreditsUpdated);
  };
}, [refreshCredits]);

// Background polling for cross-user credit sync (every 30s when tab is visible)
useEffect(() => {
  if (!user) return;

  const POLL_INTERVAL = 30_000; // 30 seconds
  let timerId = null;

  const pollCredits = async () => {
    // Skip if tab is hidden
    if (document.visibilityState !== 'visible') return;
    try {
      const res = await fetch('/api/credits/balance');
      if (res.ok) {
        const { used, limit } = await res.json();
        if (used !== undefined) {
          setUser(prev => {
            if (!prev) return prev;
            const newLimit = limit === -1 ? null : limit;
            if (prev.aiCreditsUsed === used && prev.aiCreditsLimit === newLimit) return prev;
            const updated = { ...prev, aiCreditsUsed: used, aiCreditsLimit: newLimit };
            localStorage.setItem('user', JSON.stringify(updated));
            return updated;
          });
        }
      }
    } catch {
      // Silently ignore - next poll will retry
    }
  };

  timerId = setInterval(pollCredits, POLL_INTERVAL);

  // Also poll when tab becomes visible after being hidden
  const handleVisibility = () => {
    if (document.visibilityState === 'visible') {
      pollCredits();
    }
  };
  document.addEventListener('visibilitychange', handleVisibility);

  return () => {
    clearInterval(timerId);
    document.removeEventListener('visibilitychange', handleVisibility);
  };
}, [user?.accountId]); // Re-setup if account changes

// Heartbeat - keeps lastSeenAt fresh so admin "online now" indicators are accurate.
// Pings every 2 minutes while the tab is visible.
useEffect(() => {
  if (!user) return;

  const HEARTBEAT_INTERVAL = 120_000; // 2 minutes

  const ping = () => {
    if (document.visibilityState !== 'visible') return;
    fetch('/api/user/heartbeat', { method: 'POST' }).catch(() => {});
  };

  const timerId = setInterval(ping, HEARTBEAT_INTERVAL);
  const handleVisibility = () => {
    if (document.visibilityState === 'visible') ping();
  };
  document.addEventListener('visibilitychange', handleVisibility);

  return () => {
    clearInterval(timerId);
    document.removeEventListener('visibilitychange', handleVisibility);
  };
}, [user?.id]);

// Check if user is super admin
const isSuperAdmin = user?.isSuperAdmin === true;

return (
  <UserContext.Provider
    value={{
      user,
      isLoading,
      isSuperAdmin,
      updateUser,
      clearUser,
      refreshCredits,
      handleAutoLogout,
    }}
  >
    {children}
  </UserContext.Provider>
);
}

export function useUser() {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
}

// Helper hook for just checking admin status
export function useIsSuperAdmin() {
  const { isSuperAdmin, isLoading } = useUser();
  return { isSuperAdmin, isLoading };
}

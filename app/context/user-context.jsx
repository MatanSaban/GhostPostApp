'use client';

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { registerAutoLogoutHandler, setupGlobalFetchInterceptor } from '@/lib/fetch-interceptor';

const UserContext = createContext(undefined);

export function UserProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isVerified, setIsVerified] = useState(false); // Track if we've verified with server
  const router = useRouter();

  // Handle automatic logout when token is invalid
  const handleAutoLogout = useCallback(async () => {
    console.log('Auto logout triggered');

    // Prevent multiple logout calls
    if (!user && !localStorage.getItem('user')) {
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
      setUser(null);
      setIsVerified(false);
      // Only redirect if not already on auth page
      if (!window.location.pathname.startsWith('/auth')) {
        router.push('/auth/login');
      }
    }
  }, [router, user]);

  // Setup global fetch interceptor FIRST, before any fetch calls
  useEffect(() => {
    console.log('Setting up fetch interceptor');
    setupGlobalFetchInterceptor();
    registerAutoLogoutHandler(handleAutoLogout);

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
      // Small delay to ensure cookie is set after redirect
      await new Promise(resolve => setTimeout(resolve, 100));

      try {
        console.log('Fetching user from API...');
        const response = await fetch('/api/user/me');
        console.log('User fetch response status:', response.status);

        if (response.ok) {
          const data = await response.json();
          console.log('User verified from API:', data.user.email);
          setUser(data.user);
          setIsVerified(true);
          localStorage.setItem('user', JSON.stringify(data.user));
        } else if (response.status === 401 || response.status === 403) {
          // Only trigger logout if we don't have a localStorage user
          // or if we previously had a verified user
          console.log('Got 401/403 from API');
          if (!initialUser || isVerified) {
            console.log('Triggering logout');
            await handleAutoLogout();
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
  }, [handleAutoLogout, isVerified]);

  fetchUser();
}, [handleAutoLogout]);

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
  setUser(null);
}, []);

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

'use client';

import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const UserContext = createContext(undefined);

export function UserProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch user from API on mount (more reliable than localStorage)
  useEffect(() => {
    async function fetchUser() {
      try {
        const response = await fetch('/api/user/me');
        if (response.ok) {
          const data = await response.json();
          setUser(data.user);
          // Also update localStorage for backward compatibility
          localStorage.setItem('user', JSON.stringify(data.user));
        } else {
          // Not authenticated or error - clear user
          setUser(null);
          localStorage.removeItem('user');
        }
      } catch (error) {
        console.error('Error fetching user:', error);
        // Fallback to localStorage if API fails
        try {
          const storedUser = localStorage.getItem('user');
          if (storedUser) {
            setUser(JSON.parse(storedUser));
          }
        } catch (e) {
          console.error('Error loading user from localStorage:', e);
        }
      } finally {
        setIsLoading(false);
      }
    }

    fetchUser();
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

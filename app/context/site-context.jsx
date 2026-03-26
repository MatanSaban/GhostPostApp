'use client';

import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useUser } from '@/app/context/user-context';

const SiteContext = createContext({
  selectedSite: null,
  setSelectedSite: () => {},
  sites: [],
  setSites: () => {},
  isLoading: true,
  refreshSites: () => {},
});

// Restore cached site from localStorage for instant render (avoids flash)
function getCachedSite() {
  try {
    const cached = localStorage.getItem('selectedSite');
    return cached ? JSON.parse(cached) : null;
  } catch { return null; }
}

function cacheSite(site) {
  try {
    if (site) {
      localStorage.setItem('selectedSite', JSON.stringify(site));
    } else {
      localStorage.removeItem('selectedSite');
    }
  } catch { /* ignore */ }
}

export function SiteProvider({ children }) {
  const { user, isLoading: isUserLoading } = useUser();
  const [selectedSite, setSelectedSiteRaw] = useState(getCachedSite);
  const [sites, setSites] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const loadedForUserRef = useRef(null); // track which user ID we've already loaded sites for

  // Wrap setSelectedSite to also persist to localStorage
  const setSelectedSite = useCallback((siteOrUpdater) => {
    setSelectedSiteRaw(prev => {
      const next = typeof siteOrUpdater === 'function' ? siteOrUpdater(prev) : siteOrUpdater;
      cacheSite(next);
      return next;
    });
  }, []);

  // Load sites from API
  const loadSites = useCallback(async () => {
    try {
      const response = await fetch('/api/sites');
      if (response.ok) {
        const data = await response.json();
        const freshSites = data.sites || [];
        setSites(freshSites);

        // Reconcile selected site with fresh data
        setSelectedSiteRaw(prev => {
          if (prev) {
            // Refresh the cached site with latest server data
            const updated = freshSites.find(s => s.id === prev.id);
            if (updated) { cacheSite(updated); return updated; }
          }
          // No cached site – use last selected from DB or first site
          if (freshSites.length > 0) {
            const lastSelected = data.lastSelectedSiteId
              ? freshSites.find(s => s.id === data.lastSelectedSiteId)
              : null;
            const pick = lastSelected || freshSites[0];
            cacheSite(pick);
            return pick;
          }
          return prev;
        });
      }
    } catch (error) {
      console.error('Failed to load sites:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Load sites when user is available – only once per user ID
  useEffect(() => {
    if (isUserLoading) return;
    if (!user) {
      setIsLoading(false);
      loadedForUserRef.current = null;
      return;
    }
    // Skip re-fetch if we already loaded for this user
    if (loadedForUserRef.current === user.id) return;
    loadedForUserRef.current = user.id;
    loadSites();
  }, [user, isUserLoading, loadSites]);

  // Refresh sites (can be called after updates)
  const refreshSites = useCallback(() => {
    loadSites();
  }, [loadSites]);

  return (
    <SiteContext.Provider value={{ selectedSite, setSelectedSite, sites, setSites, isLoading, refreshSites }}>
      {children}
    </SiteContext.Provider>
  );
}

export function useSite() {
  const context = useContext(SiteContext);
  if (!context) {
    throw new Error('useSite must be used within a SiteProvider');
  }
  return context;
}

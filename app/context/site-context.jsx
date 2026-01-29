'use client';

import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const SiteContext = createContext({
  selectedSite: null,
  setSelectedSite: () => {},
  sites: [],
  setSites: () => {},
  isLoading: true,
  refreshSites: () => {},
});

export function SiteProvider({ children }) {
  const [selectedSite, setSelectedSite] = useState(null);
  const [sites, setSites] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // Load sites from API
  const loadSites = useCallback(async () => {
    try {
      const response = await fetch('/api/sites');
      if (response.ok) {
        const data = await response.json();
        setSites(data.sites || []);
        
        // Update selected site if it exists in the new list
        if (selectedSite) {
          const updatedSite = data.sites?.find(s => s.id === selectedSite.id);
          if (updatedSite) {
            setSelectedSite(updatedSite);
          }
        } else if (data.sites?.length > 0) {
          // Use user's last selected site from database, or fallback to first site
          const lastSelectedSite = data.lastSelectedSiteId 
            ? data.sites.find(s => s.id === data.lastSelectedSiteId)
            : null;
          setSelectedSite(lastSelectedSite || data.sites[0]);
        }
      }
    } catch (error) {
      console.error('Failed to load sites:', error);
    } finally {
      setIsLoading(false);
    }
  }, [selectedSite]);

  // Load sites on mount
  useEffect(() => {
    loadSites();
  }, []);

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

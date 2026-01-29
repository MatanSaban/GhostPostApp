'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  hasPermission, 
  canAccess,
  canAccessSettingsTab, 
  canEditSettingsTab,
  filterSettingsTabs,
  canAccessPath,
  getModuleForPath,
  SETTINGS_TAB_TO_MODULE,
  PATH_TO_MODULE,
  CAPABILITIES,
  getPermissionKey 
} from '@/lib/permissions';

/**
 * Hook to fetch and manage current user's permissions for the selected account
 */
export function usePermissions() {
  const [permissions, setPermissions] = useState([]);
  const [role, setRole] = useState(null);
  const [isOwner, setIsOwner] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchPermissions = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const response = await fetch('/api/user/permissions');
      
      if (!response.ok) {
        throw new Error('Failed to fetch permissions');
      }
      
      const data = await response.json();
      
      setPermissions(data.permissions || []);
      setRole(data.role);
      setIsOwner(data.isOwner);
    } catch (err) {
      console.error('Error fetching permissions:', err);
      setError(err.message);
      setPermissions([]);
      setRole(null);
      setIsOwner(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPermissions();
  }, [fetchPermissions]);

  // Create a pseudo-member object for the permission functions
  const member = useMemo(() => ({
    isOwner,
    role: role ? { permissions } : null,
  }), [isOwner, role, permissions]);

  /**
   * Check if user has a specific permission
   */
  const checkPermission = useCallback((module, capability) => {
    return hasPermission(member, module, capability);
  }, [member]);

  /**
   * Check if user can perform an action (enforces VIEW requirement)
   */
  const checkAccess = useCallback((module, capability) => {
    return canAccess(member, module, capability);
  }, [member]);

  /**
   * Check if user can access a settings tab
   */
  const canAccessTab = useCallback((tabId) => {
    return canAccessSettingsTab(member, tabId);
  }, [member]);

  /**
   * Check if user can edit a settings tab
   */
  const canEditTab = useCallback((tabId) => {
    return canEditSettingsTab(member, tabId);
  }, [member]);

  /**
   * Filter settings tabs based on user permissions
   */
  const filterTabs = useCallback((tabs) => {
    return filterSettingsTabs(member, tabs);
  }, [member]);

  /**
   * Check if user has a raw permission key (e.g., 'SITES_VIEW')
   */
  const hasRawPermission = useCallback((permissionKey) => {
    if (isOwner || permissions.includes('*')) {
      return true;
    }
    return permissions.includes(permissionKey);
  }, [permissions, isOwner]);

  /**
   * Check if user can access a specific path/page
   */
  const canViewPath = useCallback((path) => {
    return canAccessPath(member, path);
  }, [member]);

  /**
   * Filter menu items based on user permissions
   * @param {Array} menuItems - Array of menu items with 'path' property
   * @returns {Array} Filtered menu items the user can access
   */
  const filterMenuItems = useCallback((menuItems) => {
    return menuItems.filter(item => canAccessPath(member, item.path));
  }, [member]);

  return {
    permissions,
    role,
    isOwner,
    isLoading,
    error,
    checkPermission,
    checkAccess,
    canAccessTab,
    canEditTab,
    filterTabs,
    hasRawPermission,
    canViewPath,
    filterMenuItems,
    refresh: fetchPermissions,
  };
}

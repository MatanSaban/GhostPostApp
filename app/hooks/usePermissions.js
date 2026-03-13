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
  MODULES,
  getPermissionKey 
} from '@/lib/permissions';

// Re-export constants so components can import them from the hook
export { MODULES, CAPABILITIES };

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
   * Check if user can access at least one settings tab
   */
  const canAccessAnySettingsTab = useCallback(() => {
    const allTabIds = Object.keys(SETTINGS_TAB_TO_MODULE);
    return allTabIds.some(tabId => canAccessSettingsTab(member, tabId));
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

  // ============================================
  // Module-specific permission helpers
  // These make it easy to check permissions for specific features
  // ============================================

  /**
   * Check if user can view a module
   * @param {string} module - Module key from MODULES (e.g., 'ENTITIES', 'KEYWORDS')
   */
  const canView = useCallback((module) => {
    return canAccess(member, module, CAPABILITIES.VIEW);
  }, [member]);

  /**
   * Check if user can create in a module
   * @param {string} module - Module key from MODULES
   */
  const canCreate = useCallback((module) => {
    return canAccess(member, module, CAPABILITIES.CREATE);
  }, [member]);

  /**
   * Check if user can edit in a module
   * @param {string} module - Module key from MODULES
   */
  const canEdit = useCallback((module) => {
    return canAccess(member, module, CAPABILITIES.EDIT);
  }, [member]);

  /**
   * Check if user can delete in a module
   * @param {string} module - Module key from MODULES
   */
  const canDelete = useCallback((module) => {
    return canAccess(member, module, CAPABILITIES.DELETE);
  }, [member]);

  /**
   * Check if user can publish in a module (special capability for ENTITIES)
   * @param {string} module - Module key from MODULES
   */
  const canPublish = useCallback((module) => {
    return canAccess(member, module, 'PUBLISH');
  }, [member]);

  /**
   * Get all permission states for a module at once
   * Useful for components that need to check multiple permissions
   * @param {string} module - Module key from MODULES
   * @returns {{ canView: boolean, canCreate: boolean, canEdit: boolean, canDelete: boolean, canPublish: boolean }}
   */
  const getModulePermissions = useCallback((module) => {
    return {
      canView: canAccess(member, module, CAPABILITIES.VIEW),
      canCreate: canAccess(member, module, CAPABILITIES.CREATE),
      canEdit: canAccess(member, module, CAPABILITIES.EDIT),
      canDelete: canAccess(member, module, CAPABILITIES.DELETE),
      canPublish: canAccess(member, module, 'PUBLISH'),
    };
  }, [member]);

  return {
    permissions,
    role,
    isOwner,
    isLoading,
    error,
    // Generic permission checks
    checkPermission,
    checkAccess,
    hasRawPermission,
    // Settings-specific
    canAccessTab,
    canAccessAnySettingsTab,
    canEditTab,
    filterTabs,
    // Path-based checks
    canViewPath,
    filterMenuItems,
    // Module-specific helpers (RECOMMENDED for feature pages)
    canView,
    canCreate,
    canEdit,
    canDelete,
    canPublish,
    getModulePermissions,
    // Constants for module keys
    MODULES,
    // Refresh function
    refresh: fetchPermissions,
  };
}

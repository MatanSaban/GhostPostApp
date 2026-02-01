/**
 * Permission system for Ghost Post
 * 
 * This module provides functions to check user permissions throughout the app.
 * Permissions follow the format: MODULE_CAPABILITY (e.g., SITES_VIEW, CONTENT_EDIT)
 * 
 * Rules:
 * - If a user doesn't have VIEW permission for a module, they can't EDIT or DELETE
 * - Account owners have all permissions automatically
 * - System roles have predefined permissions that can be modified
 */

// Standard capabilities
export const CAPABILITIES = {
  VIEW: 'VIEW',
  CREATE: 'CREATE',
  EDIT: 'EDIT',
  DELETE: 'DELETE',
};

// All modules in the system
export const MODULES = {
  // Core modules
  ACCOUNT: 'ACCOUNT',
  MEMBERS: 'MEMBERS',
  ROLES: 'ROLES',
  SITES: 'SITES',
  CONTENT: 'CONTENT',
  KEYWORDS: 'KEYWORDS',
  REDIRECTIONS: 'REDIRECTIONS',
  INTERVIEW: 'INTERVIEW',
  AUDIT: 'AUDIT',
  // Settings tabs
  SETTINGS_GENERAL: 'SETTINGS_GENERAL',
  SETTINGS_AI: 'SETTINGS_AI',
  SETTINGS_SCHEDULING: 'SETTINGS_SCHEDULING',
  SETTINGS_NOTIFICATIONS: 'SETTINGS_NOTIFICATIONS',
  SETTINGS_SEO: 'SETTINGS_SEO',
  SETTINGS_INTEGRATIONS: 'SETTINGS_INTEGRATIONS',
  SETTINGS_TEAM: 'SETTINGS_TEAM',
  SETTINGS_ROLES: 'SETTINGS_ROLES',
  SETTINGS_SUBSCRIPTION: 'SETTINGS_SUBSCRIPTION',
};

// Map settings tab IDs to module keys
export const SETTINGS_TAB_TO_MODULE = {
  'general': 'SETTINGS_GENERAL',
  'ai-configuration': 'SETTINGS_AI',
  'scheduling': 'SETTINGS_SCHEDULING',
  'notifications': 'SETTINGS_NOTIFICATIONS',
  'seo': 'SETTINGS_SEO',
  'integrations': 'SETTINGS_INTEGRATIONS',
  'users': 'MEMBERS', // Users tab requires MEMBERS permissions
  'team': 'SETTINGS_TEAM',
  'roles': 'SETTINGS_ROLES',
  'permissions': 'SETTINGS_ROLES', // Permissions tab uses same permissions as roles
  'subscription': 'SETTINGS_SUBSCRIPTION',
  'account': 'ACCOUNT',
};

// Map dashboard paths to module keys for page/menu access control
export const PATH_TO_MODULE = {
  '/dashboard': null, // Dashboard is always accessible
  '/dashboard/site-interview': 'INTERVIEW',
  '/dashboard/content-planner': 'CONTENT',
  '/dashboard/automations': 'CONTENT', // Part of content management
  '/dashboard/link-building': 'CONTENT',
  '/dashboard/redirections': 'REDIRECTIONS',
  '/dashboard/seo-frontend': 'AUDIT',
  '/dashboard/seo-backend': 'AUDIT',
  '/dashboard/site-audit': 'AUDIT',
  '/dashboard/strategy/keywords': 'KEYWORDS',
  '/dashboard/entities': 'CONTENT', // Entities are content types
  '/dashboard/settings': null, // Settings page handles its own tab permissions
};

/**
 * Get the module key for a given path
 * @param {string} path - The path to check
 * @returns {string|null} The module key or null if no permission required
 */
export function getModuleForPath(path) {
  // Exact match first
  if (PATH_TO_MODULE.hasOwnProperty(path)) {
    return PATH_TO_MODULE[path];
  }
  
  // Check for path prefixes (e.g., /dashboard/entities/blog-posts)
  for (const [basePath, module] of Object.entries(PATH_TO_MODULE)) {
    if (path.startsWith(basePath + '/')) {
      return module;
    }
  }
  
  return null;
}

/**
 * Check if a user can access a given path
 * @param {Object} member - Account member object with role and isOwner
 * @param {string} path - The path to check
 * @returns {boolean}
 */
export function canAccessPath(member, path) {
  // Owners can access everything
  if (member?.isOwner) {
    return true;
  }
  
  const permModule = getModuleForPath(path);
  
  // If no module is required, allow access
  if (!permModule) {
    return true;
  }
  
  return hasPermission(member, permModule, CAPABILITIES.VIEW);
}

/**
 * Generate permission key from module and capability
 */
export function getPermissionKey(module, capability) {
  return `${module.toUpperCase()}_${capability.toUpperCase()}`;
}

/**
 * Check if user has a specific permission
 * @param {Object} member - Account member object with role and isOwner
 * @param {string} module - Module ID (e.g., 'SITES', 'CONTENT')
 * @param {string} capability - Capability (e.g., 'VIEW', 'EDIT', 'DELETE')
 * @returns {boolean}
 */
export function hasPermission(member, module, capability) {
  // Owners have all permissions
  if (member?.isOwner) {
    return true;
  }

  const role = member?.role;
  if (!role?.permissions) {
    return false;
  }

  const permissionKey = getPermissionKey(module, capability);
  return role.permissions.includes(permissionKey);
}

/**
 * Check if user can perform an action on a module
 * This enforces the rule: no VIEW = no EDIT/DELETE
 * @param {Object} member - Account member object with role and isOwner
 * @param {string} module - Module ID
 * @param {string} capability - Capability
 * @returns {boolean}
 */
export function canAccess(member, module, capability) {
  // Owners have all permissions
  if (member?.isOwner) {
    return true;
  }

  // If capability is EDIT or DELETE, first check VIEW permission
  if (capability === CAPABILITIES.EDIT || capability === CAPABILITIES.DELETE) {
    if (!hasPermission(member, module, CAPABILITIES.VIEW)) {
      return false;
    }
  }

  return hasPermission(member, module, capability);
}

/**
 * Check if user can access a settings tab
 * @param {Object} member - Account member object
 * @param {string} tabId - Settings tab ID (e.g., 'general', 'ai-configuration')
 * @returns {boolean}
 */
export function canAccessSettingsTab(member, tabId) {
  // Owners can access everything
  if (member?.isOwner) {
    return true;
  }

  const moduleKey = SETTINGS_TAB_TO_MODULE[tabId];
  if (!moduleKey) {
    return false;
  }

  return hasPermission(member, moduleKey, CAPABILITIES.VIEW);
}

/**
 * Check if user can edit a settings tab
 * @param {Object} member - Account member object
 * @param {string} tabId - Settings tab ID
 * @returns {boolean}
 */
export function canEditSettingsTab(member, tabId) {
  // Owners can edit everything
  if (member?.isOwner) {
    return true;
  }

  const moduleKey = SETTINGS_TAB_TO_MODULE[tabId];
  if (!moduleKey) {
    return false;
  }

  return canAccess(member, moduleKey, CAPABILITIES.EDIT);
}

/**
 * Get all permissions the user has
 * @param {Object} member - Account member object
 * @returns {string[]} Array of permission keys
 */
export function getUserPermissions(member) {
  if (member?.isOwner) {
    // Return all possible permissions for owners
    return getAllPermissions();
  }
  return member?.role?.permissions || [];
}

/**
 * Get all possible permissions in the system
 * @returns {string[]}
 */
export function getAllPermissions() {
  const permissions = [];
  
  const moduleCapabilities = {
    ACCOUNT: ['VIEW', 'EDIT', 'DELETE', 'BILLING_VIEW', 'BILLING_MANAGE'],
    MEMBERS: ['VIEW', 'INVITE', 'EDIT', 'DELETE'],
    ROLES: ['VIEW', 'CREATE', 'EDIT', 'DELETE'],
    SITES: ['VIEW', 'CREATE', 'EDIT', 'DELETE'],
    CONTENT: ['VIEW', 'CREATE', 'EDIT', 'DELETE', 'PUBLISH'],
    KEYWORDS: ['VIEW', 'CREATE', 'EDIT', 'DELETE'],
    REDIRECTIONS: ['VIEW', 'CREATE', 'EDIT', 'DELETE'],
    INTERVIEW: ['VIEW', 'EDIT'],
    AUDIT: ['VIEW', 'RUN'],
    SETTINGS_GENERAL: ['VIEW', 'EDIT'],
    SETTINGS_AI: ['VIEW', 'EDIT'],
    SETTINGS_SCHEDULING: ['VIEW', 'EDIT'],
    SETTINGS_NOTIFICATIONS: ['VIEW', 'EDIT'],
    SETTINGS_SEO: ['VIEW', 'EDIT'],
    SETTINGS_INTEGRATIONS: ['VIEW', 'EDIT'],
    SETTINGS_TEAM: ['VIEW', 'EDIT'],
    SETTINGS_ROLES: ['VIEW', 'EDIT'],
    SETTINGS_SUBSCRIPTION: ['VIEW', 'EDIT'],
  };

  for (const [module, caps] of Object.entries(moduleCapabilities)) {
    for (const cap of caps) {
      permissions.push(getPermissionKey(module, cap));
    }
  }

  return permissions;
}

/**
 * Filter settings tabs based on user permissions
 * @param {Object} member - Account member object
 * @param {Array} tabs - Array of settings tabs
 * @returns {Array} Filtered tabs the user can access
 */
export function filterSettingsTabs(member, tabs) {
  if (member?.isOwner) {
    return tabs;
  }

  return tabs.filter(tab => canAccessSettingsTab(member, tab.id));
}

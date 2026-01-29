import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';

const SESSION_COOKIE = 'user_session';

// All modules with their capabilities (view, create, edit, delete, and special permissions)
// Each module maps to a settings tab or feature area
const MODULES = [
  { 
    id: 'account', 
    capabilities: ['view', 'edit', 'delete'],
    special: ['billing_view', 'billing_manage'] 
  },
  { 
    id: 'members', 
    capabilities: ['view', 'edit', 'delete'],
    special: ['invite'] 
  },
  { 
    id: 'roles', 
    capabilities: ['view', 'edit', 'delete'],
    special: ['create'] 
  },
  { 
    id: 'sites', 
    capabilities: ['view', 'edit', 'delete'],
    special: ['create'] 
  },
  { 
    id: 'content', 
    capabilities: ['view', 'edit', 'delete'],
    special: ['create', 'publish'] 
  },
  { 
    id: 'keywords', 
    capabilities: ['view', 'edit', 'delete'],
    special: ['create'] 
  },
  { 
    id: 'redirections', 
    capabilities: ['view', 'edit', 'delete'],
    special: ['create'] 
  },
  { 
    id: 'interview', 
    capabilities: ['view', 'edit'],
    special: [] 
  },
  { 
    id: 'audit', 
    capabilities: ['view'],
    special: ['run'] 
  },
  // Settings tabs as modules
  { 
    id: 'settings_general', 
    capabilities: ['view', 'edit'],
    special: [] 
  },
  { 
    id: 'settings_ai', 
    capabilities: ['view', 'edit'],
    special: [] 
  },
  { 
    id: 'settings_scheduling', 
    capabilities: ['view', 'edit'],
    special: [] 
  },
  { 
    id: 'settings_notifications', 
    capabilities: ['view', 'edit'],
    special: [] 
  },
  { 
    id: 'settings_seo', 
    capabilities: ['view', 'edit'],
    special: [] 
  },
  { 
    id: 'settings_integrations', 
    capabilities: ['view', 'edit'],
    special: [] 
  },
  { 
    id: 'settings_users', 
    capabilities: ['view', 'edit'],
    special: [] 
  },
  { 
    id: 'settings_team', 
    capabilities: ['view', 'edit'],
    special: [] 
  },
  { 
    id: 'settings_roles', 
    capabilities: ['view', 'edit'],
    special: [] 
  },
  { 
    id: 'settings_subscription', 
    capabilities: ['view', 'edit'],
    special: [] 
  },
];

// Generate permission key from module and capability
function getPermissionKey(moduleId, capability) {
  return `${moduleId.toUpperCase()}_${capability.toUpperCase()}`;
}

// Get all permissions for a module
function getModulePermissions(module) {
  const permissions = [];
  for (const cap of module.capabilities) {
    permissions.push(getPermissionKey(module.id, cap));
  }
  for (const special of module.special) {
    permissions.push(getPermissionKey(module.id, special));
  }
  return permissions;
}

// Get all available permissions
function getAllPermissions() {
  const all = [];
  for (const mod of MODULES) {
    all.push(...getModulePermissions(mod));
  }
  return all;
}

// Verify user is authenticated
async function verifyAuth() {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get(SESSION_COOKIE)?.value;

    if (!userId) {
      return null;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });

    return user;
  } catch (error) {
    console.error('Auth error:', error);
    return null;
  }
}

// GET - Fetch all available permissions structured by modules
export async function GET() {
  try {
    const user = await verifyAuth();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Return modules with their capabilities
    const modules = MODULES.map(module => ({
      id: module.id,
      capabilities: module.capabilities,
      special: module.special,
      permissions: getModulePermissions(module),
    }));

    // Also return flat list for convenience
    const allPermissions = getAllPermissions();

    return NextResponse.json({
      modules,
      permissions: allPermissions,
    });
  } catch (error) {
    console.error('Error fetching permissions:', error);
    return NextResponse.json({ error: 'Failed to fetch permissions' }, { status: 500 });
  }
}

// Note: MODULES, getPermissionKey, getAllPermissions are defined locally in this file
// If needed elsewhere, import from @/lib/permissions.js instead


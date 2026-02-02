import { cookies } from "next/headers";
import prisma from "@/lib/prisma";
import {
  hasPermission,
  canAccess,
  CAPABILITIES,
  getAllPermissions,
} from "@/lib/permissions";

const SESSION_COOKIE = "user_session";

/**
 * Get the current authenticated user's account membership
 * This includes the user's role and permissions for the currently selected account
 * @returns {Promise<{authorized: boolean, member: Object|null, error: string|null}>}
 */
export async function getCurrentAccountMember() {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get(SESSION_COOKIE)?.value;

    if (!userId) {
      return { authorized: false, member: null, error: "Unauthorized" };
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        isActive: true,
        lastSelectedAccountId: true,
        accountMemberships: {
          select: {
            id: true,
            accountId: true,
            status: true,
            isOwner: true,
            role: {
              select: {
                id: true,
                name: true,
                description: true,
                permissions: true,
                isSystemRole: true,
              },
            },
            account: {
              select: {
                id: true,
                name: true,
                slug: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      return { authorized: false, member: null, error: "User not found" };
    }

    // Check if user is active
    if (!user.isActive) {
      return {
        authorized: false,
        member: null,
        error: "User account is inactive",
      };
    }

    // Get the membership for the current account
    // If no account selected, use the first active membership
    let accountId = user.lastSelectedAccountId;

    if (!accountId && user.accountMemberships.length > 0) {
      // Find first ACTIVE membership
      const activeMembership = user.accountMemberships.find(
        (m) => m.status === "ACTIVE",
      );
      if (activeMembership) {
        accountId = activeMembership.accountId;
      }
    }

    if (!accountId) {
      return { authorized: false, member: null, error: "No account selected" };
    }

    const membership = user.accountMemberships.find(
      (m) => m.accountId === accountId,
    );
    if (!membership) {
      return {
        authorized: false,
        member: null,
        error: "Not a member of this account",
      };
    }

    const member = {
      userId: user.id,
      accountId,
      membership,
      role: membership.role,
      isOwner: membership.isOwner,
      account: membership.account,
    };

    return { authorized: true, member, error: null };
  } catch (error) {
    console.error("Auth error:", error);
    return { authorized: false, member: null, error: "Authentication failed" };
  }
}

/**
 * Check if the current user can perform an action
 * This enforces the rule: no VIEW = no EDIT/DELETE
 * @param {string} module - Module ID (e.g., 'SITES', 'CONTENT')
 * @param {string} capability - Capability (e.g., 'VIEW', 'EDIT', 'DELETE')
 * @returns {Promise<{authorized: boolean, member: Object|null, error: string|null}>}
 */
export async function checkPermission(module, capability) {
  const result = await getCurrentAccountMember();

  if (!result.authorized) {
    return result;
  }

  const member = result.member;

  // Owners have all permissions
  if (member.isOwner) {
    return { authorized: true, member, error: null };
  }

  // Check permission
  const hasAccess = canAccess(member, module, capability);

  if (!hasAccess) {
    return { authorized: false, member, error: "Forbidden" };
  }

  return { authorized: true, member, error: null };
}

/**
 * Check if user has permission for a specific module and capability
 * Simple wrapper around hasPermission
 * @param {Object} member - Account member object
 * @param {string} module - Module ID
 * @param {string} capability - Capability
 * @returns {boolean}
 */
export function memberHasPermission(member, module, capability) {
  return canAccess(member, module, capability);
}

/**
 * Get all permissions the current user has
 * @returns {Promise<string[]>}
 */
export async function getCurrentUserPermissions() {
  const result = await getCurrentAccountMember();

  if (!result.authorized || !result.member) {
    return [];
  }

  const member = result.member;

  // Owners have all permissions
  if (member.isOwner) {
    return getAllPermissions();
  }

  return member.role?.permissions || [];
}

/**
 * Filter settings tabs based on user's permissions
 * @param {Object} member - Account member
 * @param {Array} tabs - Settings tabs array
 * @returns {Array} Filtered tabs
 */
export function filterSettingsTabsByPermission(member, tabs) {
  if (member?.isOwner) {
    return tabs;
  }

  const tabToModule = {
    general: "SETTINGS_GENERAL",
    "ai-configuration": "SETTINGS_AI",
    scheduling: "SETTINGS_SCHEDULING",
    notifications: "SETTINGS_NOTIFICATIONS",
    seo: "SETTINGS_SEO",
    integrations: "SETTINGS_INTEGRATIONS",
    team: "SETTINGS_TEAM",
    roles: "SETTINGS_ROLES",
    permissions: "SETTINGS_ROLES",
    subscription: "SETTINGS_SUBSCRIPTION",
    account: "ACCOUNT",
  };

  return tabs.filter((tab) => {
    const moduleKey = tabToModule[tab.id];
    if (!moduleKey) return true; // Allow tabs without module mapping
    return canAccess(member, moduleKey, "VIEW");
  });
}

// Re-export for convenience
export { CAPABILITIES, hasPermission, canAccess };

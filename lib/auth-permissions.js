import { cookies } from "next/headers";
import prisma from "@/lib/prisma";
import {
  hasPermission,
  canAccess,
  CAPABILITIES,
  getAllPermissions,
} from "@/lib/permissions";
import { getActiveImpersonation } from "@/lib/impersonation-context";

const SESSION_COOKIE = "user_session";

/**
 * Get the current authenticated user's account membership
 * This includes the user's role and permissions for the currently selected account
 *
 * IMPERSONATION: If the request carries a valid impersonation cookie, the
 * resolved member context is for the *target* user — every downstream call
 * (permissions, data scoping, audit) sees the target user. The original admin
 * identity is surfaced via `result.impersonation` so callers can render
 * banners, skip permission denials, or attach audit metadata.
 *
 * @returns {Promise<{authorized: boolean, member: Object|null, error: string|null, isSuperAdmin: boolean, impersonation: Object|null}>}
 */
export async function getCurrentAccountMember() {
  try {
    const cookieStore = await cookies();
    const realUserId = cookieStore.get(SESSION_COOKIE)?.value;

    if (!realUserId) {
      return { authorized: false, member: null, error: "Unauthorized", isSuperAdmin: false, impersonation: null };
    }

    // If a live impersonation session is in effect, swap the resolved userId
    // BEFORE we do the user lookup. Everything downstream (permissions,
    // account scoping) then runs against the target user.
    const impersonation = await getActiveImpersonation();
    const userId = impersonation ? impersonation.targetUserId : realUserId;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        isActive: true,
        isSuperAdmin: true,
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
                archivedAt: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      return { authorized: false, member: null, error: "User not found", isSuperAdmin: false, impersonation: null };
    }

    // Check if user is active
    if (!user.isActive) {
      return {
        authorized: false,
        member: null,
        error: "User account is inactive",
        isSuperAdmin: false,
        impersonation: null,
      };
    }

    // SuperAdmin users have full access without needing account membership.
    // We deliberately don't surface this branch through impersonation: a
    // target user with isSuperAdmin=true is a misconfiguration (admins should
    // never grant impersonation to other admins). Treat it as the admin
    // operating normally.
    if (user.isSuperAdmin) {
      return {
        authorized: true,
        member: {
          userId: user.id,
          accountId: null,
          membership: null,
          role: { name: 'SuperAdmin', permissions: ['*'] },
          isOwner: true,
          account: null,
        },
        error: null,
        isSuperAdmin: true,
        impersonation: null,
      };
    }

    // Get the membership for the current account.
    // Never resolve to an archived account - archived accounts are restore-only,
    // not usable for normal operations. If lastSelectedAccountId points to one,
    // fall through to the first active, non-archived membership.
    //
    // When impersonating, ignore lastSelectedAccountId and always scope to the
    // accountId recorded on the impersonation session — the admin chose which
    // account to assist with at session-start time.
    const isArchived = (m) => !!m?.account?.archivedAt;
    let accountId = null;
    const preferredAccountId = impersonation
      ? impersonation.targetAccountId
      : user.lastSelectedAccountId;
    if (preferredAccountId) {
      const selected = user.accountMemberships.find(
        (m) => m.accountId === preferredAccountId,
      );
      if (selected && selected.status === "ACTIVE" && !isArchived(selected)) {
        accountId = selected.accountId;
      }
    }

    if (!accountId && !impersonation) {
      const activeMembership = user.accountMemberships.find(
        (m) => m.status === "ACTIVE" && !isArchived(m),
      );
      if (activeMembership) {
        accountId = activeMembership.accountId;
      }
    }

    if (!accountId) {
      return {
        authorized: false,
        member: null,
        error: "ACCOUNT_ARCHIVED_OR_NONE",
        isSuperAdmin: false,
        impersonation: null,
      };
    }

    const membership = user.accountMemberships.find(
      (m) => m.accountId === accountId,
    );
    if (!membership) {
      return {
        authorized: false,
        member: null,
        error: "Not a member of this account",
        isSuperAdmin: false,
        impersonation: null,
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

    return {
      authorized: true,
      member,
      error: null,
      isSuperAdmin: false,
      impersonation: impersonation
        ? {
            sessionId: impersonation.sessionId,
            grantId: impersonation.grantId,
            adminUserId: impersonation.adminUserId,
            scope: impersonation.scope,
            startedAt: impersonation.startedAt,
            expiresAt: impersonation.expiresAt,
          }
        : null,
    };
  } catch (error) {
    console.error("Auth error:", error);
    return { authorized: false, member: null, error: "Authentication failed", isSuperAdmin: false, impersonation: null };
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

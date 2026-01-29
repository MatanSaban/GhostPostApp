/**
 * Script to update all Owner roles with all permissions
 * and clean up legacy permission values
 * Run with: node scripts/update-owner-permissions.js
 */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Legacy permissions that need to be replaced
const LEGACY_PERMISSION_MAPPING = {
  'INTERVIEW_MANAGE': 'INTERVIEW_EDIT',
  'SETTINGS_VIEW': 'SETTINGS_GENERAL_VIEW',
  'SETTINGS_EDIT': 'SETTINGS_GENERAL_EDIT',
};

// All available permissions
const ALL_PERMISSIONS = [
  // Account Management
  'ACCOUNT_VIEW',
  'ACCOUNT_EDIT',
  'ACCOUNT_DELETE',
  'ACCOUNT_BILLING_VIEW',
  'ACCOUNT_BILLING_MANAGE',

  // Member Management
  'MEMBERS_VIEW',
  'MEMBERS_INVITE',
  'MEMBERS_EDIT',
  'MEMBERS_REMOVE',

  // Role Management
  'ROLES_VIEW',
  'ROLES_CREATE',
  'ROLES_EDIT',
  'ROLES_DELETE',

  // Site Management
  'SITES_VIEW',
  'SITES_CREATE',
  'SITES_EDIT',
  'SITES_DELETE',

  // Content Management
  'CONTENT_VIEW',
  'CONTENT_CREATE',
  'CONTENT_EDIT',
  'CONTENT_PUBLISH',
  'CONTENT_DELETE',

  // Keyword Management
  'KEYWORDS_VIEW',
  'KEYWORDS_CREATE',
  'KEYWORDS_EDIT',
  'KEYWORDS_DELETE',

  // Redirections
  'REDIRECTIONS_VIEW',
  'REDIRECTIONS_CREATE',
  'REDIRECTIONS_EDIT',
  'REDIRECTIONS_DELETE',

  // Interview
  'INTERVIEW_VIEW',
  'INTERVIEW_EDIT',

  // Site Audit
  'AUDIT_VIEW',
  'AUDIT_RUN',

  // Settings - General
  'SETTINGS_GENERAL_VIEW',
  'SETTINGS_GENERAL_EDIT',

  // Settings - AI Configuration
  'SETTINGS_AI_VIEW',
  'SETTINGS_AI_EDIT',

  // Settings - Scheduling
  'SETTINGS_SCHEDULING_VIEW',
  'SETTINGS_SCHEDULING_EDIT',

  // Settings - Notifications
  'SETTINGS_NOTIFICATIONS_VIEW',
  'SETTINGS_NOTIFICATIONS_EDIT',

  // Settings - SEO
  'SETTINGS_SEO_VIEW',
  'SETTINGS_SEO_EDIT',

  // Settings - Integrations
  'SETTINGS_INTEGRATIONS_VIEW',
  'SETTINGS_INTEGRATIONS_EDIT',

  // Settings - Team
  'SETTINGS_TEAM_VIEW',
  'SETTINGS_TEAM_EDIT',

  // Settings - Users
  'SETTINGS_USERS_VIEW',
  'SETTINGS_USERS_EDIT',

  // Settings - Roles
  'SETTINGS_ROLES_VIEW',
  'SETTINGS_ROLES_EDIT',

  // Settings - Subscription
  'SETTINGS_SUBSCRIPTION_VIEW',
  'SETTINGS_SUBSCRIPTION_EDIT',
];

async function cleanupLegacyPermissions() {
  console.log('🧹 Cleaning up legacy permissions...\n');

  // Get all roles with raw query to avoid enum validation
  const roles = await prisma.$runCommandRaw({
    find: 'Role',
    filter: {},
  });

  const allRoles = roles.cursor?.firstBatch || [];
  let updatedCount = 0;

  for (const role of allRoles) {
    if (!role.permissions || role.permissions.length === 0) continue;

    let needsUpdate = false;
    const updatedPermissions = role.permissions.map(permission => {
      if (LEGACY_PERMISSION_MAPPING[permission]) {
        needsUpdate = true;
        console.log(`   Replacing "${permission}" with "${LEGACY_PERMISSION_MAPPING[permission]}" in role "${role.name}"`);
        return LEGACY_PERMISSION_MAPPING[permission];
      }
      return permission;
    });

    // Remove duplicates
    const uniquePermissions = [...new Set(updatedPermissions)];

    if (needsUpdate) {
      // Use raw update to bypass enum validation
      await prisma.$runCommandRaw({
        update: 'Role',
        updates: [
          {
            q: { _id: role._id },
            u: { $set: { permissions: uniquePermissions } },
          },
        ],
      });
      updatedCount++;
    }
  }

  console.log(`\n✅ Cleaned up ${updatedCount} role(s) with legacy permissions\n`);
}

async function updateOwnerPermissions() {
  console.log('🔄 Starting Owner roles permissions update...\n');

  try {
    // First, clean up any legacy permissions
    await cleanupLegacyPermissions();

    // Find all Owner roles using raw query to avoid relation issues
    const rolesResult = await prisma.$runCommandRaw({
      find: 'Role',
      filter: {
        name: { $in: ['Owner', 'owner', 'OWNER'] },
      },
    });

    const ownerRoles = rolesResult.cursor?.firstBatch || [];

    console.log(`📋 Found ${ownerRoles.length} Owner role(s) to update\n`);

    if (ownerRoles.length === 0) {
      console.log('⚠️  No Owner roles found. Creating Owner roles for accounts without one...\n');
      
      // Find all accounts
      const accounts = await prisma.account.findMany({
        include: {
          roles: {
            where: {
              name: 'Owner',
            },
          },
        },
      });

      for (const account of accounts) {
        if (account.roles.length === 0) {
          // Create Owner role for this account
          const newOwnerRole = await prisma.role.create({
            data: {
              accountId: account.id,
              name: 'Owner',
              description: 'Full access to all features',
              permissions: ALL_PERMISSIONS,
              isSystemRole: true,
            },
          });
          console.log(`✅ Created Owner role for account: ${account.name}`);

          // Update account members who are owners to use this role
          await prisma.accountMember.updateMany({
            where: {
              accountId: account.id,
              isOwner: true,
            },
            data: {
              roleId: newOwnerRole.id,
            },
          });
          console.log(`   └─ Updated owner members to use new Owner role`);
        }
      }
    } else {
      // Update existing Owner roles using raw update
      for (const role of ownerRoles) {
        const currentPermissions = role.permissions || [];
        const missingPermissions = ALL_PERMISSIONS.filter(p => !currentPermissions.includes(p));

        if (missingPermissions.length > 0) {
          await prisma.$runCommandRaw({
            update: 'Role',
            updates: [
              {
                q: { _id: role._id },
                u: { $set: { permissions: ALL_PERMISSIONS } },
              },
            ],
          });
          console.log(`✅ Updated Owner role (ID: ${role._id.$oid || role._id})`);
          console.log(`   └─ Added ${missingPermissions.length} missing permission(s)`);
        } else {
          console.log(`⏭️  Owner role (ID: ${role._id.$oid || role._id}) already has all permissions`);
        }
      }
    }

    // Also check for owners using Admin roles and move them to Owner role
    // Using raw query to find Admin roles
    const adminRolesResult = await prisma.$runCommandRaw({
      find: 'Role',
      filter: { name: 'Admin' },
    });

    const adminRoles = adminRolesResult.cursor?.firstBatch || [];

    for (const adminRole of adminRoles) {
      const adminRoleId = adminRole._id.$oid || adminRole._id.toString();
      
      // Find owner members with this Admin role
      const ownerMembers = await prisma.accountMember.findMany({
        where: {
          roleId: adminRoleId,
          isOwner: true,
        },
      });

      if (ownerMembers.length > 0) {
        console.log(`\n📋 Found ${ownerMembers.length} owner member(s) using Admin role\n`);

        // Find or create Owner role for this account
        const accountId = adminRole.accountId.$oid || adminRole.accountId.toString();
        
        // Check if Owner role exists
        const existingOwnerResult = await prisma.$runCommandRaw({
          find: 'Role',
          filter: { 
            accountId: { $oid: accountId },
            name: 'Owner',
          },
        });
        
        let ownerRoleId;
        const existingOwner = existingOwnerResult.cursor?.firstBatch?.[0];
        
        if (existingOwner) {
          ownerRoleId = existingOwner._id.$oid || existingOwner._id.toString();
        } else {
          // Create Owner role
          const newOwnerRole = await prisma.role.create({
            data: {
              accountId: accountId,
              name: 'Owner',
              description: 'Full access to all features',
              permissions: ALL_PERMISSIONS,
              isSystemRole: true,
            },
          });
          ownerRoleId = newOwnerRole.id;
          console.log(`✅ Created Owner role for account`);
        }

        // Update owner members to use Owner role
        for (const member of ownerMembers) {
          await prisma.accountMember.update({
            where: { id: member.id },
            data: { roleId: ownerRoleId },
          });
          console.log(`   └─ Moved owner member to Owner role`);
        }
      }
    }

    console.log('\n✨ Owner permissions update completed successfully!');
  } catch (error) {
    console.error('❌ Error updating owner permissions:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

updateOwnerPermissions();

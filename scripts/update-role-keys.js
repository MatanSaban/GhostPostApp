const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// ALL_PERMISSIONS - Complete list of all available permissions
const ALL_PERMISSIONS = [
  // Account Management
  'ACCOUNT_VIEW', 'ACCOUNT_EDIT', 'ACCOUNT_DELETE', 'ACCOUNT_BILLING_VIEW', 'ACCOUNT_BILLING_MANAGE',
  // Member Management
  'MEMBERS_VIEW', 'MEMBERS_INVITE', 'MEMBERS_EDIT', 'MEMBERS_DELETE',
  // Role Management
  'ROLES_VIEW', 'ROLES_CREATE', 'ROLES_EDIT', 'ROLES_DELETE',
  // Site Management
  'SITES_VIEW', 'SITES_CREATE', 'SITES_EDIT', 'SITES_DELETE',
  // Content Management
  'CONTENT_VIEW', 'CONTENT_CREATE', 'CONTENT_EDIT', 'CONTENT_PUBLISH', 'CONTENT_DELETE',
  // Keyword Management
  'KEYWORDS_VIEW', 'KEYWORDS_CREATE', 'KEYWORDS_EDIT', 'KEYWORDS_DELETE',
  // Redirections
  'REDIRECTIONS_VIEW', 'REDIRECTIONS_CREATE', 'REDIRECTIONS_EDIT', 'REDIRECTIONS_DELETE',
  // Interview
  'INTERVIEW_VIEW', 'INTERVIEW_EDIT',
  // Site Audit
  'AUDIT_VIEW', 'AUDIT_RUN',
  // Settings - General
  'SETTINGS_GENERAL_VIEW', 'SETTINGS_GENERAL_EDIT',
  // Settings - AI Configuration
  'SETTINGS_AI_VIEW', 'SETTINGS_AI_EDIT',
  // Settings - Scheduling
  'SETTINGS_SCHEDULING_VIEW', 'SETTINGS_SCHEDULING_EDIT',
  // Settings - Notifications
  'SETTINGS_NOTIFICATIONS_VIEW', 'SETTINGS_NOTIFICATIONS_EDIT',
  // Settings - SEO
  'SETTINGS_SEO_VIEW', 'SETTINGS_SEO_EDIT',
  // Settings - Integrations
  'SETTINGS_INTEGRATIONS_VIEW', 'SETTINGS_INTEGRATIONS_EDIT',
  // Settings - Users
  'SETTINGS_USERS_VIEW', 'SETTINGS_USERS_EDIT',
  // Settings - Team
  'SETTINGS_TEAM_VIEW', 'SETTINGS_TEAM_EDIT',
  // Settings - Roles
  'SETTINGS_ROLES_VIEW', 'SETTINGS_ROLES_EDIT',
  // Settings - Subscription
  'SETTINGS_SUBSCRIPTION_VIEW', 'SETTINGS_SUBSCRIPTION_EDIT',
];

// System roles that should exist in every account
const SYSTEM_ROLES = [
  {
    key: 'owner',
    name: 'Owner',
    description: 'Account owner with full access (unchangeable)',
    permissions: ALL_PERMISSIONS,
  },
  {
    key: 'ceo',
    name: 'CEO',
    description: 'Chief Executive Officer - Full access to everything',
    permissions: ALL_PERMISSIONS,
  },
  {
    key: 'cfo',
    name: 'CFO',
    description: 'Chief Financial Officer - Financial and billing oversight',
    permissions: [
      // Account - Full financial access
      'ACCOUNT_VIEW', 'ACCOUNT_EDIT', 'ACCOUNT_BILLING_VIEW', 'ACCOUNT_BILLING_MANAGE',
      // Members - View and manage
      'MEMBERS_VIEW', 'MEMBERS_INVITE', 'MEMBERS_EDIT',
      // Roles - View only
      'ROLES_VIEW',
      // Sites - View only
      'SITES_VIEW',
      // Content - View only
      'CONTENT_VIEW',
      // Keywords - View only
      'KEYWORDS_VIEW',
      // Redirections - View only
      'REDIRECTIONS_VIEW',
      // Audit - Full access
      'AUDIT_VIEW', 'AUDIT_RUN',
      // Settings - General (view)
      'SETTINGS_GENERAL_VIEW',
      // Settings - Users (view)
      'SETTINGS_USERS_VIEW',
      // Settings - Subscription (full access)
      'SETTINGS_SUBSCRIPTION_VIEW', 'SETTINGS_SUBSCRIPTION_EDIT',
    ],
  },
  {
    key: 'manager',
    name: 'Manager',
    description: 'Team manager - Content and team oversight',
    permissions: [
      // Account - View only
      'ACCOUNT_VIEW',
      // Members - View and invite
      'MEMBERS_VIEW', 'MEMBERS_INVITE', 'MEMBERS_EDIT',
      // Roles - View only
      'ROLES_VIEW',
      // Sites - Full access
      'SITES_VIEW', 'SITES_CREATE', 'SITES_EDIT',
      // Content - Full access
      'CONTENT_VIEW', 'CONTENT_CREATE', 'CONTENT_EDIT', 'CONTENT_PUBLISH', 'CONTENT_DELETE',
      // Keywords - Full access
      'KEYWORDS_VIEW', 'KEYWORDS_CREATE', 'KEYWORDS_EDIT', 'KEYWORDS_DELETE',
      // Redirections - Full access
      'REDIRECTIONS_VIEW', 'REDIRECTIONS_CREATE', 'REDIRECTIONS_EDIT', 'REDIRECTIONS_DELETE',
      // Interview - Full access
      'INTERVIEW_VIEW', 'INTERVIEW_EDIT',
      // Audit - Full access
      'AUDIT_VIEW', 'AUDIT_RUN',
      // Settings - General
      'SETTINGS_GENERAL_VIEW', 'SETTINGS_GENERAL_EDIT',
      // Settings - AI
      'SETTINGS_AI_VIEW', 'SETTINGS_AI_EDIT',
      // Settings - Scheduling
      'SETTINGS_SCHEDULING_VIEW', 'SETTINGS_SCHEDULING_EDIT',
      // Settings - Notifications
      'SETTINGS_NOTIFICATIONS_VIEW', 'SETTINGS_NOTIFICATIONS_EDIT',
      // Settings - SEO
      'SETTINGS_SEO_VIEW', 'SETTINGS_SEO_EDIT',
      // Settings - Integrations
      'SETTINGS_INTEGRATIONS_VIEW', 'SETTINGS_INTEGRATIONS_EDIT',
      // Settings - Team
      'SETTINGS_TEAM_VIEW', 'SETTINGS_TEAM_EDIT',
    ],
  },
  {
    key: 'team_lead',
    name: 'Team Lead',
    description: 'Team lead - Content management and team coordination',
    permissions: [
      // Account - View only
      'ACCOUNT_VIEW',
      // Members - View only
      'MEMBERS_VIEW',
      // Sites - View and edit
      'SITES_VIEW', 'SITES_EDIT',
      // Content - Full access
      'CONTENT_VIEW', 'CONTENT_CREATE', 'CONTENT_EDIT', 'CONTENT_PUBLISH',
      // Keywords - Full access
      'KEYWORDS_VIEW', 'KEYWORDS_CREATE', 'KEYWORDS_EDIT',
      // Redirections - Create and edit
      'REDIRECTIONS_VIEW', 'REDIRECTIONS_CREATE', 'REDIRECTIONS_EDIT',
      // Interview - Full access
      'INTERVIEW_VIEW', 'INTERVIEW_EDIT',
      // Audit - View
      'AUDIT_VIEW',
      // Settings - General (view)
      'SETTINGS_GENERAL_VIEW',
      // Settings - AI (view)
      'SETTINGS_AI_VIEW',
      // Settings - Scheduling
      'SETTINGS_SCHEDULING_VIEW', 'SETTINGS_SCHEDULING_EDIT',
      // Settings - Notifications (view)
      'SETTINGS_NOTIFICATIONS_VIEW',
      // Settings - SEO (view)
      'SETTINGS_SEO_VIEW',
      // Settings - Team (view)
      'SETTINGS_TEAM_VIEW',
    ],
  },
  {
    key: 'employee',
    name: 'Employee',
    description: 'Standard employee - Basic content access',
    permissions: [
      // Account - View only
      'ACCOUNT_VIEW',
      // Sites - View only
      'SITES_VIEW',
      // Content - Create and edit (no publish/delete)
      'CONTENT_VIEW', 'CONTENT_CREATE', 'CONTENT_EDIT',
      // Keywords - View and create
      'KEYWORDS_VIEW', 'KEYWORDS_CREATE',
      // Redirections - View only
      'REDIRECTIONS_VIEW',
      // Interview - View and edit (for content research)
      'INTERVIEW_VIEW', 'INTERVIEW_EDIT',
      // Settings - General (view)
      'SETTINGS_GENERAL_VIEW',
      // Settings - Notifications (personal)
      'SETTINGS_NOTIFICATIONS_VIEW', 'SETTINGS_NOTIFICATIONS_EDIT',
    ],
  },
];

async function main() {
  console.log('Fetching all accounts...');
  const accounts = await prisma.account.findMany();
  console.log(`Found ${accounts.length} accounts\n`);

  for (const account of accounts) {
    console.log(`\nProcessing account: ${account.name} (${account.id})`);
    
    for (const roleData of SYSTEM_ROLES) {
      // Check if role already exists by key or name
      const existingRole = await prisma.role.findFirst({
        where: {
          accountId: account.id,
          OR: [
            { key: roleData.key },
            { name: roleData.name },
          ],
        },
      });

      if (existingRole) {
        // Update existing role to ensure it has correct key, permissions, and is marked as system role
        await prisma.role.update({
          where: { id: existingRole.id },
          data: {
            key: roleData.key,
            description: roleData.description,
            permissions: roleData.permissions,
            isSystemRole: true,
          },
        });
        console.log(`  ✓ Updated existing role: ${roleData.name} (key: ${roleData.key}, ${roleData.permissions.length} permissions)`);
      } else {
        // Create new role
        await prisma.role.create({
          data: {
            accountId: account.id,
            key: roleData.key,
            name: roleData.name,
            description: roleData.description,
            permissions: roleData.permissions,
            isSystemRole: true,
          },
        });
        console.log(`  ✓ Created new role: ${roleData.name} (key: ${roleData.key}, ${roleData.permissions.length} permissions)`);
      }
    }
  }

  console.log('\n✅ Done! All accounts now have all system roles with updated permissions.');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

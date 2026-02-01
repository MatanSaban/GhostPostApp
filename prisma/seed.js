const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting seed...');

  // Hash the password
  const hashedPassword = await bcrypt.hash('123456', 12);

  // Create or update SuperAdmin user
  const superAdmin = await prisma.user.upsert({
    where: { email: 'matansaban28@gmail.com' },
    update: {
      firstName: 'Matan',
      lastName: 'Saban',
      phoneNumber: '0527984133',
      password: hashedPassword,
      isSuperAdmin: true,
      isActive: true,
      emailVerified: new Date(),
      phoneVerified: new Date(),
      consentGiven: true,
      consentDate: new Date(),
      registrationStep: 'COMPLETED',
    },
    create: {
      email: 'matansaban28@gmail.com',
      firstName: 'Matan',
      lastName: 'Saban',
      phoneNumber: '0527984133',
      password: hashedPassword,
      primaryAuthMethod: 'EMAIL',
      isSuperAdmin: true,
      isActive: true,
      emailVerified: new Date(),
      phoneVerified: new Date(),
      consentGiven: true,
      consentDate: new Date(),
      registrationStep: 'COMPLETED',
    },
  });

  console.log('✅ SuperAdmin user created:', superAdmin.email);

  // Create sample users for demo accounts
  const sampleUsersData = [
    {
      email: 'john@acmecorp.com',
      firstName: 'John',
      lastName: 'Doe',
      phoneNumber: '0521234567',
    },
    {
      email: 'jane@techstart.io',
      firstName: 'Jane',
      lastName: 'Smith',
      phoneNumber: '0529876543',
    },
    {
      email: 'bob@digitalagency.com',
      firstName: 'Bob',
      lastName: 'Wilson',
      phoneNumber: '0525551234',
    },
    {
      email: 'alice@creativestudio.io',
      firstName: 'Alice',
      lastName: 'Brown',
      phoneNumber: '0526667788',
    },
    {
      email: 'charlie@marketinghub.com',
      firstName: 'Charlie',
      lastName: 'Davis',
      phoneNumber: '0527778899',
    },
  ];

  const sampleUsers = [];
  for (const userData of sampleUsersData) {
    const user = await prisma.user.upsert({
      where: { email: userData.email },
      update: {
        firstName: userData.firstName,
        lastName: userData.lastName,
        phoneNumber: userData.phoneNumber,
        password: hashedPassword,
        isActive: true,
        emailVerified: new Date(),
        phoneVerified: new Date(),
        consentGiven: true,
        consentDate: new Date(),
        registrationStep: 'COMPLETED',
        lastLoginAt: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000), // Random login in last 7 days
      },
      create: {
        email: userData.email,
        firstName: userData.firstName,
        lastName: userData.lastName,
        phoneNumber: userData.phoneNumber,
        password: hashedPassword,
        primaryAuthMethod: 'EMAIL',
        isActive: true,
        emailVerified: new Date(),
        phoneVerified: new Date(),
        consentGiven: true,
        consentDate: new Date(),
        registrationStep: 'COMPLETED',
        lastLoginAt: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000),
      },
    });
    sampleUsers.push(user);
    console.log('✅ Sample user created:', user.email);
  }

  // Create default plans
  const plans = [
    {
      name: 'Basic',
      slug: 'basic',
      description: 'Perfect for small businesses getting started with SEO',
      price: 29,
      currency: 'USD',
      interval: 'MONTHLY',
      features: [
        { key: 'seo_audit', label: 'Basic SEO audit' },
        { key: 'email_support', label: 'Email support' },
      ],
      limitations: [
        { key: 'maxSites', label: '1 Website', value: 1, type: 'number' },
        { key: 'maxMembers', label: '1 Team member', value: 1, type: 'number' },
        { key: 'maxKeywords', label: '100 Keywords', value: 100, type: 'number' },
        { key: 'maxContent', label: '50 Content pieces/month', value: 50, type: 'number' },
      ],
      isActive: true,
      sortOrder: 1,
    },
    {
      name: 'Pro',
      slug: 'pro',
      description: 'For growing businesses that need more power',
      price: 79,
      currency: 'USD',
      interval: 'MONTHLY',
      features: [
        { key: 'seo_audit', label: 'Advanced SEO audit' },
        { key: 'priority_support', label: 'Priority support' },
        { key: 'team_collab', label: 'Team collaboration' },
        { key: 'api_access', label: 'API access' },
      ],
      limitations: [
        { key: 'maxSites', label: '5 Websites', value: 5, type: 'number' },
        { key: 'maxMembers', label: '5 Team members', value: 5, type: 'number' },
        { key: 'maxKeywords', label: '500 Keywords', value: 500, type: 'number' },
        { key: 'maxContent', label: '200 Content pieces/month', value: 200, type: 'number' },
      ],
      isActive: true,
      sortOrder: 2,
    },
    {
      name: 'Enterprise',
      slug: 'enterprise',
      description: 'For agencies and large organizations',
      price: 199,
      currency: 'USD',
      interval: 'MONTHLY',
      features: [
        { key: 'white_label', label: 'White-label reports' },
        { key: 'dedicated_support', label: 'Dedicated support' },
        { key: 'custom_integrations', label: 'Custom integrations' },
        { key: 'sla', label: 'SLA guarantee' },
        { key: 'training', label: 'Training sessions' },
      ],
      limitations: [
        { key: 'maxSites', label: 'Unlimited Websites', value: -1, type: 'number' },
        { key: 'maxMembers', label: 'Unlimited Team members', value: -1, type: 'number' },
        { key: 'maxKeywords', label: 'Unlimited Keywords', value: -1, type: 'number' },
        { key: 'maxContent', label: 'Unlimited Content', value: -1, type: 'number' },
      ],
      isActive: true,
      sortOrder: 3,
    },
  ];

  for (const plan of plans) {
    const createdPlan = await prisma.plan.upsert({
      where: { slug: plan.slug },
      update: plan,
      create: plan,
    });
    console.log('✅ Plan created/updated:', createdPlan.name);
  }

  // Get all plans for creating subscriptions
  const allPlans = await prisma.plan.findMany();
  const basicPlan = allPlans.find(p => p.slug === 'basic');
  const proPlan = allPlans.find(p => p.slug === 'pro');
  const enterprisePlan = allPlans.find(p => p.slug === 'enterprise');

  // Create sample accounts with owners and subscriptions
  const accountsData = [
    {
      name: 'Acme Corporation',
      slug: 'acme-corp',
      ownerIndex: 0, // John Doe
      plan: enterprisePlan,
    },
    {
      name: 'TechStart Inc',
      slug: 'techstart',
      ownerIndex: 1, // Jane Smith
      plan: proPlan,
    },
    {
      name: 'Digital Agency',
      slug: 'digital-agency',
      ownerIndex: 2, // Bob Wilson
      plan: basicPlan,
    },
    {
      name: 'Creative Studio',
      slug: 'creative-studio',
      ownerIndex: 3, // Alice Brown
      plan: proPlan,
    },
    {
      name: 'Marketing Hub',
      slug: 'marketing-hub',
      ownerIndex: 4, // Charlie Davis
      plan: basicPlan,
    },
  ];

  for (const accountData of accountsData) {
    const owner = sampleUsers[accountData.ownerIndex];
    
    // Create or update account
    const account = await prisma.account.upsert({
      where: { slug: accountData.slug },
      update: {
        name: accountData.name,
        billingEmail: owner.email,
        generalEmail: owner.email,
        isActive: true,
      },
      create: {
        name: accountData.name,
        slug: accountData.slug,
        billingEmail: owner.email,
        generalEmail: owner.email,
        isActive: true,
      },
    });
    console.log('✅ Account created/updated:', account.name);

    // Create default system roles for the account
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

    const systemRoles = [
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

    let ownerRole = null;
    for (const roleData of systemRoles) {
      const role = await prisma.role.upsert({
        where: {
          accountId_name: {
            accountId: account.id,
            name: roleData.name,
          },
        },
        update: {
          key: roleData.key,
          isSystemRole: true,
        },
        create: {
          accountId: account.id,
          key: roleData.key,
          name: roleData.name,
          description: roleData.description,
          permissions: roleData.permissions,
          isSystemRole: true,
        },
      });
      if (roleData.key === 'owner') {
        ownerRole = role;
      }
      console.log(`  ✅ System role created/updated: ${roleData.name}`);
    }

    // Create account membership for owner
    await prisma.accountMember.upsert({
      where: {
        accountId_userId: {
          accountId: account.id,
          userId: owner.id,
        },
      },
      update: {
        roleId: ownerRole.id,
        isOwner: true,
        status: 'ACTIVE',
      },
      create: {
        accountId: account.id,
        userId: owner.id,
        roleId: ownerRole.id,
        isOwner: true,
        status: 'ACTIVE',
      },
    });
    console.log('✅ Account member created for:', owner.email);

    // Create subscription for the account
    if (accountData.plan) {
      const now = new Date();
      const periodEnd = new Date(now);
      periodEnd.setMonth(periodEnd.getMonth() + 1);

      await prisma.subscription.upsert({
        where: { accountId: account.id },
        update: {
          planId: accountData.plan.id,
          status: 'ACTIVE',
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
        },
        create: {
          accountId: account.id,
          planId: accountData.plan.id,
          status: 'ACTIVE',
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
        },
      });
      console.log('✅ Subscription created for:', account.name, '- Plan:', accountData.plan.name);
    }
  }

  console.log('🎉 Seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

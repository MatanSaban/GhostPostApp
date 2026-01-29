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
        '1 Website',
        '100 Keywords',
        '50 Content pieces/month',
        'Basic SEO audit',
        'Email support',
      ],
      maxSites: 1,
      maxMembers: 1,
      maxKeywords: 100,
      maxContent: 50,
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
        '5 Websites',
        '500 Keywords',
        '200 Content pieces/month',
        'Advanced SEO audit',
        'Priority support',
        'Team collaboration',
        'API access',
      ],
      maxSites: 5,
      maxMembers: 5,
      maxKeywords: 500,
      maxContent: 200,
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
        'Unlimited Websites',
        'Unlimited Keywords',
        'Unlimited Content',
        'White-label reports',
        'Dedicated support',
        'Custom integrations',
        'SLA guarantee',
        'Training sessions',
      ],
      maxSites: 999,
      maxMembers: 999,
      maxKeywords: 99999,
      maxContent: 99999,
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

    // Create default role for the account
    const adminRole = await prisma.role.upsert({
      where: {
        accountId_name: {
          accountId: account.id,
          name: 'Admin',
        },
      },
      update: {},
      create: {
        accountId: account.id,
        name: 'Admin',
        description: 'Full access to account settings',
        permissions: [
          'ACCOUNT_VIEW',
          'ACCOUNT_EDIT',
          'MEMBERS_VIEW',
          'MEMBERS_INVITE',
          'MEMBERS_EDIT',
          'SITES_VIEW',
          'SITES_CREATE',
          'SITES_EDIT',
          'CONTENT_VIEW',
          'CONTENT_CREATE',
          'CONTENT_EDIT',
          'CONTENT_PUBLISH',
        ],
        isSystemRole: true,
      },
    });

    // Create account membership for owner
    await prisma.accountMember.upsert({
      where: {
        accountId_userId: {
          accountId: account.id,
          userId: owner.id,
        },
      },
      update: {
        roleId: adminRole.id,
        isOwner: true,
        status: 'ACTIVE',
      },
      create: {
        accountId: account.id,
        userId: owner.id,
        roleId: adminRole.id,
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

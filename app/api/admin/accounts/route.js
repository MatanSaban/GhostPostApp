import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';

const SESSION_COOKIE = 'user_session';

// Verify super admin access
async function verifySuperAdmin() {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get(SESSION_COOKIE)?.value;

    if (!userId) {
      return null;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, isSuperAdmin: true },
    });

    if (!user || !user.isSuperAdmin) {
      return null;
    }

    return user;
  } catch (error) {
    console.error('Auth error:', error);
    return null;
  }
}

export async function GET(request) {
  try {
    // Verify super admin access
    const admin = await verifySuperAdmin();
    if (!admin) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Fetch accounts with relations
    const accounts = await prisma.account.findMany({
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                lastLoginAt: true,
              },
            },
          },
        },
        subscription: {
          include: {
            plan: {
              select: {
                id: true,
                name: true,
                translations: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Format the response
    const formattedAccounts = accounts.map((account) => {
      const owner = account.members.find((m) => m.isOwner)?.user;
      const plan = account.subscription?.plan;

      // Most recent login across all members of the account
      const lastConnectionAt = account.members.reduce((latest, m) => {
        const ts = m.user?.lastLoginAt;
        if (!ts) return latest;
        return !latest || ts > latest ? ts : latest;
      }, null);
      
      // Format plan translations as object keyed by language
      const planTranslations = {};
      if (plan?.translations) {
        plan.translations.forEach(t => {
          planTranslations[t.language] = {
            name: t.name,
            description: t.description,
            features: t.features,
          };
        });
      }
      
      return {
        id: account.id,
        name: account.name,
        slug: account.slug,
        logo: account.logo,
        website: account.website,
        industry: account.industry,
        timezone: account.timezone,
        defaultLanguage: account.defaultLanguage,
        billingEmail: account.billingEmail,
        generalEmail: account.generalEmail,
        owner: owner
          ? {
              name: `${owner.firstName} ${owner.lastName}`,
              email: owner.email,
            }
          : null,
        plan: plan?.name || 'No Plan',
        planId: plan?.id || '',
        billingInterval: account.subscription?.billingInterval || 'MONTHLY',
        planTranslations,
        status: account.isActive ? 'active' : 'inactive',
        usersCount: account.members.length,
        createdAt: account.createdAt.toISOString(),
        updatedAt: account.updatedAt.toISOString(),
        lastConnectionAt: lastConnectionAt ? lastConnectionAt.toISOString() : null,
      };
    });

    // Calculate stats
    const stats = {
      total: accounts.length,
      active: accounts.filter((a) => a.isActive).length,
      totalUsers: accounts.reduce((sum, a) => sum + a.members.length, 0),
    };

    return NextResponse.json({
      accounts: formattedAccounts,
      stats,
    });
  } catch (error) {
    console.error('Error fetching accounts:', error);
    return NextResponse.json(
      { error: 'Failed to fetch accounts' },
      { status: 500 }
    );
  }
}

// POST - Create a new account
export async function POST(request) {
  try {
    const admin = await verifySuperAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { 
      name, 
      slug, 
      ownerEmail,
      logo,
      website,
      industry,
      timezone,
      defaultLanguage,
      billingEmail,
      generalEmail,
      isActive,
      planId,
      billingInterval,
    } = body;

    // Validate required fields
    if (!name || !slug || !billingEmail || !generalEmail) {
      return NextResponse.json(
        { error: 'Name, slug, billingEmail and generalEmail are required' },
        { status: 400 }
      );
    }

    // Check if slug already exists
    const existingAccount = await prisma.account.findUnique({
      where: { slug },
    });

    if (existingAccount) {
      return NextResponse.json(
        { error: 'Slug already in use' },
        { status: 400 }
      );
    }

    // Find owner user if email provided
    let ownerUser = null;
    if (ownerEmail) {
      ownerUser = await prisma.user.findUnique({
        where: { email: ownerEmail },
      });

      if (!ownerUser) {
        return NextResponse.json(
          { error: 'Owner user not found' },
          { status: 400 }
        );
      }
    }

    // Get default role for owner
    const ownerRole = await prisma.role.findFirst({
      where: { name: 'Owner' },
    });

    // Create account with optional owner
    const newAccount = await prisma.account.create({
      data: {
        name,
        slug,
        logo: logo || null,
        website: website || null,
        industry: industry || null,
        timezone: timezone || 'UTC',
        defaultLanguage: defaultLanguage || 'EN',
        billingEmail,
        generalEmail,
        isActive: isActive !== false,
        ...(ownerUser && ownerRole && {
          members: {
            create: {
              userId: ownerUser.id,
              roleId: ownerRole.id,
              isOwner: true,
            },
          },
        }),
      },
      include: {
        members: {
          where: { isOwner: true },
          include: {
            user: {
              select: {
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
          take: 1,
        },
        _count: {
          select: { members: true },
        },
      },
    });

    const owner = newAccount.members[0]?.user;

    // Create subscription if a plan was selected
    let subscriptionPlan = null;
    if (planId) {
      const plan = await prisma.plan.findUnique({ where: { id: planId } });
      if (plan) {
        const now = new Date();
        const interval = billingInterval || 'MONTHLY';
        const periodEnd = new Date(now);
        if (interval === 'YEARLY') {
          periodEnd.setFullYear(periodEnd.getFullYear() + 1);
        } else {
          periodEnd.setMonth(periodEnd.getMonth() + 1);
        }

        await prisma.subscription.create({
          data: {
            accountId: newAccount.id,
            planId: plan.id,
            status: 'ACTIVE',
            billingInterval: interval,
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
          },
        });
        subscriptionPlan = plan;
      }
    }

    return NextResponse.json({
      id: newAccount.id,
      name: newAccount.name,
      slug: newAccount.slug,
      owner: owner
        ? {
            name: `${owner.firstName} ${owner.lastName}`,
            email: owner.email,
          }
        : null,
      plan: subscriptionPlan?.name || 'No Plan',
      planId: subscriptionPlan?.id || '',
      billingInterval: billingInterval || 'MONTHLY',
      status: 'active',
      usersCount: newAccount._count.members,
      createdAt: newAccount.createdAt.toISOString(),
    });
  } catch (error) {
    console.error('Error creating account:', error);
    return NextResponse.json(
      { error: 'Failed to create account' },
      { status: 500 }
    );
  }
}

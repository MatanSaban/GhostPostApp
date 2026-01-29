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

    // Fetch all users with their account memberships
    const users = await prisma.user.findMany({
      include: {
        accountMemberships: {
          include: {
            account: {
              select: {
                id: true,
                name: true,
              },
            },
            role: {
              select: {
                name: true,
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
    const formattedUsers = users.map((user) => {
      // Determine primary role
      let role = 'user';
      if (user.isSuperAdmin) {
        role = 'superAdmin';
      } else if (user.accountMemberships.some((m) => m.isOwner)) {
        role = 'owner';
      } else if (user.accountMemberships.length > 0) {
        role = user.accountMemberships[0].role?.name?.toLowerCase() || 'member';
      }

      return {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phoneNumber: user.phoneNumber,
        image: user.image,
        primaryAuthMethod: user.primaryAuthMethod,
        selectedLanguage: user.selectedLanguage,
        preferredCurrency: user.preferredCurrency,
        registrationStep: user.registrationStep,
        consentGiven: user.consentGiven,
        consentDate: user.consentDate?.toISOString() || null,
        isActive: user.isActive,
        emailVerified: user.emailVerified?.toISOString() || null,
        phoneVerified: user.phoneVerified?.toISOString() || null,
        accounts: user.accountMemberships.map((m) => m.account.name),
        accountIds: user.accountMemberships.map((m) => m.account.id),
        role,
        status: user.isActive ? 'active' : 'inactive',
        isSuperAdmin: user.isSuperAdmin,
        lastLoginAt: user.lastLoginAt?.toISOString() || null,
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
      };
    });

    // Calculate stats
    const stats = {
      total: users.length,
      active: users.filter((u) => u.isActive).length,
      superAdmins: users.filter((u) => u.isSuperAdmin).length,
    };

    return NextResponse.json({
      users: formattedUsers,
      stats,
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    return NextResponse.json(
      { error: 'Failed to fetch users' },
      { status: 500 }
    );
  }
}

// POST - Create a new user
export async function POST(request) {
  try {
    const admin = await verifySuperAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { firstName, lastName, email, password, isSuperAdmin, accountId } = body;

    // Validate required fields
    if (!firstName || !lastName || !email) {
      return NextResponse.json(
        { error: 'First name, last name, and email are required' },
        { status: 400 }
      );
    }

    // Check if email already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: 'Email already in use' },
        { status: 400 }
      );
    }

    // If accountId is provided, verify it exists and get a default role
    let account = null;
    let defaultRole = null;
    if (accountId) {
      account = await prisma.account.findUnique({
        where: { id: accountId },
      });
      if (!account) {
        return NextResponse.json(
          { error: 'Account not found' },
          { status: 400 }
        );
      }
      // Get the "Editor" role for this account, or create one if not found
      defaultRole = await prisma.role.findFirst({
        where: { accountId, name: 'Editor' },
      });
      if (!defaultRole) {
        // Try to find any role for this account
        defaultRole = await prisma.role.findFirst({
          where: { accountId },
        });
      }
      if (!defaultRole) {
        // Create a default "Member" role for the account
        defaultRole = await prisma.role.create({
          data: {
            accountId,
            name: 'Member',
            description: 'Default member role',
            permissions: ['ACCOUNT_VIEW', 'SITES_VIEW'],
            isSystemRole: true,
          },
        });
      }
    }

    // Create user (password will be set to a random hash - user should reset)
    const bcrypt = await import('bcryptjs');
    const hashedPassword = await bcrypt.hash(password || Math.random().toString(36), 12);

    const newUser = await prisma.user.create({
      data: {
        firstName,
        lastName,
        email,
        password: hashedPassword,
        isSuperAdmin: isSuperAdmin || false,
        isActive: true,
        emailVerified: new Date(), // Admin-created users are pre-verified
        registrationStep: 'COMPLETED',
      },
    });

    // If account was provided, create the membership
    if (account && defaultRole) {
      await prisma.accountMember.create({
        data: {
          accountId: account.id,
          userId: newUser.id,
          roleId: defaultRole.id,
          isOwner: false,
          status: 'ACTIVE',
        },
      });
    }

    return NextResponse.json({
      id: newUser.id,
      firstName: newUser.firstName,
      lastName: newUser.lastName,
      email: newUser.email,
      isSuperAdmin: newUser.isSuperAdmin,
      status: 'active',
      accounts: account ? [account.name] : [],
      role: newUser.isSuperAdmin ? 'superAdmin' : 'user',
      lastLoginAt: null,
      createdAt: newUser.createdAt.toISOString(),
    });
  } catch (error) {
    console.error('Error creating user:', error);
    return NextResponse.json(
      { error: 'Failed to create user' },
      { status: 500 }
    );
  }
}

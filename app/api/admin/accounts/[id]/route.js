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

// GET - Get a single account
export async function GET(request, { params }) {
  try {
    const admin = await verifySuperAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const account = await prisma.account.findUnique({
      where: { id },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        },
        subscription: {
          include: {
            plan: true,
          },
        },
      },
    });

    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    return NextResponse.json(account);
  } catch (error) {
    console.error('Error fetching account:', error);
    return NextResponse.json(
      { error: 'Failed to fetch account' },
      { status: 500 }
    );
  }
}

// PUT - Update an account
export async function PUT(request, { params }) {
  try {
    const admin = await verifySuperAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { 
      name, 
      slug, 
      logo,
      website,
      industry,
      timezone,
      defaultLanguage,
      billingEmail,
      generalEmail,
      isActive,
    } = body;

    // Check if account exists
    const existingAccount = await prisma.account.findUnique({
      where: { id },
    });

    if (!existingAccount) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    // Check for slug conflicts if slug is being changed
    if (slug && slug !== existingAccount.slug) {
      const slugConflict = await prisma.account.findFirst({
        where: {
          slug,
          id: { not: id },
        },
      });

      if (slugConflict) {
        return NextResponse.json(
          { error: 'Slug already in use' },
          { status: 400 }
        );
      }
    }

    // Update account
    const updatedAccount = await prisma.account.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(slug !== undefined && { slug }),
        ...(logo !== undefined && { logo: logo || null }),
        ...(website !== undefined && { website: website || null }),
        ...(industry !== undefined && { industry: industry || null }),
        ...(timezone !== undefined && { timezone }),
        ...(defaultLanguage !== undefined && { defaultLanguage }),
        ...(billingEmail !== undefined && { billingEmail }),
        ...(generalEmail !== undefined && { generalEmail }),
        ...(isActive !== undefined && { isActive }),
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
        subscription: {
          include: {
            plan: {
              select: { name: true },
            },
          },
        },
        _count: {
          select: { members: true },
        },
      },
    });

    // Format response
    const owner = updatedAccount.members[0]?.user;
    const formatted = {
      id: updatedAccount.id,
      name: updatedAccount.name,
      slug: updatedAccount.slug,
      logo: updatedAccount.logo,
      website: updatedAccount.website,
      industry: updatedAccount.industry,
      timezone: updatedAccount.timezone,
      defaultLanguage: updatedAccount.defaultLanguage,
      billingEmail: updatedAccount.billingEmail,
      generalEmail: updatedAccount.generalEmail,
      owner: owner
        ? {
            name: `${owner.firstName} ${owner.lastName}`,
            email: owner.email,
          }
        : null,
      plan: updatedAccount.subscription?.plan?.name || 'No Plan',
      status: updatedAccount.isActive ? 'active' : 'inactive',
      usersCount: updatedAccount._count.members,
      createdAt: updatedAccount.createdAt.toISOString(),
    };

    return NextResponse.json(formatted);
  } catch (error) {
    console.error('Error updating account:', error);
    return NextResponse.json(
      { error: 'Failed to update account' },
      { status: 500 }
    );
  }
}

// DELETE - Delete an account (with safety checks)
export async function DELETE(request, { params }) {
  try {
    const admin = await verifySuperAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    // Check if account exists
    const account = await prisma.account.findUnique({
      where: { id },
      include: {
        subscription: true,
        members: {
          where: { isOwner: true },
          include: {
            user: true,
          },
        },
        _count: {
          select: { members: true },
        },
      },
    });

    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    // Safety check: Don't delete accounts with active subscriptions
    if (account.subscription && account.subscription.status === 'ACTIVE') {
      return NextResponse.json(
        { error: 'Cannot delete account with active subscription. Cancel subscription first.' },
        { status: 400 }
      );
    }

    // Get the owner user
    const ownerMembership = account.members[0];
    const ownerUser = ownerMembership?.user;

    // Safety check: Don't delete if owner is super admin
    if (ownerUser?.isSuperAdmin) {
      return NextResponse.json(
        { error: 'Cannot delete account owned by a super admin' },
        { status: 400 }
      );
    }

    // Delete in transaction
    await prisma.$transaction(async (tx) => {
      // Delete account-related data
      await tx.aiCreditsLog.deleteMany({ where: { accountId: id } });
      await tx.addOnPurchase.deleteMany({ where: { subscription: { accountId: id } } });
      
      // Delete subscription if exists
      if (account.subscription) {
        await tx.subscription.delete({
          where: { accountId: id },
        });
      }

      // Delete all memberships first (they reference roles)
      await tx.accountMember.deleteMany({
        where: { accountId: id },
      });

      // Delete roles (after memberships are deleted)
      await tx.role.deleteMany({ where: { accountId: id } });
      
      // Delete sites
      await tx.site.deleteMany({ where: { accountId: id } });

      // Delete the account
      await tx.account.delete({
        where: { id },
      });

      // Delete the owner user if exists
      if (ownerUser) {
        // Delete user-related records
        await tx.authProvider.deleteMany({ where: { userId: ownerUser.id } });
        await tx.session.deleteMany({ where: { userId: ownerUser.id } });
        await tx.otpCode.deleteMany({ where: { userId: ownerUser.id } });
        await tx.userInterview.deleteMany({ where: { userId: ownerUser.id } });
        await tx.userSitePreference.deleteMany({ where: { userId: ownerUser.id } });
        await tx.accountMember.deleteMany({ where: { userId: ownerUser.id } });
        await tx.user.delete({ where: { id: ownerUser.id } });
      }
    });

    return NextResponse.json({ 
      success: true,
      deletedOwner: ownerUser ? ownerUser.email : null,
    });
  } catch (error) {
    console.error('Error deleting account:', error);
    return NextResponse.json(
      { error: 'Failed to delete account' },
      { status: 500 }
    );
  }
}

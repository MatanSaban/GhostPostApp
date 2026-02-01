import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';

const SESSION_COOKIE = 'user_session';

async function verifySuperAdmin() {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get(SESSION_COOKIE)?.value;

    if (!userId) return null;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, isSuperAdmin: true },
    });

    if (!user || !user.isSuperAdmin) return null;
    return user;
  } catch (error) {
    console.error('Auth error:', error);
    return null;
  }
}

// Get single user
export async function GET(request, { params }) {
  try {
    const admin = await verifySuperAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        accountMemberships: {
          include: {
            account: { select: { id: true, name: true, slug: true } },
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({ user });
  } catch (error) {
    console.error('Error fetching user:', error);
    return NextResponse.json({ error: 'Failed to fetch user' }, { status: 500 });
  }
}

// Update user
export async function PUT(request, { params }) {
  try {
    const admin = await verifySuperAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { 
      firstName, 
      lastName, 
      email, 
      phoneNumber,
      image,
      primaryAuthMethod,
      selectedLanguage,
      preferredCurrency,
      registrationStep,
      consentGiven,
      isActive,
      isSuperAdmin,
      emailVerified,
      phoneVerified,
      accountId,
    } = body;

    // Check if user exists
    const existingUser = await prisma.user.findUnique({ 
      where: { id },
      include: { accountMemberships: true },
    });
    if (!existingUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Check if new email conflicts
    if (email && email !== existingUser.email) {
      const emailConflict = await prisma.user.findUnique({ where: { email } });
      if (emailConflict) {
        return NextResponse.json({ error: 'Email already in use' }, { status: 400 });
      }
    }

    // Build update data with all provided fields
    let updateData = {};
    
    if (firstName !== undefined) updateData.firstName = firstName;
    if (lastName !== undefined) updateData.lastName = lastName;
    if (email !== undefined) updateData.email = email;
    if (phoneNumber !== undefined) updateData.phoneNumber = phoneNumber || null;
    if (image !== undefined) updateData.image = image || null;
    if (primaryAuthMethod !== undefined) updateData.primaryAuthMethod = primaryAuthMethod;
    if (selectedLanguage !== undefined) updateData.selectedLanguage = selectedLanguage || null;
    if (preferredCurrency !== undefined) updateData.preferredCurrency = preferredCurrency || null;
    if (registrationStep !== undefined) updateData.registrationStep = registrationStep;
    if (consentGiven !== undefined) updateData.consentGiven = consentGiven;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (isSuperAdmin !== undefined) updateData.isSuperAdmin = isSuperAdmin;
    // Handle boolean values - convert to DateTime or null
    if (emailVerified !== undefined) {
      updateData.emailVerified = emailVerified ? (existingUser.emailVerified || new Date()) : null;
    }
    if (phoneVerified !== undefined) {
      updateData.phoneVerified = phoneVerified ? (existingUser.phoneVerified || new Date()) : null;
    }

    const user = await prisma.user.update({
      where: { id },
      data: updateData,
    });

    // Handle account membership changes
    if (accountId !== undefined) {
      const currentAccountId = existingUser.accountMemberships[0]?.accountId || null;
      
      if (accountId && accountId !== currentAccountId) {
        // Remove old membership if exists
        if (currentAccountId) {
          await prisma.accountMember.deleteMany({
            where: { userId: id },
          });
        }
        
        // Get default role for new membership (required field)
        let defaultRole = await prisma.role.findFirst({
          where: { name: 'Member' },
        });
        
        // If no Member role exists, get any role or create one
        if (!defaultRole) {
          defaultRole = await prisma.role.findFirst();
        }
        
        if (!defaultRole) {
          // Create a default Member role if none exists
          defaultRole = await prisma.role.create({
            data: {
              name: 'Member',
              description: 'Default member role',
              permissions: [],
            },
          });
        }
        
        // Create new membership using connect for relations
        await prisma.accountMember.create({
          data: {
            account: { connect: { id: accountId } },
            user: { connect: { id } },
            role: { connect: { id: defaultRole.id } },
            isOwner: false,
            status: 'ACTIVE',
          },
        });
      } else if (!accountId && currentAccountId) {
        // Remove membership if accountId is cleared
        await prisma.accountMember.deleteMany({
          where: { userId: id },
        });
      }
    }

    return NextResponse.json({ user, message: 'User updated successfully' });
  } catch (error) {
    console.error('Error updating user:', error);
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 });
  }
}

// Delete user
export async function DELETE(request, { params }) {
  try {
    const admin = await verifySuperAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id },
      include: { 
        accountMemberships: {
          include: {
            account: {
              include: {
                subscription: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Prevent deleting super admins (except yourself)
    if (user.isSuperAdmin && user.id !== admin.id) {
      return NextResponse.json({ error: 'Cannot delete other super admins' }, { status: 400 });
    }

    // Prevent deleting yourself
    if (user.id === admin.id) {
      return NextResponse.json({ error: 'Cannot delete yourself' }, { status: 400 });
    }

    // Find accounts where this user is the owner
    const ownedAccounts = user.accountMemberships.filter(m => m.isOwner);

    // Delete all related records in a transaction
    await prisma.$transaction(async (tx) => {
      // For each owned account, delete the account and all its related data
      for (const membership of ownedAccounts) {
        const accountId = membership.accountId;
        
        // Delete account-related data
        await tx.aiCreditsLog.deleteMany({ where: { accountId } });
        await tx.addOnPurchase.deleteMany({ where: { subscription: { accountId } } });
        await tx.subscription.deleteMany({ where: { accountId } });
        await tx.role.deleteMany({ where: { accountId } });
        await tx.site.deleteMany({ where: { accountId } });
        await tx.accountMember.deleteMany({ where: { accountId } });
        await tx.account.delete({ where: { id: accountId } });
      }
      
      // Delete user-related records
      await tx.accountMember.deleteMany({ where: { userId: id } });
      await tx.authProvider.deleteMany({ where: { userId: id } });
      await tx.session.deleteMany({ where: { userId: id } });
      await tx.otpCode.deleteMany({ where: { userId: id } });
      await tx.userInterview.deleteMany({ where: { userId: id } });
      await tx.userSitePreference.deleteMany({ where: { userId: id } });
      await tx.user.delete({ where: { id } });
    });

    return NextResponse.json({ 
      message: 'User deleted successfully',
      deletedAccounts: ownedAccounts.length,
    });
  } catch (error) {
    console.error('Error deleting user:', error);
    return NextResponse.json({ error: 'Failed to delete user' }, { status: 500 });
  }
}

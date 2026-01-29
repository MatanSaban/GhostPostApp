import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';

const TEMP_REG_COOKIE = 'temp_reg_id';

// All permissions for the Owner role
const OWNER_PERMISSIONS = [
  'ACCOUNT_VIEW',
  'ACCOUNT_EDIT',
  'ACCOUNT_DELETE',
  'ACCOUNT_BILLING_VIEW',
  'ACCOUNT_BILLING_MANAGE',
  'MEMBERS_VIEW',
  'MEMBERS_INVITE',
  'MEMBERS_EDIT',
  'MEMBERS_REMOVE',
  'ROLES_VIEW',
  'ROLES_CREATE',
  'ROLES_EDIT',
  'ROLES_DELETE',
  'SITES_VIEW',
  'SITES_CREATE',
  'SITES_EDIT',
  'SITES_DELETE',
  'CONTENT_VIEW',
  'CONTENT_CREATE',
  'CONTENT_EDIT',
  'CONTENT_PUBLISH',
  'CONTENT_DELETE',
  'KEYWORDS_VIEW',
  'KEYWORDS_CREATE',
  'KEYWORDS_EDIT',
  'KEYWORDS_DELETE',
  'REDIRECTIONS_VIEW',
  'REDIRECTIONS_CREATE',
  'REDIRECTIONS_EDIT',
  'REDIRECTIONS_DELETE',
  'INTERVIEW_VIEW',
  'INTERVIEW_MANAGE',
  'AUDIT_VIEW',
  'AUDIT_RUN',
  'SETTINGS_VIEW',
  'SETTINGS_EDIT',
];

export async function POST(request) {
  try {
    // Get tempRegId from cookie
    const cookieStore = await cookies();
    const tempRegId = cookieStore.get(TEMP_REG_COOKIE)?.value;

    if (!tempRegId) {
      return NextResponse.json(
        { error: 'No registration in progress' },
        { status: 400 }
      );
    }

    // Get the temp registration with all data
    const tempReg = await prisma.tempRegistration.findUnique({
      where: { id: tempRegId },
    });

    if (!tempReg) {
      cookieStore.delete(TEMP_REG_COOKIE);
      return NextResponse.json(
        { error: 'Registration not found. Please start over.' },
        { status: 404 }
      );
    }

    // Check if temp registration has expired
    if (new Date() > tempReg.expiresAt) {
      await prisma.tempRegistration.delete({ where: { id: tempRegId } });
      cookieStore.delete(TEMP_REG_COOKIE);
      return NextResponse.json(
        { error: 'Registration expired. Please start over.' },
        { status: 410 }
      );
    }

    // Validate that all required steps are complete
    if (!tempReg.emailVerified && !tempReg.phoneVerified) {
      return NextResponse.json(
        { error: 'Email or phone verification required' },
        { status: 400 }
      );
    }

    if (!tempReg.accountName || !tempReg.accountSlug) {
      return NextResponse.json(
        { error: 'Account setup required' },
        { status: 400 }
      );
    }

    if (!tempReg.selectedPlanId) {
      return NextResponse.json(
        { error: 'Plan selection required' },
        { status: 400 }
      );
    }

    // Check if user already exists (shouldn't happen but safety check)
    const existingUser = await prisma.user.findUnique({
      where: { email: tempReg.email },
    });

    if (existingUser) {
      await prisma.tempRegistration.delete({ where: { id: tempRegId } });
      cookieStore.delete(TEMP_REG_COOKIE);
      return NextResponse.json(
        { error: 'A user with this email already exists' },
        { status: 409 }
      );
    }

    // Check if account slug is still available
    const existingAccount = await prisma.account.findUnique({
      where: { slug: tempReg.accountSlug },
    });

    if (existingAccount) {
      return NextResponse.json(
        { error: 'This account slug is no longer available. Please choose a different one.' },
        { status: 409 }
      );
    }

    // Create everything in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // 1. Create the real user
      const user = await tx.user.create({
        data: {
          email: tempReg.email,
          firstName: tempReg.firstName,
          lastName: tempReg.lastName,
          phoneNumber: tempReg.phoneNumber,
          password: tempReg.password, // Already hashed
          primaryAuthMethod: 'EMAIL',
          emailVerified: tempReg.emailVerified,
          phoneVerified: tempReg.phoneVerified,
          consentGiven: tempReg.consentGiven,
          consentDate: tempReg.consentDate,
          registrationStep: 'COMPLETED',
          isActive: true,
        },
      });

      // 2. Create the account
      const account = await tx.account.create({
        data: {
          name: tempReg.accountName,
          slug: tempReg.accountSlug,
          billingEmail: tempReg.email,
          generalEmail: tempReg.email,
        },
      });

      // 3. Create the Owner role for this account
      const ownerRole = await tx.role.create({
        data: {
          accountId: account.id,
          name: 'Owner',
          description: 'Full access to all account features',
          permissions: OWNER_PERMISSIONS,
          isSystemRole: true,
        },
      });

      // 4. Create the AccountMember linking user, account, and role
      await tx.accountMember.create({
        data: {
          accountId: account.id,
          userId: user.id,
          roleId: ownerRole.id,
          isOwner: true,
          status: 'ACTIVE',
        },
      });

      // 5. Update user's lastSelectedAccountId
      await tx.user.update({
        where: { id: user.id },
        data: { lastSelectedAccountId: account.id },
      });

      // 6. Create subscription if plan was selected
      if (tempReg.selectedPlanId) {
        const plan = await tx.plan.findUnique({
          where: { id: tempReg.selectedPlanId },
        });

        if (plan) {
          await tx.subscription.create({
            data: {
              accountId: account.id,
              planId: plan.id,
              status: 'ACTIVE',
              currentPeriodStart: new Date(),
              currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
            },
          });
        }
      }

      // 7. Delete the temp registration
      await tx.tempRegistration.delete({
        where: { id: tempRegId },
      });

      return { user, account };
    });

    // Clear the temp registration cookie
    cookieStore.delete(TEMP_REG_COOKIE);

    // Return success with user data for session
    return NextResponse.json({
      success: true,
      user: {
        id: result.user.id,
        email: result.user.email,
        firstName: result.user.firstName,
        lastName: result.user.lastName,
      },
      account: {
        id: result.account.id,
        name: result.account.name,
        slug: result.account.slug,
      },
    });
  } catch (error) {
    console.error('Finalize registration error:', error);
    return NextResponse.json(
      { error: 'Failed to complete registration' },
      { status: 500 }
    );
  }
}

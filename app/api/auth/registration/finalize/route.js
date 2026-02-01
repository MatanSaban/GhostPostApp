import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';

const TEMP_REG_COOKIE = 'temp_reg_id';
const SESSION_COOKIE = 'user_session';

// All permissions for the Owner role (must match Permission enum in schema.prisma)
const OWNER_PERMISSIONS = [
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
  'MEMBERS_DELETE',
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
  // Settings
  'SETTINGS_GENERAL_VIEW',
  'SETTINGS_GENERAL_EDIT',
  'SETTINGS_AI_VIEW',
  'SETTINGS_AI_EDIT',
  'SETTINGS_SCHEDULING_VIEW',
  'SETTINGS_SCHEDULING_EDIT',
  'SETTINGS_NOTIFICATIONS_VIEW',
  'SETTINGS_NOTIFICATIONS_EDIT',
  'SETTINGS_SEO_VIEW',
  'SETTINGS_SEO_EDIT',
  'SETTINGS_INTEGRATIONS_VIEW',
  'SETTINGS_INTEGRATIONS_EDIT',
  'SETTINGS_USERS_VIEW',
  'SETTINGS_USERS_EDIT',
  'SETTINGS_TEAM_VIEW',
  'SETTINGS_TEAM_EDIT',
  'SETTINGS_ROLES_VIEW',
  'SETTINGS_ROLES_EDIT',
  'SETTINGS_SUBSCRIPTION_VIEW',
  'SETTINGS_SUBSCRIPTION_EDIT',
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
          image: tempReg.image, // Profile image (e.g., from Google)
          primaryAuthMethod: tempReg.authMethod || 'EMAIL',
          emailVerified: tempReg.emailVerified,
          phoneVerified: tempReg.phoneVerified,
          consentGiven: tempReg.consentGiven,
          consentDate: tempReg.consentDate,
          registrationStep: 'COMPLETED',
          isActive: true,
        },
      });

      // 1b. If registered via Google, create AuthProvider record
      if (tempReg.authMethod === 'GOOGLE' && tempReg.googleId) {
        await tx.authProvider.create({
          data: {
            userId: user.id,
            provider: 'GOOGLE',
            providerAccountId: tempReg.googleId,
            isPrimary: true,
          },
        });
      }

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
              billingInterval: 'MONTHLY', // Default to monthly
              currentPeriodStart: new Date(),
              currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
            },
          });
          
          // Get AI credits from plan limitations
          const { getLimitFromPlan } = await import('@/lib/account-utils');
          const planAiCredits = getLimitFromPlan(plan.limitations, 'aiCredits', 0) || 0;
          
          // Add plan's AI credits to account balance
          if (planAiCredits > 0) {
            await tx.account.update({
              where: { id: account.id },
              data: { aiCreditsBalance: planAiCredits },
            });
            
            // Log the initial credit allocation
            await tx.aiCreditsLog.create({
              data: {
                accountId: account.id,
                type: 'CREDIT',
                amount: planAiCredits,
                balance: planAiCredits,
                source: 'plan_activation',
                description: `Initial AI credits from ${plan.name} plan`,
              },
            });
          }
        }
      }

      // 7. Create site from interview data if website URL was provided
      let site = null;
      const interviewData = tempReg.interviewData || {};
      const websiteUrl = interviewData.websiteUrl;
      
      if (websiteUrl) {
        // Import site key utilities
        const { generateSiteKey, generateSiteSecret, DEFAULT_SITE_PERMISSIONS } = await import('@/lib/site-keys');
        
        // Normalize URL
        let normalizedUrl = websiteUrl.trim();
        if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
          normalizedUrl = 'https://' + normalizedUrl;
        }
        // Remove trailing slash
        normalizedUrl = normalizedUrl.replace(/\/+$/, '');
        
        // Extract site name from URL or use account name
        let siteName = account.name;
        try {
          const urlObj = new URL(normalizedUrl);
          siteName = urlObj.hostname.replace('www.', '');
        } catch {
          // Keep account name as fallback
        }
        
        // Detect platform from interview analysis if available
        const platform = interviewData.analysis?.platform?.name?.toLowerCase() || null;
        
        // Generate site connection keys
        const siteKey = generateSiteKey();
        const siteSecret = generateSiteSecret();
        
        site = await tx.site.create({
          data: {
            accountId: account.id,
            name: siteName,
            url: normalizedUrl,
            platform,
            isActive: true,
            connectionStatus: 'PENDING',
            siteKey,
            siteSecret,
            sitePermissions: DEFAULT_SITE_PERMISSIONS,
          },
        });
        
        // Update the AccountMember to set this site as selected
        await tx.accountMember.updateMany({
          where: { 
            accountId: account.id,
            userId: user.id,
          },
          data: { lastSelectedSiteId: site.id },
        });
        
        console.log('[Finalize] Created site:', { siteId: site.id, url: normalizedUrl });
      }

      // 8. Delete the temp registration
      await tx.tempRegistration.delete({
        where: { id: tempRegId },
      });

      return { user, account, site };
    });

    // Clear the temp registration cookie
    cookieStore.delete(TEMP_REG_COOKIE);

    // Set session cookie to log in the user
    cookieStore.set(SESSION_COOKIE, result.user.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: '/',
    });

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
      site: result.site ? {
        id: result.site.id,
        name: result.site.name,
        url: result.site.url,
      } : null,
    });
  } catch (error) {
    console.error('Finalize registration error:', error);
    return NextResponse.json(
      { error: 'Failed to complete registration' },
      { status: 500 }
    );
  }
}

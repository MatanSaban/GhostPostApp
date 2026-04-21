import crypto from 'crypto';
import prisma from '@/lib/prisma';

// Owner permissions - must stay in sync with the set in
// app/api/auth/registration/finalize/route.js.
export const OWNER_PERMISSIONS = [
  'ACCOUNT_VIEW',
  'ACCOUNT_EDIT',
  'ACCOUNT_DELETE',
  'ACCOUNT_BILLING_VIEW',
  'ACCOUNT_BILLING_MANAGE',
  'MEMBERS_VIEW',
  'MEMBERS_INVITE',
  'MEMBERS_EDIT',
  'MEMBERS_DELETE',
  'ROLES_VIEW',
  'ROLES_CREATE',
  'ROLES_EDIT',
  'ROLES_DELETE',
  'SITES_VIEW',
  'SITES_CREATE',
  'SITES_EDIT',
  'SITES_DELETE',
  'CONTENT_PLANNER_VIEW',
  'CONTENT_PLANNER_CREATE',
  'CONTENT_PLANNER_EDIT',
  'CONTENT_PLANNER_DELETE',
  'AI_CONTENT_VIEW',
  'AI_CONTENT_CREATE',
  'AI_CONTENT_EDIT',
  'AI_CONTENT_DELETE',
  'ENTITIES_VIEW',
  'ENTITIES_CREATE',
  'ENTITIES_EDIT',
  'ENTITIES_PUBLISH',
  'ENTITIES_DELETE',
  'CAMPAIGNS_VIEW',
  'CAMPAIGNS_CREATE',
  'CAMPAIGNS_EDIT',
  'CAMPAIGNS_DELETE',
  'KEYWORDS_VIEW',
  'KEYWORDS_CREATE',
  'KEYWORDS_EDIT',
  'KEYWORDS_DELETE',
  'COMPETITORS_VIEW',
  'COMPETITORS_CREATE',
  'COMPETITORS_EDIT',
  'COMPETITORS_DELETE',
  'REDIRECTIONS_VIEW',
  'REDIRECTIONS_CREATE',
  'REDIRECTIONS_EDIT',
  'REDIRECTIONS_DELETE',
  'INTERVIEW_VIEW',
  'INTERVIEW_EDIT',
  'AUDIT_VIEW',
  'AUDIT_RUN',
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
  'REPORTS_VIEW',
  'REPORTS_MANAGE',
];

// MongoDB ObjectId is 24 hex chars. The placeholder slug cannot collide with a
// real slug because real slugs are required to be lowercase alphanumeric plus
// hyphens; the collision probability of two random 24-hex strings is negligible.
function draftSlug() {
  return `draft-${crypto.randomBytes(12).toString('hex')}`;
}

function draftAccountName(firstName) {
  const trimmed = (firstName || '').trim();
  if (trimmed) return `${trimmed}'s workspace`;
  return 'Draft workspace';
}

/**
 * Wipe any existing draft user (and all cascaded rows) for the given email.
 * Used when someone re-registers with an email that has an abandoned draft.
 * Never touches completed users.
 */
export async function purgeDraftUserByEmail(email) {
  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true, registrationStep: true },
  });
  if (existing && existing.registrationStep !== 'COMPLETED') {
    // Cascade deletes AuthProvider, AccountMember, OtpCode, etc.
    await prisma.user.delete({ where: { id: existing.id } });
    // Draft account(s) owned by this user are cascaded via AccountMember/Account relations.
    // Also purge any dangling draft accounts whose owner-email matches.
    await prisma.account.deleteMany({
      where: { isDraft: true, billingEmail: email },
    });
  }
}

/**
 * Create a real User + draft Account + Owner role + membership in one transaction.
 * Optionally links a Google AuthProvider.
 *
 * Returns { user, account, role } - all real DB rows. The account's `isDraft`
 * flag is true until registration finalizes.
 */
export async function createDraftUserAndAccount({
  email,
  firstName = '',
  lastName = '',
  phoneNumber = null,
  password = null, // already hashed
  image = null,
  authMethod = 'EMAIL', // 'EMAIL' | 'GOOGLE'
  googleId = null,
  googleTokens = null, // { access_token, refresh_token, expires_in }
  emailVerified = null, // Date | null
  consentGiven = false,
  consentDate = null,
  registrationStep = 'VERIFY',
}) {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email,
        firstName: firstName || null,
        lastName: lastName || null,
        phoneNumber,
        password,
        image,
        primaryAuthMethod: authMethod,
        emailVerified,
        consentGiven,
        consentDate,
        registrationStep,
        isActive: true,
      },
    });

    if (authMethod === 'GOOGLE' && googleId) {
      await tx.authProvider.create({
        data: {
          userId: user.id,
          provider: 'GOOGLE',
          providerAccountId: googleId,
          accessToken: googleTokens?.access_token || null,
          refreshToken: googleTokens?.refresh_token || null,
          expiresAt: googleTokens?.expires_in
            ? Math.floor(Date.now() / 1000) + googleTokens.expires_in
            : null,
          isPrimary: true,
        },
      });
    }

    const account = await tx.account.create({
      data: {
        name: draftAccountName(firstName),
        slug: draftSlug(),
        billingEmail: email,
        generalEmail: email,
        isDraft: true,
      },
    });

    const role = await tx.role.create({
      data: {
        accountId: account.id,
        name: 'Owner',
        description: 'Full access to all account features',
        permissions: OWNER_PERMISSIONS,
        isSystemRole: true,
      },
    });

    await tx.accountMember.create({
      data: {
        accountId: account.id,
        userId: user.id,
        roleId: role.id,
        isOwner: true,
        status: 'ACTIVE',
      },
    });

    await tx.user.update({
      where: { id: user.id },
      data: { lastSelectedAccountId: account.id },
    });

    return { user, account, role };
  });
}

/**
 * Fetch a user's single draft account (the one they own and haven't activated yet).
 * Returns null if no draft is owned by the user.
 */
export async function getDraftAccountForUser(userId) {
  const membership = await prisma.accountMember.findFirst({
    where: {
      userId,
      isOwner: true,
      account: { isDraft: true },
    },
    include: { account: true },
  });
  return membership?.account || null;
}

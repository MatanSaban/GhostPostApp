/**
 * Create Site Account Handler
 * 
 * Creates a new site account for the user.
 */

/**
 * Generate a URL-friendly slug from a name
 */
function generateSlug(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 50);
}

/**
 * Map language code to Language enum
 */
function mapLanguage(lang) {
  const languageMap = {
    'en': 'EN',
    'he': 'HE',
    'ar': 'AR',
    'es': 'ES',
    'fr': 'FR',
    'de': 'DE',
    'pt': 'PT',
    'it': 'IT',
    'ru': 'RU',
    'zh': 'ZH',
    'ja': 'JA',
    'ko': 'KO'
  };
  return languageMap[lang?.toLowerCase()] || 'EN';
}

export async function createSiteAccount(params, context) {
  const { name, url, platform, language } = params;
  
  if (!context.userId) {
    return {
      success: false,
      error: 'User not authenticated'
    };
  }
  
  try {
    // Get user
    const user = await context.prisma.user.findUnique({
      where: { id: context.userId },
      include: {
        accountMemberships: {
          where: { isOwner: true },
          include: { account: true }
        }
      }
    });
    
    if (!user) {
      return {
        success: false,
        error: 'User not found'
      };
    }
    
    // Get or create account for user
    let account = user.accountMemberships[0]?.account;
    
    if (!account) {
      // Create a new account for the user
      const accountSlug = generateSlug(name || user.email.split('@')[0]);
      
      // Find owner role or create one
      account = await context.prisma.account.create({
        data: {
          name: name || 'My Account',
          slug: accountSlug + '-' + Date.now().toString(36),
          billingEmail: user.email,
          generalEmail: user.email,
          defaultLanguage: mapLanguage(language)
        }
      });
      
      // Create owner role
      const ownerRole = await context.prisma.role.create({
        data: {
          accountId: account.id,
          name: 'Owner',
          description: 'Account owner with full access',
          isSystemRole: true,
          permissions: [
            'ACCOUNT_VIEW', 'ACCOUNT_EDIT', 'ACCOUNT_DELETE',
            'ACCOUNT_BILLING_VIEW', 'ACCOUNT_BILLING_MANAGE',
            'MEMBERS_VIEW', 'MEMBERS_INVITE', 'MEMBERS_EDIT', 'MEMBERS_REMOVE',
            'ROLES_VIEW', 'ROLES_CREATE', 'ROLES_EDIT', 'ROLES_DELETE',
            'SITES_VIEW', 'SITES_CREATE', 'SITES_EDIT', 'SITES_DELETE',
            'CONTENT_VIEW', 'CONTENT_CREATE', 'CONTENT_EDIT', 'CONTENT_PUBLISH', 'CONTENT_DELETE',
            'KEYWORDS_VIEW', 'KEYWORDS_CREATE', 'KEYWORDS_EDIT', 'KEYWORDS_DELETE',
            'REDIRECTIONS_VIEW', 'REDIRECTIONS_CREATE', 'REDIRECTIONS_EDIT', 'REDIRECTIONS_DELETE',
            'INTERVIEW_VIEW', 'INTERVIEW_MANAGE',
            'AUDIT_VIEW', 'AUDIT_RUN',
            'SETTINGS_VIEW', 'SETTINGS_EDIT'
          ]
        }
      });
      
      // Add user as owner
      await context.prisma.accountMember.create({
        data: {
          accountId: account.id,
          userId: user.id,
          roleId: ownerRole.id,
          isOwner: true,
          status: 'ACTIVE'
        }
      });
    }
    
    // Create the site
    const siteSlug = generateSlug(name);
    const site = await context.prisma.site.create({
      data: {
        accountId: account.id,
        name: name,
        slug: siteSlug + '-' + Date.now().toString(36),
        domain: url ? new URL(url.startsWith('http') ? url : 'https://' + url).hostname : null,
        language: mapLanguage(language),
        settings: {
          platform: platform || 'unknown',
          originalUrl: url
        }
      }
    });
    
    // Update interview with siteId if available
    if (context.interview) {
      await context.prisma.userInterview.update({
        where: { id: context.interview.id },
        data: { siteId: site.id }
      });
    }
    
    // Update user's lastSelectedAccountId
    await context.prisma.user.update({
      where: { id: user.id },
      data: { lastSelectedAccountId: account.id }
    });
    
    return {
      success: true,
      siteId: site.id,
      accountId: account.id,
      site: {
        id: site.id,
        name: site.name,
        domain: site.domain
      }
    };
    
  } catch (error) {
    console.error('Create site account error:', error);
    return {
      success: false,
      error: error.message || 'Failed to create site account'
    };
  }
}

/**
 * Create Site Account Handler
 * 
 * Creates a new site account for the user.
 * Also tracks Ai-GCoins for operations performed during the interview.
 */

import { trackAIUsage } from '@/lib/ai/credits-service';
import { AI_OPERATIONS } from '@/lib/ai/credits';

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
            'MEMBERS_VIEW', 'MEMBERS_INVITE', 'MEMBERS_EDIT', 'MEMBERS_DELETE',
            'ROLES_VIEW', 'ROLES_CREATE', 'ROLES_EDIT', 'ROLES_DELETE',
            'SITES_VIEW', 'SITES_CREATE', 'SITES_EDIT', 'SITES_DELETE',
            'CONTENT_PLANNER_VIEW', 'CONTENT_PLANNER_CREATE', 'CONTENT_PLANNER_EDIT', 'CONTENT_PLANNER_DELETE',
            'AI_CONTENT_VIEW', 'AI_CONTENT_CREATE', 'AI_CONTENT_EDIT', 'AI_CONTENT_DELETE',
            'ENTITIES_VIEW', 'ENTITIES_CREATE', 'ENTITIES_EDIT', 'ENTITIES_PUBLISH', 'ENTITIES_DELETE',
            'CAMPAIGNS_VIEW', 'CAMPAIGNS_CREATE', 'CAMPAIGNS_EDIT', 'CAMPAIGNS_DELETE',
            'KEYWORDS_VIEW', 'KEYWORDS_CREATE', 'KEYWORDS_EDIT', 'KEYWORDS_DELETE',
            'COMPETITORS_VIEW', 'COMPETITORS_CREATE', 'COMPETITORS_EDIT', 'COMPETITORS_DELETE',
            'REDIRECTIONS_VIEW', 'REDIRECTIONS_CREATE', 'REDIRECTIONS_EDIT', 'REDIRECTIONS_DELETE',
            'INTERVIEW_VIEW', 'INTERVIEW_EDIT',
            'AUDIT_VIEW', 'AUDIT_RUN',
            'SETTINGS_GENERAL_VIEW', 'SETTINGS_GENERAL_EDIT',
            'SETTINGS_AI_VIEW', 'SETTINGS_AI_EDIT',
            'SETTINGS_SCHEDULING_VIEW', 'SETTINGS_SCHEDULING_EDIT',
            'SETTINGS_NOTIFICATIONS_VIEW', 'SETTINGS_NOTIFICATIONS_EDIT',
            'SETTINGS_SEO_VIEW', 'SETTINGS_SEO_EDIT',
            'SETTINGS_INTEGRATIONS_VIEW', 'SETTINGS_INTEGRATIONS_EDIT',
            'SETTINGS_USERS_VIEW', 'SETTINGS_USERS_EDIT',
            'SETTINGS_TEAM_VIEW', 'SETTINGS_TEAM_EDIT',
            'SETTINGS_ROLES_VIEW', 'SETTINGS_ROLES_EDIT',
            'SETTINGS_SUBSCRIPTION_VIEW', 'SETTINGS_SUBSCRIPTION_EDIT',
            'REPORTS_VIEW', 'REPORTS_MANAGE',
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
    const responses = context.interview?.responses || {};
    const externalData = context.interview?.externalData || {};
    const crawled = externalData.crawledData || {};
    const businessInfo = responses.businessInfo || {};
    
    // Ensure URL always has a protocol (prefer crawled URL which has correct protocol)
    let siteUrl = crawled.url || url || '';
    if (siteUrl && !siteUrl.startsWith('http://') && !siteUrl.startsWith('https://')) {
      siteUrl = `https://${siteUrl}`;
    }

    // Check for duplicate site URL in the same account
    const normalizedNew = siteUrl.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/+$/, '').toLowerCase();
    const existingSites = await context.prisma.site.findMany({
      where: { accountId: account.id, isActive: true },
      select: { url: true },
    });
    const isDuplicate = existingSites.some(s => {
      const existing = (s.url || '').replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/+$/, '').toLowerCase();
      return existing === normalizedNew;
    });

    if (isDuplicate) {
      return {
        success: false,
        error: `This website already exists under the account "${account.name}".`
      };
    }
    
    const site = await context.prisma.site.create({
      data: {
        accountId: account.id,
        name: name,
        url: siteUrl,
        platform: platform || 'unknown',
        contentLanguage: language || responses.contentLanguage || null,
        businessName: businessInfo.businessName || crawled.businessName || null,
        businessPhone: businessInfo.phone || crawled.phone || null,
        businessEmail: businessInfo.email || crawled.email || null,
        businessAbout: businessInfo.about || crawled.description || null,
        businessCategory: businessInfo.category || crawled.category || null,
        businessAddress: businessInfo.address || crawled.address || null,
        targetLocations: responses.targetLocations || [],
        writingStyle: typeof responses.writingStyle === 'string' ? responses.writingStyle : (responses.writingStyle?.selected || null),
        internalLinksPer1000: responses.internalLinksPer1000Words != null ? parseInt(responses.internalLinksPer1000Words) : null,
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
    
    // Track Ai-GCoins for all operations performed during the interview
    // This is needed because accountId wasn't available when the operations ran
    // Only track if this is a new account (context.accountId was null)
    if (context.interview && !context.accountId) {
      const externalData = context.interview.externalData || {};
      const operationsToTrack = [];
      
      // Check which operations were performed based on externalData keys
      if (externalData.crawledData || externalData._rawCrawlResult) {
        operationsToTrack.push({
          operation: 'CRAWL_WEBSITE',
          description: `Website crawl during interview for ${url}`,
          metadata: { websiteUrl: url },
        });
      }
      
      if (externalData.crawledData?.platform || externalData.platform) {
        operationsToTrack.push({
          operation: 'DETECT_PLATFORM',
          description: `Platform detection during interview`,
          metadata: { platform: externalData.crawledData?.platform || externalData.platform },
        });
      }
      
      if (externalData.keywordSuggestions?.length > 0) {
        operationsToTrack.push({
          operation: 'GENERATE_KEYWORDS',
          description: `Generated ${externalData.keywordSuggestions.length} keywords during interview`,
          metadata: { keywordCount: externalData.keywordSuggestions.length },
        });
      }
      
      if (externalData.competitorSuggestions?.length > 0) {
        operationsToTrack.push({
          operation: 'FIND_COMPETITORS',
          description: `Found ${externalData.competitorSuggestions.length} competitors during interview`,
          metadata: { competitorCount: externalData.competitorSuggestions.length },
        });
      }
      
      if (externalData.writingStyleAnalysis) {
        operationsToTrack.push({
          operation: 'ANALYZE_WRITING_STYLE',
          description: `Writing style analysis during interview`,
          metadata: {},
        });
      }
      
      // Track all operations
      console.log(`[CreateSiteAccount] Tracking ${operationsToTrack.length} AI operations for account ${account.id}`);
      for (const op of operationsToTrack) {
        await trackAIUsage({
          accountId: account.id,
          userId: context.userId,
          siteId: site.id,
          operation: op.operation,
          description: op.description,
          metadata: {
            ...op.metadata,
            trackedDuringAccountCreation: true,
            interviewId: context.interview.id,
          },
        });
      }
    }
    
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

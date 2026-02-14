/**
 * Complete Interview Handler
 * 
 * Finalizes the interview, generates an SEO strategy using AI,
 * creates the site account if needed, and marks as complete.
 */

import { generateSEOStrategy } from '@/lib/ai/interview-ai.js';
import { trackAIUsage } from '@/lib/ai/credits-service';
import { AI_OPERATIONS } from '@/lib/ai/credits';

export async function completeInterview(params, context) {
  const { createAccount = true } = params;
  
  if (!context.interview) {
    return {
      success: false,
      error: 'No active interview session'
    };
  }
  
  try {
    const interview = context.interview;
    const responses = interview.responses || {};
    const externalData = interview.externalData || {};

    // Generate SEO strategy using AI
    let seoStrategy = null;
    try {
      const strategyData = {
        businessName: externalData.crawledData?.businessName || responses.businessName,
        category: externalData.crawledData?.category,
        description: externalData.crawledData?.description,
        websiteUrl: responses.websiteUrl,
        competitors: responses.competitors,
        writingStyle: responses.writingStyle || externalData.crawledData?.writingStyle,
        intentions: responses.intentions,
        keywords: responses.keywords || externalData.keywordSuggestions,
        contentLanguage: responses.contentLanguage,
        internalLinksPerArticle: responses.internalLinksPerArticle,
      };

      const strategyResult = await generateSEOStrategy(strategyData);
      if (strategyResult.success) {
        seoStrategy = strategyResult.data;
        
        // Track AI credits usage for SEO strategy generation
        if (context.accountId) {
          await trackAIUsage({
            accountId: context.accountId,
            userId: context.userId,
            siteId: context.siteId || siteId,
            operation: AI_OPERATIONS.COMPLETE_INTERVIEW.key,
            description: `Interview completion and SEO strategy for ${responses.websiteUrl}`,
            metadata: {
              websiteUrl: responses.websiteUrl,
              businessName: responses.businessName,
              hasStrategy: !!seoStrategy,
              descriptionKey: 'completedInterview',
              descriptionParams: { url: responses.websiteUrl },
            }
          });
        }
      }
    } catch (aiError) {
      console.error('SEO strategy generation error:', aiError);
    }
    
    // Check if we already have a site
    let siteId = interview.siteId;
    let newAccountId = null;  // Track if we created a new account
    
    // Create site account if requested and not already created
    if (createAccount && !siteId && responses.websiteUrl) {
      // Import and call create site account handler
      const { createSiteAccount } = await import('./create-site-account.js');
      
      const createResult = await createSiteAccount({
        name: responses.businessName || responses.websiteName || 'My Website',
        url: responses.websiteUrl,
        platform: responses.platform || 'unknown',
        language: responses.language || responses.contentLanguage || 'en'
      }, context);
      
      if (createResult.success) {
        siteId = createResult.siteId;
        newAccountId = createResult.accountId;
        
        // Track COMPLETE_INTERVIEW credits if we just created an account
        // (create-site-account tracks all other interview operations)
        if (seoStrategy && newAccountId) {
          await trackAIUsage({
            accountId: newAccountId,
            userId: context.userId,
            siteId: siteId,
            operation: 'COMPLETE_INTERVIEW',
            description: `Interview completion and SEO strategy for ${responses.websiteUrl}`,
            metadata: {
              websiteUrl: responses.websiteUrl,
              businessName: responses.businessName,
              hasStrategy: true,
              trackedDuringAccountCreation: true,
              descriptionKey: 'completedInterview',
              descriptionParams: { url: responses.websiteUrl },
            },
          });
        }
      } else {
        console.error('Failed to create site account:', createResult.error);
      }
    }
    
    // Update site with collected data if we have a site
    if (siteId) {
      const { updateSiteAccount } = await import('./update-site-account.js');
      
      const updateFields = {};
      
      // Map interview responses to site fields
      if (responses.phone) updateFields.phone = responses.phone;
      if (responses.email) updateFields.email = responses.email;
      if (responses.competitors) updateFields.competitors = responses.competitors;
      if (responses.writingStyle) updateFields.writingStyle = responses.writingStyle;
      if (responses.intentions) updateFields.intentions = responses.intentions;
      if (responses.keywords) updateFields.keywords = responses.keywords;
      if (responses.internalLinksCount) updateFields.internalLinksCount = responses.internalLinksCount;
      if (responses.favoriteArticles) updateFields.favoriteArticles = responses.favoriteArticles;
      if (seoStrategy) updateFields.seoStrategy = seoStrategy;
      
      if (Object.keys(updateFields).length > 0) {
        await updateSiteAccount({ siteId, fields: updateFields }, {
          ...context,
          interview: { ...interview, siteId }
        });
      }
      
      // Save selected keywords to the Keyword model
      try {
        const keywordsToSave = responses.keywords || [];
        // keywords can be an array of strings or an object with selectedKeywords
        const keywordStrings = Array.isArray(keywordsToSave) 
          ? keywordsToSave 
          : (keywordsToSave.selectedKeywords || []);
        
        if (keywordStrings.length > 0) {
          // Get existing keywords for deduplication
          const existingKeywords = await context.prisma.keyword.findMany({
            where: { siteId },
            select: { keyword: true },
          });
          const existingSet = new Set(existingKeywords.map(k => k.keyword.toLowerCase().trim()));
          
          const newKeywords = keywordStrings
            .filter(kw => typeof kw === 'string' && kw.trim() && !existingSet.has(kw.toLowerCase().trim()))
            .map(kw => ({
              siteId,
              keyword: kw.trim(),
              status: 'TRACKING',
              tags: ['interview'],
            }));
          
          if (newKeywords.length > 0) {
            await context.prisma.keyword.createMany({ data: newKeywords });
            console.log(`[CompleteInterview] Saved ${newKeywords.length} keywords to Keyword model for site ${siteId}`);
          }
        }
      } catch (kwError) {
        console.error('[CompleteInterview] Error saving keywords:', kwError);
      }
      
      // Save selected competitors to the Competitor model
      try {
        const competitorsToSave = responses.competitors || [];
        const competitorUrls = Array.isArray(competitorsToSave) ? competitorsToSave : [];
        
        if (competitorUrls.length > 0) {
          for (const url of competitorUrls) {
            try {
              const parsedUrl = new URL(url.startsWith('http') ? url : `https://${url}`);
              const domain = parsedUrl.hostname.replace(/^www\./, '');
              
              // Check if competitor already exists
              const existing = await context.prisma.competitor.findFirst({
                where: {
                  siteId,
                  OR: [
                    { url: parsedUrl.href },
                    { domain },
                  ],
                },
              });
              
              if (!existing) {
                await context.prisma.competitor.create({
                  data: {
                    siteId,
                    url: parsedUrl.href,
                    domain,
                    name: domain,
                    favicon: `https://www.google.com/s2/favicons?domain=${domain}&sz=64`,
                    source: 'AI',
                    scanStatus: 'PENDING',
                  },
                });
              } else if (!existing.isActive) {
                // Reactivate if was deactivated
                await context.prisma.competitor.update({
                  where: { id: existing.id },
                  data: { isActive: true },
                });
              }
            } catch (urlErr) {
              console.error(`[CompleteInterview] Error saving competitor ${url}:`, urlErr);
            }
          }
          console.log(`[CompleteInterview] Saved competitors to Competitor model for site ${siteId}`);
        }
      } catch (compError) {
        console.error('[CompleteInterview] Error saving competitors:', compError);
      }
    }
    
    // Mark interview as completed and store SEO strategy
    await context.prisma.userInterview.update({
      where: { id: interview.id },
      data: {
        status: 'COMPLETED',
        siteId: siteId || interview.siteId,
        completedAt: new Date(),
        externalData: {
          ...externalData,
          seoStrategy: seoStrategy,
          completedAt: new Date().toISOString(),
        }
      }
    });
    
    // Update user registration step if applicable
    if (context.userId) {
      const user = await context.prisma.user.findUnique({
        where: { id: context.userId }
      });
      
      if (user && user.registrationStep === 'INTERVIEW') {
        await context.prisma.user.update({
          where: { id: context.userId },
          data: { registrationStep: 'PLAN' }
        });
      }
    }
    
    return {
      success: true,
      siteId: siteId || null,
      seoStrategy: seoStrategy,
      message: 'Interview completed successfully',
      nextStep: siteId ? 'dashboard' : 'manual-setup'
    };
    
  } catch (error) {
    console.error('Complete interview error:', error);
    return {
      success: false,
      error: error.message || 'Failed to complete interview'
    };
  }
}

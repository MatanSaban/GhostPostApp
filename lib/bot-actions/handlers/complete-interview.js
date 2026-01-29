/**
 * Complete Interview Handler
 * 
 * Finalizes the interview, generates an SEO strategy using AI,
 * creates the site account if needed, and marks as complete.
 */

import { generateSEOStrategy } from '@/lib/ai/interview-ai.js';

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
      }
    } catch (aiError) {
      console.error('SEO strategy generation error:', aiError);
    }
    
    // Check if we already have a site
    let siteId = interview.siteId;
    
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

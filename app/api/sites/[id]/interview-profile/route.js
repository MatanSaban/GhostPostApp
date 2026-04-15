/**
 * Site Interview Profile API
 * Returns the interview data collected for a site
 */

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';

const SESSION_COOKIE = 'user_session';

// Get authenticated user with account memberships
async function getAuthenticatedUser() {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get(SESSION_COOKIE)?.value;

    if (!userId) {
      return null;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        isSuperAdmin: true,
        accountMemberships: {
          select: {
            accountId: true,
          },
        },
      },
    });

    return user;
  } catch (error) {
    console.error('[InterviewProfile] Auth error:', error);
    return null;
  }
}

export async function GET(request, { params }) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: siteId } = await params;

    // SuperAdmin can access any site, others need account membership
    let site;
    if (user.isSuperAdmin) {
      site = await prisma.site.findUnique({
        where: { id: siteId },
        select: {
          id: true,
          url: true,
          name: true,
          platform: true,
          crawledData: true,
          crawledAt: true,
        },
      });
    } else {
      const accountIds = user.accountMemberships.map(m => m.accountId);
      site = await prisma.site.findFirst({
        where: user.isSuperAdmin ? { id: siteId } : { id: siteId, accountId: { in: accountIds } },
        select: {
          id: true,
          url: true,
          name: true,
          platform: true,
          crawledData: true,
          crawledAt: true,
        },
      });
    }

    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    // Find the interview for this site
    // Prioritize IN_PROGRESS/NOT_STARTED interviews over COMPLETED ones
    // This ensures if user starts a new interview after completing one,
    // we show the new interview's data (not the old completed one)
    let interview = await prisma.userInterview.findFirst({
      where: {
        userId: user.id,
        siteId: siteId,
        status: { in: ['IN_PROGRESS', 'NOT_STARTED'] },
      },
      select: {
        id: true,
        status: true,
        responses: true,
        externalData: true,
        currentStep: true,
        completedAt: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
    });

    // If no active interview, fall back to the most recent completed one
    if (!interview) {
      interview = await prisma.userInterview.findFirst({
        where: {
          userId: user.id,
          siteId: siteId,
          status: 'COMPLETED',
        },
        select: {
          id: true,
          status: true,
          responses: true,
          externalData: true,
          currentStep: true,
          completedAt: true,
          updatedAt: true,
        },
        orderBy: { updatedAt: 'desc' },
      });
    }

    if (!interview) {
      return NextResponse.json({
        status: 'NOT_STARTED',
        progress: 0,
        sections: [],
        crawledData: site.crawledData || null,
        availablePosts: [],
      });
    }

    let responses = interview.responses || {};
    const externalData = interview.externalData || {};

    // If the active interview is IN_PROGRESS and missing key fields,
    // fill them in from the most recent completed interview (if any).
    // This ensures defaults (e.g. writingStyle) are available even when
    // the user started a new interview that hasn't reached those questions yet.
    if (interview.status === 'IN_PROGRESS') {
      const completedInterview = await prisma.userInterview.findFirst({
        where: {
          userId: user.id,
          siteId: siteId,
          status: 'COMPLETED',
        },
        select: { responses: true },
        orderBy: { updatedAt: 'desc' },
      });

      if (completedInterview?.responses) {
        const completedResponses = completedInterview.responses;
        const fieldsToFill = [
          'writingStyle', 'websitePlatform', 'contentLanguage',
          'internalLinksPer1000Words', 'favoriteArticles',
        ];
        const merged = { ...responses };
        for (const field of fieldsToFill) {
          if (merged[field] === undefined && completedResponses[field] !== undefined) {
            merged[field] = completedResponses[field];
          }
        }
        responses = merged;
      }
    }
    const crawledData = externalData.crawledData || site.crawledData || {};

    // Get available posts from SiteEntity or fetched articles
    let availablePosts = [];
    
    // First try to get posts from SiteEntity (synced from WordPress)
    const postEntityType = await prisma.siteEntityType.findFirst({
      where: { siteId: site.id, slug: { in: ['posts', 'post'] } },
    });
    
    if (postEntityType) {
      const siteEntities = await prisma.siteEntity.findMany({
        where: { 
          siteId: site.id, 
          entityTypeId: postEntityType.id,
          status: 'PUBLISHED',
        },
        select: {
          id: true,
          title: true,
          url: true,
          excerpt: true,
          featuredImage: true,
        },
        orderBy: { publishedAt: 'desc' },
        take: 50,
      });
      
      availablePosts = siteEntities.map(e => ({
        id: e.id,
        title: e.title,
        url: e.url,
        excerpt: e.excerpt,
        image: e.featuredImage,
      }));
    }
    
    // Fallback to fetchedArticles from interview externalData
    if (availablePosts.length === 0 && externalData.fetchedArticles?.length > 0) {
      availablePosts = externalData.fetchedArticles.map(a => ({
        id: a.url, // Use URL as ID for fetched articles
        title: a.title,
        url: a.url,
        excerpt: a.excerpt,
        image: a.image,
      }));
    }

    // Fetch manual keywords from Keyword model (not archived)
    const siteKeywords = await prisma.keyword.findMany({
      where: {
        siteId: site.id,
        status: { not: 'ARCHIVED' },
      },
      select: {
        id: true,
        keyword: true,
        status: true,
        tags: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    // Fetch competitors from Competitor model (active ones)
    const siteCompetitors = await prisma.competitor.findMany({
      where: {
        siteId: site.id,
        isActive: true,
      },
      select: {
        id: true,
        url: true,
        domain: true,
        name: true,
        source: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    // Build sections from interview data merged with site data
    const sections = buildSections(responses, crawledData, availablePosts, siteKeywords, siteCompetitors);
    
    // Calculate progress
    const totalQuestions = 13; // Based on interview questions count
    const answeredQuestions = Object.keys(responses).filter(key => {
      const val = responses[key];
      return val !== null && val !== undefined && val !== '' && 
             (Array.isArray(val) ? val.length > 0 : true);
    }).length;
    const progress = Math.round((answeredQuestions / totalQuestions) * 100);

    return NextResponse.json({
      interviewId: interview.id,
      status: interview.status,
      progress: Math.min(progress, 100),
      completedAt: interview.completedAt,
      updatedAt: interview.updatedAt,
      currentStep: interview.currentStep ?? 0, // Current question index (0-based)
      sections,
      responses,
      crawledData,
      availablePosts,
    });
  } catch (error) {
    console.error('[InterviewProfile] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch interview profile' },
      { status: 500 }
    );
  }
}

/**
 * PATCH - Update interview responses
 */
export async function PATCH(request, { params }) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: siteId } = await params;
    const body = await request.json();
    const { field, value } = body;

    if (!field) {
      return NextResponse.json({ error: 'Field is required' }, { status: 400 });
    }

    // Verify site access
    let site;
    if (user.isSuperAdmin) {
      site = await prisma.site.findUnique({
        where: { id: siteId },
        select: { id: true },
      });
    } else {
      const accountIds = user.accountMemberships.map(m => m.accountId);
      site = await prisma.site.findFirst({
        where: user.isSuperAdmin ? { id: siteId } : { id: siteId, accountId: { in: accountIds } },
        select: { id: true },
      });
    }

    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    // Find the interview for this site
    const interview = await prisma.userInterview.findFirst({
      where: {
        userId: user.id,
        siteId: siteId,
      },
      select: {
        id: true,
        responses: true,
      },
      orderBy: { updatedAt: 'desc' },
    });

    if (!interview) {
      return NextResponse.json({ error: 'Interview not found' }, { status: 404 });
    }

    // Update the specific field in responses
    const currentResponses = interview.responses || {};
    const updatedResponses = {
      ...currentResponses,
      [field]: value,
    };

    // Update the interview
    await prisma.userInterview.update({
      where: { id: interview.id },
      data: {
        responses: updatedResponses,
        updatedAt: new Date(),
      },
    });

    // Sync keywords to Keyword model when keywords field is updated
    if (field === 'keywords' && Array.isArray(value)) {
      try {
        // Get existing keywords
        const existingKeywords = await prisma.keyword.findMany({
          where: { siteId },
          select: { id: true, keyword: true },
        });
        const existingSet = new Set(existingKeywords.map(k => k.keyword.toLowerCase().trim()));

        // Delete keywords that were removed
        const newValueSet = new Set(value.map(kw => typeof kw === 'string' ? kw.toLowerCase().trim() : '').filter(Boolean));
        const keywordsToDelete = existingKeywords.filter(k => !newValueSet.has(k.keyword.toLowerCase().trim()));
        if (keywordsToDelete.length > 0) {
          await prisma.keyword.deleteMany({
            where: { id: { in: keywordsToDelete.map(k => k.id) } },
          });
        }

        // Add new keywords that don't exist
        const newKeywords = value
          .filter(kw => typeof kw === 'string' && kw.trim() && !existingSet.has(kw.toLowerCase().trim()))
          .map(kw => ({
            siteId,
            keyword: kw.trim(),
            status: 'TRACKING',
            tags: ['interview'],
          }));

        if (newKeywords.length > 0) {
          await prisma.keyword.createMany({ data: newKeywords });
        }
      } catch (syncError) {
        console.error('[InterviewProfile] Error syncing keywords:', syncError);
      }
    }

    // Sync competitors to Competitor model when competitors field is updated
    if (field === 'competitors' && Array.isArray(value)) {
      try {
        for (const url of value) {
          try {
            const parsedUrl = new URL(url.startsWith('http') ? url : `https://${url}`);
            const domain = parsedUrl.hostname.replace(/^www\./, '');

            // Check if competitor already exists
            const existing = await prisma.competitor.findFirst({
              where: {
                siteId,
                OR: [
                  { url: parsedUrl.href },
                  { domain },
                ],
              },
            });

            if (!existing) {
              await prisma.competitor.create({
                data: {
                  siteId,
                  url: parsedUrl.href,
                  domain,
                  name: domain,
                  favicon: `https://www.google.com/s2/favicons?domain=${domain}&sz=64`,
                  source: 'MANUAL',
                  scanStatus: 'PENDING',
                },
              });
            } else if (!existing.isActive) {
              // Reactivate if was deactivated
              await prisma.competitor.update({
                where: { id: existing.id },
                data: { isActive: true },
              });
            }
          } catch (urlErr) {
            console.error(`[InterviewProfile] Error syncing competitor ${url}:`, urlErr);
          }
        }
      } catch (syncError) {
        console.error('[InterviewProfile] Error syncing competitors:', syncError);
      }
    }

    return NextResponse.json({ 
      success: true, 
      field, 
      value,
    });
  } catch (error) {
    console.error('[InterviewProfile] PATCH error:', error);
    return NextResponse.json(
      { error: 'Failed to update interview' },
      { status: 500 }
    );
  }
}

/**
 * Safely convert a value to a displayable string
 * Handles objects by extracting meaningful text fields
 */
function toDisplayString(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value;
  
  // Handle objects - try to extract meaningful string
  if (typeof value === 'object') {
    // Return first found text field
    if (value.name) return value.name;
    if (value.title) return value.title;
    if (value.businessName) return value.businessName;
    if (value.about) return value.about;
    if (value.description) return value.description;
    if (value.label) return value.label;
    if (value.text) return value.text;
    
    // For objects with specific fields, create a summary
    const textParts = [];
    if (value.businessName) textParts.push(value.businessName);
    if (value.category) textParts.push(value.category);
    if (value.about) textParts.push(value.about);
    if (textParts.length > 0) {
      return textParts.join(' - ');
    }
    
    // Last resort: return first non-empty string value
    for (const key of Object.keys(value)) {
      if (typeof value[key] === 'string' && value[key].trim()) {
        return value[key];
      }
    }
  }
  
  return null;
}

/**
 * Build display sections from interview responses
 */
function buildSections(responses, crawledData, availablePosts = [], siteKeywords = [], siteCompetitors = []) {
  const sections = [];

  // 1. Website & Business Info
  const businessInfo = {
    id: 'business',
    title: 'פרטי העסק',
    titleKey: 'siteProfile.sections.business',
    status: getFieldStatus([responses.websiteUrl, responses.businessInfo, responses.contentLanguage]),
    items: [],
  };

  if (responses.websiteUrl) {
    businessInfo.items.push({
      label: 'כתובת האתר',
      labelKey: 'siteProfile.fields.websiteUrl',
      fieldKey: 'websiteUrl',
      value: responses.websiteUrl,
      type: 'url',
      editable: false,
    });
  }

  if (crawledData?.businessName || crawledData?.title) {
    businessInfo.items.push({
      label: 'שם העסק',
      labelKey: 'siteProfile.fields.businessName',
      fieldKey: null, // Crawled data - not directly editable
      value: toDisplayString(crawledData.businessName || crawledData.title),
      editable: false,
    });
  }

  if (responses.businessInfo) {
    const businessInfoValue = toDisplayString(responses.businessInfo);
    if (businessInfoValue) {
      businessInfo.items.push({
        label: 'תיאור העסק',
        labelKey: 'siteProfile.fields.businessInfo',
        fieldKey: 'businessInfo',
        value: businessInfoValue,
        type: 'text',
        editable: true,
      });
    }
  }

  // Language code to name mapping
  const languageNames = {
    'he': 'עברית',
    'en': 'אנגלית',
    'ar': 'ערבית',
    'ru': 'רוסית',
    'fr': 'צרפתית',
    'es': 'ספרדית',
    'de': 'גרמנית',
    'it': 'איטלקית',
    'pt': 'פורטוגזית',
    'zh': 'סינית',
    'ja': 'יפנית',
    'ko': 'קוריאנית',
  };

  if (responses.contentLanguage) {
    const langCode = responses.contentLanguage?.toLowerCase?.() || responses.contentLanguage;
    const langName = languageNames[langCode] || toDisplayString(responses.contentLanguage);
    businessInfo.items.push({
      label: 'שפת התוכן',
      labelKey: 'siteProfile.fields.contentLanguage',
      fieldKey: 'contentLanguage',
      value: langName,
      rawValue: responses.contentLanguage,
      type: 'select',
      options: [
        { value: 'he', label: 'עברית' },
        { value: 'en', label: 'אנגלית' },
        { value: 'ar', label: 'ערבית' },
        { value: 'ru', label: 'רוסית' },
        { value: 'fr', label: 'צרפתית' },
        { value: 'es', label: 'ספרדית' },
        { value: 'de', label: 'גרמנית' },
      ],
      editable: true,
    });
  }

  if (crawledData?.description) {
    const desc = toDisplayString(crawledData.description);
    if (desc) {
      businessInfo.items.push({
        label: 'תיאור מהאתר',
        labelKey: 'siteProfile.fields.siteDescription',
        fieldKey: null, // Crawled data - not directly editable
        value: desc,
        type: 'text',
        editable: false,
      });
    }
  }

  if (businessInfo.items.length > 0) {
    sections.push(businessInfo);
  }

  // Country code to name mapping
  const countryNames = {
    'IL': 'ישראל',
    'US': 'ארצות הברית',
    'UK': 'בריטניה',
    'GB': 'בריטניה',
    'DE': 'גרמניה',
    'FR': 'צרפת',
    'CA': 'קנדה',
    'AU': 'אוסטרליה',
    'NZ': 'ניו זילנד',
    'ES': 'ספרד',
    'IT': 'איטליה',
    'NL': 'הולנד',
    'BE': 'בלגיה',
    'CH': 'שוויץ',
    'AT': 'אוסטריה',
    'SE': 'שוודיה',
    'NO': 'נורווגיה',
    'DK': 'דנמרק',
    'FI': 'פינלנד',
    'PL': 'פולין',
    'RU': 'רוסיה',
    'UA': 'אוקראינה',
    'BR': 'ברזיל',
    'MX': 'מקסיקו',
    'AR': 'ארגנטינה',
    'JP': 'יפן',
    'CN': 'סין',
    'IN': 'הודו',
    'KR': 'דרום קוריאה',
    'SG': 'סינגפור',
    'AE': 'איחוד האמירויות',
    'SA': 'סעודיה',
    'EG': 'מצרים',
    'ZA': 'דרום אפריקה',
    'GLOBAL': 'גלובלי',
  };

  // 2. Target Audience & Locations
  const audience = {
    id: 'audience',
    title: 'קהל יעד',
    titleKey: 'siteProfile.sections.audience',
    // Only use interview responses for status (not crawled data)
    status: getFieldStatus([responses.targetLocations]),
    items: [],
  };

  // Normalize targetLocations to always be an array
  let targetLocationsArray = responses.targetLocations;
  if (typeof targetLocationsArray === 'string' && targetLocationsArray) {
    targetLocationsArray = [targetLocationsArray];
  } else if (!Array.isArray(targetLocationsArray)) {
    targetLocationsArray = [];
  }

  // Convert country codes to names for display
  const targetLocationsDisplay = targetLocationsArray.map(code => 
    countryNames[code?.toUpperCase?.()] || code
  );

  // Build country options for select
  const countryOptions = [
    { value: 'IL', label: 'ישראל' },
    { value: 'US', label: 'ארצות הברית' },
    { value: 'GB', label: 'בריטניה' },
    { value: 'DE', label: 'גרמניה' },
    { value: 'FR', label: 'צרפת' },
    { value: 'CA', label: 'קנדה' },
    { value: 'AU', label: 'אוסטרליה' },
    { value: 'RU', label: 'רוסיה' },
    { value: 'GLOBAL', label: 'גלובלי' },
  ];

  if (targetLocationsArray.length > 0) {
    audience.items.push({
      label: 'אזורי יעד',
      labelKey: 'siteProfile.fields.targetLocations',
      fieldKey: 'targetLocations',
      value: targetLocationsDisplay[0], // Display name
      rawValue: targetLocationsArray[0], // Code for saving
      type: 'select',
      options: countryOptions,
      editable: true,
    });
  }

  if (crawledData?.targetAudience) {
    const targetAudienceValue = toDisplayString(crawledData.targetAudience);
    if (targetAudienceValue) {
      audience.items.push({
        label: 'קהל יעד',
        labelKey: 'siteProfile.fields.targetAudience',
        fieldKey: null,
        value: targetAudienceValue,
        type: 'text',
        editable: false,
      });
    }
  }

  if (audience.items.length > 0) {
    sections.push(audience);
  }

  // 3. Keywords & SEO
  // Merge interview keywords with database keywords (deduplicated)
  const interviewKeywords = responses.keywords || [];
  const dbKeywordStrings = siteKeywords.map(k => k.keyword);
  const allKeywordsSet = new Set([
    ...interviewKeywords.map(k => typeof k === 'string' ? k.toLowerCase().trim() : ''),
    ...dbKeywordStrings.map(k => k.toLowerCase().trim()),
  ]);
  // Get unique keywords preserving original casing from DB
  const mergedKeywords = [];
  const seenLower = new Set();
  // First add DB keywords (they have more data)
  for (const kw of siteKeywords) {
    const lower = kw.keyword.toLowerCase().trim();
    if (!seenLower.has(lower)) {
      seenLower.add(lower);
      mergedKeywords.push(kw.keyword);
    }
  }
  // Then add interview keywords that aren't in DB yet
  for (const kw of interviewKeywords) {
    if (typeof kw === 'string') {
      const lower = kw.toLowerCase().trim();
      if (!seenLower.has(lower)) {
        seenLower.add(lower);
        mergedKeywords.push(kw);
      }
    }
  }

  // Merge interview competitors with database competitors (deduplicated by domain)
  const interviewCompetitors = responses.competitors || [];
  const seenDomains = new Set();
  const mergedCompetitors = [];
  // First add DB competitors (they have more data)
  for (const comp of siteCompetitors) {
    const domain = comp.domain.toLowerCase();
    if (!seenDomains.has(domain)) {
      seenDomains.add(domain);
      mergedCompetitors.push({
        url: comp.url,
        domain: comp.domain,
        name: comp.name || comp.domain,
      });
    }
  }
  // Then add interview competitors that aren't in DB yet
  for (const url of interviewCompetitors) {
    try {
      const parsedUrl = new URL(url.startsWith('http') ? url : `https://${url}`);
      const domain = parsedUrl.hostname.replace(/^www\./, '').toLowerCase();
      if (!seenDomains.has(domain)) {
        seenDomains.add(domain);
        mergedCompetitors.push({
          url: parsedUrl.href,
          domain,
          name: domain,
        });
      }
    } catch {
      // Invalid URL, skip
    }
  }

  const seo = {
    id: 'seo',
    title: 'מילות מפתח ו-SEO',
    titleKey: 'siteProfile.sections.seo',
    // Use interview responses for status (not merged DB data)
    // This ensures new interviews show correct progress
    status: getFieldStatus([interviewKeywords, interviewCompetitors]),
    items: [],
  };

  // Always show keywords field (even if empty) so user can add them
  seo.items.push({
    label: 'מילות מפתח',
    labelKey: 'siteProfile.fields.keywords',
    fieldKey: 'keywords',
    value: mergedKeywords,
    type: 'tags',
    editable: true,
    syncedWithDb: true, // Indicates this syncs with Keyword model
  });

  // Always show competitors field (even if empty) so user can add them
  seo.items.push({
    label: 'מתחרים',
    labelKey: 'siteProfile.fields.competitors',
    fieldKey: 'competitors',
    value: mergedCompetitors.map(c => c.url),
    displayValue: mergedCompetitors, // Full objects for display
    type: 'competitors',
    editable: true,
    syncedWithDb: true, // Indicates this syncs with Competitor model
  });

  sections.push(seo);

  // 4. Content & Writing Style
  const content = {
    id: 'content',
    title: 'סגנון תוכן',
    titleKey: 'siteProfile.sections.content',
    status: getFieldStatus([responses.writingStyle, responses.favoriteArticles]),
    items: [],
  };

  if (responses.writingStyle) {
    const styleLabels = {
      professional: 'מקצועי ורשמי',
      casual: 'קליל ונגיש',
      educational: 'חינוכי ומעמיק',
      persuasive: 'שכנועי ומכירתי',
      storytelling: 'סיפורי ואישי',
    };
    const styleValue = styleLabels[responses.writingStyle] || toDisplayString(responses.writingStyle);
    if (styleValue) {
      content.items.push({
        label: 'סגנון כתיבה',
        labelKey: 'siteProfile.fields.writingStyle',
        fieldKey: 'writingStyle',
        value: styleValue,
        rawValue: responses.writingStyle,
        type: 'select',
        options: [
          { value: 'professional', label: 'מקצועי ורשמי' },
          { value: 'casual', label: 'קליל ונגיש' },
          { value: 'educational', label: 'חינוכי ומעמיק' },
          { value: 'persuasive', label: 'שכנועי ומכירתי' },
          { value: 'storytelling', label: 'סיפורי ואישי' },
        ],
        editable: true,
      });
    }
  }

  if (responses.internalLinksPer1000Words !== undefined) {
    content.items.push({
      label: 'קישורים פנימיים',
      labelKey: 'siteProfile.fields.internalLinks',
      fieldKey: 'internalLinksPer1000Words',
      value: `${responses.internalLinksPer1000Words} לכל 1,000 מילים`,
      rawValue: responses.internalLinksPer1000Words,
      type: 'slider',
      min: 0,
      max: 10,
      editable: true,
    });
  }

  // Favorite articles - always show so users can fetch and select posts
  content.items.push({
    label: 'מאמרים מועדפים',
    labelKey: 'siteProfile.fields.favoriteArticles',
    fieldKey: 'favoriteArticles',
    value: responses.favoriteArticles || [],
    type: 'articles',
    editable: true, // Always editable - will show fetch button if no posts
    options: availablePosts,
    maxSelection: 3,
  });

  if (content.items.length > 0) {
    sections.push(content);
  }

  // 5. Technical & Platform
  // Determine which fields are relevant for status
  const technicalFields = [responses.websitePlatform];
  // Only include wordpressPlugin in status check if platform is wordpress
  if (responses.websitePlatform === 'wordpress') {
    technicalFields.push(responses.wordpressPlugin);
  }
  
  const technical = {
    id: 'technical',
    title: 'פרטים טכניים',
    titleKey: 'siteProfile.sections.technical',
    status: getFieldStatus(technicalFields),
    items: [],
  };

  if (responses.websitePlatform) {
    const platformLabels = {
      wordpress: 'WordPress',
      wix: 'Wix',
      shopify: 'Shopify',
      custom: 'אתר מותאם',
      other: 'אחר',
    };
    const platformValue = platformLabels[responses.websitePlatform] || toDisplayString(responses.websitePlatform);
    if (platformValue) {
      technical.items.push({
        label: 'פלטפורמה',
        labelKey: 'siteProfile.fields.platform',
        fieldKey: 'websitePlatform',
        value: platformValue,
        rawValue: responses.websitePlatform,
        type: 'select',
        options: [
          { value: 'wordpress', label: 'WordPress' },
          { value: 'wix', label: 'Wix' },
          { value: 'shopify', label: 'Shopify' },
          { value: 'custom', label: 'אתר מותאם' },
          { value: 'other', label: 'אחר' },
        ],
        editable: true,
      });
    }
  }

  if (responses.wordpressPlugin !== undefined) {
    technical.items.push({
      label: 'תוסף WordPress',
      labelKey: 'siteProfile.fields.wordpressPlugin',
      fieldKey: 'wordpressPlugin',
      value: responses.wordpressPlugin ? 'מותקן' : 'לא מותקן',
      rawValue: responses.wordpressPlugin,
      type: 'boolean',
      editable: false, // Changed via plugin install flow
    });
  }

  if (responses.googleIntegration !== undefined) {
    technical.items.push({
      label: 'אינטגרציית Google',
      labelKey: 'siteProfile.fields.googleIntegration',
      fieldKey: 'googleIntegration',
      value: responses.googleIntegration ? 'מחובר' : 'לא מחובר',
      rawValue: responses.googleIntegration,
      type: 'boolean',
      editable: false, // Changed via OAuth flow
    });
  }

  if (technical.items.length > 0) {
    sections.push(technical);
  }

  return sections;
}

/**
 * Determine status based on whether fields have values
 */
function getFieldStatus(fields) {
  const hasAny = fields.some(f => {
    if (Array.isArray(f)) return f.length > 0;
    return f !== null && f !== undefined && f !== '';
  });
  const hasAll = fields.every(f => {
    if (Array.isArray(f)) return f.length > 0;
    return f !== null && f !== undefined && f !== '';
  });
  
  if (hasAll) return 'complete';
  if (hasAny) return 'in-progress';
  return 'pending';
}

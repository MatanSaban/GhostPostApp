import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { generateStructuredResponse } from '@/lib/ai/gemini';
import { findCompetitors } from '@/lib/bot-actions/handlers/find-competitors';
import { trackAIUsage } from '@/lib/ai/credits-service';
import { enforceCredits } from '@/lib/account-limits';
import { z } from 'zod';

const SESSION_COOKIE = 'user_session';

// Get authenticated user
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
        accountMemberships: {
          select: {
            accountId: true,
          },
        },
      },
    });

    return user;
  } catch (error) {
    console.error('Auth error:', error);
    return null;
  }
}

// Schema for keyword extraction from website content
const keywordExtractionSchema = z.object({
  mainTopic: z.string().describe('The main topic/business of the website in 2-4 words'),
  businessType: z.string().describe('The type of business (e.g., "Law Firm", "Dental Clinic", "Web Agency", "Restaurant")'),
  location: z.object({
    city: z.string().optional().describe('The city where the business operates (e.g., "תל אביב", "ירושלים", "חיפה")'),
    region: z.string().optional().describe('The region/area (e.g., "מרכז", "צפון", "דרום", "גוש דן")'),
    isLocalBusiness: z.boolean().describe('Whether this is a local business serving a specific area'),
    serviceArea: z.string().optional().describe('Description of service area if mentioned'),
  }).describe('Location information extracted from the content'),
  extractedKeywords: z.array(z.object({
    keyword: z.string().describe('The keyword or phrase'),
    frequency: z.number().describe('Estimated frequency/importance (1-10)'),
    intent: z.enum(['commercial', 'informational', 'navigational', 'transactional']).describe('Search intent'),
  })).describe('Top 10 keywords extracted from the website content, ordered by importance'),
  competitorSearchQueries: z.array(z.object({
    query: z.string().describe('The search query designed to find direct competitors'),
    rationale: z.string().describe('Why this query will find competitors, not aggregators'),
  })).describe('5-7 search queries specifically designed to find DIRECT COMPETITORS (service providers), NOT directories or aggregators. Include location if relevant.'),
});

/**
 * Extract keywords, location, and competitor-finding queries from website content using AI
 */
async function extractKeywordsFromContent(site, entities, existingKeywords, existingCompetitors) {
  // Gather content from entities
  const contentPieces = [];
  
  // Site info
  if (site.name) contentPieces.push(`Website Name: ${site.name}`);
  if (site.url) contentPieces.push(`Website URL: ${site.url}`);
  if (site.description) contentPieces.push(`Description: ${site.description}`);
  
  // Entity content (pages, posts)
  for (const entity of entities) {
    const parts = [];
    if (entity.title) parts.push(`Title: ${entity.title}`);
    if (entity.excerpt) parts.push(`Excerpt: ${entity.excerpt}`);
    
    // Extract SEO data if available
    if (entity.seoData) {
      const seo = typeof entity.seoData === 'string' ? JSON.parse(entity.seoData) : entity.seoData;
      if (seo.title) parts.push(`SEO Title: ${seo.title}`);
      if (seo.description) parts.push(`Meta Description: ${seo.description}`);
      if (seo.focusKeyword) parts.push(`Focus Keyword: ${seo.focusKeyword}`);
      if (seo.keywords) parts.push(`Keywords: ${seo.keywords}`);
    }
    
    // Add limited content (first 500 chars to avoid token explosion)
    if (entity.content) {
      // Strip HTML tags and limit content
      const cleanContent = entity.content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      parts.push(`Content: ${cleanContent.substring(0, 500)}...`);
    }
    
    if (parts.length > 0) {
      contentPieces.push(`\n--- ${entity.entityType?.name || 'Page'}: ${entity.title} ---\n${parts.join('\n')}`);
    }
  }
  
  // Existing keywords context
  if (existingKeywords.length > 0) {
    contentPieces.push(`\nExisting tracked keywords: ${existingKeywords.join(', ')}`);
  }
  
  // Existing competitors context
  if (existingCompetitors.length > 0) {
    const compDomains = existingCompetitors.map(c => c.domain).join(', ');
    contentPieces.push(`\nExisting competitors: ${compDomains}`);
  }
  
  const fullContent = contentPieces.join('\n');
  
  // Detect language from content
  const hasHebrew = /[\u0590-\u05FF]/.test(fullContent);
  const language = hasHebrew ? 'Hebrew' : 'English';
  
  const systemPrompt = `You are an expert SEO consultant specializing in competitor research. Your task is to analyze a business website and generate search queries that will find DIRECT COMPETITORS - actual businesses offering similar services, NOT directories, aggregators, or informational sites.

CRITICAL RULES:
1. LOCATION EXTRACTION: Look for any mention of city, neighborhood, region, or service area. Israeli businesses often mention: תל אביב, ירושלים, חיפה, באר שבע, גוש דן, מרכז הארץ, etc.

2. COMPETITOR-FINDING QUERIES - Generate queries that will return ACTUAL BUSINESSES, not directories:
   - BAD: "עורך דין מקרקעין" (too generic, returns directories like midrag, duns100)
   - GOOD: "משרד עורכי דין מקרקעין תל אביב" (specific, finds actual law firms)
   - BAD: "התחדשות עירונית" (returns Wikipedia/news)
   - GOOD: "חברת התחדשות עירונית תל אביב יצירת קשר" (finds actual companies)
   
3. COMMERCIAL INTENT: Every query MUST imply an intent to HIRE or CONTACT the business:
   - Add location when available
   - Add terms like: משרד, חברה, שירותי, יצירת קשר, מחירים, המלצות
   - Use "[service] + [location]" format
   - Use "[business type] מומלץ ב[location]"

4. AVOID generic terms that return aggregators:
   - DON'T use: "מומלץ", "טוב", "הכי" alone (these return ranking sites)
   - DO use: "[specific service] [location] יצירת קשר"

The content is in ${language}. Return all output in the same language.`;

  const userPrompt = `Analyze this business website and generate competitor-finding search queries:

${fullContent}

IMPORTANT: Your search queries must find DIRECT COMPETITORS (actual businesses), not directories like midrag.co.il, easy.co.il, duns100.co.il, etc.

Return:
1. Main topic and business type
2. Location info (city, region, whether it's local)
3. Commercial keywords
4. 5-7 search queries designed to find ACTUAL COMPETITOR BUSINESSES`;

  try {
    const result = await generateStructuredResponse({
      system: systemPrompt,
      prompt: userPrompt,
      schema: keywordExtractionSchema,
      temperature: 0.3,
      operation: 'GENERIC',
    });
    
    return result;
  } catch (error) {
    console.error('[DiscoverCompetitors] Keyword extraction failed:', error);
    return null;
  }
}

/**
 * POST /api/competitors/discover
 * 
 * Smart competitor discovery:
 * 1. Analyze website content to extract keywords
 * 2. Use existing keywords if available
 * 3. Consider existing competitors
 * 4. Search Google for competitors
 * 5. Aggregate and rank results
 */
export async function POST(request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { siteId, targetLocation = 'IL' } = body;

    if (!siteId) {
      return NextResponse.json(
        { error: 'Site ID is required' },
        { status: 400 }
      );
    }

    // Get user's account IDs
    const accountIds = user.accountMemberships.map(m => m.accountId);

    // Verify the user has access to this site
    const site = await prisma.site.findFirst({
      where: {
        id: siteId,
        accountId: { in: accountIds },
      },
    });

    if (!site) {
      return NextResponse.json(
        { error: 'Site not found' },
        { status: 404 }
      );
    }

    // ── Enforce AI credit limit ──────────────────────────────
    const creditCheck = await enforceCredits(site.accountId, 1); // GENERIC = 1 credit
    if (!creditCheck.allowed) {
      return NextResponse.json(creditCheck, { status: 402 });
    }

    console.log(`[DiscoverCompetitors] Starting smart discovery for ${site.name} (${site.url})`);

    // Step 1: Gather data from multiple sources
    
    // A. Get existing keywords from the site
    const existingKeywordsData = await prisma.keyword.findMany({
      where: { siteId },
      select: { keyword: true },
      take: 20,
    });
    const existingKeywords = existingKeywordsData.map(k => k.keyword);
    console.log(`[DiscoverCompetitors] Found ${existingKeywords.length} existing keywords`);
    
    // B. Get existing competitors
    const existingCompetitors = await prisma.competitor.findMany({
      where: { siteId, isActive: true },
      select: { domain: true, url: true },
    });
    console.log(`[DiscoverCompetitors] Found ${existingCompetitors.length} existing competitors`);
    
    // C. Get entities (pages, posts) for content analysis
    const entities = await prisma.siteEntity.findMany({
      where: { 
        siteId,
        status: 'PUBLISHED',
      },
      include: {
        entityType: {
          select: { name: true, slug: true },
        },
      },
      take: 20, // Limit to avoid token explosion
      orderBy: { updatedAt: 'desc' },
    });
    console.log(`[DiscoverCompetitors] Found ${entities.length} entities for content analysis`);
    
    // Prioritize about/info pages
    const aboutPages = entities.filter(e => {
      const slug = e.slug?.toLowerCase() || '';
      const title = e.title?.toLowerCase() || '';
      return slug.includes('about') || slug.includes('אודות') || 
             title.includes('about') || title.includes('אודות') ||
             slug.includes('service') || slug.includes('שירותים');
    });
    
    // Combine about pages first, then other pages
    const sortedEntities = [...aboutPages, ...entities.filter(e => !aboutPages.includes(e))].slice(0, 15);

    // Step 2: Extract keywords from content using AI
    let extractedData = null;
    let searchKeywords = [];
    let mainTopic = '';
    let businessLocation = null;
    
    if (sortedEntities.length > 0 || site.name || site.description) {
      console.log(`[DiscoverCompetitors] Extracting keywords from website content...`);
      extractedData = await extractKeywordsFromContent(site, sortedEntities, existingKeywords, existingCompetitors);
      
      if (extractedData) {
        mainTopic = extractedData.mainTopic;
        businessLocation = extractedData.location;
        
        console.log(`[DiscoverCompetitors] Main topic identified: ${mainTopic}`);
        console.log(`[DiscoverCompetitors] Business type: ${extractedData.businessType}`);
        console.log(`[DiscoverCompetitors] Location: ${JSON.stringify(businessLocation)}`);
        console.log(`[DiscoverCompetitors] Extracted ${extractedData.extractedKeywords?.length || 0} keywords`);
        console.log(`[DiscoverCompetitors] Generated ${extractedData.competitorSearchQueries?.length || 0} competitor-finding queries`);
        
        // Track AI usage for keyword extraction
        await trackAIUsage({
          accountId: site.accountId,
          userId: user.id,
          siteId: site.id,
          operation: 'GENERIC',
          description: `Keyword extraction for competitor discovery`,
          metadata: {
            mainTopic,
            businessType: extractedData.businessType,
            location: businessLocation,
            keywordsExtracted: extractedData.extractedKeywords?.length || 0,
          },
        });
      }
    }

    // Step 3: Build final search queries - prioritize competitor-finding queries
    const keywordSources = {
      competitorQueries: [],
      fromContent: [],
      fromExisting: existingKeywords.slice(0, 2),
    };
    
    if (extractedData) {
      // Use the AI-generated competitor-finding queries (these are designed to find actual businesses)
      keywordSources.competitorQueries = extractedData.competitorSearchQueries
        ?.slice(0, 5)
        .map(q => q.query) || [];
      
      // Add top commercial-intent keywords as fallback
      keywordSources.fromContent = extractedData.extractedKeywords
        ?.filter(k => k.intent === 'commercial' || k.intent === 'transactional')
        .sort((a, b) => b.frequency - a.frequency)
        .slice(0, 3)
        .map(k => k.keyword) || [];
    }
    
    // Prioritize competitor-finding queries over generic keywords
    const allKeywords = [
      ...keywordSources.competitorQueries,  // Priority: AI competitor-finding queries
      ...keywordSources.fromContent,         // Then: commercial keywords
      ...keywordSources.fromExisting,        // Then: existing keywords (limited)
    ];
    
    // Remove duplicates and limit to 5
    const uniqueKeywords = [...new Set(allKeywords)].filter(Boolean);
    searchKeywords = uniqueKeywords.slice(0, 5);
    
    if (searchKeywords.length === 0) {
      // Fallback: use site name + "services" or similar
      if (site.name) {
        searchKeywords = [site.name];
      } else {
        return NextResponse.json(
          { error: 'Could not extract keywords from website. Please add some content or keywords to your site.' },
          { status: 400 }
        );
      }
    }

    console.log(`[DiscoverCompetitors] Final search keywords: ${searchKeywords.join(', ')}`);

    // Step 4: Create context for the findCompetitors handler
    const context = {
      userId: user.id,
      accountId: site.accountId,
      siteId: site.id,
      interview: {
        externalData: {
          crawledData: {
            businessName: site.name,
          },
        },
      },
    };

    // Step 5: Search for competitors
    console.log(`[DiscoverCompetitors] Searching Google for competitors...`);
    
    const result = await findCompetitors({
      keywords: searchKeywords,
      userWebsiteUrl: site.url,
      targetLocation,
      // Pass location info for enhanced filtering
      businessLocation: businessLocation,
      businessType: extractedData?.businessType,
    }, context);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to find competitors' },
        { status: 500 }
      );
    }

    // Get account's current AI credits usage
    const account = await prisma.account.findUnique({
      where: { id: site.accountId },
      select: { aiCreditsUsedTotal: true },
    });

    return NextResponse.json({
      success: true,
      mainTopic,
      businessType: extractedData?.businessType,
      location: businessLocation,
      competitors: result.competitors || [],
      keywordsSearched: result.keywordsSearched || searchKeywords,
      keywordSources: {
        competitorQueries: keywordSources.competitorQueries.length,
        fromContent: keywordSources.fromContent.length,
        fromExisting: keywordSources.fromExisting.length,
      },
      // Include updated credits for frontend to update UI
      creditsUpdated: account ? { used: account.aiCreditsUsedTotal } : null,
    });
  } catch (error) {
    console.error('Error discovering competitors:', error);
    return NextResponse.json(
      { error: 'Failed to discover competitors' },
      { status: 500 }
    );
  }
}

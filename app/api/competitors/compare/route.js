import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { scrapeCompetitorPage, comparePages } from '@/lib/competitor-scraper';
import { identifyContentGaps, generateSkyscraperOutline } from '@/lib/ai/competitor-analysis';
import { trackAIUsage } from '@/lib/ai/credits-service';

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

// POST - Compare user's page with competitor
export async function POST(request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { 
      competitorId, 
      siteId, 
      userPageUrl,  // URL of user's page to compare
      generateOutline = false,  // Whether to generate skyscraper outline
      targetKeyword = '',  // Target keyword for outline
    } = body;

    if (!competitorId || !siteId || !userPageUrl) {
      return NextResponse.json(
        { error: 'Competitor ID, Site ID, and User Page URL are required' },
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

    // Get the competitor
    const competitor = await prisma.competitor.findFirst({
      where: {
        id: competitorId,
        siteId,
        isActive: true,
      },
    });

    if (!competitor) {
      return NextResponse.json(
        { error: 'Competitor not found' },
        { status: 404 }
      );
    }

    // If competitor hasn't been scanned or data is old, scrape it first
    let competitorData = {
      url: competitor.url,
      title: competitor.title,
      metaDescription: competitor.metaDescription,
      wordCount: competitor.wordCount,
      h1Count: competitor.h1Count,
      h2Count: competitor.h2Count,
      h3Count: competitor.h3Count,
      imageCount: competitor.imageCount,
      videoCount: competitor.videoCount,
      ttfb: competitor.ttfb,
      headings: competitor.headings,
      mainContent: competitor.mainContent,
    };

    // If no data, scrape now
    if (!competitor.wordCount || !competitor.mainContent) {
      console.log(`[Compare] Scraping competitor ${competitor.url}...`);
      const scrapeResult = await scrapeCompetitorPage(competitor.url);
      if (scrapeResult.success) {
        competitorData = scrapeResult.data;
        
        // Update competitor with new data
        await prisma.competitor.update({
          where: { id: competitorId },
          data: {
            title: scrapeResult.data.title,
            metaDescription: scrapeResult.data.metaDescription,
            wordCount: scrapeResult.data.wordCount,
            h1Count: scrapeResult.data.h1Count,
            h2Count: scrapeResult.data.h2Count,
            h3Count: scrapeResult.data.h3Count,
            imageCount: scrapeResult.data.imageCount,
            videoCount: scrapeResult.data.videoCount,
            ttfb: scrapeResult.data.ttfb,
            headings: scrapeResult.data.headings,
            mainContent: scrapeResult.data.mainContent,
            scanStatus: 'COMPLETED',
            lastScannedAt: new Date(),
          },
        });
      }
    }

    // Scrape user's page
    console.log(`[Compare] Scraping user page ${userPageUrl}...`);
    const userScrapeResult = await scrapeCompetitorPage(userPageUrl);
    
    if (!userScrapeResult.success) {
      return NextResponse.json(
        { error: 'Failed to scrape your page', details: userScrapeResult.error },
        { status: 500 }
      );
    }

    const userData = userScrapeResult.data;

    // Calculate metric comparison
    const metricsComparison = comparePages(userData, competitorData);

    // AI Content Gap Analysis
    let contentGaps = null;
    let skyscraperOutline = null;
    let creditsUsed = 0;

    if (userData.mainContent && competitorData.mainContent) {
      try {
        console.log(`[Compare] Running AI content gap analysis...`);
        contentGaps = await identifyContentGaps(
          userData.mainContent,
          competitorData.mainContent,
          userData.title,
          competitorData.title
        );

        // Track AI usage
        const gapTrackResult = await trackAIUsage({
          accountId: site.accountId,
          userId: user.id,
          siteId: site.id,
          operation: 'COMPETITOR_GAP_ANALYSIS',
          description: `Content gap analysis: ${userData.title} vs ${competitorData.title}`,
          metadata: {
            competitorId,
            userUrl: userPageUrl,
            competitorUrl: competitor.url,
          },
        });
        
        if (gapTrackResult.success) {
          creditsUsed = gapTrackResult.totalUsed;
        }

        // Generate skyscraper outline if requested
        if (generateOutline) {
          console.log(`[Compare] Generating skyscraper outline...`);
          skyscraperOutline = await generateSkyscraperOutline(
            competitorData,
            contentGaps,
            targetKeyword || userData.title
          );

          // Track additional AI usage for outline
          const outlineTrackResult = await trackAIUsage({
            accountId: site.accountId,
            userId: user.id,
            siteId: site.id,
            operation: 'SKYSCRAPER_OUTLINE',
            description: `Skyscraper outline: ${targetKeyword || userData.title}`,
            metadata: {
              competitorId,
              keyword: targetKeyword,
            },
          });
          
          if (outlineTrackResult.success) {
            creditsUsed = outlineTrackResult.totalUsed;
          }
        }

        // Update competitor with content gaps
        await prisma.competitor.update({
          where: { id: competitorId },
          data: {
            contentGaps: contentGaps.gaps,
          },
        });
      } catch (aiError) {
        console.error('[Compare] AI analysis failed:', aiError.message);
        // Continue without AI analysis
      }
    }

    return NextResponse.json({
      success: true,
      comparison: {
        user: {
          url: userPageUrl,
          title: userData.title,
          wordCount: userData.wordCount,
          h1Count: userData.h1Count,
          h2Count: userData.h2Count,
          h3Count: userData.h3Count,
          imageCount: userData.imageCount,
          videoCount: userData.videoCount,
          ttfb: userData.ttfb,
        },
        competitor: {
          url: competitor.url,
          title: competitorData.title,
          wordCount: competitorData.wordCount,
          h1Count: competitorData.h1Count,
          h2Count: competitorData.h2Count,
          h3Count: competitorData.h3Count,
          imageCount: competitorData.imageCount,
          videoCount: competitorData.videoCount,
          ttfb: competitorData.ttfb,
        },
        metrics: metricsComparison,
      },
      contentGaps,
      skyscraperOutline,
      // Include updated credits for frontend to update UI
      creditsUpdated: creditsUsed > 0 ? { used: creditsUsed } : null,
    });
  } catch (error) {
    console.error('Error comparing pages:', error);
    return NextResponse.json(
      { error: 'Failed to compare pages' },
      { status: 500 }
    );
  }
}

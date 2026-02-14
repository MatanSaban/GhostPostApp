import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { scrapeCompetitorPage } from '@/lib/competitor-scraper';
import { generateCompetitorSummary, analyzeCompetitorTopics } from '@/lib/ai/competitor-analysis';
import { trackAIUsage, AI_OPERATIONS } from '@/lib/ai/credits-service';
import { enforceCredits } from '@/lib/account-limits';

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

// POST - Scan a competitor page
export async function POST(request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { competitorId, siteId, includeAI = false } = body;

    if (!competitorId || !siteId) {
      return NextResponse.json(
        { error: 'Competitor ID and Site ID are required' },
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

    // ── Enforce AI credit limit (only if AI analysis requested) ───
    if (includeAI) {
      const creditCheck = await enforceCredits(site.accountId, 5); // COMPETITOR_SCAN = 5 credits
      if (!creditCheck.allowed) {
        return NextResponse.json(creditCheck, { status: 402 });
      }
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

    // Mark as scanning
    await prisma.competitor.update({
      where: { id: competitorId },
      data: { scanStatus: 'SCANNING' },
    });

    try {
      // Scrape the page
      console.log(`[CompetitorScan] Scraping ${competitor.url}...`);
      const scrapeResult = await scrapeCompetitorPage(competitor.url);

      if (!scrapeResult.success) {
        // Update with error
        await prisma.competitor.update({
          where: { id: competitorId },
          data: {
            scanStatus: 'ERROR',
            scanError: scrapeResult.error,
            lastScannedAt: new Date(),
          },
        });

        return NextResponse.json(
          { error: 'Scraping failed', details: scrapeResult.error },
          { status: 500 }
        );
      }

      const data = scrapeResult.data;

      // Extract business name from title if not already set
      // The title often has format: "Business Name | Description" or "Business Name - Tagline"
      let extractedName = null;
      if (!competitor.name && data.title) {
        // Try to extract the business name from common title formats
        const titleParts = data.title.split(/\s*[\|\-–—]\s*/);
        if (titleParts.length > 0) {
          extractedName = titleParts[0].trim();
          // If the first part is too long, it's probably not a name
          if (extractedName.length > 60) {
            extractedName = null;
          }
        }
      }

      // Prepare update data
      const updateData = {
        title: data.title,
        metaDescription: data.metaDescription,
        wordCount: data.wordCount,
        h1Count: data.h1Count,
        h2Count: data.h2Count,
        h3Count: data.h3Count,
        imageCount: data.imageCount,
        videoCount: data.videoCount,
        internalLinks: data.internalLinks,
        externalLinks: data.externalLinks,
        ttfb: data.ttfb,
        headings: data.headings,
        mainContent: data.mainContent,
        scanStatus: 'COMPLETED',
        scanError: null,
        lastScannedAt: new Date(),
      };

      // Set the name if we extracted one and there isn't one already
      if (extractedName && !competitor.name) {
        updateData.name = extractedName;
      }

      // If AI analysis is requested and there's content
      let creditsUsed = 0;
      if (includeAI && data.mainContent && data.mainContent.length > 100) {
        console.log(`[CompetitorScan] Running AI analysis...`);
        
        try {
          // Get AI summary
          const summary = await generateCompetitorSummary(data.mainContent, data.title);
          updateData.aiSummary = summary.summary;
          updateData.topicsCovered = summary.mainTopics;

          // Track AI usage
          const trackResult = await trackAIUsage({
            accountId: site.accountId,
            userId: user.id,
            siteId: site.id,
            operation: 'COMPETITOR_SCAN',
            description: `Competitor scan: ${competitor.domain}`,
            metadata: {
              competitorId,
              url: competitor.url,
            },
          });
          
          if (trackResult.success) {
            creditsUsed = trackResult.totalUsed;
          }
        } catch (aiError) {
          console.error('[CompetitorScan] AI analysis failed:', aiError.message);
          // Continue without AI - don't fail the whole scan
        }
      }

      // Update competitor with scraped data
      const updatedCompetitor = await prisma.competitor.update({
        where: { id: competitorId },
        data: updateData,
      });

      return NextResponse.json({
        success: true,
        competitor: updatedCompetitor,
        metrics: {
          wordCount: data.wordCount,
          h1Count: data.h1Count,
          h2Count: data.h2Count,
          h3Count: data.h3Count,
          imageCount: data.imageCount,
          videoCount: data.videoCount,
          ttfb: data.ttfb,
        },
        // Include updated credits for frontend to update UI
        creditsUpdated: creditsUsed > 0 ? { used: creditsUsed } : null,
      });
    } catch (scrapeError) {
      // Update with error
      await prisma.competitor.update({
        where: { id: competitorId },
        data: {
          scanStatus: 'ERROR',
          scanError: scrapeError.message,
          lastScannedAt: new Date(),
        },
      });

      throw scrapeError;
    }
  } catch (error) {
    console.error('Error scanning competitor:', error);
    return NextResponse.json(
      { error: 'Failed to scan competitor' },
      { status: 500 }
    );
  }
}

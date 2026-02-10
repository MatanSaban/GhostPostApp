import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';

const SESSION_COOKIE = 'user_session';

// Get authenticated user with their account memberships
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
            account: {
              select: {
                subscription: {
                  select: {
                    plan: {
                      select: {
                        limitations: true,
                      },
                    },
                  },
                },
              },
            },
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

// Helper to get competitor limit from plan
// Returns Infinity for unlimited competitors
function getCompetitorLimit(user, accountId) {
  const membership = user.accountMemberships.find(m => m.accountId === accountId);
  const limitations = membership?.account?.subscription?.plan?.limitations;
  
  if (!limitations || !Array.isArray(limitations)) {
    return Infinity; // No limit by default
  }
  
  const competitorLimit = limitations.find(l => l.key === 'maxCompetitors');
  // If no limit set, return Infinity for unlimited
  return competitorLimit?.value || Infinity;
}

// GET - List competitors for a site
export async function GET(request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get('siteId');

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

    // Get competitors
    const competitors = await prisma.competitor.findMany({
      where: {
        siteId,
        isActive: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    // Get limit info
    const limit = getCompetitorLimit(user, site.accountId);
    const count = competitors.length;

    return NextResponse.json({
      competitors,
      limit,
      count,
      remaining: Math.max(0, limit - count),
    });
  } catch (error) {
    console.error('Error fetching competitors:', error);
    return NextResponse.json(
      { error: 'Failed to fetch competitors' },
      { status: 500 }
    );
  }
}

// POST - Add a new competitor
export async function POST(request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { siteId, url, name, source = 'MANUAL', discoveryKeyword, serpPosition } = body;

    if (!siteId || !url) {
      return NextResponse.json(
        { error: 'Site ID and URL are required' },
        { status: 400 }
      );
    }

    // Validate URL
    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch {
      return NextResponse.json(
        { error: 'Invalid URL format' },
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

    // Check competitor limit (only if limit is set in plan)
    const limit = getCompetitorLimit(user, site.accountId);
    if (limit !== Infinity) {
      const currentCount = await prisma.competitor.count({
        where: { siteId, isActive: true },
      });

      if (currentCount >= limit) {
        return NextResponse.json(
          { 
            error: 'Competitor limit reached',
            limit,
            count: currentCount,
          },
          { status: 403 }
        );
      }
    }

    // Extract domain
    const domain = parsedUrl.hostname.replace(/^www\./, '');

    // Check if competitor already exists (by domain or URL)
    const existingCompetitor = await prisma.competitor.findFirst({
      where: { 
        siteId, 
        OR: [
          { url: parsedUrl.href },
          { domain: domain },
        ],
      },
    });

    if (existingCompetitor) {
      // If it was deactivated, reactivate it
      if (!existingCompetitor.isActive) {
        const reactivated = await prisma.competitor.update({
          where: { id: existingCompetitor.id },
          data: { isActive: true },
        });
        return NextResponse.json({ competitor: reactivated, reactivated: true });
      }
      
      return NextResponse.json(
        { error: 'Competitor already exists' },
        { status: 409 }
      );
    }

    const favicon = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;

    // Create competitor
    const competitor = await prisma.competitor.create({
      data: {
        siteId,
        url: parsedUrl.href,
        domain,
        name: name || null,
        favicon,
        source,
        discoveryKeyword: discoveryKeyword || null,
        serpPosition: serpPosition || null,
        scanStatus: 'PENDING',
      },
    });

    return NextResponse.json({ competitor }, { status: 201 });
  } catch (error) {
    console.error('Error adding competitor:', error);
    return NextResponse.json(
      { error: 'Failed to add competitor' },
      { status: 500 }
    );
  }
}

// DELETE - Remove a competitor
export async function DELETE(request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const competitorId = searchParams.get('id');
    const siteId = searchParams.get('siteId');

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

    // Soft delete - mark as inactive
    await prisma.competitor.update({
      where: { id: competitorId },
      data: { isActive: false },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting competitor:', error);
    return NextResponse.json(
      { error: 'Failed to delete competitor' },
      { status: 500 }
    );
  }
}

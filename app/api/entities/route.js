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

// GET - Get entities for a site
export async function GET(request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get('siteId');
    const type = searchParams.get('type'); // This is the slug (e.g., 'posts', 'pages')

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

    // Build query
    const where = { siteId };
    
    // If type is provided, find the entity type ID by slug
    if (type) {
      const entityType = await prisma.siteEntityType.findFirst({
        where: {
          siteId,
          slug: type,
          isEnabled: true,
        },
      });
      
      if (entityType) {
        where.entityTypeId = entityType.id;
      } else {
        // Entity type not found, return empty
        return NextResponse.json({ 
          entities: [],
          lastSync: null,
        });
      }
    }

    const entities = await prisma.siteEntity.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      include: {
        entityType: {
          select: {
            name: true,
            slug: true,
          },
        },
      },
    });

    return NextResponse.json({ 
      entities,
      lastSync: site.updatedAt,
    });
  } catch (error) {
    console.error('Failed to fetch entities:', error);
    return NextResponse.json(
      { error: 'Failed to fetch entities' },
      { status: 500 }
    );
  }
}

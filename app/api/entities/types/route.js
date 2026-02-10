import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';

const SESSION_COOKIE = 'user_session';

// Get authenticated user with their active account
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
        lastSelectedAccountId: true,
        accountMemberships: {
          where: { status: 'ACTIVE' },
          select: { accountId: true },
          take: 1,
        },
      },
    });

    if (!user) return null;

    // Get accountId from lastSelectedAccountId or first membership
    const accountId = user.lastSelectedAccountId || user.accountMemberships[0]?.accountId;

    return {
      id: user.id,
      email: user.email,
      accountId,
    };
  } catch (error) {
    console.error('Auth error:', error);
    return null;
  }
}

// GET - Get enabled entity types for a site
export async function GET(request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get('siteId');

    if (!siteId) {
      return NextResponse.json({ types: [] });
    }

    // Verify the user has access to this site
    const site = await prisma.site.findFirst({
      where: {
        id: siteId,
        accountId: user.accountId,
      },
    });

    if (!site) {
      return NextResponse.json({ types: [] });
    }

    // Get enabled entity types for this site
    const types = await prisma.siteEntityType.findMany({
      where: {
        siteId,
        isEnabled: true,
      },
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true,
        name: true,
        slug: true,
        apiEndpoint: true,
        sitemaps: true,
      },
    });

    return NextResponse.json({ types });
  } catch (error) {
    console.error('Failed to fetch entity types:', error);
    return NextResponse.json({ types: [] });
  }
}

// POST - Create or update entity types for a site
export async function POST(request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { siteId, types } = body;

    if (!siteId || !types || !Array.isArray(types)) {
      return NextResponse.json(
        { error: 'Site ID and types array are required' },
        { status: 400 }
      );
    }

    // Verify the user has access to this site
    const site = await prisma.site.findFirst({
      where: {
        id: siteId,
        accountId: user.accountId,
      },
    });

    if (!site) {
      return NextResponse.json(
        { error: 'Site not found' },
        { status: 404 }
      );
    }

    // Get the slugs of types being saved (enabled)
    const enabledSlugs = types.map(t => t.slug);
    
    // Disable any types that are NOT in the selection
    // This ensures only the selected types are enabled
    await prisma.siteEntityType.updateMany({
      where: {
        siteId,
        slug: { notIn: enabledSlugs },
        isEnabled: true,
      },
      data: { isEnabled: false },
    });
    
    console.log(`[EntityTypes] Disabled types not in selection. Enabled: ${enabledSlugs.join(', ')}`);

    // Create or update each entity type
    const results = [];
    for (let i = 0; i < types.length; i++) {
      const type = types[i];
      
      console.log(`[EntityTypes] Saving type: ${type.slug}`, {
        name: type.name,
        apiEndpoint: type.apiEndpoint,
        sitemaps: type.sitemaps,
      });
      
      const entityType = await prisma.siteEntityType.upsert({
        where: {
          siteId_slug: {
            siteId,
            slug: type.slug,
          },
        },
        update: {
          name: type.name,
          apiEndpoint: type.apiEndpoint || type.slug,
          sitemaps: type.sitemaps || [],
          isEnabled: true, // Explicitly enable selected types
          sortOrder: i,
        },
        create: {
          siteId,
          name: type.name,
          slug: type.slug,
          apiEndpoint: type.apiEndpoint || type.slug,
          sitemaps: type.sitemaps || [],
          isEnabled: true, // New types from selection are enabled
          sortOrder: i,
        },
      });
      
      results.push(entityType);
    }

    return NextResponse.json({ 
      success: true,
      types: results,
    });
  } catch (error) {
    console.error('Failed to save entity types:', error);
    return NextResponse.json(
      { error: 'Failed to save entity types' },
      { status: 500 }
    );
  }
}

// DELETE - Disable an entity type
export async function DELETE(request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const typeId = searchParams.get('typeId');

    if (!typeId) {
      return NextResponse.json(
        { error: 'Type ID is required' },
        { status: 400 }
      );
    }

    // Verify the user has access to this entity type via site
    const entityType = await prisma.siteEntityType.findFirst({
      where: { id: typeId },
      include: {
        site: {
          select: { accountId: true },
        },
      },
    });

    if (!entityType || entityType.site.accountId !== user.accountId) {
      return NextResponse.json(
        { error: 'Entity type not found' },
        { status: 404 }
      );
    }

    // Disable the entity type (soft delete)
    await prisma.siteEntityType.update({
      where: { id: typeId },
      data: { isEnabled: false },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete entity type:', error);
    return NextResponse.json(
      { error: 'Failed to delete entity type' },
      { status: 500 }
    );
  }
}

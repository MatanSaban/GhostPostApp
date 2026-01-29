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

// GET - Get a single entity by ID
export async function GET(request, { params }) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    // Get user's account IDs
    const accountIds = user.accountMemberships.map(m => m.accountId);

    // Get the entity with its site and entity type
    const entity = await prisma.siteEntity.findUnique({
      where: { id },
      include: {
        site: {
          select: {
            id: true,
            name: true,
            url: true,
            accountId: true,
          },
        },
        entityType: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    });

    if (!entity) {
      return NextResponse.json({ error: 'Entity not found' }, { status: 404 });
    }

    // Verify the user has access to this entity's site
    if (!accountIds.includes(entity.site.accountId)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    return NextResponse.json({ entity });
  } catch (error) {
    console.error('Failed to get entity:', error);
    return NextResponse.json(
      { error: 'Failed to get entity' },
      { status: 500 }
    );
  }
}

// PUT - Update an entity
export async function PUT(request, { params }) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();

    // Get user's account IDs
    const accountIds = user.accountMemberships.map(m => m.accountId);

    // Get the entity to verify access
    const existingEntity = await prisma.siteEntity.findUnique({
      where: { id },
      include: {
        site: {
          select: {
            accountId: true,
          },
        },
      },
    });

    if (!existingEntity) {
      return NextResponse.json({ error: 'Entity not found' }, { status: 404 });
    }

    // Verify the user has access to this entity's site
    if (!accountIds.includes(existingEntity.site.accountId)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Update the entity
    const updatedEntity = await prisma.siteEntity.update({
      where: { id },
      data: {
        title: body.title,
        slug: body.slug,
        excerpt: body.excerpt,
        content: body.content,
        status: body.status,
        featuredImage: body.featuredImage,
        seoData: body.seoData,
        acfData: body.acfData,
        metadata: body.metadata,
        updatedAt: new Date(),
      },
      include: {
        entityType: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    });

    return NextResponse.json({ 
      entity: updatedEntity,
      message: 'Entity updated successfully',
    });
  } catch (error) {
    console.error('Failed to update entity:', error);
    return NextResponse.json(
      { error: 'Failed to update entity' },
      { status: 500 }
    );
  }
}

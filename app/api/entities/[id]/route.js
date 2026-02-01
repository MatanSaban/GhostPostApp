import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { updatePost, updateSeoData, updateAcfFields, getPostBySlug } from '@/lib/wp-api-client';

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
    const syncToWordPress = body.syncToWordPress !== false; // Default to true

    // Get user's account IDs
    const accountIds = user.accountMemberships.map(m => m.accountId);

    // Get the entity with site info for WordPress sync
    const existingEntity = await prisma.siteEntity.findUnique({
      where: { id },
      include: {
        site: {
          select: {
            id: true,
            url: true,
            siteKey: true,
            siteSecret: true,
            accountId: true,
            connectionStatus: true,
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

    if (!existingEntity) {
      return NextResponse.json({ error: 'Entity not found' }, { status: 404 });
    }

    // Verify the user has access to this entity's site
    if (!accountIds.includes(existingEntity.site.accountId)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Sync to WordPress if enabled and site is connected
    let wpSyncResult = null;
    let wpSyncError = null;
    
    if (syncToWordPress && existingEntity.site.connectionStatus === 'CONNECTED' && existingEntity.externalId) {
      try {
        const postType = existingEntity.entityType?.slug || 'post';
        const wpPostId = existingEntity.externalId;
        
        // Prepare data for WordPress
        // Map our status to WordPress status
        const statusToWp = {
          'PUBLISHED': 'publish',
          'DRAFT': 'draft',
          'PENDING': 'pending',
          'SCHEDULED': 'future',
          'PRIVATE': 'private',
          'TRASH': 'trash',
          'ARCHIVED': 'trash',
        };
        
        const wpData = {
          title: body.title,
          slug: body.slug,
          excerpt: body.excerpt,
          content: body.content,
          status: statusToWp[body.status] || 'draft',
          featured_image: body.featuredImage,
        };
        
        // Add scheduled date for future posts
        if (body.status === 'SCHEDULED' && body.scheduledAt) {
          wpData.date = new Date(body.scheduledAt).toISOString();
        }
        
        // Update post in WordPress
        wpSyncResult = await updatePost(existingEntity.site, postType, wpPostId, wpData);
        
        // Update SEO data if provided
        if (body.seoData) {
          try {
            await updateSeoData(existingEntity.site, wpPostId, body.seoData);
          } catch (seoError) {
            console.warn('Failed to update SEO data:', seoError.message);
            // Don't fail the whole request for SEO errors
          }
        }
        
        // Update ACF fields if provided
        if (body.acfData) {
          try {
            // Extract just the field values for updating
            const acfValues = {};
            if (body.acfData.fields) {
              for (const field of body.acfData.fields) {
                acfValues[field.name] = field.value;
              }
            }
            if (Object.keys(acfValues).length > 0) {
              await updateAcfFields(existingEntity.site, wpPostId, acfValues);
            }
          } catch (acfError) {
            console.warn('Failed to update ACF fields:', acfError.message);
            // Don't fail the whole request for ACF errors
          }
        }
        
      } catch (error) {
        console.error('WordPress sync error:', error);
        wpSyncError = error.message;
        // Continue with local update even if WP sync fails
      }
    }

    // Update the entity in our database
    const updatedEntity = await prisma.siteEntity.update({
      where: { id },
      data: {
        title: body.title,
        slug: body.slug,
        excerpt: body.excerpt,
        content: body.content,
        status: body.status,
        featuredImage: body.featuredImage,
        scheduledAt: body.status === 'SCHEDULED' ? (body.scheduledAt ? new Date(body.scheduledAt) : null) : null,
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
      wpSync: {
        attempted: syncToWordPress && existingEntity.site.connectionStatus === 'CONNECTED',
        success: wpSyncResult !== null && wpSyncError === null,
        error: wpSyncError,
      },
    });
  } catch (error) {
    console.error('Failed to update entity:', error);
    return NextResponse.json(
      { error: 'Failed to update entity' },
      { status: 500 }
    );
  }
}

// DELETE - Remove entity from platform and optionally delete from WordPress
export async function DELETE(request, { params }) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const deleteFromWordPress = searchParams.get('deleteFromWP') === 'true';

    // Get user's account IDs
    const accountIds = user.accountMemberships.map(m => m.accountId);

    // Get the entity with site info for WordPress sync
    const entity = await prisma.siteEntity.findUnique({
      where: { id },
      include: {
        site: {
          select: {
            id: true,
            url: true,
            siteKey: true,
            siteSecret: true,
            accountId: true,
            connectionStatus: true,
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

    // If deleteFromWordPress is true and site is connected, trash the post in WordPress
    let wpDeleteResult = null;
    let wpDeleteError = null;
    
    if (deleteFromWordPress && entity.site.connectionStatus === 'CONNECTED') {
      try {
        const postType = entity.entityType?.slug || 'post';
        let wpPostId = entity.externalId;
        
        // If no externalId, try to find the post by slug
        if (!wpPostId && entity.slug) {
          console.log(`[Delete] No externalId, looking up post by slug "${entity.slug}"...`);
          const wpPost = await getPostBySlug(entity.site, postType, entity.slug);
          if (wpPost) {
            wpPostId = String(wpPost.id);
            console.log(`[Delete] Found post by slug: ID ${wpPostId}`);
          } else {
            console.log(`[Delete] Post not found in WordPress by slug "${entity.slug}"`);
          }
        }
        
        if (wpPostId) {
          // Move to trash in WordPress by updating status to 'trash'
          wpDeleteResult = await updatePost(entity.site, postType, wpPostId, {
            status: 'trash',
          });
          
          console.log(`[Delete] Moved post ${wpPostId} to trash in WordPress`);
        } else {
          wpDeleteError = 'Could not find post in WordPress';
        }
      } catch (error) {
        console.error('WordPress delete error:', error);
        wpDeleteError = error.message;
        // Continue with local delete even if WP delete fails
      }
    }

    // Delete the entity from our database
    await prisma.siteEntity.delete({
      where: { id },
    });

    console.log(`[Delete] Removed entity ${id} from platform${deleteFromWordPress ? ' (and trashed in WordPress)' : ''}`);

    return NextResponse.json({ 
      success: true,
      message: deleteFromWordPress 
        ? 'Entity deleted from platform and moved to trash in WordPress'
        : 'Entity removed from platform',
      wpDelete: {
        attempted: deleteFromWordPress && entity.site.connectionStatus === 'CONNECTED',
        success: wpDeleteResult !== null && wpDeleteError === null,
        error: wpDeleteError,
      },
    });
  } catch (error) {
    console.error('Failed to delete entity:', error);
    return NextResponse.json(
      { error: 'Failed to delete entity' },
      { status: 500 }
    );
  }
}

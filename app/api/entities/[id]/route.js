import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { updatePost, updateSeoData, updateAcfFields, getPostBySlug } from '@/lib/wp-api-client';
import { processBase64ImagesInHtml } from '@/lib/cloudinary-upload';

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
        isSuperAdmin: true, 
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
    const shouldSyncWp = syncToWordPress && existingEntity.site.connectionStatus === 'CONNECTED' && existingEntity.externalId;

    // Update the entity in our database FIRST (don't block on WP sync)
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

    // Fire-and-forget WP sync in the background so the user isn't blocked
    if (shouldSyncWp) {
      const site = existingEntity.site;
      const postType = existingEntity.entityType?.slug || 'post';
      const wpPostId = existingEntity.externalId;

      console.log(`[Entity ${id}] Starting WP sync - postType: ${postType}, wpPostId: ${wpPostId}, content length: ${(body.content || '').length}`);

      (async () => {
        try {
          const statusToWp = {
            'PUBLISHED': 'publish',
            'DRAFT': 'draft',
            'PENDING': 'pending',
            'SCHEDULED': 'future',
            'PRIVATE': 'private',
            'TRASH': 'trash',
            'ARCHIVED': 'trash',
          };

          // Process content: upload any base64 images to Cloudinary before syncing
          const processedContent = await processBase64ImagesInHtml(body.content || '', 'ghostpost/posts', `entity-${id}`);

          const wpData = {
            title: body.title,
            slug: body.slug,
            excerpt: body.excerpt,
            content: processedContent,
            status: statusToWp[body.status] || 'draft',
            featured_image: body.featuredImage,
          };

          console.log(`[Entity ${id}] WP sync data - title: ${body.title}, content length: ${processedContent.length}`);

          if (body.status === 'SCHEDULED' && body.scheduledAt) {
            const d = new Date(body.scheduledAt);
            wpData.date = d.toISOString();
            wpData.date_gmt = d.toISOString();
          }

          const wpResult = await updatePost(site, postType, wpPostId, wpData);
          console.log(`[Entity ${id}] WordPress sync completed for WP post ${wpPostId}:`, JSON.stringify(wpResult));

          if (body.seoData) {
            try {
              await updateSeoData(site, wpPostId, body.seoData);
            } catch (seoError) {
              console.warn('Failed to update SEO data:', seoError.message);
            }
          }

          if (body.acfData) {
            try {
              const acfValues = {};
              if (body.acfData.fields) {
                for (const field of body.acfData.fields) {
                  acfValues[field.name] = field.value;
                }
              }
              if (Object.keys(acfValues).length > 0) {
                await updateAcfFields(site, wpPostId, acfValues);
              }
            } catch (acfError) {
              console.warn('Failed to update ACF fields:', acfError.message);
            }
          }
        } catch (error) {
          console.error(`[Entity ${id}] WordPress sync failed:`, error.message);
        }
      })();
    }

    return NextResponse.json({ 
      entity: updatedEntity,
      message: 'Entity updated successfully',
      wpSync: {
        attempted: shouldSyncWp,
        background: shouldSyncWp, // Sync runs in background
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

// PATCH - Partial update (e.g. reschedule a published post)
export async function PATCH(request, { params }) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();

    const accountIds = user.accountMemberships.map(m => m.accountId);

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
          select: { id: true, name: true, slug: true },
        },
      },
    });

    if (!existingEntity) {
      return NextResponse.json({ error: 'Entity not found' }, { status: 404 });
    }

    if (!accountIds.includes(existingEntity.site.accountId)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Build partial update data
    const data = { updatedAt: new Date() };
    if (body.title !== undefined) data.title = body.title;
    if (body.status !== undefined) data.status = body.status;
    if (body.scheduledAt !== undefined) data.scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : null;
    // When status is PUBLISHED and a date is provided, also update publishedAt
    // so the calendar shows the post on the correct day after refresh.
    if (body.status === 'PUBLISHED' && body.scheduledAt) {
      data.publishedAt = new Date(body.scheduledAt);
    }

    // Update entity in DB
    const updatedEntity = await prisma.siteEntity.update({
      where: { id },
      data,
      include: {
        entityType: { select: { id: true, name: true, slug: true } },
      },
    });

    // Sync status/schedule to WordPress
    const shouldSyncWp = existingEntity.site.connectionStatus === 'CONNECTED' && existingEntity.externalId;
    if (shouldSyncWp && (body.status !== undefined || body.scheduledAt !== undefined)) {
      const site = existingEntity.site;
      const postType = existingEntity.entityType?.slug || 'post';
      const wpPostId = existingEntity.externalId;

      try {
        const statusToWp = {
          'PUBLISHED': 'publish',
          'DRAFT': 'draft',
          'PENDING': 'pending',
          'SCHEDULED': 'future',
          'PRIVATE': 'private',
          'TRASH': 'trash',
        };

        const wpData = {};
        if (body.status) wpData.status = statusToWp[body.status] || 'draft';
        if (body.status === 'SCHEDULED' && body.scheduledAt) {
          const d = new Date(body.scheduledAt);
          wpData.date = d.toISOString();
          wpData.date_gmt = d.toISOString();
        }
        if (body.status === 'PUBLISHED' && body.scheduledAt) {
          const d = new Date(body.scheduledAt);
          wpData.date = d.toISOString();
          wpData.date_gmt = d.toISOString();
        }

        if (Object.keys(wpData).length > 0) {
          await updatePost(site, postType, wpPostId, wpData);
        }
      } catch (wpErr) {
        console.error(`[Entity PATCH ${id}] WP sync failed:`, wpErr.message);
        // Don't fail the request — entity is already updated locally
      }
    }

    return NextResponse.json({ entity: updatedEntity });
  } catch (error) {
    console.error('Failed to patch entity:', error);
    return NextResponse.json({ error: 'Failed to update entity' }, { status: 500 });
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

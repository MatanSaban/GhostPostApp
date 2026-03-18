/**
 * Content API
 * 
 * Create and manage AI-generated content
 */

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { createPost, uploadMediaFromUrl, updateSeoData, getPost } from '@/lib/wp-api-client';
import { uploadBase64ToCloudinary, processBase64ImagesInHtml } from '@/lib/cloudinary-upload';

// Get authenticated user
async function getAuthenticatedUser() {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get(SESSION_COOKIE)?.value;
    if (!userId) return null;

    return await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        isSuperAdmin: true,
        accountMemberships: { select: { accountId: true } },
      },
    });
  } catch {
    return null;
  }
}

/**
 * GET /api/content
 * List content for a site
 */
export async function GET(request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get('siteId');
    const status = searchParams.get('status');
    const type = searchParams.get('type');

    if (!siteId) {
      return NextResponse.json({ error: 'siteId is required' }, { status: 400 });
    }

    // Verify site access
    const accountIds = user.accountMemberships.map(m => m.accountId);
    const site = await prisma.site.findFirst({
      where: user.isSuperAdmin
        ? { id: siteId }
        : { id: siteId, accountId: { in: accountIds } },
    });

    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    // Build query
    const where = { siteId };
    if (status) where.status = status;
    if (type) where.type = type;

    const contents = await prisma.content.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        keyword: { select: { id: true, keyword: true } },
        campaign: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ contents });
  } catch (error) {
    console.error('[Content API] GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch content' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/content
 * Create new content (from AI generation or manual)
 */
export async function POST(request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      siteId,
      keywordId,
      campaignId,
      title,
      html,
      slug,
      excerpt,
      metaTitle,
      metaDescription,
      featuredImage,
      featuredImageAlt,
      type = 'BLOG_POST',
      status = 'DRAFT',
      scheduledAt,
      wordCount,
    } = body;

    if (!siteId || !title) {
      return NextResponse.json(
        { error: 'siteId and title are required' },
        { status: 400 }
      );
    }

    // Verify site access
    const accountIds = user.accountMemberships.map(m => m.accountId);
    const site = await prisma.site.findFirst({
      where: user.isSuperAdmin
        ? { id: siteId }
        : { id: siteId, accountId: { in: accountIds } },
    });

    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    const contentSlug = slug || title.toLowerCase().replace(/[^a-z0-9]+/g, '-');

    // Create content record in DB
    const content = await prisma.content.create({
      data: {
        siteId,
        keywordId: keywordId || undefined,
        campaignId: campaignId || undefined,
        title,
        content: html,
        slug: contentSlug,
        excerpt,
        metaTitle: metaTitle || title,
        metaDescription,
        type,
        status,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
        wordCount,
        aiGenerated: true,
      },
    });

    // If READY_TO_PUBLISH and site is connected WordPress, push to WP
    const shouldPublish = (status === 'READY_TO_PUBLISH' || status === 'SCHEDULED') 
      && site.platform === 'wordpress' 
      && site.connectionStatus === 'CONNECTED'
      && site.siteKey && site.siteSecret;

    let wpPostId = null;
    let wpPostUrl = null;

    if (shouldPublish) {
      try {
        // Upload featured image to WP if present
        let featuredImageId = null;
        let featuredImageCdnUrl = null;
        if (featuredImage) {
          try {
            console.log('[Content API] Uploading featured image:', featuredImage?.substring(0, 80));
            // If base64, upload to Cloudinary first to get a real URL
            let imageUrl = featuredImage;
            if (featuredImage.startsWith('data:')) {
              const publicId = `${contentSlug}-featured-${Date.now()}`;
              imageUrl = await uploadBase64ToCloudinary(featuredImage, 'ghostpost/posts', publicId);
              featuredImageCdnUrl = imageUrl;
              console.log('[Content API] Featured image uploaded to Cloudinary:', imageUrl);
            }
            // Now upload the URL to WP media
            const mediaResult = await uploadMediaFromUrl(site, imageUrl, {
              alt: featuredImageAlt || title,
              title: featuredImageAlt || title,
            });
            console.log('[Content API] Media upload result:', JSON.stringify(mediaResult));
            featuredImageId = mediaResult?.id || mediaResult?.attachment_id;
          } catch (imgError) {
            console.error('[Content API] Featured image upload failed:', imgError.message);
            // Continue without featured image
          }
        }

        // Determine WP post status
        let wpStatus = 'publish';
        if (status === 'SCHEDULED' && scheduledAt) {
          wpStatus = 'future';
        }

        // Process HTML content: upload any base64 images to Cloudinary and replace src
        const processedContent = await processBase64ImagesInHtml(html || '', 'ghostpost/posts', contentSlug);

        // Create post in WordPress
        const wpData = {
          title,
          content: processedContent,
          excerpt: excerpt || '',
          slug: contentSlug,
          status: wpStatus,
        };

        console.log('[Content API] featuredImageId:', featuredImageId);

        if (featuredImageId) {
          wpData.featured_image_id = featuredImageId;
          wpData.featured_image = featuredImageId; // Template version accepts both
        }

        if (wpStatus === 'future' && scheduledAt) {
          wpData.date = new Date(scheduledAt).toISOString().replace('T', ' ').replace('Z', '');
        }

        const wpResult = await createPost(site, 'post', wpData);
        console.log('[Content API] WP create result:', JSON.stringify(wpResult));

        // Verify the post was created with content
        if (wpResult?.id) {
          try {
            const verifyPost = await getPost(site, 'post', wpResult.id);
            const wpContent = verifyPost?.content || verifyPost?.post_content || '';
            console.log('[Content API] WP verify - post content length:', wpContent.length, '| preview:', String(wpContent).substring(0, 200));
          } catch (verifyErr) {
            console.warn('[Content API] Could not verify WP post content:', verifyErr.message);
          }
        }
        wpPostId = wpResult?.id;

        if (wpPostId) {
          // Update SEO data if meta title/description provided
          if (metaTitle || metaDescription) {
            try {
              await updateSeoData(site, wpPostId, {
                title: metaTitle || title,
                description: metaDescription || '',
              });
            } catch (seoError) {
              console.error('[Content API] SEO update failed:', seoError.message);
            }
          }

          // Get the WP post URL
          const wpPost = wpResult?.post;
          wpPostUrl = wpPost?.url || wpPost?.link || wpPost?.permalink 
            || `${site.url.replace(/\/$/, '')}/${contentSlug}/`;

          // Update content record as PUBLISHED
          await prisma.content.update({
            where: { id: content.id },
            data: {
              status: 'PUBLISHED',
              publishedAt: new Date(),
            },
          });
          content.status = 'PUBLISHED';
          content.publishedAt = new Date();

          // Create or update SiteEntity so it appears in dashboard entities
          let siteEntityId = null;
          try {
            // Find the "posts" entity type for this site
            let entityType = await prisma.siteEntityType.findFirst({
              where: { siteId, slug: { in: ['posts', 'post'] } },
            });

            // Create entity type if it doesn't exist
            if (!entityType) {
              entityType = await prisma.siteEntityType.create({
                data: {
                  siteId,
                  name: 'Blog Posts',
                  slug: 'posts',
                  apiEndpoint: 'posts',
                  isEnabled: true,
                },
              });
            }

            const siteEntity = await prisma.siteEntity.upsert({
              where: {
                siteId_entityTypeId_slug: {
                  siteId,
                  entityTypeId: entityType.id,
                  slug: contentSlug,
                },
              },
              create: {
                siteId,
                entityTypeId: entityType.id,
                title,
                slug: contentSlug,
                url: wpPostUrl,
                excerpt: excerpt || '',
                content: html,
                status: wpStatus === 'future' ? 'SCHEDULED' : 'PUBLISHED',
                featuredImage: featuredImage || null,
                externalId: String(wpPostId),
                publishedAt: new Date(),
                seoData: metaTitle || metaDescription ? { title: metaTitle, description: metaDescription } : undefined,
              },
              update: {
                title,
                url: wpPostUrl,
                excerpt: excerpt || '',
                content: html,
                status: wpStatus === 'future' ? 'SCHEDULED' : 'PUBLISHED',
                featuredImage: featuredImage || null,
                externalId: String(wpPostId),
                publishedAt: new Date(),
                seoData: metaTitle || metaDescription ? { title: metaTitle, description: metaDescription } : undefined,
              },
            });
            siteEntityId = siteEntity.id;
          } catch (entityError) {
            console.error('[Content API] Entity creation failed:', entityError.message);
          }

          // Link keyword to the published URL
          if (keywordId) {
            try {
              await prisma.keyword.update({
                where: { id: keywordId },
                data: {
                  url: wpPostUrl,
                  status: 'TARGETING',
                },
              });
            } catch (kwError) {
              console.error('[Content API] Keyword update failed:', kwError.message);
            }
          }
        }
      } catch (wpError) {
        console.error('[Content API] WordPress publish failed:', wpError.message);
        // Update content with error info
        await prisma.content.update({
          where: { id: content.id },
          data: {
            status: 'FAILED',
            errorMessage: wpError.message,
            publishAttempts: { increment: 1 },
            lastAttemptAt: new Date(),
          },
        });
        content.status = 'FAILED';
        content.errorMessage = wpError.message;
      }
    }

    return NextResponse.json({ 
      content,
      wpPostId,
      wpPostUrl,
      siteEntityId,
    }, { status: 201 });
  } catch (error) {
    console.error('[Content API] POST error:', error);
    return NextResponse.json(
      { error: 'Failed to create content' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/content
 * Update existing content
 */
export async function PATCH(request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { contentId, ...updateData } = body;

    if (!contentId) {
      return NextResponse.json({ error: 'contentId is required' }, { status: 400 });
    }

    // Get content with site info
    const existingContent = await prisma.content.findUnique({
      where: { id: contentId },
      include: { site: true },
    });

    if (!existingContent) {
      return NextResponse.json({ error: 'Content not found' }, { status: 404 });
    }

    // Verify access
    const accountIds = user.accountMemberships.map(m => m.accountId);
    if (!user.isSuperAdmin && !accountIds.includes(existingContent.site.accountId)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Prepare update data
    const data = {};
    if (updateData.title !== undefined) data.title = updateData.title;
    if (updateData.html !== undefined) data.content = updateData.html;
    if (updateData.slug !== undefined) data.slug = updateData.slug;
    if (updateData.excerpt !== undefined) data.excerpt = updateData.excerpt;
    if (updateData.metaTitle !== undefined) data.metaTitle = updateData.metaTitle;
    if (updateData.metaDescription !== undefined) data.metaDescription = updateData.metaDescription;
    if (updateData.type !== undefined) data.type = updateData.type;
    if (updateData.status !== undefined) data.status = updateData.status;
    if (updateData.scheduledAt !== undefined) {
      data.scheduledAt = updateData.scheduledAt ? new Date(updateData.scheduledAt) : null;
    }
    if (updateData.wordCount !== undefined) data.wordCount = updateData.wordCount;

    const content = await prisma.content.update({
      where: { id: contentId },
      data,
    });

    return NextResponse.json({ content });
  } catch (error) {
    console.error('[Content API] PATCH error:', error);
    return NextResponse.json(
      { error: 'Failed to update content' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/content
 * Delete content
 */
export async function DELETE(request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const contentId = searchParams.get('contentId');

    if (!contentId) {
      return NextResponse.json({ error: 'contentId is required' }, { status: 400 });
    }

    // Get content with site info
    const content = await prisma.content.findUnique({
      where: { id: contentId },
      include: { site: true },
    });

    if (!content) {
      return NextResponse.json({ error: 'Content not found' }, { status: 404 });
    }

    // Verify access
    const accountIds = user.accountMemberships.map(m => m.accountId);
    if (!user.isSuperAdmin && !accountIds.includes(content.site.accountId)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    await prisma.content.delete({
      where: { id: contentId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Content API] DELETE error:', error);
    return NextResponse.json(
      { error: 'Failed to delete content' },
      { status: 500 }
    );
  }
}

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { generateImage } from '@/lib/ai/gemini';
import { gatherImageContext, buildImagePrompt } from '@/lib/ai/image-context';
import { uploadBase64ToCloudinary } from '@/lib/cloudinary-upload';
import * as wpApi from '@/lib/wp-api-client';

const SESSION_COOKIE = 'user_session';

// Image generation + Cloudinary upload + plugin upload + plugin update; allow headroom.
export const maxDuration = 120;

async function getAuthenticatedUser() {
  const cookieStore = await cookies();
  const userId = cookieStore.get(SESSION_COOKIE)?.value;
  if (!userId) return null;
  return prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, isSuperAdmin: true },
  });
}

async function verifyEntityAccess(entityId, user) {
  const entity = await prisma.siteEntity.findUnique({
    where: { id: entityId },
    include: {
      entityType: { select: { slug: true } },
      site: true,
    },
  });
  if (!entity) return null;
  if (user.isSuperAdmin) return entity;
  const member = await prisma.accountMember.findFirst({
    where: { accountId: entity.site.accountId, userId: user.id },
    select: { id: true },
  });
  return member ? entity : null;
}

// POST /api/entities/[id]/generate-featured-image
//
// Generates a featured image for an existing entity using the same prompt
// pipeline as the article worker (gatherImageContext + buildImagePrompt).
// Uploads the result to Cloudinary, then pushes it to WordPress as the post's
// featured image via the plugin. Updates the local SiteEntity row to mirror.
export async function POST(_request, { params }) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const entity = await verifyEntityAccess(id, user);
    if (!entity) {
      return NextResponse.json({ error: 'Entity not found or no access' }, { status: 404 });
    }

    const site = entity.site;
    if (site.platform !== 'wordpress' || site.connectionStatus !== 'CONNECTED') {
      return NextResponse.json(
        {
          error: 'Plugin not connected — featured image cannot be applied to the post',
          code: 'PLUGIN_DISCONNECTED',
        },
        { status: 412 },
      );
    }
    if (!entity.externalId) {
      return NextResponse.json(
        { error: 'Entity has no WordPress post id (externalId)', code: 'NO_EXTERNAL_ID' },
        { status: 422 },
      );
    }

    const focusKeyword =
      entity.seoData?.focusKeyword ||
      entity.seoData?.focuskw ||
      entity.seoData?.keyword ||
      undefined;

    let imageContext = null;
    try {
      imageContext = await gatherImageContext(site);
    } catch (err) {
      // Best-effort — buildImagePrompt handles a null/empty context gracefully.
      console.warn('[generate-featured-image] gatherImageContext failed:', err?.message);
    }

    const prompt = buildImagePrompt({
      imageContext: imageContext || {},
      keyword: focusKeyword,
      postTitle: entity.title,
      postExcerpt: entity.excerpt || '',
      imageType: 'featured',
    });

    let images;
    try {
      images = await generateImage({
        prompt,
        aspectRatio: '16:9',
        operation: 'GENERATE_IMAGE',
        metadata: { type: 'featured', entityId: entity.id, siteId: site.id },
        accountId: site.accountId,
        userId: user.id,
        siteId: site.id,
      });
    } catch (err) {
      // generateImage throws on credit failure / API failure. Surface a
      // sensible code for the client.
      const msg = err?.message || '';
      if (msg.includes('INSUFFICIENT_CREDITS') || msg.includes('credits')) {
        return NextResponse.json(
          { error: msg, code: 'INSUFFICIENT_CREDITS' },
          { status: 402 },
        );
      }
      return NextResponse.json(
        { error: 'Image generation failed', message: msg },
        { status: 502 },
      );
    }

    if (!images?.length) {
      return NextResponse.json({ error: 'No image returned', code: 'NO_IMAGE' }, { status: 502 });
    }

    const slugBase = (entity.slug || entity.id).replace(/[^a-z0-9-]/gi, '-').toLowerCase();
    const publicId = `${slugBase}-featured-${Date.now()}`;
    const base64Data = `data:${images[0].mimeType};base64,${images[0].base64}`;

    let cdnUrl;
    try {
      cdnUrl = await uploadBase64ToCloudinary(base64Data, 'ghostpost/posts', publicId);
    } catch (err) {
      return NextResponse.json(
        { error: 'Cloudinary upload failed', message: err?.message },
        { status: 502 },
      );
    }

    // Push to the WordPress media library, then attach as featured_image.
    let mediaId;
    try {
      const uploaded = await wpApi.uploadMediaFromUrl(site, cdnUrl, {
        title: entity.title,
        alt: entity.title,
        postId: entity.externalId,
      });
      mediaId = uploaded?.id;
    } catch (err) {
      return NextResponse.json(
        { error: 'Plugin media upload failed', message: err?.message },
        { status: 502 },
      );
    }

    if (mediaId) {
      try {
        await wpApi.updatePost(site, entity.entityType?.slug || 'posts', entity.externalId, {
          featured_image: mediaId,
        });
      } catch (err) {
        // Media uploaded but post-attach failed — the image is in WP's library,
        // we just couldn't link it. Surface the failure but keep the CDN URL.
        return NextResponse.json(
          {
            error: 'Plugin post update failed',
            message: err?.message,
            cdnUrl,
            mediaId,
          },
          { status: 502 },
        );
      }
    }

    // Mirror locally so the next list refresh shows the image without waiting
    // on an entity sync.
    await prisma.siteEntity
      .update({
        where: { id: entity.id },
        data: { featuredImage: cdnUrl },
      })
      .catch((err) => {
        console.warn('[generate-featured-image] local mirror failed:', err?.message);
      });

    return NextResponse.json({
      success: true,
      featuredImage: cdnUrl,
      mediaId,
    });
  } catch (error) {
    console.error('[entities generate-featured-image API] error:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error.message },
      { status: 500 },
    );
  }
}

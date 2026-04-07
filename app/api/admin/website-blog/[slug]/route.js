import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getCurrentAccountMember } from '@/lib/auth-permissions';

// GET - Get single blog post
export async function GET(request, { params }) {
  try {
    const result = await getCurrentAccountMember();
    if (!result.authorized) {
      return NextResponse.json({ error: result.error || 'Unauthorized' }, { status: 401 });
    }
    if (!result.isSuperAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { slug } = await params;

    const post = await prisma.websiteBlogPost.findUnique({
      where: { websiteId_slug: { websiteId: 'gp-ws', slug } }
    });

    if (!post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    return NextResponse.json(post);
  } catch (error) {
    console.error('Error fetching blog post:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// PUT - Update blog post
export async function PUT(request, { params }) {
  try {
    const result = await getCurrentAccountMember();
    if (!result.authorized) {
      return NextResponse.json({ error: result.error || 'Unauthorized' }, { status: 401 });
    }
    if (!result.isSuperAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { slug } = await params;
    const body = await request.json();
    const { content, seo, featuredImage, published } = body;

    // Check if post exists
    const existing = await prisma.websiteBlogPost.findUnique({
      where: { websiteId_slug: { websiteId: 'gp-ws', slug } }
    });

    if (!existing) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    // Create title object from content
    const title = {};
    for (const locale of ['en', 'he', 'fr']) {
      if (content?.[locale]?.title) {
        title[locale] = content[locale].title;
      }
    }

    const post = await prisma.websiteBlogPost.update({
      where: { websiteId_slug: { websiteId: 'gp-ws', slug } },
      data: {
        title,
        content: content || existing.content,
        seo: seo || existing.seo,
        featuredImage: featuredImage ?? existing.featuredImage,
        published: published ?? existing.published
      }
    });

    // Trigger revalidation if published
    if (published) {
      try {
        const gpWsUrl = process.env.GP_WS_URL || 'http://localhost:3001';
        await fetch(`${gpWsUrl}/api/revalidate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            secret: process.env.REVALIDATE_SECRET,
            tags: [`blog-${slug}`, 'blog-list']
          })
        });
      } catch (e) {
        console.error('Failed to revalidate:', e);
      }
    }

    return NextResponse.json(post);
  } catch (error) {
    console.error('Error updating blog post:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// DELETE - Delete blog post
export async function DELETE(request, { params }) {
  try {
    const result = await getCurrentAccountMember();
    if (!result.authorized) {
      return NextResponse.json({ error: result.error || 'Unauthorized' }, { status: 401 });
    }
    if (!result.isSuperAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { slug } = await params;

    await prisma.websiteBlogPost.delete({
      where: { websiteId_slug: { websiteId: 'gp-ws', slug } }
    });

    // Trigger revalidation
    try {
      const gpWsUrl = process.env.GP_WS_URL || 'http://localhost:3001';
      await fetch(`${gpWsUrl}/api/revalidate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          secret: process.env.REVALIDATE_SECRET,
          tags: [`blog-${slug}`, 'blog-list']
        })
      });
    } catch (e) {
      console.error('Failed to revalidate:', e);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting blog post:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getCurrentAccountMember } from '@/lib/auth-permissions';

// GET - List all blog posts
export async function GET(request) {
  try {
    const result = await getCurrentAccountMember();
    if (!result.authorized) {
      return NextResponse.json({ error: result.error || 'Unauthorized' }, { status: 401 });
    }
    if (!result.isSuperAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const posts = await prisma.websiteBlogPost.findMany({
      where: { websiteId: 'gp-ws' },
      orderBy: { updatedAt: 'desc' }
    });

    // Transform posts for list view
    const transformedPosts = posts.map(post => ({
      slug: post.slug,
      title: post.title,
      locales: Object.keys(post.content || {}).filter(k => post.content[k]?.title),
      published: post.published,
      updatedAt: post.updatedAt
    }));

    return NextResponse.json({ posts: transformedPosts });
  } catch (error) {
    console.error('Error fetching blog posts:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// POST - Create new blog post
export async function POST(request) {
  try {
    const result = await getCurrentAccountMember();
    if (!result.authorized) {
      return NextResponse.json({ error: result.error || 'Unauthorized' }, { status: 401 });
    }
    if (!result.isSuperAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { slug, content, seo, featuredImage, published } = body;

    if (!slug || !slug.match(/^[a-z0-9-]+$/)) {
      return NextResponse.json({ 
        error: 'Invalid slug. Use only lowercase letters, numbers, and hyphens.' 
      }, { status: 400 });
    }

    // Check if slug already exists
    const existing = await prisma.websiteBlogPost.findUnique({
      where: { websiteId_slug: { websiteId: 'gp-ws', slug } }
    });

    if (existing) {
      return NextResponse.json({ error: 'Slug already exists' }, { status: 400 });
    }

    // Create title object from content
    const title = {};
    for (const locale of ['en', 'he', 'fr']) {
      if (content?.[locale]?.title) {
        title[locale] = content[locale].title;
      }
    }

    const post = await prisma.websiteBlogPost.create({
      data: {
        websiteId: 'gp-ws',
        slug,
        title,
        content: content || {},
        seo: seo || {},
        featuredImage: featuredImage || '',
        published: published || false
      }
    });

    return NextResponse.json(post, { status: 201 });
  } catch (error) {
    console.error('Error creating blog post:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

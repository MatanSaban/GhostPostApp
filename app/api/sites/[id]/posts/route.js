/**
 * Site Posts API
 * Returns available posts for a site, fetches from WordPress if needed
 */

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { getPosts } from '@/lib/wp-api-client';

const SESSION_COOKIE = 'user_session';

// Get authenticated user
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
        isSuperAdmin: true,
        accountMemberships: {
          select: { accountId: true },
        },
      },
    });

    return user;
  } catch (error) {
    console.error('[SitePosts] Auth error:', error);
    return null;
  }
}

/**
 * GET - Retrieve available posts for a site
 */
export async function GET(request, { params }) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: siteId } = await params;

    // Verify site access
    let site;
    if (user.isSuperAdmin) {
      site = await prisma.site.findUnique({
        where: { id: siteId },
        select: { id: true, url: true, platform: true },
      });
    } else {
      const accountIds = user.accountMemberships.map(m => m.accountId);
      site = await prisma.site.findFirst({
        where: user.isSuperAdmin ? { id: siteId } : { id: siteId, accountId: { in: accountIds } },
        select: { id: true, url: true, platform: true },
      });
    }

    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    // Get posts from SiteEntity — skip if the posts type is disabled.
    const postEntityType = await prisma.siteEntityType.findFirst({
      where: { siteId: site.id, slug: { in: ['posts', 'post'] }, isEnabled: true },
    });

    let posts = [];

    if (postEntityType) {
      const siteEntities = await prisma.siteEntity.findMany({
        where: {
          siteId: site.id,
          entityTypeId: postEntityType.id,
          status: 'PUBLISHED',
        },
        select: {
          id: true,
          title: true,
          url: true,
          excerpt: true,
          featuredImage: true,
        },
        orderBy: { publishedAt: 'desc' },
        take: 50,
      });

      posts = siteEntities.map(e => ({
        id: e.id,
        title: e.title,
        url: e.url,
        excerpt: e.excerpt,
        image: e.featuredImage,
      }));
    }

    // Also check interview externalData for fetchedArticles
    const interview = await prisma.userInterview.findFirst({
      where: { userId: user.id, siteId },
      select: { externalData: true },
      orderBy: { updatedAt: 'desc' },
    });

    const fetchedArticles = interview?.externalData?.fetchedArticles || [];

    return NextResponse.json({
      posts,
      fetchedArticles,
      hasPosts: posts.length > 0,
      hasFetchedArticles: fetchedArticles.length > 0,
    });
  } catch (error) {
    console.error('[SitePosts] GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch posts' },
      { status: 500 }
    );
  }
}

/**
 * POST - Fetch posts from WordPress and store them
 */
export async function POST(request, { params }) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: siteId } = await params;
    const { limit = 20 } = await request.json().catch(() => ({}));

    // Verify site access and get site data
    let site;
    if (user.isSuperAdmin) {
      site = await prisma.site.findUnique({
        where: { id: siteId },
        select: {
          id: true,
          url: true,
          platform: true,
          connectionStatus: true,
          siteKey: true,
          siteSecret: true,
        },
      });
    } else {
      const accountIds = user.accountMemberships.map(m => m.accountId);
      site = await prisma.site.findFirst({
        where: user.isSuperAdmin ? { id: siteId } : { id: siteId, accountId: { in: accountIds } },
        select: {
          id: true,
          url: true,
          platform: true,
          connectionStatus: true,
          siteKey: true,
          siteSecret: true,
        },
      });
    }

    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    let posts = [];

    // Try WordPress plugin API first
    if (site.connectionStatus === 'CONNECTED') {
      try {
        const result = await getPosts(site, 'post', 1, limit, false);
        const wpPosts = Array.isArray(result) ? result : (result.posts || result.data || []);
        
        if (wpPosts.length > 0) {
          posts = wpPosts.map(post => ({
            id: String(post.id),
            title: typeof post.title === 'object' ? post.title.rendered?.replace(/<[^>]+>/g, '').trim() : post.title,
            url: post.link || post.url,
            excerpt: typeof post.excerpt === 'object' ?
              post.excerpt.rendered?.replace(/<[^>]+>/g, '').trim().substring(0, 200) :
              post.excerpt?.substring(0, 200),
            image: post.featured_image || post.featuredImage || null,
          }));
        }
      } catch (error) {
        console.log('[SitePosts] Plugin API error:', error.message);
      }
    }

    // Try WordPress REST API if plugin didn't work and site is WordPress
    if (posts.length === 0 && site.platform === 'wordpress') {
      const baseUrl = site.url.replace(/\/$/, '');
      try {
        const response = await fetch(
          `${baseUrl}/wp-json/wp/v2/posts?per_page=${limit}&_fields=id,title,link,excerpt,date,featured_media`,
          {
            headers: {
              'Accept': 'application/json',
              'User-Agent': 'Mozilla/5.0 (compatible; GhostPostBot/1.0)',
            },
            signal: AbortSignal.timeout(10000),
          }
        );

        if (response.ok) {
          const wpPosts = await response.json();

          // Fetch featured images
          posts = await Promise.all(
            wpPosts.map(async (post) => {
              let image = null;

              if (post.featured_media && post.featured_media > 0) {
                try {
                  const mediaRes = await fetch(
                    `${baseUrl}/wp-json/wp/v2/media/${post.featured_media}?_fields=source_url`,
                    { signal: AbortSignal.timeout(5000) }
                  );
                  if (mediaRes.ok) {
                    const mediaData = await mediaRes.json();
                    image = mediaData.source_url;
                  }
                } catch { /* ignore */ }
              }

              return {
                id: String(post.id),
                title: post.title?.rendered?.replace(/<[^>]+>/g, '').trim(),
                url: post.link,
                excerpt: post.excerpt?.rendered?.replace(/<[^>]+>/g, '').trim().substring(0, 200) || null,
                image,
              };
            })
          );
        }
      } catch (error) {
        console.log('[SitePosts] REST API error:', error.message);
      }
    }

    if (posts.length === 0) {
      return NextResponse.json(
        { error: 'לא הצלחנו לשלוף מאמרים מהאתר. ודא שהאתר מבוסס WordPress ויש לו מאמרים פורסמים.' },
        { status: 400 }
      );
    }

    // Store fetched articles in interview externalData
    const interview = await prisma.userInterview.findFirst({
      where: { userId: user.id, siteId },
      select: { id: true, externalData: true },
      orderBy: { updatedAt: 'desc' },
    });

    if (interview) {
      const currentExternalData = interview.externalData || {};
      await prisma.userInterview.update({
        where: { id: interview.id },
        data: {
          externalData: {
            ...currentExternalData,
            fetchedArticles: posts,
          },
          updatedAt: new Date(),
        },
      });
    }

    return NextResponse.json({
      success: true,
      posts,
      count: posts.length,
    });
  } catch (error) {
    console.error('[SitePosts] POST error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch posts from website' },
      { status: 500 }
    );
  }
}

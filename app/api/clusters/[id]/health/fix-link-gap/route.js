import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { generateLinkGapFix } from '@/lib/ai/cluster-link-fix';
import * as wpApi from '@/lib/wp-api-client';

const SESSION_COOKIE = 'user_session';

// AI generation + a WP round-trip; allow extra headroom over the default.
export const maxDuration = 90;

async function getAuthenticatedUser() {
  const cookieStore = await cookies();
  const userId = cookieStore.get(SESSION_COOKIE)?.value;
  if (!userId) return null;
  return prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, isSuperAdmin: true },
  });
}

async function verifyClusterAccess(clusterId, user) {
  const cluster = await prisma.topicCluster.findUnique({
    where: { id: clusterId },
    include: { site: true },
  });
  if (!cluster) return null;
  if (user.isSuperAdmin) return cluster;
  const member = await prisma.accountMember.findFirst({
    where: { accountId: cluster.site.accountId, userId: user.id },
    select: { id: true },
  });
  return member ? cluster : null;
}

// POST /api/clusters/[id]/health/fix-link-gap
// Body: { fromEntityId, toEntityId }
//
// AI inserts a single internal link from `fromEntity` to `toEntity` and pushes
// the updated content through the WordPress plugin. Requires the plugin to be
// connected — falls back to 412 (Precondition Failed) otherwise.
export async function POST(request, { params }) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const cluster = await verifyClusterAccess(id, user);
    if (!cluster) {
      return NextResponse.json({ error: 'Cluster not found or no access' }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const { fromEntityId, toEntityId } = body;
    if (!fromEntityId || !toEntityId) {
      return NextResponse.json(
        { error: 'fromEntityId and toEntityId are required' },
        { status: 400 },
      );
    }
    if (fromEntityId === toEntityId) {
      return NextResponse.json({ error: 'from and to must differ' }, { status: 400 });
    }

    const site = cluster.site;
    if (site.connectionStatus !== 'CONNECTED') {
      return NextResponse.json(
        {
          error: 'Plugin not connected — cannot apply the fix',
          code: 'PLUGIN_DISCONNECTED',
        },
        { status: 412 },
      );
    }

    const [fromEntity, toEntity] = await Promise.all([
      prisma.siteEntity.findFirst({
        where: { id: fromEntityId, siteId: cluster.siteId },
        include: { entityType: { select: { slug: true } } },
      }),
      prisma.siteEntity.findFirst({
        where: { id: toEntityId, siteId: cluster.siteId },
        select: { id: true, title: true, url: true },
      }),
    ]);

    if (!fromEntity || !toEntity) {
      return NextResponse.json(
        { error: 'One or both entities not found on this site' },
        { status: 404 },
      );
    }
    if (!fromEntity.externalId) {
      return NextResponse.json(
        { error: 'Source entity has no WordPress post id (externalId)' },
        { status: 422 },
      );
    }
    if (!fromEntity.content || fromEntity.content.length < 50) {
      return NextResponse.json(
        { error: 'Source entity has no usable content to modify' },
        { status: 422 },
      );
    }
    if (!toEntity.url) {
      return NextResponse.json(
        { error: 'Target entity has no URL — nothing to link to' },
        { status: 422 },
      );
    }

    // Look up the focus keyword for nicer anchor text generation, when available.
    const targetKeywordRow = await prisma.keyword.findFirst({
      where: { siteId: cluster.siteId, url: toEntity.url },
      select: { keyword: true },
      orderBy: { createdAt: 'desc' },
    });

    const fix = await generateLinkGapFix({
      sourceTitle: fromEntity.title,
      sourceContent: fromEntity.content,
      targetTitle: toEntity.title,
      targetUrl: toEntity.url,
      targetKeyword: targetKeywordRow?.keyword || cluster.mainKeyword,
      accountId: site.accountId,
      userId: user.id,
      siteId: cluster.siteId,
    });

    if (!fix?.searchText || !fix?.replaceText) {
      return NextResponse.json(
        { error: 'AI did not return a usable edit', code: 'NO_FIX' },
        { status: 422 },
      );
    }

    // Validate: the AI's searchText must appear verbatim in source content.
    if (!fromEntity.content.includes(fix.searchText)) {
      return NextResponse.json(
        {
          error: 'AI suggested a passage that does not appear in the source — refusing to apply',
          code: 'NO_VERBATIM_MATCH',
        },
        { status: 422 },
      );
    }

    // Validate: the new content must contain the target URL (link was actually inserted).
    if (!fix.replaceText.includes(toEntity.url)) {
      return NextResponse.json(
        {
          error: 'AI replaceText is missing the target URL — refusing to apply',
          code: 'NO_LINK_INSERTED',
        },
        { status: 422 },
      );
    }

    const updatedContent = fromEntity.content.replace(fix.searchText, fix.replaceText);

    // Sanity: a successful surgical edit grows the content by roughly the size
    // of the inserted <a> tag. If it's shrinking or growing wildly, abort.
    const delta = updatedContent.length - fromEntity.content.length;
    if (delta < 0 || delta > 1000) {
      return NextResponse.json(
        { error: 'Edit changed content length unexpectedly — refusing to apply', code: 'BAD_DELTA' },
        { status: 422 },
      );
    }

    const postType = fromEntity.entityType?.slug || 'posts';

    // Push to WordPress.
    let pushResult;
    try {
      pushResult = await wpApi.updatePost(site, postType, fromEntity.externalId, {
        content: updatedContent,
      });
    } catch (err) {
      return NextResponse.json(
        { error: 'Plugin update failed', message: err?.message || 'unknown' },
        { status: 502 },
      );
    }

    // Mirror the change locally so the next health check doesn't surface the same gap.
    await prisma.siteEntity
      .update({
        where: { id: fromEntity.id },
        data: { content: updatedContent },
      })
      .catch((err) => {
        // Best-effort: WP truth wins. Cron sync will fix any drift.
        console.warn('[cluster-link-fix] local content mirror failed:', err?.message);
      });

    return NextResponse.json({
      success: true,
      anchor: fix.anchor,
      rationale: fix.rationale,
      wordpressPostId: pushResult?.id || fromEntity.externalId,
    });
  } catch (error) {
    console.error('[Cluster fix-link-gap API] error:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error.message },
      { status: 500 },
    );
  }
}

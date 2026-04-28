import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { generateStructuredResponse } from '@/lib/ai/gemini';

const SESSION_COOKIE = 'user_session';

// AI suggestion is the expensive part — give it room.
export const maxDuration = 60;

const MAX_MEMBERS_IN_PROMPT = 25;
const TARGET_GAP_COUNT_DEFAULT = 8;
const ARTICLE_TYPES = ['BLOG_POST', 'SEO_ARTICLE', 'GUIDE', 'COMPARISON', 'LISTICLE', 'HOW_TO', 'CASE_STUDY'];
const INTENTS = ['INFORMATIONAL', 'NAVIGATIONAL', 'TRANSACTIONAL', 'COMMERCIAL'];

const GapSchema = z.object({
  gaps: z
    .array(
      z.object({
        title: z.string().describe('Concrete article title (5-12 words). No quotes, no trailing period.'),
        articleType: z
          .enum(ARTICLE_TYPES)
          .describe('Best-fit article type for this gap topic'),
        intent: z.enum(INTENTS).describe('Search intent the gap topic addresses'),
        explanation: z
          .string()
          .describe('One short sentence on why this fills a real gap given the existing members'),
      }),
    )
    .describe('Gap topics that would meaningfully expand the cluster without overlapping existing members'),
});

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
    include: { site: { select: { id: true, accountId: true } } },
  });
  if (!cluster) return null;
  if (user.isSuperAdmin) return cluster;
  const member = await prisma.accountMember.findFirst({
    where: { accountId: cluster.site.accountId, userId: user.id },
    select: { id: true },
  });
  return member ? cluster : null;
}

// POST /api/clusters/[id]/suggest-gaps
// Body: { count?: number }
//
// Given a cluster's pillar + members, asks the AI to propose missing subtopics
// the cluster should cover. Returns an array shaped like Campaign.subjectSuggestions
// so the wizard can drop the result straight into its SubjectsStep.
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
    const requestedCount = Math.min(Math.max(parseInt(body.count, 10) || TARGET_GAP_COUNT_DEFAULT, 3), 15);

    if (!cluster.memberEntityIds?.length) {
      return NextResponse.json({ gaps: [] });
    }

    const memberRows = await prisma.siteEntity.findMany({
      where: { id: { in: cluster.memberEntityIds } },
      select: { id: true, title: true, excerpt: true, url: true },
    });

    const pillar = cluster.pillarEntityId
      ? memberRows.find((m) => m.id === cluster.pillarEntityId)
      : null;

    const memberLines = memberRows
      .slice(0, MAX_MEMBERS_IN_PROMPT)
      .map((m, i) => {
        const tag = m.id === cluster.pillarEntityId ? ' (pillar)' : '';
        const snippet = m.excerpt ? ` — ${m.excerpt.slice(0, 140)}` : '';
        return `${i + 1}. ${m.title}${tag}${snippet}`;
      })
      .join('\n');

    const validation = await generateStructuredResponse({
      system:
        'You are a senior SEO content strategist. You propose missing subtopics that would meaningfully expand a topic cluster — not duplicates of what already exists, not generic filler.',
      prompt: `Cluster name: ${cluster.name}
Anchor keyword: ${cluster.mainKeyword}
${pillar ? `Pillar page: ${pillar.title}` : 'Pillar: (not set)'}

Existing cluster members (${memberRows.length}):
${memberLines}

Propose ${requestedCount} concrete article topics that fill real gaps in this cluster. Avoid topics that overlap an existing member. Favor different angles, intents, and audience needs. Each topic should be specific enough to write about (not "guide to X" but "how to choose between A and B for use-case Y"). Output language must match the cluster name and member titles above.`,
      schema: GapSchema,
      operation: 'CLUSTER_GAP_SUGGESTIONS',
      accountId: cluster.site.accountId,
      userId: user.id,
      siteId: cluster.siteId,
      metadata: { clusterId: cluster.id, memberCount: memberRows.length, requestedCount },
    });

    return NextResponse.json({ gaps: validation?.gaps || [] });
  } catch (error) {
    console.error('[Cluster suggest-gaps API] error:', error);
    return NextResponse.json(
      { error: 'Failed to suggest gaps', message: error.message },
      { status: 500 },
    );
  }
}

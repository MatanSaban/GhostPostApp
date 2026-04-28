/**
 * Topic Cluster Discovery
 *
 * Finds topical clusters in a site's existing SiteEntity content using
 * embeddings + AI validation. Output: TopicCluster rows with status=DISCOVERED
 * for the user to confirm via the clusters page.
 *
 * Pipeline:
 *   1. Load PUBLISHED SiteEntity rows (capped, newest first)
 *   2. Embed `${title}\n${excerpt}` for each
 *   3. Group via cosine-similarity threshold + connected components (union-find)
 *   4. For each candidate group (>= MIN_CLUSTER_SIZE), ask AI to validate, name, and pick a pillar
 *   5. Insert validated clusters with status=DISCOVERED
 *
 * Designed to be safe to call multiple times - discovery is gated externally on
 * "site has zero existing clusters" so we don't re-run on every sync.
 */

import { z } from 'zod';
import prisma from '@/lib/prisma';
import {
  generateEmbeddings,
  cosineSimilarity,
  generateStructuredResponse,
} from '@/lib/ai/gemini';

const MAX_ENTITIES = 200;
const SIM_THRESHOLD = 0.78;
const MIN_CLUSTER_SIZE = 2;
const MAX_CLUSTER_SIZE = 25;
const MAX_VALIDATIONS = 30;
const EXCERPT_FALLBACK_CHARS = 500;
const MEMBER_PROMPT_EXCERPT_CHARS = 200;

const ClusterValidationSchema = z.object({
  isRealCluster: z
    .boolean()
    .describe(
      'Whether these pages form a coherent topic cluster suitable for a pillar+spokes SEO strategy',
    ),
  name: z
    .string()
    .describe('Short human-readable cluster name (3-6 words). Empty string if not a real cluster.'),
  mainKeyword: z
    .string()
    .describe('Anchor keyword that ties members together. Empty string if not a real cluster.'),
  pillarIndex: z
    .number()
    .int()
    .describe(
      '0-based index of the member best suited to be the pillar (broadest/most authoritative). -1 if no clear pillar.',
    ),
  confidenceScore: z.number().min(0).max(1).describe('Confidence (0-1) that this is a useful cluster'),
  reasoning: z.string().optional().describe('Brief reasoning for the verdict'),
});

function buildEmbeddingInput(entity) {
  const title = entity.title || '';
  const excerpt = entity.excerpt || (entity.content || '').slice(0, EXCERPT_FALLBACK_CHARS);
  return `${title}\n${excerpt}`.trim();
}

function findConnectedComponents(embeddings, threshold) {
  const n = embeddings.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x) => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  const union = (a, b) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (cosineSimilarity(embeddings[i], embeddings[j]) >= threshold) {
        union(i, j);
      }
    }
  }

  const groups = new Map();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(i);
  }
  return Array.from(groups.values());
}

/**
 * Run topic cluster discovery for a site.
 *
 * @param {Object} params
 * @param {string} params.siteId
 * @param {string} [params.accountId] - For credit tracking
 * @param {string} [params.userId] - For credit tracking
 * @returns {Promise<{ clustersCreated: number, candidatesEvaluated: number, entitiesProcessed: number, createdIds: string[] }>}
 */
export async function discoverTopicClusters({ siteId, accountId, userId }) {
  if (!siteId) throw new Error('siteId is required for discoverTopicClusters');

  // Exclude entities already settled into a non-REJECTED cluster.
  // CONFIRMED  → user has accepted; we shouldn't propose duplicate clusters for the same content.
  // DISCOVERED → already pending review; re-proposing would clutter the queue.
  // REJECTED   → user rejected the *grouping*, not the entities. Members stay eligible
  //              for re-clustering since they may form a different valid cluster.
  const settledClusters = await prisma.topicCluster.findMany({
    where: { siteId, status: { in: ['CONFIRMED', 'DISCOVERED'] } },
    select: { memberEntityIds: true },
  });
  const settledIds = new Set();
  for (const c of settledClusters) {
    for (const id of c.memberEntityIds || []) settledIds.add(id);
  }

  const entities = await prisma.siteEntity.findMany({
    where: {
      siteId,
      status: 'PUBLISHED',
      ...(settledIds.size > 0 ? { NOT: { id: { in: Array.from(settledIds) } } } : {}),
    },
    select: { id: true, title: true, excerpt: true, content: true, publishedAt: true },
    orderBy: { publishedAt: 'desc' },
    take: MAX_ENTITIES,
  });

  if (entities.length < MIN_CLUSTER_SIZE) {
    console.log(
      `[ClusterDiscovery] site=${siteId} has ${entities.length} eligible entities (${settledIds.size} excluded as settled) - skipping`,
    );
    return { clustersCreated: 0, candidatesEvaluated: 0, entitiesProcessed: entities.length, createdIds: [] };
  }

  const inputs = entities.map(buildEmbeddingInput);
  const embeddings = await generateEmbeddings({
    values: inputs,
    operation: 'EMBEDDING',
    accountId,
    userId,
    siteId,
    metadata: { context: 'cluster-discovery' },
  });

  if (!embeddings || embeddings.length !== entities.length) {
    throw new Error(
      `Embedding count mismatch for site ${siteId}: expected ${entities.length}, got ${embeddings?.length || 0}`,
    );
  }

  const components = findConnectedComponents(embeddings, SIM_THRESHOLD)
    .filter((c) => c.length >= MIN_CLUSTER_SIZE && c.length <= MAX_CLUSTER_SIZE)
    .sort((a, b) => b.length - a.length)
    .slice(0, MAX_VALIDATIONS);

  const createdIds = [];
  for (const indices of components) {
    const members = indices.map((i) => entities[i]);
    const memberDescriptions = members
      .map((m, idx) => {
        const snippet = (m.excerpt || (m.content || '').slice(0, MEMBER_PROMPT_EXCERPT_CHARS)).slice(
          0,
          MEMBER_PROMPT_EXCERPT_CHARS,
        );
        return `[${idx}] ${m.title}${snippet ? `\n   ${snippet}` : ''}`;
      })
      .join('\n');

    let validation;
    try {
      validation = await generateStructuredResponse({
        system:
          'You are an SEO topic-clustering expert. Your job is to decide whether a candidate group of pages forms a coherent topic cluster - a set of pages covering the same broad topic from different angles, suitable for a pillar+spokes content strategy.',
        prompt: `Site has ${entities.length} pages. The following ${members.length} pages were grouped by semantic similarity. Evaluate whether they form a real, useful topic cluster.\n\nMembers:\n${memberDescriptions}\n\nReturn isRealCluster=false if the grouping is too generic, the pages are unrelated despite surface similarity, or the cluster wouldn't be actionable for SEO. Otherwise: choose a clear cluster name (3-6 words), the anchor keyword, and the 0-based index of the member best suited to be the pillar. Use pillarIndex -1 if no member is a clear pillar.`,
        schema: ClusterValidationSchema,
        operation: 'CLUSTER_DISCOVERY',
        accountId,
        userId,
        siteId,
        metadata: { memberCount: members.length },
      });
    } catch (err) {
      console.error('[ClusterDiscovery] validation failed:', err.message);
      continue;
    }

    if (!validation?.isRealCluster) continue;

    const pillarEntityId =
      Number.isInteger(validation.pillarIndex) &&
      validation.pillarIndex >= 0 &&
      validation.pillarIndex < members.length
        ? members[validation.pillarIndex].id
        : null;

    try {
      const cluster = await prisma.topicCluster.create({
        data: {
          siteId,
          name: validation.name,
          mainKeyword: validation.mainKeyword,
          pillarEntityId,
          memberEntityIds: members.map((m) => m.id),
          status: 'DISCOVERED',
          source: 'DISCOVERED_FROM_SITE',
          confidenceScore: validation.confidenceScore,
        },
      });
      createdIds.push(cluster.id);
    } catch (err) {
      console.error('[ClusterDiscovery] DB insert failed:', err.message);
    }
  }

  console.log(
    `[ClusterDiscovery] site=${siteId} processed=${entities.length} candidates=${components.length} created=${createdIds.length}`,
  );

  return {
    clustersCreated: createdIds.length,
    candidatesEvaluated: components.length,
    entitiesProcessed: entities.length,
    createdIds,
  };
}

/**
 * Run discovery only if the site has zero existing TopicClusters.
 * Safe to call from sync hooks - won't re-discover on subsequent runs.
 */
export async function maybeDiscoverClustersAfterSync({ siteId, accountId, userId }) {
  const existingCount = await prisma.topicCluster.count({ where: { siteId } });
  if (existingCount > 0) {
    return { skipped: true, reason: 'clusters_already_exist', existingCount };
  }
  try {
    const result = await discoverTopicClusters({ siteId, accountId, userId });
    return { skipped: false, ...result };
  } catch (err) {
    console.error(`[ClusterDiscovery] failed for site ${siteId}:`, err.message);
    return { skipped: false, error: err.message, clustersCreated: 0 };
  }
}

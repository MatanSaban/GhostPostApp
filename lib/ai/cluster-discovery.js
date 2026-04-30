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
import { MAX_DEPTH } from '@/lib/cluster-tree';

const MAX_ENTITIES = 200;
const SIM_THRESHOLD = 0.78;
const MIN_CLUSTER_SIZE = 2;
const MAX_CLUSTER_SIZE = 25;
const MAX_VALIDATIONS = 30;
const EXCERPT_FALLBACK_CHARS = 500;
const MEMBER_PROMPT_EXCERPT_CHARS = 200;

// Sub-cluster discovery uses tighter thresholds — the parent already proves
// the broader topic exists, so sub-groups must be more cohesive (0.82 vs 0.78)
// AND larger (≥3 members) before we'll spend an AI validation on them.
// MAX_SUB_VALIDATIONS bounds AI cost per parent at every level of the tree.
const SUB_SIM_THRESHOLD = 0.82;
const MIN_SUB_CLUSTER_SIZE = 3;
const MAX_SUB_VALIDATIONS = 8;

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
 * Build the set of entity IDs that should be excluded from sub-cluster
 * discovery for `parentClusterId`. Members of the parent itself stay eligible
 * (that's the candidate pool). Members of OTHER non-rejected clusters are
 * excluded so a single entity doesn't end up claimed by competing sub-clusters.
 */
async function getSubDiscoveryExclusions({ siteId, parentClusterId }) {
  const others = await prisma.topicCluster.findMany({
    where: {
      siteId,
      status: { in: ['CONFIRMED', 'DISCOVERED'] },
      NOT: { id: parentClusterId },
    },
    select: { memberEntityIds: true, pillarEntityId: true },
  });
  const ids = new Set();
  for (const c of others) {
    for (const id of c.memberEntityIds || []) ids.add(id);
    if (c.pillarEntityId) ids.add(c.pillarEntityId);
  }
  return ids;
}

const SubClusterValidationSchema = z.object({
  isRealCluster: z
    .boolean()
    .describe(
      'Whether these pages form a coherent SUB-topic under the parent cluster — distinct enough from the parent to warrant their own pillar+spokes structure',
    ),
  name: z
    .string()
    .describe('Short human-readable sub-cluster name (3-6 words). Empty string if not a real sub-cluster.'),
  mainKeyword: z
    .string()
    .describe('Anchor keyword for the sub-topic. Empty string if not a real sub-cluster.'),
  pillarIndex: z
    .number()
    .int()
    .describe(
      '0-based index of the member best suited to be the sub-cluster pillar. -1 if no clear pillar.',
    ),
  confidenceScore: z.number().min(0).max(1).describe('Confidence (0-1) that this is a useful sub-cluster'),
  reasoning: z.string().optional().describe('Brief reasoning for the verdict'),
});

/**
 * Discover sub-clusters under `parentCluster`. Eager: when called, it walks
 * the parent's non-pillar members, finds cohesive semantic sub-groups, and
 * (if depth allows) recursively sub-discovers the children it just created.
 *
 * Bounded by:
 *   - MAX_DEPTH from cluster-tree (4): deeper recursion is rejected.
 *   - MAX_SUB_VALIDATIONS per parent: hard cap on AI cost per branch.
 *   - SUB_SIM_THRESHOLD (0.82): tighter cohesion than top-level (0.78).
 *
 * @returns {Promise<string[]>} IDs of newly created sub-clusters at any depth in this branch.
 */
export async function discoverSubClusters({ parentCluster, accountId, userId, currentDepth }) {
  if (currentDepth >= MAX_DEPTH) return [];

  const { siteId, id: parentId, memberEntityIds, pillarEntityId, name: parentName, mainKeyword: parentKeyword } = parentCluster;

  // Eligible members: parent's members minus its pillar (the pillar IS the
  // parent — sub-clusters are formed from the spokes around it).
  const eligibleIds = (memberEntityIds || []).filter((id) => id !== pillarEntityId);
  if (eligibleIds.length < MIN_SUB_CLUSTER_SIZE) return [];

  // Exclude members already claimed by sibling sub-clusters or other clusters
  // on the site, so we don't propose overlapping sub-clusters.
  const excluded = await getSubDiscoveryExclusions({ siteId, parentClusterId: parentId });
  const candidateIds = eligibleIds.filter((id) => !excluded.has(id));
  if (candidateIds.length < MIN_SUB_CLUSTER_SIZE) {
    return [];
  }

  const entities = await prisma.siteEntity.findMany({
    where: { id: { in: candidateIds } },
    select: { id: true, title: true, excerpt: true, content: true, publishedAt: true },
  });
  if (entities.length < MIN_SUB_CLUSTER_SIZE) return [];

  const inputs = entities.map(buildEmbeddingInput);
  let embeddings;
  try {
    embeddings = await generateEmbeddings({
      values: inputs,
      operation: 'EMBEDDING',
      accountId,
      userId,
      siteId,
      metadata: { context: 'sub-cluster-discovery', parentClusterId: parentId, depth: currentDepth + 1 },
    });
  } catch (err) {
    console.error(`[ClusterDiscovery] sub-discovery embeddings failed for parent=${parentId}:`, err.message);
    return [];
  }
  if (!embeddings || embeddings.length !== entities.length) {
    console.warn(
      `[ClusterDiscovery] sub-discovery embedding count mismatch for parent=${parentId}`,
    );
    return [];
  }

  const components = findConnectedComponents(embeddings, SUB_SIM_THRESHOLD)
    .filter((c) => c.length >= MIN_SUB_CLUSTER_SIZE && c.length <= MAX_CLUSTER_SIZE)
    .sort((a, b) => b.length - a.length)
    .slice(0, MAX_SUB_VALIDATIONS);

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
          'You are an SEO topic-clustering expert. You decide whether a candidate group of pages forms a coherent SUB-cluster under a known parent topic — pages that cover a distinct sub-topic worth its own pillar+spokes treatment.',
        prompt: `Parent cluster: "${parentName}" (anchor keyword: "${parentKeyword}")
The following ${members.length} pages are all members of the parent cluster and were grouped together by tighter semantic similarity. Decide whether they form a real sub-cluster — i.e., a sub-topic distinct enough from the parent's main topic to deserve its own pillar.

Members:
${memberDescriptions}

Return isRealCluster=false if:
- The members are too closely tied to the parent's main topic to warrant their own sub-cluster (the parent already covers them).
- The grouping is too generic or the members don't share a coherent sub-angle.

Otherwise: pick a clear sub-cluster name (3-6 words), the sub-anchor keyword, and the 0-based index of the member best suited to be the SUB-cluster pillar. The sub-pillar must be different from the parent and authoritative for THIS narrower sub-topic. Use pillarIndex -1 if no member is a clear sub-pillar.`,
        schema: SubClusterValidationSchema,
        operation: 'CLUSTER_DISCOVERY',
        accountId,
        userId,
        siteId,
        metadata: {
          memberCount: members.length,
          context: 'sub-cluster-validation',
          parentClusterId: parentId,
          depth: currentDepth + 1,
        },
      });
    } catch (err) {
      console.error('[ClusterDiscovery] sub-cluster validation failed:', err.message);
      continue;
    }

    if (!validation?.isRealCluster) continue;

    const subPillarEntityId =
      Number.isInteger(validation.pillarIndex) &&
      validation.pillarIndex >= 0 &&
      validation.pillarIndex < members.length
        ? members[validation.pillarIndex].id
        : null;

    // Sub-cluster MUST have a pillar (tree invariant: child pillar must be
    // member of parent). If the AI couldn't pick one, skip this candidate
    // rather than create an invalid tree node.
    if (!subPillarEntityId) continue;

    let childCluster;
    try {
      childCluster = await prisma.topicCluster.create({
        data: {
          siteId,
          name: validation.name,
          mainKeyword: validation.mainKeyword,
          pillarEntityId: subPillarEntityId,
          memberEntityIds: members.map((m) => m.id),
          status: 'DISCOVERED',
          source: 'DISCOVERED_FROM_SITE',
          confidenceScore: validation.confidenceScore,
          parentClusterId: parentId,
          depth: currentDepth + 1,
        },
      });
      createdIds.push(childCluster.id);
    } catch (err) {
      console.error('[ClusterDiscovery] sub-cluster DB insert failed:', err.message);
      continue;
    }

    // Recurse — eager mode walks the whole branch down to MAX_DEPTH per call.
    if (currentDepth + 1 < MAX_DEPTH) {
      try {
        const grandChildren = await discoverSubClusters({
          parentCluster: childCluster,
          accountId,
          userId,
          currentDepth: currentDepth + 1,
        });
        createdIds.push(...grandChildren);
      } catch (err) {
        // Per-branch failures should not break sibling sub-cluster discovery.
        console.error(
          `[ClusterDiscovery] recursive sub-discovery failed at depth ${currentDepth + 1} for parent=${childCluster.id}:`,
          err.message,
        );
      }
    }
  }

  return createdIds;
}

/**
 * Run topic cluster discovery for a site.
 *
 * @param {Object} params
 * @param {string} params.siteId
 * @param {string} [params.accountId] - For credit tracking
 * @param {string} [params.userId] - For credit tracking
 * @param {boolean} [params.recursive=true] - When true (default), also runs eager
 *                                            sub-cluster discovery on every
 *                                            newly created top-level cluster.
 *                                            Set to false to do a flat-only pass.
 * @returns {Promise<{
 *   clustersCreated: number,
 *   subClustersCreated: number,
 *   candidatesEvaluated: number,
 *   entitiesProcessed: number,
 *   createdIds: string[],
 * }>}
 */
export async function discoverTopicClusters({ siteId, accountId, userId, recursive = true }) {
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

  // Eager sub-cluster discovery: walk every newly created root and recurse
  // down to MAX_DEPTH. Failures in one branch don't stop sibling branches —
  // each call is its own try/catch envelope inside discoverSubClusters.
  const subClusterIds = [];
  if (recursive && createdIds.length > 0) {
    for (const rootId of createdIds) {
      try {
        const root = await prisma.topicCluster.findUnique({
          where: { id: rootId },
          select: {
            id: true,
            siteId: true,
            name: true,
            mainKeyword: true,
            pillarEntityId: true,
            memberEntityIds: true,
            depth: true,
          },
        });
        if (!root) continue;
        const ids = await discoverSubClusters({
          parentCluster: root,
          accountId,
          userId,
          currentDepth: 0,
        });
        subClusterIds.push(...ids);
      } catch (err) {
        console.error(`[ClusterDiscovery] eager sub-discovery failed for root=${rootId}:`, err.message);
      }
    }
  }

  console.log(
    `[ClusterDiscovery] site=${siteId} processed=${entities.length} candidates=${components.length} created=${createdIds.length} subCreated=${subClusterIds.length}`,
  );

  return {
    clustersCreated: createdIds.length,
    subClustersCreated: subClusterIds.length,
    candidatesEvaluated: components.length,
    entitiesProcessed: entities.length,
    createdIds: [...createdIds, ...subClusterIds],
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

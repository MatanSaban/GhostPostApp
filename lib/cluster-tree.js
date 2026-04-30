/**
 * Cluster Tree Helpers
 *
 * Single source of truth for the recursive TopicCluster tree:
 *   - parentClusterId / depth invariants
 *   - cycle + depth-cap detection
 *   - pillar uniqueness (one entity can pillar at most one non-REJECTED cluster per site)
 *   - subtree walking (descendants, ancestors, member-id flattening)
 *
 * The tree invariant: if `parentClusterId` is set, the child's `pillarEntityId`
 * MUST be a member of the parent. That single rule is what makes it a tree of
 * clusters — the child's anchor IS one of the parent's supporting posts.
 *
 * Application-side enforcement (Prisma + MongoDB has no partial unique indexes
 * and no native cycle detection on self-relations).
 */

import prisma from '@/lib/prisma';

export const MAX_DEPTH = 4;

/**
 * Custom error type so callers (API routes) can map to 400 vs 500.
 */
export class ClusterTreeError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'ClusterTreeError';
    this.code = code; // 'CYCLE' | 'DEPTH_EXCEEDED' | 'PILLAR_NOT_MEMBER' | 'PILLAR_CONFLICT' | 'PARENT_CROSS_SITE' | 'PARENT_NOT_FOUND' | 'PILLAR_REQUIRED' | 'ORPHAN_CHILDREN'
  }
}

/**
 * Walk the parent chain from `clusterId` upward to its root.
 * Returns an array root-first ending with the cluster itself.
 * Throws ClusterTreeError('CYCLE') if a cycle is detected.
 */
export async function getAncestorChain(clusterId) {
  const chain = [];
  const seen = new Set();
  let currentId = clusterId;
  while (currentId) {
    if (seen.has(currentId)) {
      throw new ClusterTreeError(`Cycle detected at cluster ${currentId}`, 'CYCLE');
    }
    seen.add(currentId);
    const node = await prisma.topicCluster.findUnique({
      where: { id: currentId },
      select: {
        id: true,
        siteId: true,
        name: true,
        mainKeyword: true,
        pillarEntityId: true,
        memberEntityIds: true,
        parentClusterId: true,
        depth: true,
        status: true,
      },
    });
    if (!node) break;
    chain.unshift(node);
    if (chain.length > MAX_DEPTH + 2) {
      // Safety net: parents shouldn't go this deep. Treat as cycle.
      throw new ClusterTreeError(`Ancestor chain exceeds safety limit`, 'CYCLE');
    }
    currentId = node.parentClusterId;
  }
  return chain;
}

/**
 * BFS the subtree rooted at `rootClusterId`. Returns flat array, root-first.
 */
export async function getSubtree(rootClusterId, { maxDepth = MAX_DEPTH } = {}) {
  const root = await prisma.topicCluster.findUnique({
    where: { id: rootClusterId },
    select: {
      id: true,
      siteId: true,
      name: true,
      pillarEntityId: true,
      memberEntityIds: true,
      parentClusterId: true,
      depth: true,
      status: true,
    },
  });
  if (!root) return [];

  const out = [root];
  let frontier = [root.id];
  let levelsRemaining = maxDepth;
  while (frontier.length > 0 && levelsRemaining-- > 0) {
    const children = await prisma.topicCluster.findMany({
      where: { parentClusterId: { in: frontier } },
      select: {
        id: true,
        siteId: true,
        name: true,
        pillarEntityId: true,
        memberEntityIds: true,
        parentClusterId: true,
        depth: true,
        status: true,
      },
    });
    if (children.length === 0) break;
    out.push(...children);
    frontier = children.map((c) => c.id);
  }
  return out;
}

/**
 * Flatten all member entity IDs in a subtree. De-duplicates. Used by the
 * subtree-scoped cannibalization preflight (Phase 7) and ancestor-link health.
 */
export async function getSubtreeMemberIds(rootClusterId) {
  const nodes = await getSubtree(rootClusterId);
  const ids = new Set();
  for (const n of nodes) {
    for (const id of n.memberEntityIds || []) ids.add(id);
  }
  return Array.from(ids);
}

/**
 * Validate a proposed parent change for a cluster.
 *
 * Pass `cluster` as the existing row OR a synthetic shape for newly-created
 * clusters: { id?, siteId, pillarEntityId, memberEntityIds }. When `id` is
 * absent (creation path), self-cycle is impossible so we only check ancestor
 * walking + the pillar-in-parent invariant + depth cap.
 */
export async function validateParentChange({ cluster, proposedParentId }) {
  if (proposedParentId === null || proposedParentId === undefined) {
    // Detaching to root is always allowed.
    return;
  }
  if (cluster.id && proposedParentId === cluster.id) {
    throw new ClusterTreeError('A cluster cannot be its own parent', 'CYCLE');
  }

  const parent = await prisma.topicCluster.findUnique({
    where: { id: proposedParentId },
    select: {
      id: true,
      siteId: true,
      memberEntityIds: true,
      parentClusterId: true,
      depth: true,
    },
  });
  if (!parent) {
    throw new ClusterTreeError('Parent cluster not found', 'PARENT_NOT_FOUND');
  }
  if (parent.siteId !== cluster.siteId) {
    throw new ClusterTreeError('Parent cluster must belong to the same site', 'PARENT_CROSS_SITE');
  }

  // The child must have a pillar; that pillar must be a member of the parent.
  if (!cluster.pillarEntityId) {
    throw new ClusterTreeError(
      'Child cluster must have a pillar before being attached to a parent',
      'PILLAR_REQUIRED',
    );
  }
  if (!(parent.memberEntityIds || []).includes(cluster.pillarEntityId)) {
    throw new ClusterTreeError(
      "Child cluster's pillar must be a member of the parent cluster",
      'PILLAR_NOT_MEMBER',
    );
  }

  // Walk parent's ancestor chain to detect cycle (cluster.id appearing upstream)
  // and to compute the resulting depth.
  const parentChain = await getAncestorChain(proposedParentId);
  if (cluster.id && parentChain.some((c) => c.id === cluster.id)) {
    throw new ClusterTreeError('This change would create a circular relationship', 'CYCLE');
  }
  // parentChain is root-first; its length === parent.depth + 1.
  const newDepth = parentChain.length;
  if (newDepth > MAX_DEPTH) {
    throw new ClusterTreeError(
      `Sub-cluster nesting limit reached (max ${MAX_DEPTH} levels)`,
      'DEPTH_EXCEEDED',
    );
  }

  // Also check that this change wouldn't push existing descendants past MAX_DEPTH.
  if (cluster.id) {
    const subtree = await getSubtree(cluster.id);
    const currentMaxDepthInSubtree = subtree.reduce((acc, n) => Math.max(acc, n.depth), 0);
    const currentDepth = cluster.depth ?? 0;
    const subtreeRelativeDepth = currentMaxDepthInSubtree - currentDepth;
    if (newDepth + subtreeRelativeDepth > MAX_DEPTH) {
      throw new ClusterTreeError(
        `This change would push descendants beyond the max depth of ${MAX_DEPTH}`,
        'DEPTH_EXCEEDED',
      );
    }
  }
}

/**
 * Reject if `entityId` is already pillar of any other live (CONFIRMED/DISCOVERED)
 * cluster on the same site. Members can be shared, but each entity can be
 * pillar of at most one cluster — keeps the tree a tree.
 */
export async function assertPillarUniqueness({ siteId, entityId, excludeClusterId = null }) {
  if (!entityId) return;
  const conflict = await prisma.topicCluster.findFirst({
    where: {
      siteId,
      pillarEntityId: entityId,
      status: { in: ['CONFIRMED', 'DISCOVERED'] },
      ...(excludeClusterId ? { NOT: { id: excludeClusterId } } : {}),
    },
    select: { id: true, name: true },
  });
  if (conflict) {
    throw new ClusterTreeError(
      `Entity ${entityId} is already the pillar of cluster "${conflict.name}"`,
      'PILLAR_CONFLICT',
    );
  }
}

/**
 * Recompute `depth` for a cluster and all its descendants based on parent chain.
 * Call after any operation that changes parent linkage (PATCH parent, DELETE
 * with cascade, promote/demote).
 *
 * Uses one query per BFS level — O(depth) round trips, max 4 with our cap.
 * Fixed-point loop bounded by MAX_DEPTH+2 levels as a safety net.
 */
export async function recomputeDepths(rootClusterId) {
  const root = await prisma.topicCluster.findUnique({
    where: { id: rootClusterId },
    select: { id: true, parentClusterId: true, depth: true },
  });
  if (!root) return;

  let baseDepth = 0;
  if (root.parentClusterId) {
    const parent = await prisma.topicCluster.findUnique({
      where: { id: root.parentClusterId },
      select: { depth: true },
    });
    baseDepth = (parent?.depth ?? 0) + 1;
  }
  if (root.depth !== baseDepth) {
    await prisma.topicCluster.update({
      where: { id: root.id },
      data: { depth: baseDepth },
    });
  }

  // BFS down, setting each child's depth = parent.depth + 1.
  let frontier = [{ id: root.id, depth: baseDepth }];
  let levels = 0;
  while (frontier.length > 0 && levels++ < MAX_DEPTH + 2) {
    const children = await prisma.topicCluster.findMany({
      where: { parentClusterId: { in: frontier.map((f) => f.id) } },
      select: { id: true, parentClusterId: true, depth: true },
    });
    if (children.length === 0) break;
    const parentDepthById = new Map(frontier.map((f) => [f.id, f.depth]));
    const next = [];
    for (const c of children) {
      const newDepth = (parentDepthById.get(c.parentClusterId) ?? 0) + 1;
      if (c.depth !== newDepth) {
        await prisma.topicCluster.update({
          where: { id: c.id },
          data: { depth: newDepth },
        });
      }
      next.push({ id: c.id, depth: newDepth });
    }
    frontier = next;
  }
}

/**
 * Build a map clusterId -> ancestor pillarEntityIds (excluding self).
 * Used by the list endpoint to feed Phase 4 health analysis (ANCESTOR link gaps).
 *
 * Input: a flat array of cluster rows that includes parentClusterId + pillarEntityId.
 * Returns: { [clusterId]: string[] }  (oldest ancestor first, immediate parent last)
 */
export function buildAncestorPillarMap(clusters) {
  const byId = new Map(clusters.map((c) => [c.id, c]));
  const cache = new Map();

  function chainFor(id) {
    if (cache.has(id)) return cache.get(id);
    const cluster = byId.get(id);
    if (!cluster || !cluster.parentClusterId) {
      cache.set(id, []);
      return [];
    }
    const parent = byId.get(cluster.parentClusterId);
    if (!parent) {
      cache.set(id, []);
      return [];
    }
    const parentChain = chainFor(parent.id);
    const result = parent.pillarEntityId ? [...parentChain, parent.pillarEntityId] : parentChain;
    cache.set(id, result);
    return result;
  }

  const out = {};
  for (const c of clusters) out[c.id] = chainFor(c.id);
  return out;
}

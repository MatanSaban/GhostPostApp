/**
 * Cluster Cannibalization Preflight
 *
 * Per-action cannibalization check scoped to a specific TopicCluster's members.
 * Unlike the site-wide engine in lib/cannibalization-engine.js (which finds
 * existing conflicts on a whole site), this runs at the moment a NEW Content
 * row is being created - before the user has approved/published anything -
 * and surfaces "this candidate may step on existing cluster members" warnings.
 *
 * Used by the activate route when a Campaign linked to a TopicCluster is
 * activated. The result is persisted on `Content.preflight` and surfaces in
 * the planner so the user can address conflicts before publish.
 *
 * Algorithm (cheap → expensive):
 *   1. Title jaccard against each cluster member (reuses tokenize +
 *      jaccardSimilarity from the existing engine, including Hebrew handling)
 *   2. Semantic embedding similarity (best-effort; falls back gracefully)
 *
 * Conflict shape (per candidate):
 *   { entityId, entityTitle, entityUrl, score, type, recommendation }
 */

import prisma from '@/lib/prisma';
import { tokenize, jaccardSimilarity } from '@/lib/cannibalization-engine';
import { generateEmbeddings, cosineSimilarity } from '@/lib/ai/gemini';
import { getSubtreeMemberIds } from '@/lib/cluster-tree';

const TITLE_JACCARD_THRESHOLD = 0.5;
const SEMANTIC_THRESHOLD = 0.85;
const EMBEDDING_INPUT_CHARS = 500;
const VALID_SCOPES = new Set(['cluster', 'subtree']);

function buildEmbeddingInput(item) {
  const title = item.title || '';
  const body = (item.content || item.excerpt || '').slice(0, EMBEDDING_INPUT_CHARS);
  return `${title}\n${body}`.trim();
}

function recommendFromTitleScore(score) {
  if (score >= 0.8) return 'MERGE';
  if (score >= 0.6) return 'DIFFERENTIATE';
  return 'REVIEW';
}

function recommendFromSemanticScore(score) {
  if (score >= 0.92) return 'MERGE';
  if (score >= 0.88) return 'DIFFERENTIATE';
  return 'REVIEW';
}

function emptyResults(candidates) {
  return { results: candidates.map(() => ({ hasConflict: false, conflicts: [] })) };
}

/**
 * Run cluster preflight for a batch of candidates against a single cluster
 * OR the entire subtree rooted at that cluster.
 *
 * @param {Object} params
 * @param {Array<{ title: string, content?: string, excerpt?: string, focusKeyword?: string }>} params.candidates
 * @param {string} params.topicClusterId - Cluster to check against. If null/undefined, no-op.
 * @param {'cluster'|'subtree'} [params.scope='cluster'] - 'cluster' checks only the
 *   target cluster's direct members (v1+v2 behavior). 'subtree' walks descendants
 *   to MAX_DEPTH and checks against every member of every descendant cluster — used
 *   when a campaign is tied to a non-leaf cluster (Phase 7).
 * @param {string} [params.accountId] - For credit tracking on the embedding pass
 * @param {string} [params.userId]
 * @param {string} [params.siteId]
 * @returns {Promise<{
 *   results: Array<{
 *     hasConflict: boolean,
 *     conflicts: Array<{entityId, entityTitle, entityUrl, score, type, recommendation}>
 *   }>,
 *   scope: 'cluster'|'subtree',
 *   memberCount: number,
 * }>}
 */
export async function preflightCandidates({
  candidates,
  topicClusterId,
  scope = 'cluster',
  accountId,
  userId,
  siteId,
}) {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return { results: [], scope, memberCount: 0 };
  }
  if (!topicClusterId) {
    return { ...emptyResults(candidates), scope, memberCount: 0 };
  }
  if (!VALID_SCOPES.has(scope)) {
    throw new Error(`preflightCandidates: invalid scope "${scope}"`);
  }

  const cluster = await prisma.topicCluster.findUnique({
    where: { id: topicClusterId },
    select: { id: true, siteId: true, memberEntityIds: true },
  });
  if (!cluster) {
    return { ...emptyResults(candidates), scope, memberCount: 0 };
  }

  // Resolve which entity IDs we're checking against. 'subtree' uses the
  // tree-walking helper from lib/cluster-tree.js, which BFS-flattens member
  // IDs across the root + all descendants up to MAX_DEPTH.
  let memberIds;
  if (scope === 'subtree') {
    memberIds = await getSubtreeMemberIds(topicClusterId);
  } else {
    memberIds = cluster.memberEntityIds || [];
  }
  if (memberIds.length === 0) {
    return { ...emptyResults(candidates), scope, memberCount: 0 };
  }

  const members = await prisma.siteEntity.findMany({
    where: { id: { in: memberIds } },
    select: { id: true, title: true, excerpt: true, content: true, url: true },
  });
  if (members.length === 0) {
    return { ...emptyResults(candidates), scope, memberCount: 0 };
  }

  // ── Layer 1: title jaccard (always runs, no API cost) ─────────────
  const memberTokens = members.map((m) => tokenize(m.title || ''));
  const candidateTokens = candidates.map((c) => tokenize(c.title || ''));

  const titleConflicts = candidates.map((_, ci) => {
    const conflicts = [];
    members.forEach((member, mi) => {
      const score = jaccardSimilarity(candidateTokens[ci], memberTokens[mi]);
      if (score >= TITLE_JACCARD_THRESHOLD) {
        conflicts.push({
          entityId: member.id,
          entityTitle: member.title,
          entityUrl: member.url,
          score: Number(score.toFixed(3)),
          type: 'TITLE_OVERLAP',
          recommendation: recommendFromTitleScore(score),
        });
      }
    });
    return conflicts;
  });

  // ── Layer 2: semantic embeddings (best-effort) ────────────────────
  let semanticConflicts = candidates.map(() => []);
  try {
    const memberInputs = members.map(buildEmbeddingInput);
    const candidateInputs = candidates.map(buildEmbeddingInput);
    const allInputs = [...memberInputs, ...candidateInputs];

    const embeddings = await generateEmbeddings({
      values: allInputs,
      operation: 'CANNIBALIZATION_EMBEDDING',
      accountId,
      userId,
      siteId: siteId || cluster.siteId,
      metadata: { context: 'cluster-preflight', clusterId: topicClusterId },
    });

    if (embeddings && embeddings.length === allInputs.length) {
      const memberEmbs = embeddings.slice(0, members.length);
      const candEmbs = embeddings.slice(members.length);

      semanticConflicts = candidates.map((_, ci) => {
        const conflicts = [];
        members.forEach((member, mi) => {
          const score = cosineSimilarity(candEmbs[ci], memberEmbs[mi]);
          if (score >= SEMANTIC_THRESHOLD) {
            conflicts.push({
              entityId: member.id,
              entityTitle: member.title,
              entityUrl: member.url,
              score: Number(score.toFixed(3)),
              type: 'SEMANTIC_OVERLAP',
              recommendation: recommendFromSemanticScore(score),
            });
          }
        });
        return conflicts;
      });
    }
  } catch (err) {
    // Embedding pass is best-effort. Title-overlap layer still applies.
    console.error('[ClusterPreflight] embedding pass failed:', err.message);
  }

  // ── Merge layers per candidate (dedupe by entityId, keep highest score) ──
  const results = candidates.map((_, ci) => {
    const merged = new Map();
    [...titleConflicts[ci], ...semanticConflicts[ci]].forEach((c) => {
      const existing = merged.get(c.entityId);
      if (!existing || c.score > existing.score) {
        merged.set(c.entityId, c);
      }
    });
    const conflicts = Array.from(merged.values()).sort((a, b) => b.score - a.score);
    return { hasConflict: conflicts.length > 0, conflicts };
  });

  return { results, scope, memberCount: members.length };
}

/**
 * Convenience wrapper for a single candidate.
 * Reserved for the v2 chat-agent path; v1 uses preflightCandidates from activate.
 */
export async function preflightCandidate({
  candidate,
  topicClusterId,
  scope = 'cluster',
  accountId,
  userId,
  siteId,
}) {
  const { results } = await preflightCandidates({
    candidates: [candidate],
    topicClusterId,
    scope,
    accountId,
    userId,
    siteId,
  });
  return results[0] || { hasConflict: false, conflicts: [] };
}

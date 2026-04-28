/**
 * Cluster Auto-Map
 *
 * Given a candidate post (title + content) and a site, picks the best-matching
 * CONFIRMED TopicCluster via cosine similarity above a confidence threshold.
 *
 * Used by the chat agent flow: when the agent proposes a `wp_create_post`,
 * we auto-map to the closest cluster so we can run cluster-scoped preflight
 * and show the user "Cluster: X" + conflicts in the approval modal.
 *
 * Below threshold = no match. The caller treats this as "no cluster context" —
 * agent proceeds without cluster awareness rather than risk a wrong match.
 *
 * Cluster representation per match: `${name}\n${mainKeyword}` — concise, user-confirmed,
 * doesn't depend on having a pillar set or hydrating member entities.
 */

import prisma from '@/lib/prisma';
import { generateEmbeddings, cosineSimilarity } from '@/lib/ai/gemini';

const MATCH_THRESHOLD = 0.7;
const CANDIDATE_CHARS = 500;

function buildCandidateInput({ title, content }) {
  const t = (title || '').trim();
  const body = (content || '').slice(0, CANDIDATE_CHARS).trim();
  return body ? `${t}\n${body}` : t;
}

function buildClusterInput(cluster) {
  return `${cluster.name}\n${cluster.mainKeyword}`;
}

/**
 * @param {Object} params
 * @param {{title: string, content?: string}} params.candidate
 * @param {string} params.siteId
 * @param {string} [params.accountId] - For credit tracking
 * @param {string} [params.userId]
 * @returns {Promise<{ clusterId: string, clusterName: string, matchScore: number } | null>}
 *   Best-matching cluster with score, or null if no cluster scored above threshold.
 */
export async function findBestMatchingCluster({ candidate, siteId, accountId, userId }) {
  if (!siteId || !candidate?.title) return null;

  const clusters = await prisma.topicCluster.findMany({
    where: { siteId, status: 'CONFIRMED' },
    select: { id: true, name: true, mainKeyword: true },
  });
  if (clusters.length === 0) return null;

  const candidateInput = buildCandidateInput(candidate);
  if (!candidateInput) return null;

  const inputs = [candidateInput, ...clusters.map(buildClusterInput)];
  let embeddings;
  try {
    embeddings = await generateEmbeddings({
      values: inputs,
      operation: 'CLUSTER_AUTO_MAP',
      accountId,
      userId,
      siteId,
      metadata: { context: 'cluster-auto-map', clusterCount: clusters.length },
    });
  } catch (err) {
    console.error('[ClusterAutoMap] embedding failed:', err.message);
    return null;
  }

  if (!embeddings || embeddings.length !== inputs.length) return null;

  const candEmb = embeddings[0];
  let best = null;
  for (let i = 0; i < clusters.length; i++) {
    const score = cosineSimilarity(candEmb, embeddings[i + 1]);
    if (!best || score > best.score) {
      best = { cluster: clusters[i], score };
    }
  }

  if (!best || best.score < MATCH_THRESHOLD) return null;

  return {
    clusterId: best.cluster.id,
    clusterName: best.cluster.name,
    matchScore: Number(best.score.toFixed(3)),
  };
}

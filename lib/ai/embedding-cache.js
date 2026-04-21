/**
 * Per-URL embedding cache keyed by content hash.
 *
 * Purpose: the cannibalization engine embeds every candidate URL once per run.
 * For users with overlapping scopes (same URL appears in multiple groups, or
 * the engine runs multiple times in a short window), we want to avoid paying
 * for the embedding twice if the content hasn't changed.
 *
 * Scope: process-local LRU, 10-minute TTL. The cost/quality ceiling is low
 * enough that we don't need a DB-backed cache yet - if we ever do, the API
 * stays the same.
 */

import crypto from 'node:crypto';
import { generateEmbeddings } from './gemini.js';

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_ENTRIES = 5000; // rough upper bound; large sites stay well under this

/** @type {Map<string, { vec: number[], at: number }>} */
const cache = new Map();

function hashKey(text) {
  return crypto.createHash('sha1').update(text).digest('hex').slice(0, 16);
}

function evictIfFull() {
  if (cache.size <= MAX_ENTRIES) return;
  // Drop the oldest ~10% by insertion order (Map preserves it)
  const toDrop = Math.ceil(MAX_ENTRIES * 0.1);
  let i = 0;
  for (const key of cache.keys()) {
    cache.delete(key);
    if (++i >= toDrop) break;
  }
}

/**
 * Get embeddings for a list of texts, caching by content hash. Only uncached
 * entries go to the embedding API; the rest are returned from memory.
 *
 * @param {string[]} texts - Texts to embed. Order preserved.
 * @param {Object} [ctx] - Usage-tracking context forwarded to generateEmbeddings.
 * @param {string} [ctx.operation]
 * @param {string} [ctx.accountId]
 * @param {string} [ctx.siteId]
 * @param {string} [ctx.userId]
 * @returns {Promise<number[][]>} One vector per input, in the same order.
 */
export async function getOrComputeEmbeddings(texts, ctx = {}) {
  const now = Date.now();
  const keys = texts.map(t => hashKey(t || ''));
  const result = new Array(texts.length);
  const missingIdx = [];
  const missingTexts = [];

  for (let i = 0; i < texts.length; i++) {
    const entry = cache.get(keys[i]);
    if (entry && now - entry.at < CACHE_TTL_MS) {
      result[i] = entry.vec;
    } else {
      missingIdx.push(i);
      missingTexts.push(texts[i] || '');
    }
  }

  if (missingTexts.length === 0) return result;

  const fresh = await generateEmbeddings({ values: missingTexts, ...ctx });
  evictIfFull();
  for (let j = 0; j < missingIdx.length; j++) {
    const idx = missingIdx[j];
    const vec = fresh[j];
    cache.set(keys[idx], { vec, at: now });
    result[idx] = vec;
  }
  return result;
}

/** Clear the cache - used by tests. */
export function _clearEmbeddingCache() {
  cache.clear();
}

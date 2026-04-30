/**
 * Web search adapter for the chat agent.
 *
 * Tries providers in order of quality, falling back when the previous one is
 * not configured / fails. The agent calls this through the `web_search` tool.
 *
 *   1. Tavily   (TAVILY_API_KEY)         - best results for AI use
 *   2. SerpAPI  (SERPAPI_KEY)            - rich Google results
 *   3. Google CSE (GOOGLE_CSE_KEY + GOOGLE_CSE_ID) - official, but quota-limited
 *   4. DuckDuckGo HTML scrape            - zero-config fallback
 *
 * Always returns:
 *   { provider, query, results: [{ title, url, snippet, source? }] }
 *
 * Fail-soft: if every provider errors, returns `{ results: [], error }` rather
 * than throwing - the chat agent can still tell the user "I couldn't find
 * anything" without crashing the whole turn.
 */

import { BOT_FETCH_HEADERS } from '@/lib/bot-identity';

const FETCH_TIMEOUT_MS = 12000;

function withTimeout(ms = FETCH_TIMEOUT_MS) {
  const c = new AbortController();
  const id = setTimeout(() => c.abort(), ms);
  return { signal: c.signal, clear: () => clearTimeout(id) };
}

async function searchTavily(query, limit) {
  const key = process.env.TAVILY_API_KEY;
  if (!key) return null;
  const t = withTimeout();
  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: key,
        query,
        search_depth: 'basic',
        max_results: Math.min(limit || 5, 10),
        include_images: false,
        include_answer: false,
      }),
      signal: t.signal,
    });
    if (!res.ok) return null;
    const data = await res.json();
    return {
      provider: 'tavily',
      query,
      results: (data.results || []).map((r) => ({
        title: r.title,
        url: r.url,
        snippet: r.content,
        source: r.source || null,
      })),
    };
  } catch (e) {
    return null;
  } finally { t.clear(); }
}

async function searchSerpApi(query, limit) {
  const key = process.env.SERPAPI_KEY;
  if (!key) return null;
  const t = withTimeout();
  try {
    const url = new URL('https://serpapi.com/search.json');
    url.searchParams.set('q', query);
    url.searchParams.set('api_key', key);
    url.searchParams.set('num', String(Math.min(limit || 5, 10)));
    const res = await fetch(url, { signal: t.signal });
    if (!res.ok) return null;
    const data = await res.json();
    const organic = data.organic_results || [];
    return {
      provider: 'serpapi',
      query,
      results: organic.slice(0, limit || 5).map((r) => ({
        title: r.title,
        url: r.link,
        snippet: r.snippet,
        source: r.source || null,
      })),
    };
  } catch (e) {
    return null;
  } finally { t.clear(); }
}

async function searchGoogleCSE(query, limit) {
  const key = process.env.GOOGLE_CSE_KEY;
  const cx = process.env.GOOGLE_CSE_ID;
  if (!key || !cx) return null;
  const t = withTimeout();
  try {
    const url = new URL('https://www.googleapis.com/customsearch/v1');
    url.searchParams.set('q', query);
    url.searchParams.set('key', key);
    url.searchParams.set('cx', cx);
    url.searchParams.set('num', String(Math.min(limit || 5, 10)));
    const res = await fetch(url, { signal: t.signal });
    if (!res.ok) return null;
    const data = await res.json();
    return {
      provider: 'google_cse',
      query,
      results: (data.items || []).map((r) => ({
        title: r.title,
        url: r.link,
        snippet: r.snippet,
        source: r.displayLink || null,
      })),
    };
  } catch (e) {
    return null;
  } finally { t.clear(); }
}

async function searchDuckDuckGo(query, limit) {
  // Free, no-key HTML scrape against DuckDuckGo's lite endpoint. Used as the
  // last-resort fallback so the agent always has SOMETHING. Less reliable
  // than the API providers above - if you need quality, set TAVILY_API_KEY.
  const t = withTimeout();
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const res = await fetch(url, { headers: BOT_FETCH_HEADERS, signal: t.signal });
    if (!res.ok) return null;
    const html = await res.text();
    const results = [];
    // DuckDuckGo HTML uses `.result__title` > `a.result__a` and `.result__snippet`
    const blockRe = /<div class="result__body[\s\S]*?<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]+class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/g;
    let m;
    while ((m = blockRe.exec(html)) !== null && results.length < (limit || 5)) {
      const rawUrl = m[1];
      const title = m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      const snippet = m[3].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      // DDG wraps in /l/?uddg=encoded. Decode if present.
      let cleanUrl = rawUrl;
      try {
        const u = new URL(rawUrl, 'https://duckduckgo.com');
        const uddg = u.searchParams.get('uddg');
        if (uddg) cleanUrl = decodeURIComponent(uddg);
      } catch { /* keep raw */ }
      results.push({ title, url: cleanUrl, snippet, source: null });
    }
    return { provider: 'duckduckgo', query, results };
  } catch (e) {
    return null;
  } finally { t.clear(); }
}

/**
 * Run a web search. Returns the first provider that gives a non-empty result.
 *
 * @param {string} query
 * @param {{ limit?: number }} [opts]
 * @returns {Promise<{ provider: string, query: string, results: Array, error?: string }>}
 */
export async function webSearch(query, { limit = 5 } = {}) {
  if (!query || typeof query !== 'string') {
    return { provider: null, query: query || '', results: [], error: 'Query is required' };
  }

  const providers = [searchTavily, searchSerpApi, searchGoogleCSE, searchDuckDuckGo];
  for (const fn of providers) {
    const out = await fn(query, limit);
    if (out && out.results && out.results.length > 0) return out;
  }
  return { provider: null, query, results: [], error: 'No provider returned results' };
}

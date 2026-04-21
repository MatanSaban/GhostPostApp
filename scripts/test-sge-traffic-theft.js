/**
 * Unit test: analyzeSgeTrafficTheft logic
 *
 * Run with:  node scripts/test-sge-traffic-theft.js
 *
 * This file exercises the exact same thresholds as the production module
 * against three controlled mock scenarios without touching any database or API.
 *
 * GA4 cross-referencing is page-level: each candidate query maps to a specific
 * landing page URL, and the session drop is evaluated per-page - not site-wide.
 */

// ─── Thresholds (mirrored from lib/agent-analysis.js) ───────────────
const SGE_MAX_POSITION = 5;
const SGE_MAX_POSITION_VARIANCE = 1.5;
const SGE_MIN_IMPRESSIONS = 300;
const SGE_MAX_IMPRESSIONS_DROP = -10;
const SGE_MIN_CTR_DROP_PERCENT = 35;
const SGE_GA_SESSIONS_DROP_THRESHOLD = -25;
const SGE_BASE_CONFIDENCE = 82;
const SGE_BOOSTED_CONFIDENCE = 99;

// ─── Pure logic extracted for testability ────────────────────────────
/**
 * Pure function version of the production filter + GA4 logic.
 *
 * @param {Array} queries         GSC top queries (with comparison data)
 * @param {Array} queryPagePairs  GSC query→page pairs (for URL mapping)
 * @param {Map|null} pageSessionDrops  Map<pageUrl, sessionsChange (int %)>
 *                                     null = GA4 unavailable
 * @returns {Array} stolenQueries
 */
function detectSgeTheft(queries, queryPagePairs = [], pageSessionDrops = null) {
  // Build query → page URL lookup (highest impressions wins)
  const queryToPage = new Map();
  for (const pair of queryPagePairs) {
    const key = pair.query.toLowerCase();
    const existing = queryToPage.get(key);
    if (!existing || pair.impressions > existing.impressions) {
      queryToPage.set(key, pair.page);
    }
  }

  // Phase 1: GSC-only filter
  const candidates = [];

  for (const q of queries) {
    const position = parseFloat(q.position);
    const ctr = parseFloat(q.ctr);
    const ctrChange = q.ctrChange;
    const impressionsChange = q.impressionsChange;
    const posChange = Math.abs(q.positionChange || 0);

    if (isNaN(position) || isNaN(ctr)) continue;

    if (position > SGE_MAX_POSITION) continue;
    if (posChange > SGE_MAX_POSITION_VARIANCE) continue;
    if (q.impressions < SGE_MIN_IMPRESSIONS) continue;
    if (impressionsChange < SGE_MAX_IMPRESSIONS_DROP) continue;
    if (ctrChange > -SGE_MIN_CTR_DROP_PERCENT) continue;

    const pageUrl = queryToPage.get(q.query.toLowerCase()) || null;
    candidates.push({ ...q, impressionsChange, pageUrl });
  }

  // Phase 2: Per-page GA4 confidence
  const stolenQueries = [];

  for (const c of candidates) {
    const pageSessionsChange = (pageSessionDrops && c.pageUrl)
      ? (pageSessionDrops.get(c.pageUrl) ?? null)
      : null;

    const ga4Confirmed =
      pageSessionsChange !== null &&
      pageSessionsChange <= SGE_GA_SESSIONS_DROP_THRESHOLD;
    const confidence = ga4Confirmed
      ? SGE_BOOSTED_CONFIDENCE
      : SGE_BASE_CONFIDENCE;

    stolenQueries.push({
      query: c.query,
      position: c.position,
      impressions: c.impressions,
      impressionsChange: c.impressionsChange,
      clicks: c.clicks,
      ctr: c.ctr,
      ctrChange: c.ctrChange,
      positionChange: c.positionChange,
      pageUrl: c.pageUrl,
      pageSessionsChange,
      confidence,
      ga4Confirmed,
    });
  }

  return stolenQueries;
}

// ─── Mock Data ──────────────────────────────────────────────────────

// Query-page pairs (simulates fetchGSCQueryPagePairs)
const mockQueryPagePairs = [
  { query: 'best running shoes 2026', page: 'https://example.com/running-shoes', impressions: 1000, clicks: 150, ctr: '15.0', position: '2.0' },
  { query: 'how to train for a marathon', page: 'https://example.com/marathon-guide', impressions: 1050, clicks: 42, ctr: '4.0', position: '2.1' },
  { query: 'best protein powder', page: 'https://example.com/protein-powder', impressions: 180, clicks: 15, ctr: '8.3', position: '12.0' },
];

// Page-level GA4 session drops (simulates per-page fetchGAPageSessionsDrop results)
const mockPageSessionDrops = new Map([
  // Marathon guide page lost 40% sessions - confirms SGE theft
  ['https://example.com/marathon-guide', -40],
  // Running shoes page is fine - sessions grew 5%
  ['https://example.com/running-shoes', 5],
  // Protein powder page lost 30% - but this query won't pass GSC filters anyway
  ['https://example.com/protein-powder', -30],
]);

/**
 * Scenario A - "Normal keyword, no problems"
 *
 * Position 2, Impressions 1000, CTR 15% → stable across periods.
 * ctrChange ~0 (no drop).  Should NOT trigger.
 */
const scenarioA = {
  query: 'best running shoes 2026',
  clicks: 150,
  impressions: 1000,
  ctr: '15.0',
  position: '2.0',
  clicksChange: 2,
  impressionsChange: 3,
  ctrChange: -1,
  positionChange: 0,
};

/**
 * Scenario B - "SGE Traffic Theft - classic zero-click"
 *
 * Position 2, Impressions rose slightly to 1050, but CTR
 * crashed from ~15% to 4% (≈ −73% relative).
 * Page-level GA4 sessions on /marathon-guide dropped 40%.
 * MUST trigger with 99% confidence.
 */
const scenarioB = {
  query: 'how to train for a marathon',
  clicks: 42,
  impressions: 1050,
  ctr: '4.0',
  position: '2.1',
  clicksChange: -73,
  impressionsChange: 5,
  ctrChange: -73,
  positionChange: -1,
};

/**
 * Scenario C - "Standard Rank Drop - NOT SGE"
 *
 * Position dropped from 2 to 12.  Impressions and clicks both dropped.
 * This is a normal ranking loss, not an SGE theft pattern.
 * Should NOT trigger.
 */
const scenarioC = {
  query: 'best protein powder',
  clicks: 15,
  impressions: 180,
  ctr: '8.3',
  position: '12.0',
  clicksChange: -60,
  impressionsChange: -45,
  ctrChange: -30,
  positionChange: 83,
};

// ─── Test Runner ────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ✅ PASS: ${label}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${label}`);
    failed++;
  }
}

function testSgeTrafficTheftLogic() {
  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║  SGE Traffic Theft Detection - Unit Tests       ║');
  console.log('║  (Page-Level GA4 Cross-Reference)               ║');
  console.log('╚══════════════════════════════════════════════════╝\n');

  // ── Scenario A: Normal stable keyword - no alert ──
  console.log('── Scenario A: Normal keyword (stable CTR) ──');
  const resultA = detectSgeTheft([scenarioA], mockQueryPagePairs, mockPageSessionDrops);
  assert(resultA.length === 0, 'No stolen queries detected (CTR is stable)');

  // ── Scenario B: SGE theft with page-level GA4 confirmation ──
  console.log('\n── Scenario B: SGE Traffic Theft (CTR crash + page GA4 drop) ──');
  const resultB = detectSgeTheft([scenarioB], mockQueryPagePairs, mockPageSessionDrops);
  assert(resultB.length === 1, 'Exactly 1 stolen query detected');
  assert(resultB[0]?.query === 'how to train for a marathon', 'Correct query identified');
  assert(resultB[0]?.pageUrl === 'https://example.com/marathon-guide', 'Mapped to correct page URL');
  assert(resultB[0]?.pageSessionsChange === -40, 'Page-level sessions drop is -40%');
  assert(resultB[0]?.confidence === 99, 'Confidence boosted to 99% (page GA4 confirmed)');
  assert(resultB[0]?.ga4Confirmed === true, 'GA4 confirmation flag is true');
  assert(resultB[0]?.ctrChange <= -35, 'CTR drop is ≥ 35% relative');

  // ── Scenario B without GA4: should still trigger but with 82% confidence ──
  console.log('\n── Scenario B (variant): SGE Theft WITHOUT GA4 data ──');
  const resultB_noGA = detectSgeTheft([scenarioB], mockQueryPagePairs, null);
  assert(resultB_noGA.length === 1, 'Still triggers without GA4');
  assert(resultB_noGA[0]?.confidence === 82, 'Base confidence 82% (no GA4)');
  assert(resultB_noGA[0]?.ga4Confirmed === false, 'GA4 confirmation flag is false');
  assert(resultB_noGA[0]?.pageUrl === 'https://example.com/marathon-guide', 'Page URL still mapped from GSC pairs');

  // ── FALSE POSITIVE GUARD: Page B drops but Page A shouldn't get boosted ──
  console.log('\n── False Positive Guard: Page-level isolation ──');
  // Scenario A's page (/running-shoes) has +5% sessions - must NOT get 99% confidence
  // Even though /marathon-guide has -40% sessions
  const scenarioA_withCtrDrop = {
    ...scenarioA,
    query: 'best running shoes 2026',
    ctrChange: -50,  // Force CTR drop to pass GSC filters
    impressions: 500,
  };
  const resultFP = detectSgeTheft(
    [scenarioA_withCtrDrop, scenarioB],
    mockQueryPagePairs,
    mockPageSessionDrops
  );
  assert(resultFP.length === 2, 'Both queries pass GSC filters');
  const shoesResult = resultFP.find(q => q.query === 'best running shoes 2026');
  const marathonResult = resultFP.find(q => q.query === 'how to train for a marathon');
  assert(shoesResult?.confidence === 82, '/running-shoes: 82% confidence (page sessions +5%, NOT boosted)');
  assert(shoesResult?.ga4Confirmed === false, '/running-shoes: ga4Confirmed is false');
  assert(shoesResult?.pageSessionsChange === 5, '/running-shoes: pageSessionsChange is +5%');
  assert(marathonResult?.confidence === 99, '/marathon-guide: 99% confidence (page sessions -40%, BOOSTED)');
  assert(marathonResult?.ga4Confirmed === true, '/marathon-guide: ga4Confirmed is true');

  // ── Scenario C: Standard rank drop - should NOT trigger ──
  console.log('\n── Scenario C: Standard Rank Drop (position 2→12) ──');
  const resultC = detectSgeTheft([scenarioC], mockQueryPagePairs, mockPageSessionDrops);
  assert(resultC.length === 0, 'No stolen queries (position dropped, not SGE)');

  // ── Combined: all 3 original scenarios at once ──
  console.log('\n── Combined: All 3 original scenarios mixed ──');
  const resultAll = detectSgeTheft([scenarioA, scenarioB, scenarioC], mockQueryPagePairs, mockPageSessionDrops);
  assert(resultAll.length === 1, 'Only Scenario B triggers from the mix');
  assert(resultAll[0]?.query === 'how to train for a marathon', 'Only the SGE-stolen keyword returned');

  // ── Edge case: CTR drop exactly at boundary (−35%) - should trigger ──
  console.log('\n── Edge Case: CTR drop exactly −35% ──');
  const edgeCase = {
    ...scenarioA,
    query: 'edge case keyword',
    ctrChange: -35,
    impressions: 500,
  };
  const edgePairs = [...mockQueryPagePairs, { query: 'edge case keyword', page: 'https://example.com/edge', impressions: 500 }];
  const resultEdge = detectSgeTheft([edgeCase], edgePairs);
  assert(resultEdge.length === 1, 'Triggers at exactly −35% CTR drop (boundary inclusive)');

  // ── Edge case: CTR drop at −34% - should NOT trigger ──
  console.log('\n── Edge Case: CTR drop −34% (just below threshold) ──');
  const edgeCase2 = {
    ...scenarioA,
    query: 'near miss keyword',
    ctrChange: -34,
    impressions: 500,
  };
  const resultEdge2 = detectSgeTheft([edgeCase2], mockQueryPagePairs);
  assert(resultEdge2.length === 0, 'Does NOT trigger at −34% CTR drop');

  // ── Edge case: Impressions below 300 - should NOT trigger ──
  console.log('\n── Edge Case: Impressions below minimum (290) ──');
  const lowImpressions = {
    ...scenarioB,
    query: 'low volume keyword',
    impressions: 290,
  };
  const resultLowImp = detectSgeTheft([lowImpressions], mockQueryPagePairs);
  assert(resultLowImp.length === 0, 'Does NOT trigger with < 300 impressions');

  // ── Edge case: Query has no page mapping - GA4 stays base confidence ──
  console.log('\n── Edge Case: Query with no page mapping ──');
  const orphanQuery = {
    ...scenarioB,
    query: 'unmapped orphan query',
  };
  const resultOrphan = detectSgeTheft([orphanQuery], mockQueryPagePairs, mockPageSessionDrops);
  assert(resultOrphan.length === 1, 'Still triggers on GSC evidence alone');
  assert(resultOrphan[0]?.pageUrl === null, 'pageUrl is null (no mapping found)');
  assert(resultOrphan[0]?.confidence === 82, 'Base confidence 82% (cannot verify page sessions)');
  assert(resultOrphan[0]?.ga4Confirmed === false, 'ga4Confirmed false (no page to check)');

  // ── Edge case: Page sessions drop exactly -25% (boundary) ──
  console.log('\n── Edge Case: Page sessions drop exactly −25% (boundary) ──');
  const boundaryPageDrops = new Map([
    ['https://example.com/marathon-guide', -25],
  ]);
  const resultBoundary = detectSgeTheft([scenarioB], mockQueryPagePairs, boundaryPageDrops);
  assert(resultBoundary[0]?.confidence === 99, 'Triggers at exactly −25% page sessions drop (boundary inclusive)');
  assert(resultBoundary[0]?.ga4Confirmed === true, 'GA4 confirmed at boundary');

  // ── Edge case: Page sessions drop -24% (just above threshold) ──
  console.log('\n── Edge Case: Page sessions drop −24% (just above threshold) ──');
  const nearMissPageDrops = new Map([
    ['https://example.com/marathon-guide', -24],
  ]);
  const resultNearMiss = detectSgeTheft([scenarioB], mockQueryPagePairs, nearMissPageDrops);
  assert(resultNearMiss[0]?.confidence === 82, 'Base confidence at −24% page sessions drop (not enough)');
  assert(resultNearMiss[0]?.ga4Confirmed === false, 'GA4 NOT confirmed at -24%');

  // ── Summary ──
  console.log('\n══════════════════════════════════════════════════');
  console.log(`  Total: ${passed + failed}  |  Passed: ${passed}  |  Failed: ${failed}`);
  console.log('══════════════════════════════════════════════════\n');

  if (failed > 0) {
    process.exit(1);
  }
}

testSgeTrafficTheftLogic();

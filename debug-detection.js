// Debug: Show all groups and which ones are high-confidence vs borderline
import { PrismaClient } from './node_modules/.prisma/client/default.js';
import { detectProactive, groupCandidates, deduplicateCandidates } from './lib/cannibalization-engine.js';

const prisma = new PrismaClient();

async function main() {
  const site = await prisma.site.findFirst({
    where: { url: { contains: 'dgblog' } },
    include: { googleIntegration: true }
  });
  
  if (!site) { console.log('Site not found!'); return; }
  
  const entities = await prisma.siteEntity.findMany({
    where: { siteId: site.id, status: 'PUBLISHED', entityType: { isEnabled: true } },
    select: {
      id: true, title: true, url: true, slug: true,
      seoData: true, metadata: true,
      entityType: { select: { slug: true } }
    }
  });
  
  const candidates = detectProactive(entities);
  const deduped = deduplicateCandidates(candidates, []);
  const groups = groupCandidates(deduped);
  
  const HIGH_CONFIDENCE_SCORE = 60;
  const HIGH_CONFIDENCE_URLS = 3;
  
  const highConf = groups.filter(g => g.combinedScore >= HIGH_CONFIDENCE_SCORE || g.urls.length >= HIGH_CONFIDENCE_URLS);
  const borderline = groups.filter(g => g.combinedScore < HIGH_CONFIDENCE_SCORE && g.urls.length < HIGH_CONFIDENCE_URLS);
  
  console.log(`\n=== HIGH CONFIDENCE (bypass AI) - ${highConf.length} groups ===`);
  for (const g of highConf) {
    console.log(`\nScore: ${g.combinedScore}% | URLs: ${g.urls.length}`);
    for (let i = 0; i < g.urls.length; i++) {
      console.log(`  ${g.entities[i]?.title}`);
    }
    if (g.data?.titlePrefixMatch) console.log(`  [PREFIX MATCH]`);
    // Show pair details
    for (const p of g.pairs) {
      const a = p.data?.entityA?.title?.substring(0, 40);
      const b = p.data?.entityB?.title?.substring(0, 40);
      console.log(`  Pair: ${a} <-> ${b} = ${p.score}%`);
      console.log(`    Jaccard: ${p.data?.combinedSimilarity}% | Containment: ${p.data?.titleContainment}% | Bigram: ${p.data?.titleBigramScore}% | Prefix: ${p.data?.titlePrefixMatch}`);
    }
  }
  
  console.log(`\n=== BORDERLINE (needs AI) - ${borderline.length} groups ===`);
  for (const g of borderline) {
    console.log(`  Score: ${g.combinedScore}% | ${g.entities.map(e => e.title?.substring(0, 50)).join(' <-> ')}`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());

main().catch(console.error).finally(() => prisma.$disconnect());

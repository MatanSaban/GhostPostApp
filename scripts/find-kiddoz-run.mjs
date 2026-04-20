import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const sites = await prisma.site.findMany({
  where: { url: { contains: 'kiddoz', mode: 'insensitive' } },
  select: { id: true, url: true, name: true, accountId: true },
});
console.log('Sites:', JSON.stringify(sites, null, 2));

for (const s of sites) {
  const runs = await prisma.agentRun.findMany({
    where: { siteId: s.id },
    orderBy: { startedAt: 'desc' },
    take: 5,
    select: { id: true, status: true, source: true, startedAt: true, completedAt: true, insightsCount: true, error: true },
  });
  console.log(`\nRecent runs for ${s.url}:`);
  console.log(JSON.stringify(runs, null, 2));
}

await prisma.$disconnect();

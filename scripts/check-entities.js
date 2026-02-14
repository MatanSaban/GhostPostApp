const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
  const site = await p.site.findFirst({
    where: { url: { contains: 'dahan' } },
    select: { id: true, url: true },
  });
  console.log('site:', site.url, 'id:', site.id);

  const total = await p.siteEntity.count({ where: { siteId: site.id } });
  console.log('Total entities:', total);

  const entities = await p.siteEntity.findMany({
    where: { siteId: site.id },
    select: { slug: true, url: true, externalId: true, entityType: true },
    orderBy: { url: 'asc' },
  });

  entities.forEach(e => console.log(JSON.stringify(e)));

  // Check for "projects" specifically
  const projectEntity = await p.siteEntity.findFirst({
    where: {
      siteId: site.id,
      OR: [
        { slug: { contains: 'project' } },
        { url: { contains: 'project' } },
      ],
    },
    select: { slug: true, url: true, externalId: true },
  });
  console.log('\nProject entity:', projectEntity ? JSON.stringify(projectEntity) : 'NOT FOUND');

  await p.$disconnect();
})();

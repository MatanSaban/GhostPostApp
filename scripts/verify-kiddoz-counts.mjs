import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const site = await prisma.site.findFirst({
  where: { url: { contains: 'kiddoz', mode: 'insensitive' } },
  select: {
    id: true,
    url: true,
    _count: {
      select: {
        entities: { where: { entityType: { isEnabled: true } } },
        entityTypes: { where: { isEnabled: true } },
      },
    },
  },
});

console.log('Site:', site.url);
console.log('  Enabled entity types:', site._count.entityTypes);
console.log('  Entities of enabled types:', site._count.entities, '← this is what the UI should show');

const unfilteredEntities = await prisma.siteEntity.count({ where: { siteId: site.id } });
console.log('  (For reference) All entities ignoring enabled filter:', unfilteredEntities);

await prisma.$disconnect();

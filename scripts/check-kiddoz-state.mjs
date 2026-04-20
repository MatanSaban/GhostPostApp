import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const site = await prisma.site.findFirst({
  where: { url: { contains: 'kiddoz', mode: 'insensitive' } },
  select: { id: true, url: true, platform: true, connectionStatus: true, entitySyncStatus: true, entitySyncProgress: true, entitySyncMessage: true, lastEntitySyncAt: true },
});
console.log('Site:', JSON.stringify(site, null, 2));

const types = await prisma.siteEntityType.findMany({
  where: { siteId: site.id },
  orderBy: { sortOrder: 'asc' },
});
console.log('\nEntity types (with sitemaps):');
for (const t of types) {
  console.log(`  ${t.isEnabled ? '[ON] ' : '[off]'} ${t.slug.padEnd(20)} ${t.name}`);
  console.log(`        sitemaps:`, JSON.stringify(t.sitemaps));
  console.log(`        apiEndpoint: ${t.apiEndpoint}`);
}

const counts = await prisma.siteEntity.groupBy({
  by: ['entityTypeId'],
  where: { siteId: site.id },
  _count: { _all: true },
});
console.log('\nEntity counts by typeId:');
for (const c of counts) {
  const t = types.find(x => x.id === c.entityTypeId);
  console.log(`  ${(t?.slug || c.entityTypeId).padEnd(25)} ${t?.isEnabled ? '[ON] ' : '[off]'} count=${c._count._all}`);
}

console.log('\nSitemap snapshots in DB:');
const sitemaps = await prisma.siteSitemap.findMany({
  where: { siteId: site.id },
  select: { url: true, sitemapType: true, urlCount: true, postType: true, parentId: true },
  orderBy: { url: 'asc' },
});
for (const sm of sitemaps) {
  console.log(`  ${sm.url}  type=${sm.sitemapType}  postType=${sm.postType}  urls=${sm.urlCount}`);
}
await prisma.$disconnect();

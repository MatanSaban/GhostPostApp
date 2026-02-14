const { PrismaClient } = require('./node_modules/@prisma/client');
const p = new PrismaClient();

(async () => {
  // Check all dahan sites for entities
  const sites = await p.site.findMany({
    where: { url: { contains: 'dahan' } },
    select: { id: true, url: true, name: true, connectionStatus: true, siteKey: true },
  });
  console.log('Dahan sites:', JSON.stringify(sites, null, 2));

  for (const s of sites) {
    const count = await p.siteEntity.count({ where: { siteId: s.id } });
    console.log(`  Site ${s.id} (${s.url}): ${count} entities`);
  }

  // Check latest audit
  const audit = await p.siteAudit.findFirst({
    where: { site: { url: { contains: 'dahan' } } },
    orderBy: { createdAt: 'desc' },
    select: { id: true, siteId: true, status: true },
  });
  console.log('Latest audit:', JSON.stringify(audit, null, 2));

  if (audit) {
    const entityCount = await p.siteEntity.count({ where: { siteId: audit.siteId } });
    console.log(`Entities for audit site: ${entityCount}`);
  }

  await p.$disconnect();
})();

// Run: node _cluster-status.js
// Outputs the role of each replica-set member, plus current primary (if any).
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
(async () => {
  try {
    const r = await prisma.$runCommandRaw({ hello: 1 });
    console.log('isWritablePrimary:', r.isWritablePrimary);
    console.log('primary:          ', r.primary || '(none — cluster has no primary)');
    console.log('hosts:            ', r.hosts);
    console.log('me:               ', r.me);
    console.log('setName:          ', r.setName);
  } catch (e) {
    console.log('FAILED to reach cluster:', e.message?.split('\n')[0]?.slice(0, 200));
  } finally {
    await prisma.$disconnect();
  }
})();

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fixConflictingTranslations() {
  console.log('Fixing conflicting translations in database...');

  // Delete entities.sync which conflicts with entities.sync.{nested}
  const deleteResult = await prisma.i18nTranslation.deleteMany({
    where: { 
      key: 'entities.sync'
    }
  });
  console.log('Deleted entities.sync translations:', deleteResult.count);

  // Check remaining sync translations
  const remaining = await prisma.i18nTranslation.findMany({
    where: {
      key: { startsWith: 'entities.sync' }
    },
    select: { key: true, value: true, locale: true }
  });
  console.log('Remaining entities.sync.* translations:', remaining);

  await prisma.$disconnect();
}

fixConflictingTranslations().catch(e => {
  console.error(e);
  prisma.$disconnect();
});


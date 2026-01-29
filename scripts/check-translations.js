const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkTranslations() {
  // Find all Hebrew translations containing 'cancel'
  const translations = await prisma.i18nTranslation.findMany({
    where: { 
      locale: 'he',
      isLatest: true,
      key: { contains: 'cancel' }
    },
    select: { key: true, value: true }
  });
  
  console.log('All Hebrew translations containing "cancel":');
  console.log(JSON.stringify(translations, null, 2));
  
  // Also check for the exact keys we care about
  const specific = await prisma.i18nTranslation.findMany({
    where: {
      locale: 'he',
      isLatest: true,
      key: { in: ['admin.subscriptions.actions.cancel', 'admin.common.cancel', 'admin.common.close', 'common.cancel'] }
    },
    select: { key: true, value: true }
  });
  
  console.log('\nSpecific translations:');
  console.log(JSON.stringify(specific, null, 2));
}

checkTranslations()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

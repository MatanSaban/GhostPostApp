const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function updateTranslations() {
  console.log('Updating Hebrew translations in database...');

  // Update admin.subscriptions.actions.cancel
  const result1 = await prisma.i18nTranslation.updateMany({
    where: { 
      key: 'admin.subscriptions.actions.cancel',
      locale: 'he',
      isLatest: true
    },
    data: { value: 'ביטול מנוי' }
  });
  console.log('Updated admin.subscriptions.actions.cancel:', result1.count);

  // Update admin.common.cancel  
  const result2 = await prisma.i18nTranslation.updateMany({
    where: { 
      key: 'admin.common.cancel',
      locale: 'he',
      isLatest: true
    },
    data: { value: 'ביטול' }
  });
  console.log('Updated admin.common.cancel:', result2.count);

  // Update admin.common.close
  const result3 = await prisma.i18nTranslation.updateMany({
    where: { 
      key: 'admin.common.close',
      locale: 'he',
      isLatest: true
    },
    data: { value: 'סגור' }
  });
  console.log('Updated admin.common.close:', result3.count);

  console.log('Done!');
}

updateTranslations()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function clearOldFeatures() {
  try {
    // Clear features from all plans
    const plans = await prisma.plan.updateMany({
      data: { features: [] }
    });
    console.log('Cleared features from', plans.count, 'plans');

    // Clear features from all translations
    const translations = await prisma.planTranslation.updateMany({
      data: { features: [] }
    });
    console.log('Cleared features from', translations.count, 'translations');

    console.log('Done!');
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

clearOldFeatures();

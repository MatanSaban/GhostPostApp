/**
 * Update Question Order
 * 
 * This script updates the order of contentLanguage and businessConfirmation questions.
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  // Update contentLanguage to order 3 with defaultFromCrawl
  const langResult = await prisma.interviewQuestion.updateMany({
    where: { translationKey: 'registration.interview.questions.contentLanguage' },
    data: {
      order: 3,
      inputConfig: {
        selectionMode: 'dropdown',
        defaultFromCrawl: 'language',
        options: [
          { value: 'en', labelKey: 'registration.languages.english' },
          { value: 'he', labelKey: 'registration.languages.hebrew' },
          { value: 'es', labelKey: 'registration.languages.spanish' },
          { value: 'fr', labelKey: 'registration.languages.french' },
          { value: 'de', labelKey: 'registration.languages.german' },
          { value: 'pt', labelKey: 'registration.languages.portuguese' },
          { value: 'it', labelKey: 'registration.languages.italian' },
          { value: 'ru', labelKey: 'registration.languages.russian' },
          { value: 'ar', labelKey: 'registration.languages.arabic' },
          { value: 'zh', labelKey: 'registration.languages.chinese' },
          { value: 'ja', labelKey: 'registration.languages.japanese' },
        ],
      },
    },
  });
  console.log('Updated contentLanguage:', langResult);

  // Update businessConfirmation to order 4
  const bizResult = await prisma.interviewQuestion.updateMany({
    where: { translationKey: 'registration.interview.questions.businessConfirmation' },
    data: { order: 4 },
  });
  console.log('Updated businessConfirmation:', bizResult);

  // Verify the changes
  const questions = await prisma.interviewQuestion.findMany({
    orderBy: { order: 'asc' },
    select: { translationKey: true, order: true, inputConfig: true },
  });
  console.log('\nCurrent question order:');
  questions.forEach(q => {
    const hasDefault = q.inputConfig?.defaultFromCrawl ? ` (defaultFromCrawl: ${q.inputConfig.defaultFromCrawl})` : '';
    console.log(`  ${q.order}. ${q.translationKey}${hasDefault}`);
  });
}

run()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

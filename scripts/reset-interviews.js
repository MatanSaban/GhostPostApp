/**
 * Reset all user interviews to start fresh
 * Run with: node scripts/reset-interviews.js
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function resetInterviews() {
  console.log('Resetting all user interviews...\n');

  const result = await prisma.userInterview.updateMany({
    data: {
      currentStep: 0,
      status: 'NOT_STARTED',
      responses: {},
    },
  });

  console.log(`✅ Reset ${result.count} interview(s) to start from question 1`);
}

resetInterviews()
  .catch((e) => {
    console.error('Reset failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

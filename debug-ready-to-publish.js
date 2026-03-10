const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // Reset posts that hit max retries
  const reset = await prisma.content.updateMany({
    where: {
      status: 'READY_TO_PUBLISH',
      publishAttempts: { gte: 3 },
    },
    data: {
      publishAttempts: 0,
      errorMessage: null,
    },
  });
  
  console.log('Reset', reset.count, 'posts with exhausted retries');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

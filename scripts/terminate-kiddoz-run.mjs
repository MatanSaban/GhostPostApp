import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const RUN_ID = '69e589a81b369f2c4dd61148';

const before = await prisma.agentRun.findUnique({ where: { id: RUN_ID } });
if (!before) {
  console.log('Run not found.');
  await prisma.$disconnect();
  process.exit(1);
}
console.log('Before:', JSON.stringify({ id: before.id, status: before.status, startedAt: before.startedAt }, null, 2));

if (before.status !== 'RUNNING') {
  console.log(`Run is already ${before.status} - no change made.`);
  await prisma.$disconnect();
  process.exit(0);
}

const updated = await prisma.agentRun.update({
  where: { id: RUN_ID },
  data: {
    status: 'FAILED',
    completedAt: new Date(),
    error: 'Manually terminated by operator',
  },
});
console.log('After:', JSON.stringify({ id: updated.id, status: updated.status, completedAt: updated.completedAt, error: updated.error }, null, 2));

await prisma.$disconnect();

/**
 * Clears all agent analysis history (AgentInsight and AgentRun records)
 * 
 * Usage: node scripts/clear-agent-history.js
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('[Clear Agent History] Starting...');
  
  const insightsDeleted = await prisma.agentInsight.deleteMany({});
  console.log(`[Clear Agent History] Deleted ${insightsDeleted.count} insights`);
  
  const runsDeleted = await prisma.agentRun.deleteMany({});
  console.log(`[Clear Agent History] Deleted ${runsDeleted.count} runs`);
  
  console.log('[Clear Agent History] Done!');
}

main()
  .catch(e => {
    console.error('[Clear Agent History] Error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

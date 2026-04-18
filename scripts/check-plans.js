const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  const plans = await p.plan.findMany({ include: { translations: true } });
  plans.forEach(plan => {
    console.log('=== PLAN:', plan.name, '===');
    console.log('features:', JSON.stringify(plan.features, null, 2));
    console.log('limitations:', JSON.stringify(plan.limitations, null, 2));
    plan.translations.forEach(t => {
      console.log('  TRANSLATION', t.language, ':');
      console.log('    features:', JSON.stringify(t.features, null, 2));
      console.log('    limitations:', JSON.stringify(t.limitations, null, 2));
    });
  });
}

main().catch(console.error).finally(() => p.$disconnect());

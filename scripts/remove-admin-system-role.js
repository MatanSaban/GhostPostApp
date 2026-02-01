const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Removing Admin from system roles...');
  
  const result = await prisma.role.updateMany({
    where: { key: 'admin' },
    data: { isSystemRole: false }
  });
  
  console.log(`Updated ${result.count} Admin roles to non-system roles (now deletable)`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

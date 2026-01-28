const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fixPermissions() {
  console.log('Fixing MEMBERS_REMOVE -> MEMBERS_DELETE in Role permissions...');
  
  // Use $runCommandRaw to directly update MongoDB documents
  const result = await prisma.$runCommandRaw({
    update: 'Role',
    updates: [{
      q: { permissions: 'MEMBERS_REMOVE' },
      u: { $set: { 'permissions.$': 'MEMBERS_DELETE' } },
      multi: true
    }]
  });
  
  console.log('Update result:', JSON.stringify(result, null, 2));
  
  // Verify the fix
  const roles = await prisma.$runCommandRaw({
    find: 'Role',
    filter: {}
  });
  
  console.log('\nCurrent roles permissions:');
  roles.cursor.firstBatch.forEach(role => {
    console.log(`- ${role.name}: ${role.permissions?.join(', ') || 'none'}`);
  });
  
  await prisma.$disconnect();
  console.log('\nDone!');
}

fixPermissions().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});

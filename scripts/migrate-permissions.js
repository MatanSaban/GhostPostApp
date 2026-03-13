const { PrismaClient } = require('@prisma/client');

async function migratePermissions() {
  const prisma = new PrismaClient();
  
  try {
    // Use raw MongoDB query to get all roles
    const roles = await prisma.$runCommandRaw({
      find: 'Role',
      filter: {}
    });
    
    console.log('Found roles:', JSON.stringify(roles, null, 2));
    
    // Map old CONTENT_* permissions to new ones
    const permissionMapping = {
      'CONTENT_VIEW': ['CONTENT_PLANNER_VIEW', 'AI_CONTENT_VIEW', 'ENTITIES_VIEW'],
      'CONTENT_CREATE': ['CONTENT_PLANNER_CREATE', 'AI_CONTENT_CREATE', 'ENTITIES_CREATE'],
      'CONTENT_EDIT': ['CONTENT_PLANNER_EDIT', 'AI_CONTENT_EDIT', 'ENTITIES_EDIT'],
      'CONTENT_DELETE': ['CONTENT_PLANNER_DELETE', 'AI_CONTENT_DELETE', 'ENTITIES_DELETE'],
      'CONTENT_PUBLISH': ['ENTITIES_PUBLISH']
    };
    
    for (const role of roles.cursor?.firstBatch || []) {
      const oldPermissions = role.permissions || [];
      const newPermissions = [];
      
      for (const perm of oldPermissions) {
        if (permissionMapping[perm]) {
          // Replace old permission with new ones
          newPermissions.push(...permissionMapping[perm]);
        } else {
          // Keep non-CONTENT permissions as is
          newPermissions.push(perm);
        }
      }
      
      // Remove duplicates
      const uniquePermissions = [...new Set(newPermissions)];
      
      console.log(`Updating role ${role.name}: ${oldPermissions.length} -> ${uniquePermissions.length} permissions`);
      
      // Update using raw MongoDB command
      await prisma.$runCommandRaw({
        update: 'Role',
        updates: [{
          q: { _id: role._id },
          u: { $set: { permissions: uniquePermissions } }
        }]
      });
    }
    
    console.log('Migration complete!');
  } catch (error) {
    console.error('Migration error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

migratePermissions();

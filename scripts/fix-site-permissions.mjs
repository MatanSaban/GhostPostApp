import { PrismaClient } from '@prisma/client';
import { generateSiteKey, generateSiteSecret, DEFAULT_SITE_PERMISSIONS } from '../lib/site-keys.js';

const prisma = new PrismaClient();

async function fixSitePermissions() {
  console.log('Looking for sites missing siteKey or sitePermissions...');
  console.log('DEFAULT_SITE_PERMISSIONS:', DEFAULT_SITE_PERMISSIONS);
  
  // Find all sites
  const allSites = await prisma.site.findMany();
  console.log(`Total sites: ${allSites.length}`);
  
  // Filter sites that need fixing
  const sitesNeedingFix = allSites.filter(site => 
    !site.siteKey || 
    !site.siteSecret || 
    !site.sitePermissions || 
    site.sitePermissions.length === 0
  );
  
  console.log(`Sites needing update: ${sitesNeedingFix.length}`);
  
  for (const site of sitesNeedingFix) {
    console.log(`\nFixing site: ${site.name} (${site.url})`);
    console.log(`  Current siteKey: ${site.siteKey ? 'exists' : 'missing'}`);
    console.log(`  Current siteSecret: ${site.siteSecret ? 'exists' : 'missing'}`);
    console.log(`  Current permissions: ${site.sitePermissions?.length || 0} permissions`);
    
    const updated = await prisma.site.update({
      where: { id: site.id },
      data: {
        siteKey: site.siteKey || generateSiteKey(),
        siteSecret: site.siteSecret || generateSiteSecret(),
        sitePermissions: DEFAULT_SITE_PERMISSIONS,
      },
    });
    
    console.log(`  Updated! New permissions: ${updated.sitePermissions.length}`);
  }
  
  console.log('\nDone!');
}

fixSitePermissions()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

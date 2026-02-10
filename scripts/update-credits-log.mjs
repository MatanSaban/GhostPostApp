import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  try {
    // Find the user by email
    const user = await prisma.user.findFirst({
      where: { email: 'office@red-ghost.co.il' },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        accountMemberships: {
          select: {
            accountId: true,
            account: {
              select: {
                id: true,
                name: true,
                aiCreditsUsedTotal: true,
              }
            }
          }
        }
      }
    });

    if (!user) {
      console.log('User not found');
      return;
    }

    console.log('User found:', user.email);
    console.log('Account ID:', user.accountMemberships[0]?.accountId);
    console.log('Account aiCreditsUsedTotal:', user.accountMemberships[0]?.account?.aiCreditsUsedTotal);

    const accountId = user.accountMemberships[0]?.accountId;
    if (!accountId) {
      console.log('No account found for user');
      return;
    }

    // Find sites associated with this account to get proper site names
    const sites = await prisma.site.findMany({
      where: { accountId },
      select: { id: true, name: true, url: true }
    });

    console.log('\nSites for this account:');
    sites.forEach(site => {
      console.log(`  - ${site.name} (${site.url})`);
    });

    // Create a map of URL domain to site name
    const urlToSiteName = {};
    for (const site of sites) {
      if (site.url) {
        try {
          const urlObj = new URL(site.url);
          const domain = urlObj.hostname.replace('www.', '');
          urlToSiteName[domain] = site.name;
          urlToSiteName[urlObj.hostname] = site.name;
          urlToSiteName[site.url] = site.name;
          // Also match without protocol
          urlToSiteName[site.url.replace('https://', '').replace('http://', '')] = site.name;
        } catch {}
      }
    }
    console.log('\nURL to Site Name mapping:', urlToSiteName);

    // Find existing AI credits logs for this account
    const logs = await prisma.aiCreditsLog.findMany({
      where: { accountId },
      orderBy: { createdAt: 'asc' }, // Order by oldest first to calculate running total
    });

    console.log(`\nFound ${logs.length} logs to update...`);

    // Update each log with descriptionKey and descriptionParams based on source
    const sourceToDescriptionKey = {
      'CRAWL_WEBSITE': 'crawledWebsite',
      'GENERATE_KEYWORDS': 'generatedKeywords',
      'FIND_COMPETITORS': 'foundCompetitors',
      'ANALYZE_WRITING_STYLE': 'analyzedWritingStyle',
      'DETECT_PLATFORM': 'detectedPlatform',
      'COMPLETE_INTERVIEW': 'completedInterview',
    };

    let runningTotal = 0;

    for (const log of logs) {
      const metadata = log.metadata || {};
      const descriptionKey = sourceToDescriptionKey[log.source];
      
      // Update running total for DEBIT entries
      if (log.type === 'DEBIT') {
        runningTotal += Math.abs(log.amount);
      }

      // Build descriptionParams based on source type
      let descriptionParams = {};
      switch (log.source) {
        case 'CRAWL_WEBSITE':
          descriptionParams = { url: metadata.websiteUrl || '' };
          break;
        case 'GENERATE_KEYWORDS':
          descriptionParams = { count: metadata.totalKeywords || 0 };
          break;
        case 'FIND_COMPETITORS':
          descriptionParams = { 
            count: metadata.competitorsFound || 0, 
            keywords: metadata.keywordsSearched?.length || 0 
          };
          break;
        case 'ANALYZE_WRITING_STYLE':
          descriptionParams = {};
          break;
        case 'DETECT_PLATFORM':
          descriptionParams = { platform: metadata.detectedPlatform || 'unknown' };
          break;
        case 'COMPLETE_INTERVIEW':
          descriptionParams = { url: metadata.websiteUrl || '' };
          break;
      }

      // Get proper site name from the URL - always try to look up from sites first
      let siteName = null;
      if (metadata.websiteUrl) {
        try {
          const urlObj = new URL(metadata.websiteUrl);
          const domain = urlObj.hostname.replace('www.', '');
          siteName = urlToSiteName[domain] || urlToSiteName[metadata.websiteUrl];
        } catch {}
      }
      // Fallback to existing metadata only if we couldn't find from sites
      if (!siteName) {
        siteName = metadata.siteName || metadata.businessName;
      }

      // Update the log with new metadata and correct balance
      const updatedMetadata = {
        ...metadata,
        descriptionKey,
        descriptionParams,
        siteName: siteName || metadata.siteName,
        businessName: siteName || metadata.businessName,
      };

      await prisma.aiCreditsLog.update({
        where: { id: log.id },
        data: { 
          metadata: updatedMetadata,
          balance: runningTotal, // Fix balance to be positive running total
        }
      });

      console.log(`Updated log ${log.id} (${log.source}) - siteName: ${siteName || 'N/A'}, balance: ${runningTotal}`);
    }

    console.log('\nDone! All logs updated.');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();

import { refreshAccessToken, fetchGADailyTraffic, fetchGAReport } from '../lib/google-integration.js';
import { PrismaClient } from '@prisma/client';

const p = new PrismaClient();

try {
  // Test specifically for the "Red Ghost" site with 0 daily rows
  const int = await p.googleIntegration.findUnique({ where: { siteId: '698c523bfac55637d5b26bb4' } });
  if (!int) { console.log('Not found'); process.exit(0); }

  const refreshed = await refreshAccessToken(int.refreshToken);
  const accessToken = refreshed.access_token;
  const cleanId = int.gaPropertyId.replace('properties/', '');

  // Raw API call to see exactly what comes back
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 30);
  const fmt = (d) => d.toISOString().split('T')[0];

  const body = {
    dateRanges: [{ startDate: fmt(startDate), endDate: fmt(endDate) }],
    dimensions: [{ name: 'date' }],
    metrics: [
      { name: 'activeUsers' },
      { name: 'screenPageViews' },
    ],
    orderBys: [{ dimension: { dimensionName: 'date' } }],
  };

  // First call fetchGAReport directly to confirm it works
  console.log('Direct fetchGAReport test...');
  const gaResult = await fetchGAReport(accessToken, int.gaPropertyId, 30);
  console.log('fetchGAReport:', gaResult ? `visitors=${gaResult.visitors}` : 'null');
  
  // Test the updated fetchGADailyTraffic (with 2 date ranges)
  console.log('\nUpdated fetchGADailyTraffic test...');
  try {
    const chart = await fetchGADailyTraffic(accessToken, int.gaPropertyId, 30);
    console.log('Result:', Array.isArray(chart) ? `${chart.length} rows` : 'not array');
    if (chart?.length > 0) {
      console.log('First:', chart[0]);
      console.log('Last:', chart[chart.length - 1]);
    } else {
      console.log('Empty result');
    }
  } catch (e) {
    console.log('Error:', e.message);
  }
} catch (e) {
  console.error('Error:', e);
} finally {
  await p.$disconnect();
}

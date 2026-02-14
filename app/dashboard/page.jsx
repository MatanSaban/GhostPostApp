import { getTranslations } from '@/i18n/server';
import DashboardContent from './components/DashboardContent';

export default async function DashboardPage() {
  const t = await getTranslations();

  const activityData = [
    { action: t('dashboard.activity.publishedArticles', { count: 3 }), time: t('time.hoursAgo', { count: 2 }), dotColor: 'success' },
    { action: t('dashboard.activity.fixedLinks', { count: 12 }), time: t('time.hoursAgo', { count: 5 }), dotColor: 'success' },
    { action: t('dashboard.activity.newKeywords', { count: 8 }), time: t('time.daysAgo', { count: 1 }), dotColor: 'info' },
    { action: t('dashboard.activity.updatedMeta', { count: 15 }), time: t('time.daysAgo', { count: 2 }), dotColor: 'success' },
  ];

  const translations = {
    commandCenter: t('dashboard.commandCenter'),
    subtitle: t('dashboard.subtitle'),
    trafficOverview: t('dashboard.trafficOverview'),
    siteHealthScore: t('dashboard.siteHealthScore'),
    aiAgentActivity: t('dashboard.aiAgentActivity'),
    viewAllActivity: t('dashboard.viewAllActivity'),
    quickActions: t('dashboard.quickActions'),
    overallScore: t('dashboard.overallScore'),
    performance: t('dashboard.performance'),
    seo: t('dashboard.seo'),
    bestPractices: t('dashboard.bestPractices'),

    // GA stats
    organicVisitors: t('dashboard.stats.organicVisitors'),
    totalPageViews: t('dashboard.stats.totalPageViews'),
    avgSessionDuration: t('dashboard.stats.avgSessionDuration'),
    sessions: t('dashboard.stats.sessions'),

    // GSC stats
    totalClicks: t('dashboard.stats.totalClicks'),
    totalImpressions: t('dashboard.stats.totalImpressions'),
    avgCtr: t('dashboard.stats.avgCtr'),
    avgPosition: t('dashboard.stats.avgPosition'),

    // Section headers
    gaTitle: t('dashboard.gaTitle'),
    gscTitle: t('dashboard.gscTitle'),
    last30days: t('dashboard.last30days'),

    // CTAs
    connectIntegration: t('dashboard.connectIntegration'),
    gaCtaDesc: t('dashboard.gaCtaDesc'),
    gscCtaDesc: t('dashboard.gscCtaDesc'),

    // Chart / table
    noTrafficData: t('dashboard.noTrafficData'),
    tokenError: t('dashboard.tokenError'),
    reconnectGoogle: t('dashboard.reconnectGoogle'),
    topPages: t('dashboard.topPages'),
    page: t('dashboard.table.page'),
    clicks: t('dashboard.table.clicks'),
    impressions: t('dashboard.table.impressions'),
    ctr: t('dashboard.table.ctr'),
    position: t('dashboard.table.position'),

    // Top Keywords
    topKeywords: t('dashboard.topKeywords'),
    keyword: t('dashboard.table.keyword'),
    sortBy: t('dashboard.sortBy'),
    pageViews: t('dashboard.stats.totalPageViews'),
    visitors: t('dashboard.stats.visitors'),

    // Quick actions
    contentPlanner: t('nav.strategy.contentPlanner'),
    keywords: t('nav.strategy.keywords'),
    siteAudit: t('nav.tools.siteAudit'),

    // Activity data (pre-rendered on server)
    activityData,
  };

  return <DashboardContent translations={translations} />;
}

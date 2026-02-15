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

    // Date range presets
    dateToday: t('dashboard.dateRange.today'),
    dateYesterday: t('dashboard.dateRange.yesterday'),
    dateLast7: t('dashboard.dateRange.last7'),
    dateLast30: t('dashboard.dateRange.last30'),
    dateLast90: t('dashboard.dateRange.last90'),
    dateLast180: t('dashboard.dateRange.last180'),
    dateLast365: t('dashboard.dateRange.last365'),
    dateCustom: t('dashboard.dateRange.custom'),
    noDataForRange: t('dashboard.noDataForRange'),
    loadingChart: t('dashboard.loadingChart'),

    // Comparison labels
    vsPrefix: t('dashboard.comparison.vs'),
    vsPrevDay: t('dashboard.comparison.vsPrevDay'),
    vsPrev7: t('dashboard.comparison.vsPrev7'),
    vsPrev30: t('dashboard.comparison.vsPrev30'),
    vsPrev90: t('dashboard.comparison.vsPrev90'),
    vsPrev180: t('dashboard.comparison.vsPrev180'),
    vsPrev365: t('dashboard.comparison.vsPrev365'),

    // Tooltip explanations
    tipVisitorsLegend: t('dashboard.tooltips.visitorsLegend'),
    tipPageViewsLegend: t('dashboard.tooltips.pageViewsLegend'),
    tipMoreFromPrev: t('dashboard.tooltips.moreFromPrev'),
    tipLessFromPrev: t('dashboard.tooltips.lessFromPrev'),
    tipCardUp: t('dashboard.tooltips.cardUp'),
    tipCardDown: t('dashboard.tooltips.cardDown'),
    tipCardNoChange: t('dashboard.tooltips.cardNoChange'),
    tipNoChange: t('dashboard.tooltips.noChange'),
    tipPositionUp: t('dashboard.tooltips.positionUp'),
    tipPositionDown: t('dashboard.tooltips.positionDown'),
    tipPositionNoChange: t('dashboard.tooltips.positionNoChange'),
    dataFromGA: t('dashboard.tooltips.dataFromGA'),
    dataFromGSC: t('dashboard.tooltips.dataFromGSC'),

    // AI Traffic
    aiTrafficTitle: t('dashboard.aiTraffic.title'),
    aiTotalSessions: t('dashboard.aiTraffic.totalAiSessions'),
    aiTrafficShare: t('dashboard.aiTraffic.aiTrafficShare'),
    aiEngineBreakdown: t('dashboard.aiTraffic.engineBreakdown'),
    aiTopLandingPages: t('dashboard.aiTraffic.topAiLandingPages'),
    aiTopPages: t('dashboard.aiTraffic.topPages'),
    aiQuery: t('dashboard.aiTraffic.query'),
    aiPage: t('dashboard.aiTraffic.page'),
    aiSessions: t('dashboard.aiTraffic.sessions'),
    aiNoTraffic: t('dashboard.aiTraffic.noAiTraffic'),
    tipAiSessions: t('dashboard.aiTraffic.tipAiSessions'),
    tipAiShare: t('dashboard.aiTraffic.tipAiShare'),
    // aiKeywordsTitle: t('dashboard.aiTraffic.aiKeywordsTitle'),
    // aiNoKeywordsData: t('dashboard.aiTraffic.noAiKeywordsData'),
    // tipAiKeywords: t('dashboard.aiTraffic.tipAiKeywords'),
    // inferredQueriesTitle: t('dashboard.aiTraffic.inferredQueriesTitle'),
    // inferredDirect: t('dashboard.aiTraffic.inferredDirect'),
    // inferredComparison: t('dashboard.aiTraffic.inferredComparison'),
    // inferredDiscovery: t('dashboard.aiTraffic.inferredDiscovery'),
    // inferredLoading: t('dashboard.aiTraffic.inferredLoading'),
    // inferredNoData: t('dashboard.aiTraffic.inferredNoData'),
    // inferredPending: t('dashboard.aiTraffic.inferredPending'),
    // inferredDisclaimer: t('dashboard.aiTraffic.inferredDisclaimer'),

    // Quick actions
    contentPlanner: t('nav.strategy.contentPlanner'),
    keywords: t('nav.strategy.keywords'),
    siteAudit: t('nav.tools.siteAudit'),

    // Activity data (pre-rendered on server)
    activityData,
  };

  return <DashboardContent translations={translations} />;
}

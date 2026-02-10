import { 
  Activity
} from 'lucide-react';
import Link from 'next/link';
import { StatsCard, DashboardCard, ActivityItem, PrimaryActionButton, ProgressBar, QuickActions } from './components';
import { ArrowIcon } from '@/app/components/ui/arrow-icon';
import { getTranslations } from '@/i18n/server';
import styles from './page.module.css';

export default async function DashboardPage() {
  const t = await getTranslations();

  const kpiData = [
    {
      iconName: 'Users',
      value: '5,847',
      label: t('dashboard.stats.organicVisitors'),
      trend: 'up',
      trendValue: '+24%',
      color: 'purple',
    },
    {
      iconName: 'FileText',
      value: '9,234',
      label: t('dashboard.stats.totalPageViews'),
      trend: 'up',
      trendValue: '+18%',
      color: 'blue',
    },
    {
      iconName: 'Clock',
      value: '3:42',
      label: t('dashboard.stats.avgSessionDuration'),
      trend: 'down',
      trendValue: '-3%',
      color: 'orange',
    },
    {
      iconName: 'Target',
      value: '87/100',
      label: t('dashboard.stats.overallSeoScore'),
      trend: 'up',
      trendValue: '+12%',
      color: 'green',
    },
  ];

  const activityData = [
    { action: t('dashboard.activity.publishedArticles', { count: 3 }), time: t('time.hoursAgo', { count: 2 }), dotColor: 'success' },
    { action: t('dashboard.activity.fixedLinks', { count: 12 }), time: t('time.hoursAgo', { count: 5 }), dotColor: 'success' },
    { action: t('dashboard.activity.newKeywords', { count: 8 }), time: t('time.daysAgo', { count: 1 }), dotColor: 'info' },
    { action: t('dashboard.activity.updatedMeta', { count: 15 }), time: t('time.daysAgo', { count: 2 }), dotColor: 'success' },
  ];

  const quickActionsData = [
    { label: t('nav.strategy.contentPlanner'), href: '/dashboard/strategy/content-planner', iconName: 'FileText' },
    { label: t('nav.strategy.keywords'), href: '/dashboard/strategy/keywords', iconName: 'Target' },
    { label: t('nav.tools.siteAudit'), href: '/dashboard/technical-seo/site-audit', iconName: 'Activity' },
  ];

  return (
    <>
      {/* Header */}
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>{t('dashboard.commandCenter')}</h1>
          <p className={styles.pageSubtitle}>{t('dashboard.subtitle')}</p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className={styles.kpiGrid}>
        {kpiData.map((kpi, index) => (
          <StatsCard
            key={index}
            iconName={kpi.iconName}
            value={kpi.value}
            label={kpi.label}
            trend={kpi.trend}
            trendValue={kpi.trendValue}
            color={kpi.color}
          />
        ))}
      </div>

      {/* Main Content Grid */}
      <div className={styles.mainGrid}>
        {/* Left Column - Charts */}
        <div className={styles.leftColumn}>
          {/* Traffic Overview */}
          <DashboardCard title={t('dashboard.trafficOverview')}>
            <div className={styles.chartContainer}>
              <div className={styles.chartPlaceholder}>
                <Activity size={48} className={styles.chartPlaceholderIcon} />
                <p>{t('dashboard.chartComingSoon')}</p>
              </div>
            </div>
          </DashboardCard>

          {/* Health Score */}
          <DashboardCard title={t('dashboard.siteHealthScore')}>
            <div className={styles.healthScoreContainer}>
              <div className={styles.healthScoreCircle}>
                <svg viewBox="0 0 120 120" className={styles.healthScoreSvg}>
                  <circle
                    cx="60"
                    cy="60"
                    r="52"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="8"
                    className={styles.healthScoreBg}
                  />
                  <circle
                    cx="60"
                    cy="60"
                    r="52"
                    fill="none"
                    stroke="url(#healthGradient)"
                    strokeWidth="8"
                    strokeDasharray={`${87 * 3.27} ${100 * 3.27}`}
                    strokeLinecap="round"
                    className={styles.healthScoreProgress}
                  />
                  <defs>
                    <linearGradient id="healthGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="var(--primary)" />
                      <stop offset="100%" stopColor="var(--accent)" />
                    </linearGradient>
                  </defs>
                </svg>
                <div className={styles.healthScoreValue}>87</div>
              </div>
              <div className={styles.healthScoreInfo}>
                <div className={styles.healthScoreLabel}>{t('dashboard.overallScore')}</div>
                <div className={styles.healthScoreDescription}>
                  {t('dashboard.healthImproved', { percent: 12 })}
                </div>
              </div>
            </div>
            <div className={styles.healthMetrics}>
              <div className={styles.healthMetric}>
                <span>{t('dashboard.performance')}</span>
                <ProgressBar value={92} />
              </div>
              <div className={styles.healthMetric}>
                <span>{t('dashboard.seo')}</span>
                <ProgressBar value={85} />
              </div>
              <div className={styles.healthMetric}>
                <span>{t('dashboard.bestPractices')}</span>
                <ProgressBar value={78} />
              </div>
            </div>
          </DashboardCard>
        </div>

        {/* Right Column */}
        <div className={styles.rightColumn}>
          {/* AI Agent Activity */}
          <DashboardCard title={t('dashboard.aiAgentActivity')}>
            <div className={styles.activityList}>
              {activityData.map((item, index) => (
                <ActivityItem
                  key={index}
                  dotColor={item.dotColor}
                  text={item.action}
                  time={item.time}
                />
              ))}
            </div>
            <Link href="/dashboard/automations" className={styles.viewAllLink}>
              {t('dashboard.viewAllActivity')}
              <ArrowIcon size={16} />
            </Link>
          </DashboardCard>

          {/* Quick Actions */}
          <DashboardCard title={t('dashboard.quickActions')}>
            <QuickActions actions={quickActionsData} />
          </DashboardCard>
        </div>
      </div>
    </>
  );
}

import { StatsCard, PrimaryActionButton } from '../components';
import { AutomationsList } from './components';
import { getTranslations } from '@/i18n/server';
import styles from './page.module.css';

export default async function AutomationsPage() {
  const t = await getTranslations();

  const statsData = [
    { iconName: 'Zap', value: '12', label: t('automations.stats.activeAutomations'), trend: 'up', trendValue: '+3', color: 'purple' },
    { iconName: 'BarChart2', value: '847', label: t('automations.stats.tasksCompleted'), trend: 'up', trendValue: '+124', color: 'green' },
    { iconName: 'RefreshCw', value: '23', label: t('automations.stats.runningToday'), trend: 'up', trendValue: '+5', color: 'blue' },
    { iconName: 'CheckCircle', value: '99.2%', label: t('automations.stats.successRate'), trend: 'up', trendValue: '+0.8%', color: 'green' },
  ];

  const automations = [
    {
      id: 1,
      name: t('automations.items.contentPublishing.name'),
      description: t('automations.items.contentPublishing.description'),
      iconName: 'FileText',
      color: 'purple',
      active: true,
      tasksCompleted: 156,
      lastRun: t('time.hoursAgo', { count: 2 })
    },
    {
      id: 2,
      name: t('automations.items.internalLinking.name'),
      description: t('automations.items.internalLinking.description'),
      iconName: 'Link2',
      color: 'blue',
      active: true,
      tasksCompleted: 89,
      lastRun: t('time.hoursAgo', { count: 5 })
    },
    {
      id: 3,
      name: t('automations.items.imageOptimization.name'),
      description: t('automations.items.imageOptimization.description'),
      iconName: 'Image',
      color: 'green',
      active: true,
      tasksCompleted: 234,
      lastRun: t('time.daysAgo', { count: 1 })
    },
    {
      id: 4,
      name: t('automations.items.metaUpdates.name'),
      description: t('automations.items.metaUpdates.description'),
      iconName: 'RefreshCw',
      color: 'orange',
      active: false,
      tasksCompleted: 67,
      lastRun: t('time.daysAgo', { count: 3 })
    },
  ];

  const activityLog = [
    { action: t('automations.activity.publishedArticles', { count: 3 }), time: t('time.hoursAgo', { count: 2 }), type: 'success' },
    { action: t('automations.activity.addedInternalLinks', { count: 12 }), time: t('time.hoursAgo', { count: 5 }), type: 'success' },
    { action: t('automations.activity.optimizedImages', { count: 28 }), time: t('time.daysAgo', { count: 1 }), type: 'info' },
    { action: t('automations.activity.updatedMetaDescriptions', { count: 15 }), time: t('time.daysAgo', { count: 2 }), type: 'success' },
  ];

  const listTranslations = {
    yourAutomations: t('automations.yourAutomations'),
    tasks: t('automations.tasks'),
    last: t('automations.last'),
  };

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.pageHeader}>
        <div className={styles.headerContent}>
          <h1 className={styles.pageTitle}>{t('automations.title')}</h1>
          <p className={styles.pageSubtitle}>
            {t('automations.subtitle')}
          </p>
        </div>
        <PrimaryActionButton iconName="Plus">
          {t('automations.createAutomation')}
        </PrimaryActionButton>
      </div>

      {/* Stats */}
      <div className={styles.statsGrid}>
        {statsData.map((stat, index) => (
          <StatsCard
            key={index}
            iconName={stat.iconName}
            value={stat.value}
            label={stat.label}
            trend={stat.trend}
            trendValue={stat.trendValue}
            color={stat.color}
          />
        ))}
      </div>

      {/* Automations List */}
      <AutomationsList automations={automations} translations={listTranslations} />

      {/* Activity Log */}
      <div className={styles.activityCard}>
        <div className={styles.cardHeader}>
          <h3 className={styles.cardTitle}>{t('dashboard.recentActivity')}</h3>
        </div>
        <div className={styles.activityList}>
          {activityLog.map((item, index) => (
            <div key={index} className={styles.activityItem}>
              <div className={styles.activityContent}>
                <span className={`${styles.activityDot} ${styles[item.type]}`} />
                <span className={styles.activityText}>{item.action}</span>
              </div>
              <span className={styles.activityTime}>{item.time}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

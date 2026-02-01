import Link from 'next/link';
import { StatsCard, PrimaryActionButton } from '../../components';
import { ContentPlannerView } from './components';
import { getTranslations } from '@/i18n/server';
import styles from './page.module.css';

export default async function ContentPlannerPage() {
  const t = await getTranslations();

  const statsData = [
    { iconName: 'FileText', value: '24', label: t('contentPlanner.totalPosts'), trend: 'up', trendValue: '+8', color: 'purple' },
    { iconName: 'CheckCircle', value: '18', label: t('contentPlanner.published'), trend: 'up', trendValue: '+5', color: 'green' },
    { iconName: 'Clock', value: '4', label: t('contentPlanner.scheduled'), trend: 'up', trendValue: '+2', color: 'blue' },
    { iconName: 'Calendar', value: '2', label: t('contentPlanner.drafts'), trend: 'down', trendValue: '-1', color: 'orange' },
  ];

  const contentItems = [
    { 
      id: 1, 
      title: t('contentPlanner.sampleContent.seoBestPractices'), 
      type: t('contentPlanner.blogPost'),
      status: 'published',
      statusText: t('contentPlanner.published'),
      date: t('contentPlanner.sampleContent.date1')
    },
    { 
      id: 2, 
      title: t('contentPlanner.sampleContent.coreWebVitals'), 
      type: t('contentPlanner.guide'),
      status: 'scheduled',
      statusText: t('contentPlanner.scheduled'),
      date: t('contentPlanner.sampleContent.date2')
    },
    { 
      id: 3, 
      title: t('contentPlanner.sampleContent.aiContentGuide'), 
      type: t('contentPlanner.blogPost'),
      status: 'scheduled',
      statusText: t('contentPlanner.scheduled'),
      date: t('contentPlanner.sampleContent.date3')
    },
    { 
      id: 4, 
      title: t('contentPlanner.sampleContent.linkBuildingStrategies'), 
      type: t('contentPlanner.tutorial'),
      status: 'draft',
      statusText: t('contentPlanner.draft'),
      date: '-'
    },
  ];

  const viewTranslations = {
    calendar: t('contentPlanner.calendar'),
    list: t('contentPlanner.list'),
    allContent: t('contentPlanner.allContent'),
    published: t('contentPlanner.published'),
    scheduled: t('contentPlanner.scheduled'),
    draft: t('contentPlanner.draft'),
    dayNames: [
      t('time.sun'), t('time.mon'), t('time.tue'), t('time.wed'), 
      t('time.thu'), t('time.fri'), t('time.sat')
    ],
    months: [
      t('time.january'), t('time.february'), t('time.march'), t('time.april'),
      t('time.may'), t('time.june'), t('time.july'), t('time.august'),
      t('time.september'), t('time.october'), t('time.november'), t('time.december')
    ],
  };

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.pageHeader}>
        <div className={styles.headerContent}>
          <h1 className={styles.pageTitle}>{t('contentPlanner.title')}</h1>
          <p className={styles.pageSubtitle}>
            {t('contentPlanner.subtitle')}
          </p>
        </div>
        <div className={styles.headerActions}>
          <Link href="/dashboard/content-planner/ai-content-wizard">
            <PrimaryActionButton iconName="Sparkles">
              {t('contentPlanner.aiWizard')}
            </PrimaryActionButton>
          </Link>
        </div>
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

      {/* Calendar/List View */}
      <ContentPlannerView 
        translations={viewTranslations} 
        contentItems={contentItems}
      />
    </div>
  );
}

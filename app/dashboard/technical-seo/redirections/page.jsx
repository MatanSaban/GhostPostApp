import { 
  Edit,
  Trash2
} from 'lucide-react';
import { StatsCard } from '@/app/dashboard/components';
import { RedirectForm } from './components';
import { getTranslations } from '@/i18n/server';
import styles from './page.module.css';

const redirects = [
  { from: '/old-blog-post', to: '/blog/new-optimized-post', type: '301', hits: 342 },
  { from: '/products/discontinued', to: '/products', type: '301', hits: 156 },
  { from: '/about-us-old', to: '/about', type: '301', hits: 89 },
  { from: '/temp-promo', to: '/promotions/current', type: '302', hits: 234 },
  { from: '/legacy/api', to: '/api/v2', type: '307', hits: 1024 },
];

export default async function RedirectionsPage() {
  const t = await getTranslations();

  const statsData = [
    { iconName: 'RefreshCw', value: '34', label: t('redirections.activeRedirects'), trend: 'up', trendValue: '+4', color: 'purple' },
    { iconName: 'BarChart2', value: '2,847', label: t('redirections.totalHits'), trend: 'up', trendValue: '+324', color: 'blue' },
    { iconName: 'AlertTriangle', value: '3', label: t('redirections.brokenLinks'), trend: 'down', trendValue: '-5', color: 'orange' },
    { iconName: 'CheckCircle', value: '98%', label: t('redirections.successRate'), trend: 'up', trendValue: '+2%', color: 'green' },
  ];

  const formTranslations = {
    createNew: t('redirections.createNew'),
    fromUrl: t('redirections.fromUrl'),
    fromUrlPlaceholder: t('redirections.fromUrlPlaceholder'),
    toUrl: t('redirections.toUrl'),
    toUrlPlaceholder: t('redirections.toUrlPlaceholder'),
    type: t('redirections.type'),
    permanent: t('redirections.permanent'),
    temporary: t('redirections.temporary'),
    add: t('common.add'),
  };

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.pageHeader}>
        <div className={styles.headerContent}>
          <h1 className={styles.pageTitle}>{t('redirections.title')}</h1>
          <p className={styles.pageSubtitle}>
            {t('redirections.subtitle')}
          </p>
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

      {/* Create Redirect Form */}
      <RedirectForm translations={formTranslations} />

      {/* Redirects Table */}
      <div className={styles.tableCard}>
        <h3 className={styles.cardTitle}>{t('redirections.activeRedirects')}</h3>
        <div className={styles.tableHeader}>
          <span>{t('redirections.from')}</span>
          <span>{t('redirections.to')}</span>
          <span>{t('redirections.type')}</span>
          <span>{t('redirections.hits')}</span>
          <span>{t('common.actions')}</span>
        </div>
        <div className={styles.tableBody}>
          {redirects.map((redirect, index) => (
            <div key={index} className={styles.tableRow}>
              <div className={`${styles.urlCell} ${styles.fromUrl}`}>
                <span className={styles.urlPath}>{redirect.from}</span>
              </div>
              <div className={`${styles.urlCell} ${styles.toUrl}`}>
                <span className={styles.urlPath}>{redirect.to}</span>
              </div>
              <div className={`${styles.cell} ${styles.typeCell}`}>
                <span className={`${styles.typeBadge} ${styles[`type${redirect.type}`]}`}>
                  {redirect.type}
                </span>
              </div>
              <div className={`${styles.cell} ${styles.hitsCell}`}>
                {redirect.hits.toLocaleString()}
              </div>
              <div className={styles.actions}>
                <button className={styles.actionButton}>
                  <Edit size={14} />
                </button>
                <button className={`${styles.actionButton} ${styles.delete}`}>
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

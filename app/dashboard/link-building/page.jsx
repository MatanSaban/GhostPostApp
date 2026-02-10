import { 
  ExternalLink
} from 'lucide-react';
import { getTranslations } from '@/i18n/server';
import { PageHeader, StatsGrid, StatusBadge, PrimaryActionButton } from '../components';
import styles from './page.module.css';

export default async function LinkBuildingPage() {
  const t = await getTranslations();
  
  const statsData = [
    { iconName: 'Link', value: '142', label: t('linkBuilding.stats.totalBacklinks'), trend: 'up', trendValue: '+18', color: 'purple' },
    { iconName: 'ExternalLink', value: '67', label: t('linkBuilding.stats.referringDomains'), trend: 'up', trendValue: '+8', color: 'blue' },
    { iconName: 'TrendingUp', value: '45', label: t('linkBuilding.stats.domainAuthority'), trend: 'up', trendValue: '+3', color: 'green' },
    { iconName: 'Target', value: '23', label: t('linkBuilding.stats.newOpportunities'), trend: 'up', trendValue: '+5', color: 'orange' },
  ];

  const opportunities = [
    { domain: 'techcrunch.com', category: t('linkBuilding.categories.techBlog'), score: 92, scoreLevel: 'high' },
    { domain: 'entrepreneur.com', category: t('linkBuilding.categories.business'), score: 87, scoreLevel: 'high' },
    { domain: 'searchengineland.com', category: t('linkBuilding.categories.seo'), score: 78, scoreLevel: 'medium' },
    { domain: 'hubspot.com', category: t('linkBuilding.categories.marketing'), score: 85, scoreLevel: 'high' },
  ];

  const backlinks = [
    { domain: 'blog.example.com', url: '/guest-post-seo-tips', da: 45, type: t('linkBuilding.types.guestPost'), date: t('linkBuilding.dates.jan15') },
    { domain: 'medium.com', url: '/@user/article-123', da: 92, type: t('linkBuilding.types.mention'), date: t('linkBuilding.dates.jan12') },
    { domain: 'industry-news.com', url: '/best-seo-tools-2024', da: 58, type: t('linkBuilding.types.listicle'), date: t('linkBuilding.dates.jan10') },
    { domain: 'tech-review.net', url: '/ghost-post-review', da: 42, type: t('linkBuilding.types.review'), date: t('linkBuilding.dates.jan8') },
  ];
  
  return (
    <>
      <PageHeader
        title={t('linkBuilding.title')}
        subtitle={t('linkBuilding.subtitle')}
      >
        <PrimaryActionButton iconName="RefreshCw">
          {t('linkBuilding.findOpportunities')}
        </PrimaryActionButton>
      </PageHeader>

      <StatsGrid stats={statsData} />

      {/* Main Grid */}
      <div className={styles.mainGrid}>
        {/* Opportunities */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <div>
              <h3 className={styles.cardTitle}>{t('linkBuilding.opportunities')}</h3>
              <p className={styles.cardSubtitle}>{t('linkBuilding.opportunitiesSubtitle')}</p>
            </div>
          </div>
          <div className={styles.opportunitiesList}>
            {opportunities.map((opp, index) => (
              <div key={index} className={styles.opportunityItem}>
                <div className={styles.opportunityInfo}>
                  <span className={styles.opportunityDomain}>{opp.domain}</span>
                  <span className={styles.opportunityMeta}>{opp.category}</span>
                </div>
                <div className={styles.opportunityScore}>
                  <span className={styles.scoreLabel}>{t('linkBuilding.match')}</span>
                  <span className={`${styles.scoreValue} ${styles[opp.scoreLevel]}`}>
                    {opp.score}%
                  </span>
                </div>
                <button className={styles.contactButton}>
                  <ExternalLink size={12} /> {t('linkBuilding.contact')}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Backlinks */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <div>
              <h3 className={styles.cardTitle}>{t('linkBuilding.recentBacklinks')}</h3>
              <p className={styles.cardSubtitle}>{t('linkBuilding.recentBacklinksSubtitle')}</p>
            </div>
          </div>
          <div className={styles.backlinksTable}>
            <div className={styles.tableHeader}>
              <span>{t('linkBuilding.table.source')}</span>
              <span>{t('linkBuilding.table.da')}</span>
              <span>{t('linkBuilding.table.type')}</span>
              <span>{t('linkBuilding.table.date')}</span>
            </div>
            <div className={styles.tableBody}>
              {backlinks.map((link, index) => (
                <div key={index} className={styles.tableRow}>
                  <div className={styles.domainCell}>
                    <span className={styles.domainName}>{link.domain}</span>
                    <span className={styles.domainUrl}>{link.url}</span>
                  </div>
                  <span className={`${styles.cell} ${styles.daCell}`}>{link.da}</span>
                  <span className={`${styles.cell} ${styles.typeCell}`}>{link.type}</span>
                  <span className={`${styles.cell} ${styles.dateCell}`}>{link.date}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

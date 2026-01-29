import { 
  TrendingUp,
  TrendingDown,
  Minus
} from 'lucide-react';
import { StatsCard, PrimaryActionButton } from '../components';
import { getTranslations } from '@/i18n/server';
import styles from './page.module.css';

const getPositionClass = (position) => {
  if (position <= 3) return 'top3';
  if (position <= 10) return 'top10';
  if (position <= 20) return 'top20';
  return 'below20';
};

export default async function KeywordStrategyPage() {
  const t = await getTranslations();

  const statsData = [
    { iconName: 'Search', value: '156', label: t('keywordStrategy.trackedKeywords'), trend: 'up', trendValue: '+23', color: 'purple' },
    { iconName: 'Target', value: '42', label: t('keywordStrategy.topRankings'), trend: 'up', trendValue: '+8', color: 'green' },
    { iconName: 'BarChart2', value: '3,240', label: t('keywordStrategy.monthlyVolume'), trend: 'up', trendValue: '+456', color: 'blue' },
    { iconName: 'Users', value: '18', label: t('keywordStrategy.opportunities'), trend: 'up', trendValue: '+5', color: 'orange' },
  ];

  const opportunities = [
    { keyword: 'ai seo tools', volume: 2400, difficulty: 'easy', cpc: '$2.50' },
    { keyword: 'automated content creation', volume: 1800, difficulty: 'medium', cpc: '$3.20' },
    { keyword: 'seo automation platform', volume: 890, difficulty: 'easy', cpc: '$4.10' },
    { keyword: 'ai content marketing', volume: 3200, difficulty: 'medium', cpc: '$2.80' },
    { keyword: 'ghost writing software', volume: 1100, difficulty: 'hard', cpc: '$1.90' },
    { keyword: 'seo content generator', volume: 2100, difficulty: 'medium', cpc: '$3.50' },
  ];

  const rankings = [
    { keyword: 'ai seo platform', position: 3, volume: 2400, traffic: 423, trend: 'up', change: '+2' },
    { keyword: 'automated seo tools', position: 7, volume: 1800, traffic: 156, trend: 'up', change: '+5' },
    { keyword: 'content automation', position: 12, volume: 3200, traffic: 89, trend: 'down', change: '-3' },
    { keyword: 'seo ghost writing', position: 5, volume: 890, traffic: 234, trend: 'up', change: '+1' },
    { keyword: 'ai blog generator', position: 18, volume: 4500, traffic: 67, trend: 'stable', change: '0' },
  ];

  const getDifficultyText = (difficulty) => {
    switch (difficulty) {
      case 'easy': return t('keywordStrategy.easy');
      case 'medium': return t('keywordStrategy.medium');
      case 'hard': return t('keywordStrategy.hard');
      default: return difficulty;
    }
  };

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.pageHeader}>
        <div className={styles.headerContent}>
          <h1 className={styles.pageTitle}>{t('keywordStrategy.title')}</h1>
          <p className={styles.pageSubtitle}>
            {t('keywordStrategy.subtitle')}
          </p>
        </div>
        <PrimaryActionButton iconName="Sparkles">
          {t('keywordStrategy.aiResearch')}
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

      {/* Opportunities */}
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <div>
            <h3 className={styles.cardTitle}>{t('keywordStrategy.opportunities')}</h3>
            <p className={styles.cardSubtitle}>{t('keywordStrategy.opportunitiesSubtitle')}</p>
          </div>
        </div>
        <div className={styles.opportunitiesGrid}>
          {opportunities.map((opp, index) => (
            <div key={index} className={styles.opportunityCard}>
              <div className={styles.opportunityKeyword}>{opp.keyword}</div>
              <div className={styles.opportunityMeta}>
                <span className={styles.metaItem}>
                  {t('keywordStrategy.volume')}: <span className={styles.metaValue}>{opp.volume.toLocaleString()}</span>
                </span>
                <span className={styles.metaItem}>
                  {t('keywordStrategy.cpc')}: <span className={styles.metaValue}>{opp.cpc}</span>
                </span>
                <span className={`${styles.difficultyBadge} ${styles[opp.difficulty]}`}>
                  {getDifficultyText(opp.difficulty)}
                </span>
              </div>
              <button className={styles.targetButton}>{t('keywordStrategy.targetKeyword')}</button>
            </div>
          ))}
        </div>
      </div>

      {/* Rankings Table */}
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <div>
            <h3 className={styles.cardTitle}>{t('keywordStrategy.currentRankings')}</h3>
            <p className={styles.cardSubtitle}>{t('keywordStrategy.rankingsSubtitle')}</p>
          </div>
        </div>
        <div className={styles.tableHeader}>
          <span>{t('keywordStrategy.keyword')}</span>
          <span>{t('keywordStrategy.position')}</span>
          <span>{t('keywordStrategy.volume')}</span>
          <span>{t('keywordStrategy.traffic')}</span>
          <span>{t('keywordStrategy.trend')}</span>
        </div>
        <div className={styles.tableBody}>
          {rankings.map((item, index) => {
            const TrendIcon = item.trend === 'up' ? TrendingUp : 
                             item.trend === 'down' ? TrendingDown : Minus;
            return (
              <div key={index} className={styles.tableRow}>
                <div className={styles.keywordCell}>{item.keyword}</div>
                <div className={`${styles.cell} ${styles.positionCell}`}>
                  <span className={`${styles.positionBadge} ${styles[getPositionClass(item.position)]}`}>
                    #{item.position}
                  </span>
                </div>
                <div className={`${styles.cell} ${styles.volumeCell}`}>
                  {item.volume.toLocaleString()}
                </div>
                <div className={`${styles.cell} ${styles.trafficCell}`}>
                  {item.traffic}
                </div>
                <div className={`${styles.cell} ${styles.trendCell}`}>
                  <span className={`${styles.trendIndicator} ${styles[item.trend]}`}>
                    <TrendIcon className={styles.trendIcon} />
                    {item.change}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

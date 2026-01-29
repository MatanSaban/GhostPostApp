import { 
  Activity, 
  TrendingUp, 
  TrendingDown, 
  AlertCircle, 
  Zap, 
  Clock, 
  RefreshCw,
  Play
} from 'lucide-react';
import { getTranslations } from '@/i18n/server';
import styles from './page.module.css';

const vitalData = [
  { metric: 'LCP', nameKey: 'lcp', value: 2.1, threshold: 2.5, unit: 's', status: 'good' },
  { metric: 'FID', nameKey: 'fid', value: 45, threshold: 100, unit: 'ms', status: 'good' },
  { metric: 'CLS', nameKey: 'cls', value: 0.08, threshold: 0.1, unit: '', status: 'good' },
  { metric: 'FCP', nameKey: 'fcp', value: 1.3, threshold: 1.8, unit: 's', status: 'good' },
  { metric: 'TTI', nameKey: 'tti', value: 3.2, threshold: 3.8, unit: 's', status: 'good' },
  { metric: 'TBT', nameKey: 'tbt', value: 180, threshold: 200, unit: 'ms', status: 'warning' },
];

const performanceHistory = [
  { weekKey: 'week1', score: 78 },
  { weekKey: 'week2', score: 82 },
  { weekKey: 'week3', score: 85 },
  { weekKey: 'week4', score: 91 },
];

const recommendations = [
  {
    type: 'warning',
    titleKey: 'optimizeImages',
    descriptionKey: 'optimizeImagesDesc',
    actionKey: 'autoOptimize',
  },
  {
    type: 'info',
    titleKey: 'enableCaching',
    descriptionKey: 'enableCachingDesc',
    actionKey: 'applyFix',
  },
  {
    type: 'suggestion',
    titleKey: 'deferJavascript',
    descriptionKey: 'deferJavascriptDesc',
    actionKey: null,
  },
];

export default async function SiteAuditPage() {
  const t = await getTranslations();
  const performanceScore = 91;
  const circumference = 88 * 2 * Math.PI;
  const strokeDashoffset = circumference * (1 - performanceScore / 100);
  const maxScore = Math.max(...performanceHistory.map(h => h.score));

  return (
    <div className={styles.container}>
      <div className={styles.pageHeader}>
        <div className={styles.headerContent}>
          <h1 className={styles.pageTitle}>{t('siteAudit.title')}</h1>
          <p className={styles.pageSubtitle}>{t('siteAudit.subtitle')}</p>
        </div>
        <button className={styles.runAuditButton}>
          <Play className={styles.buttonIcon} />
          {t('siteAudit.runAudit')}
        </button>
      </div>

      {/* Performance Score */}
      <div className={styles.scoreCard}>
        <div className={styles.scoreWrapper}>
          <div className={styles.scoreRing}>
            <svg className={styles.scoreSvg} viewBox="0 0 192 192">
              <defs>
                <linearGradient id="scoreGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#7B2CBF" />
                  <stop offset="100%" stopColor="#00FF9D" />
                </linearGradient>
              </defs>
              <circle
                className={styles.scoreTrack}
                cx="96"
                cy="96"
                r="88"
              />
              <circle
                className={styles.scoreFill}
                cx="96"
                cy="96"
                r="88"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
              />
            </svg>
            <div className={styles.scoreContent}>
              <div className={styles.scoreValue}>{performanceScore}</div>
              <div className={styles.scoreLabel}>{t('siteAudit.performance')}</div>
            </div>
          </div>
        </div>
        <h2 className={styles.scoreTitle}>{t('siteAudit.excellentPerformance')}</h2>
        <p className={styles.scoreDescription}>{t('siteAudit.performingWell')}</p>
      </div>

      {/* Core Web Vitals */}
      <div className={styles.sectionCard}>
        <div className={styles.sectionHeader}>
          <h3 className={styles.sectionTitle}>{t('siteAudit.coreWebVitals')}</h3>
          <span className={styles.lastUpdated}>
            <RefreshCw className={styles.updateIcon} />
            {t('siteAudit.lastUpdated')}: {t('siteAudit.hoursAgo', { count: 2 })}
          </span>
        </div>
        
        <div className={styles.vitalsGrid}>
          {vitalData.map((vital) => (
            <div key={vital.metric} className={styles.vitalCard}>
              <div className={styles.vitalHeader}>
                <span className={styles.vitalName}>{vital.metric}</span>
                <div className={`${styles.vitalStatus} ${styles[vital.status]}`}></div>
              </div>
              <div className={styles.vitalValue}>
                {vital.value}
                <span className={styles.vitalUnit}>{vital.unit}</span>
              </div>
              <div className={styles.vitalThreshold}>
                {t('siteAudit.threshold')}: {vital.threshold}{vital.unit}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Performance Trend */}
      <div className={styles.sectionCard}>
        <div className={styles.sectionHeader}>
          <div>
            <h3 className={styles.sectionTitle}>{t('siteAudit.performanceTrend')}</h3>
            <p style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)', marginTop: '0.25rem' }}>
              {t('siteAudit.lastWeeks')}
            </p>
          </div>
          <div className={`${styles.trendBadge} ${styles.positive}`}>
            <TrendingUp className={styles.trendIcon} />
            {t('siteAudit.trendPercent')}
          </div>
        </div>
        
        <div className={styles.chartContainer}>
          <div className={styles.chartPlaceholder}>
            <div className={styles.chartBars}>
              {performanceHistory.map((item, index) => (
                <div 
                  key={index} 
                  className={styles.chartBar}
                  style={{ height: `${(item.score / maxScore) * 100}%` }}
                ></div>
              ))}
            </div>
            <div className={styles.chartLabels}>
              {performanceHistory.map((item, index) => (
                <span key={index}>{t(`siteAudit.weeks.${item.weekKey}`)}</span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* AI Recommendations */}
      <div className={styles.sectionCard}>
        <div className={styles.sectionHeader}>
          <h3 className={styles.sectionTitle}>{t('siteAudit.recommendations')}</h3>
        </div>
        
        <div className={styles.recommendationsList}>
          {recommendations.map((rec, index) => (
            <div key={index} className={`${styles.recommendationCard} ${styles[rec.type]}`}>
              {rec.type === 'warning' ? (
                <AlertCircle className={`${styles.recommendationIcon} ${styles.warning}`} />
              ) : rec.type === 'info' ? (
                <Zap className={`${styles.recommendationIcon} ${styles.info}`} />
              ) : (
                <Clock className={`${styles.recommendationIcon} ${styles.suggestion}`} />
              )}
              <div className={styles.recommendationContent}>
                <h4 className={styles.recommendationTitle}>{t(`siteAudit.recommendationTitles.${rec.titleKey}`)}</h4>
                <p className={styles.recommendationDescription}>{t(`siteAudit.recommendationDescriptions.${rec.descriptionKey}`)}</p>
                {rec.actionKey && (
                  <button className={`${styles.recommendationAction} ${styles[rec.type]}`}>
                    {t(`siteAudit.${rec.actionKey}`)}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

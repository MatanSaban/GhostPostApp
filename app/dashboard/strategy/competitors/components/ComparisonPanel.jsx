'use client';

import { Zap, TrendingUp, Loader2 } from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import { DashboardCard, PrimaryActionButton } from '@/app/dashboard/components';
import styles from '../competitors.module.css';

export function ComparisonPanel({
  selectedCompetitor,
  comparisonData,
  comparing,
  userPageUrl,
  setUserPageUrl,
  onCompare,
}) {
  const { t } = useLocale();

  if (!selectedCompetitor) return null;

  return (
    <DashboardCard
      title={t('competitorAnalysis.headToHead')}
      subtitle={t('competitorAnalysis.headToHeadDescription')}
    >
      <div className={styles.compareForm}>
        <input
          type="url"
          value={userPageUrl}
          onChange={(e) => setUserPageUrl(e.target.value)}
          placeholder={t('competitorAnalysis.selectPageToCompare')}
          className={styles.urlInput}
        />
        <button
          className={styles.compareButton}
          onClick={onCompare}
          disabled={!userPageUrl || comparing}
        >
          {comparing ? (
            <Loader2 className={styles.spinIcon} size={16} />
          ) : (
            <>
              <Zap size={16} />
              {t('competitorAnalysis.compare')}
            </>
          )}
        </button>
      </div>

      {comparisonData && (
        <div className={styles.comparisonResults}>
          <div className={styles.comparisonHeader}>
            <div className={styles.comparisonColumn}>
              <span className={styles.columnLabel}>{t('competitorAnalysis.yourPage')}</span>
              <span className={styles.columnTitle}>{comparisonData.comparison.user.title}</span>
            </div>
            <div className={styles.vsIndicator}>VS</div>
            <div className={styles.comparisonColumn}>
              <span className={styles.columnLabel}>{t('competitorAnalysis.competitorPage')}</span>
              <span className={styles.columnTitle}>{comparisonData.comparison.competitor.title}</span>
            </div>
          </div>

          <div className={styles.metricsComparison}>
            {Object.entries(comparisonData.comparison.metrics).map(([key, metric]) => {
              if (key === 'overall') return null;
              const labels = {
                wordCount: t('competitorAnalysis.wordCount'),
                h1Count: t('competitorAnalysis.h1Count'),
                h2Count: t('competitorAnalysis.h2Count'),
                h3Count: t('competitorAnalysis.h3Count'),
                imageCount: t('competitorAnalysis.images'),
                videoCount: t('competitorAnalysis.videos'),
                ttfb: t('competitorAnalysis.speed'),
              };

              return (
                <div key={key} className={styles.metricComparison}>
                  <span className={styles.metricName}>{labels[key] || key}</span>
                  <div className={styles.metricValues}>
                    <span className={`${styles.metricValue} ${metric.winner === 'user' ? styles.winner : ''}`}>
                      {metric.user}
                      {metric.winner === 'user' && <TrendingUp size={14} />}
                    </span>
                    <span className={styles.metricDivider}>vs</span>
                    <span className={`${styles.metricValue} ${metric.winner === 'competitor' ? styles.winner : ''}`}>
                      {metric.competitor}
                      {metric.winner === 'competitor' && <TrendingUp size={14} />}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {comparisonData.contentGaps?.gaps?.length > 0 && (
            <div className={styles.contentGaps}>
              <h4>{t('competitorAnalysis.contentGapAnalysis')}</h4>
              <p className={styles.gapDescription}>{t('competitorAnalysis.contentGapDescription')}</p>
              <div className={styles.gapsList}>
                {comparisonData.contentGaps.gaps.map((gap, index) => (
                  <div key={index} className={styles.gapItem}>
                    <span className={`${styles.gapBadge} ${styles[gap.importance]}`}>
                      {t(`competitorAnalysis.gapImportance.${gap.importance === 'nice-to-have' ? 'niceToHave' : gap.importance}`)}
                    </span>
                    <span className={styles.gapTopic}>{gap.topic}</span>
                    <span className={styles.gapReason}>{gap.reason}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className={styles.skyscraperCta}>
            <div className={styles.skyscraperInfo}>
              <Zap size={24} />
              <div>
                <h4>{t('competitorAnalysis.skyscraper')}</h4>
                <p>{t('competitorAnalysis.skyscraperDescription')}</p>
              </div>
            </div>
            <PrimaryActionButton iconName="Sparkles">
              {t('competitorAnalysis.generateOutline')}
            </PrimaryActionButton>
          </div>
        </div>
      )}
    </DashboardCard>
  );
}

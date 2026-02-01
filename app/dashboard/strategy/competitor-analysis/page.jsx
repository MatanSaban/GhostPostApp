'use client';

import { useState } from 'react';
import { 
  Users, 
  Search, 
  Plus,
  TrendingUp,
  TrendingDown,
  ExternalLink,
  BarChart3,
  Target,
} from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import { useSite } from '@/app/context/site-context';
import styles from './competitor-analysis.module.css';

export default function CompetitorAnalysisPage() {
  const { t } = useLocale();
  const { selectedSite } = useSite();
  const [competitors, setCompetitors] = useState([]);

  if (!selectedSite) {
    return (
      <div className={styles.container}>
        <div className={styles.emptyState}>
          <Users className={styles.emptyIcon} />
          <p>{t('competitorAnalysis.selectSite')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h1 className={styles.title}>{t('competitorAnalysis.title')}</h1>
          <p className={styles.subtitle}>{t('competitorAnalysis.subtitle')}</p>
        </div>
        <button className={styles.addButton}>
          <Plus className={styles.buttonIcon} />
          {t('competitorAnalysis.addCompetitor')}
        </button>
      </div>

      {/* Stats Overview */}
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statIcon}>
            <Users />
          </div>
          <div className={styles.statContent}>
            <span className={styles.statValue}>0</span>
            <span className={styles.statLabel}>{t('competitorAnalysis.trackedCompetitors')}</span>
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statIcon}>
            <Target />
          </div>
          <div className={styles.statContent}>
            <span className={styles.statValue}>0</span>
            <span className={styles.statLabel}>{t('competitorAnalysis.sharedKeywords')}</span>
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statIcon}>
            <BarChart3 />
          </div>
          <div className={styles.statContent}>
            <span className={styles.statValue}>0</span>
            <span className={styles.statLabel}>{t('competitorAnalysis.contentGaps')}</span>
          </div>
        </div>
      </div>

      {/* Empty State */}
      <div className={styles.emptyState}>
        <Users className={styles.emptyIcon} />
        <h3 className={styles.emptyTitle}>{t('competitorAnalysis.noCompetitors')}</h3>
        <p className={styles.emptyDescription}>{t('competitorAnalysis.noCompetitorsDescription')}</p>
        <button className={styles.addButton}>
          <Plus className={styles.buttonIcon} />
          {t('competitorAnalysis.addFirstCompetitor')}
        </button>
      </div>
    </div>
  );
}

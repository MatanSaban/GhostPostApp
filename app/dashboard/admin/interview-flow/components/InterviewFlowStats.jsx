'use client';

import { useLocale } from '@/app/context/locale-context';
import styles from '../../admin.module.css';

export default function InterviewFlowStats({ questions, botActions }) {
  const { t } = useLocale();
  
  return (
    <div className={styles.statsGrid}>
      <div className={styles.statCard}>
        <div className={styles.statLabel}>{t('admin.stats.totalQuestions')}</div>
        <div className={styles.statValue}>{questions.length}</div>
      </div>
      <div className={styles.statCard}>
        <div className={styles.statLabel}>{t('admin.stats.activeQuestions')}</div>
        <div className={styles.statValue}>{questions.filter(q => q.isActive).length}</div>
      </div>
      <div className={styles.statCard}>
        <div className={styles.statLabel}>{t('admin.stats.botActions')}</div>
        <div className={styles.statValue}>{botActions.length}</div>
      </div>
      <div className={styles.statCard}>
        <div className={styles.statLabel}>{t('admin.stats.questionTypes')}</div>
        <div className={styles.statValue}>{new Set(questions.map(q => q.questionType)).size}</div>
      </div>
    </div>
  );
}

'use client';

import { Sparkles, Zap, Clock, TrendingUp } from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import styles from '../competitors.module.css';

export function DiscoveryConfirmModal({ onClose, onConfirm }) {
  const { t } = useLocale();

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.confirmModal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.confirmHeader}>
          <div className={styles.confirmIcon}>
            <Sparkles size={28} />
          </div>
          <h3>{t('competitorAnalysis.discoverCompetitors')}</h3>
        </div>

        <div className={styles.confirmContent}>
          <p className={styles.confirmDescription}>
            {t('competitorAnalysis.discoverConfirmDescription')}
          </p>

          <div className={styles.confirmDetails}>
            <div className={styles.confirmDetail}>
              <div className={styles.confirmDetailIcon}>
                <Zap size={18} />
              </div>
              <div className={styles.confirmDetailText}>
                <strong>{t('competitorAnalysis.creditsUsed')}</strong>
                <span>~2-3 {t('settings.credits.credits')}</span>
              </div>
            </div>

            <div className={styles.confirmDetail}>
              <div className={styles.confirmDetailIcon}>
                <Clock size={18} />
              </div>
              <div className={styles.confirmDetailText}>
                <strong>{t('competitorAnalysis.estimatedTime')}</strong>
                <span>15-30 {t('common.seconds')}</span>
              </div>
            </div>

            <div className={styles.confirmDetail}>
              <div className={styles.confirmDetailIcon}>
                <TrendingUp size={18} />
              </div>
              <div className={styles.confirmDetailText}>
                <strong>{t('competitorAnalysis.whatYouGet')}</strong>
                <span>{t('competitorAnalysis.whatYouGetDescription')}</span>
              </div>
            </div>
          </div>

          <div className={styles.confirmSteps}>
            <h4>{t('competitorAnalysis.howItWorks')}</h4>
            <ol>
              <li>{t('competitorAnalysis.step1')}</li>
              <li>{t('competitorAnalysis.step2')}</li>
              <li>{t('competitorAnalysis.step3')}</li>
            </ol>
          </div>
        </div>

        <div className={styles.confirmFooter}>
          <button className={styles.confirmCancel} onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className={styles.confirmStart} onClick={onConfirm}>
            <Sparkles size={16} />
            {t('competitorAnalysis.startDiscovery')}
          </button>
        </div>
      </div>
    </div>
  );
}

'use client';

import { createPortal } from 'react-dom';
import { Sparkles, X, Loader2, AlertCircle, Check, ExternalLink } from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import styles from '../competitors.module.css';

export function DiscoveryModal({
  discovering,
  discoveredCompetitors,
  selectedDiscovered,
  addingDiscovered,
  discoveryInfo,
  onToggleSelection,
  onAddSelected,
  onClose,
}) {
  const { t } = useLocale();

  return createPortal(
    <div className={styles.modalOverlay} onClick={() => !discovering && onClose()}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div className={styles.modalTitle}>
            <Sparkles size={20} />
            <h3>{t('competitorAnalysis.discoverCompetitors')}</h3>
          </div>
          <button
            className={styles.modalClose}
            onClick={onClose}
            disabled={discovering}
          >
            <X size={20} />
          </button>
        </div>

        <div className={styles.modalContent}>
          {discovering ? (
            <div className={styles.discoveringState}>
              <Loader2 className={styles.spinIcon} size={40} />
              <p>{t('competitorAnalysis.discoveringCompetitors')}</p>
              <span className={styles.discoveringHint}>
                {t('competitorAnalysis.findWithAIDescription')}
              </span>
            </div>
          ) : discoveredCompetitors.length > 0 ? (
            <>
              {discoveryInfo && (
                <div className={styles.discoveryInfo}>
                  {discoveryInfo.mainTopic && (
                    <div className={styles.mainTopic}>
                      <strong>{t('competitorAnalysis.mainTopic')}:</strong> {discoveryInfo.mainTopic}
                    </div>
                  )}
                  {discoveryInfo.keywordsSearched?.length > 0 && (
                    <div className={styles.keywordsSearched}>
                      <strong>{t('competitorAnalysis.keywordsSearched')}:</strong>{' '}
                      {discoveryInfo.keywordsSearched.map((kw, i) => (
                        <span key={i} className={styles.keywordTag}>{kw}</span>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <p className={styles.discoveredDescription}>
                {t('competitorAnalysis.discoveredDescription')}
              </p>
              <div className={styles.discoveredList}>
                {discoveredCompetitors.map((comp) => (
                  <div
                    key={comp.domain}
                    className={`${styles.discoveredItem} ${selectedDiscovered.has(comp.domain) ? styles.selected : ''}`}
                    onClick={() => onToggleSelection(comp.domain)}
                  >
                    <div className={styles.discoveredCheck}>
                      {selectedDiscovered.has(comp.domain) ? (
                        <Check size={16} />
                      ) : (
                        <div className={styles.emptyCheck} />
                      )}
                    </div>
                    <img
                      src={`https://www.google.com/s2/favicons?domain=${comp.domain}&sz=64`}
                      alt=""
                      className={styles.discoveredFavicon}
                      onError={(e) => { e.target.style.display = 'none'; }}
                    />
                    <div className={styles.discoveredInfo}>
                      <span className={styles.discoveredDomain}>{comp.domain}</span>
                      <span className={styles.discoveredMeta}>
                        {t('competitorAnalysis.foundInKeywords').replace('{count}', String(comp.keywordCount))}
                        {' • '}{t('competitorAnalysis.avgRank')}: #{comp.averageRank?.toFixed(1)}
                      </span>
                    </div>
                    <a
                      href={comp.url || `https://${comp.domain}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.discoveredLink}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ExternalLink size={14} />
                    </a>
                    <div className={styles.discoveredScore}>
                      <span className={styles.scoreValue}>{comp.totalScore}</span>
                      <span className={styles.scoreLabel}>{t('competitorAnalysis.competitorScore')}</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className={styles.noResultsState}>
              <AlertCircle size={40} />
              <p>{t('competitorAnalysis.noKeywordsForDiscovery')}</p>
            </div>
          )}
        </div>

        {discoveredCompetitors.length > 0 && !discovering && (
          <div className={styles.modalFooter}>
            <span className={styles.selectedCount}>
              {t('competitorAnalysis.selected').replace('{count}', selectedDiscovered.size)}
            </span>
            <button
              className={styles.addSelectedButton}
              onClick={onAddSelected}
              disabled={selectedDiscovered.size === 0 || addingDiscovered}
            >
              {addingDiscovered ? (
                <Loader2 className={styles.spinIcon} size={16} />
              ) : (
                <>
                  <Check size={16} />
                  {t('competitorAnalysis.addSelected')}
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

'use client';

import { useState } from 'react';
import { Check, Plus, X, Globe, ExternalLink } from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import styles from '../auth.module.css';

/**
 * CompetitorSelector component
 * Allows user to select from discovered competitors and add new ones
 */
export function CompetitorSelector({ 
  competitors = [], 
  selectedCompetitors = [],
  onSelectionChange,
  maxSelections = 5 
}) {
  const { t, locale } = useLocale();
  const [newUrl, setNewUrl] = useState('');
  const [showAddInput, setShowAddInput] = useState(false);
  const [error, setError] = useState(null);

  const isRTL = locale === 'he';

  const handleToggleCompetitor = (competitor) => {
    const isSelected = selectedCompetitors.some(c => c.url === competitor.url);
    
    if (isSelected) {
      onSelectionChange(selectedCompetitors.filter(c => c.url !== competitor.url));
    } else {
      if (selectedCompetitors.length >= maxSelections) {
        setError(t('interviewWizard.competitors.maxReached', { max: maxSelections }));
        return;
      }
      onSelectionChange([...selectedCompetitors, competitor]);
    }
    setError(null);
  };

  const handleAddCompetitor = () => {
    if (!newUrl.trim()) return;

    // Normalize URL
    let url = newUrl.trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }

    // Validate URL
    try {
      new URL(url);
    } catch {
      setError(t('interviewWizard.competitors.invalidUrl'));
      return;
    }

    // Check if already exists
    if (selectedCompetitors.some(c => c.url === url) || 
        competitors.some(c => c.url === url)) {
      setError(t('interviewWizard.competitors.alreadyExists'));
      return;
    }

    // Extract domain for display
    const domain = new URL(url).hostname.replace('www.', '');

    const newCompetitor = {
      url,
      domain,
      name: domain,
      isManual: true,
    };

    if (selectedCompetitors.length >= maxSelections) {
      setError(t('interviewWizard.competitors.maxReached', { max: maxSelections }));
      return;
    }

    onSelectionChange([...selectedCompetitors, newCompetitor]);
    setNewUrl('');
    setShowAddInput(false);
    setError(null);
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddCompetitor();
    }
  };

  return (
    <div className={styles.competitorSelectorContainer}>
      {/* Discovered Competitors */}
      {competitors.length > 0 && (
        <div className={styles.competitorList}>
          {competitors.map((competitor, index) => {
            const isSelected = selectedCompetitors.some(c => c.url === competitor.url);
            
            return (
              <div
                key={competitor.url || index}
                className={`${styles.competitorItem} ${isSelected ? styles.competitorSelected : ''}`}
                onClick={() => handleToggleCompetitor(competitor)}
              >
                <div className={styles.competitorCheckbox}>
                  {isSelected ? (
                    <Check size={16} className={styles.competitorCheckIcon} />
                  ) : (
                    <div className={styles.competitorCheckEmpty} />
                  )}
                </div>
                
                <div className={styles.competitorInfo}>
                  <div className={styles.competitorIcon}>
                    <Globe size={16} />
                  </div>
                  <div className={styles.competitorDetails}>
                    <span className={styles.competitorDomain}>
                      {competitor.domain || competitor.name}
                    </span>
                    {competitor.ranking && (
                      <span className={styles.competitorRanking}>
                        #{competitor.ranking} {t('interviewWizard.competitors.inSearch')}
                      </span>
                    )}
                  </div>
                </div>

                <a
                  href={competitor.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.competitorLink}
                  onClick={(e) => e.stopPropagation()}
                >
                  <ExternalLink size={14} />
                </a>
              </div>
            );
          })}
        </div>
      )}

      {/* Selected Manual Competitors */}
      {selectedCompetitors.filter(c => c.isManual).length > 0 && (
        <div className={styles.competitorManualList}>
          <span className={styles.competitorManualLabel}>
            {t('interviewWizard.competitors.manuallyAdded')}:
          </span>
          {selectedCompetitors.filter(c => c.isManual).map((competitor) => (
            <div key={competitor.url} className={styles.competitorManualItem}>
              <Globe size={14} />
              <span>{competitor.domain}</span>
              <button
                type="button"
                className={styles.competitorRemoveBtn}
                onClick={() => handleToggleCompetitor(competitor)}
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add New Competitor */}
      <div className={styles.competitorAddSection}>
        {showAddInput ? (
          <div className={styles.competitorAddInput}>
            <input
              type="url"
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder={t('interviewWizard.competitors.urlPlaceholder')}
              className={styles.competitorUrlInput}
              autoFocus
              dir={isRTL ? 'ltr' : 'ltr'} // URLs are always LTR
            />
            <button
              type="button"
              className={styles.competitorAddBtn}
              onClick={handleAddCompetitor}
            >
              <Plus size={16} />
              {t('interviewWizard.competitors.add')}
            </button>
            <button
              type="button"
              className={styles.competitorCancelBtn}
              onClick={() => {
                setShowAddInput(false);
                setNewUrl('');
                setError(null);
              }}
            >
              <X size={16} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            className={styles.competitorShowAddBtn}
            onClick={() => setShowAddInput(true)}
          >
            <Plus size={16} />
            {t('interviewWizard.competitors.addManually')}
          </button>
        )}
      </div>

      {/* Error Message */}
      {error && (
        <div className={styles.competitorError}>
          {error}
        </div>
      )}

      {/* Selection Count */}
      <div className={styles.competitorCount}>
        {t('interviewWizard.competitors.selected', { 
          count: selectedCompetitors.length, 
          max: maxSelections 
        })}
      </div>
    </div>
  );
}

export default CompetitorSelector;

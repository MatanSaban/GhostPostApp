'use client';

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Globe, Loader2, Check, AlertCircle, Plus, Sparkles } from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import { useSite } from '@/app/context/site-context';
import { handleLimitError } from '@/app/context/limit-guard-context';
import { InterviewWizard } from './interview-wizard';
import styles from './AddSiteModal.module.css';

// Platform display labels
const PLATFORM_LABELS = {
  wordpress: 'WordPress',
  shopify: 'Shopify',
  wix: 'Wix',
  squarespace: 'Squarespace',
  webflow: 'Webflow',
  drupal: 'Drupal',
  joomla: 'Joomla',
  custom: 'Custom Code',
};

/**
 * Reusable Add Website Modal component.
 *
 * @param {Object} props
 * @param {boolean} props.isOpen - Whether the modal is visible.
 * @param {() => void} props.onClose - Called when the modal should close.
 * @param {(site: object) => void} [props.onSiteAdded] - Optional callback after a site is successfully created.
 *   Receives the new site object. If not provided, the site is still added to the site context.
 * @param {boolean} [props.autoSelect=false] - If true, auto-select the newly created site via /api/sites/select.
 * @param {boolean} [props.showInterviewOnCreate=false] - If true, show the InterviewWizard popup after creating a site.
 */
export function AddSiteModal({ isOpen, onClose, onSiteAdded, autoSelect = false, showInterviewOnCreate = false }) {
  const { t } = useLocale();
  const { setSites, setSelectedSite } = useSite();

  const [newSiteUrl, setNewSiteUrl] = useState('');
  const [newSiteName, setNewSiteName] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [validationResult, setValidationResult] = useState(null);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState(null);
  const [isSuggestingName, setIsSuggestingName] = useState(false);
  const [interviewSite, setInterviewSite] = useState(null);
  const urlInputRef = useRef(null);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setNewSiteUrl('');
      setNewSiteName('');
      setValidationResult(null);
      setCreateError(null);
      setIsValidating(false);
      setIsCreating(false);
      setIsSuggestingName(false);
    }
  }, [isOpen]);

  // Focus URL input when modal opens
  useEffect(() => {
    if (isOpen && urlInputRef.current) {
      // Small delay to allow for animation
      const timer = setTimeout(() => urlInputRef.current?.focus(), 100);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const handleClose = () => {
    if (!isCreating) {
      onClose();
    }
  };

  const validateUrl = async () => {
    if (!newSiteUrl.trim()) return;

    setIsValidating(true);
    setValidationResult(null);
    setCreateError(null);

    try {
      let url = newSiteUrl.trim();
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
        setNewSiteUrl(url);
      }

      const response = await fetch('/api/sites/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });

      const data = await response.json();
      setValidationResult(data);

      // Auto-fill name if detected
      if (data.valid && data.siteName && !newSiteName) {
        setNewSiteName(data.siteName);
      }
    } catch (error) {
      setValidationResult({ valid: false, error: t('sites.add.validationFailed') });
    } finally {
      setIsValidating(false);
    }
  };

  const handleCreateSite = async () => {
    if (!validationResult?.valid || !newSiteName.trim()) return;

    setIsCreating(true);
    setCreateError(null);

    try {
      // Strip protocol and trailing slash for a clean URL
      const cleanUrl = newSiteUrl.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '');

      const response = await fetch('/api/sites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newSiteName.trim(),
          url: cleanUrl,
          platform: validationResult.platform || null,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        if (handleLimitError(data)) {
          onClose();
          return;
        }
        throw new Error(data.error || 'Failed to create site');
      }

      const data = await response.json();

      // Add to sites list
      setSites(prevSites => [...prevSites, data.site]);

      // Auto-select if requested
      if (autoSelect) {
        setSelectedSite(data.site);
        try {
          await fetch('/api/sites/select', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ siteId: data.site.id }),
          });
        } catch (err) {
          console.error('Failed to persist site selection:', err);
        }
      }

      // Notify parent
      onSiteAdded?.(data.site);
      onClose();

      // Show interview wizard if requested
      if (showInterviewOnCreate) {
        setInterviewSite(data.site);
      }
    } catch (error) {
      setCreateError(error.message);
    } finally {
      setIsCreating(false);
    }
  };

  const handleUrlKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      validateUrl();
    }
  };

  const suggestNameWithAI = async () => {
    if (!validationResult?.valid || !newSiteUrl.trim()) return;

    setIsSuggestingName(true);
    try {
      const response = await fetch('/api/sites/suggest-name', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: newSiteUrl.trim(),
          pageTitle: validationResult.siteName || null,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        if (errorData && handleLimitError(errorData)) {
          setIsSuggestingName(false);
          return;
        }
        throw new Error('Failed to suggest name');
      }

      const data = await response.json();
      if (data.suggestedName) {
        setNewSiteName(data.suggestedName);
      }
    } catch (error) {
      console.error('AI name suggestion failed:', error);
    } finally {
      setIsSuggestingName(false);
    }
  };

  if (!isOpen && !interviewSite) return null;

  // When the add-modal is closed but we need to show the interview wizard
  if (!isOpen && interviewSite) {
    return (
      <InterviewWizard
        onClose={() => setInterviewSite(null)}
        onComplete={() => setInterviewSite(null)}
        site={interviewSite}
      />
    );
  }

  return createPortal(
    <div className={styles.modalOverlay} onClick={handleClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h3 className={styles.modalTitle}>{t('sites.add.title')}</h3>
          <button className={styles.modalClose} onClick={handleClose}>
            <X size={20} />
          </button>
        </div>

        <div className={styles.modalBody}>
          {/* Step 1: URL Input */}
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>{t('sites.add.urlLabel')}</label>
            <div className={styles.urlInputWrapper}>
              <Globe className={styles.urlIcon} size={18} />
              <input
                ref={urlInputRef}
                type="text"
                value={newSiteUrl}
                onChange={(e) => {
                  setNewSiteUrl(e.target.value);
                  setValidationResult(null);
                }}
                onKeyDown={handleUrlKeyDown}
                placeholder={t('sites.add.urlPlaceholder')}
                className={styles.urlInput}
                disabled={isValidating}
              />
              <button
                className={styles.validateButton}
                onClick={validateUrl}
                disabled={!newSiteUrl.trim() || isValidating}
              >
                {isValidating ? (
                  <Loader2 className={styles.spinningIcon} size={18} />
                ) : (
                  t('sites.add.validate')
                )}
              </button>
            </div>
            <p className={styles.formHint}>{t('sites.add.urlHint')}</p>
          </div>

          {/* Validation Result */}
          {validationResult && (
            <div className={`${styles.validationResult} ${validationResult.valid ? styles.valid : styles.invalid}`}>
              {validationResult.valid ? (
                <>
                  <Check size={18} />
                  <span>{t('sites.add.validUrl')}</span>
                  {validationResult.platform && (
                    <span className={`${styles.platformBadge} ${validationResult.platform !== 'wordpress' ? styles.platformBadgeWarning : ''}`}>
                      {PLATFORM_LABELS[validationResult.platform] || validationResult.platform}
                    </span>
                  )}
                </>
              ) : (
                <>
                  <AlertCircle size={18} />
                  <span>{validationResult.error || t('sites.add.invalidUrl')}</span>
                </>
              )}
            </div>
          )}

          {/* Non-WordPress warning */}
          {validationResult?.valid && validationResult.platform && validationResult.platform !== 'wordpress' && (
            <div className={styles.platformWarning}>
              <AlertCircle size={16} />
              <span>{t('sites.add.nonWordPressWarning')}</span>
            </div>
          )}

          {/* Step 2: Name Input (only after valid URL) */}
          {validationResult?.valid && (
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>{t('sites.add.nameLabel')}</label>
              <div className={styles.nameInputWrapper}>
                <input
                  type="text"
                  value={newSiteName}
                  onChange={(e) => setNewSiteName(e.target.value)}
                  placeholder={t('sites.add.namePlaceholder')}
                  className={styles.nameInput}
                />
                <button
                  type="button"
                  className={styles.aiSuggestButton}
                  onClick={suggestNameWithAI}
                  disabled={isSuggestingName}
                  title={t('sites.add.aiSuggest')}
                >
                  {isSuggestingName ? (
                    <Loader2 className={styles.spinningIcon} size={16} />
                  ) : (
                    <Sparkles size={16} />
                  )}
                  <span>{t('sites.add.aiSuggest')}</span>
                </button>
              </div>
            </div>
          )}

          {/* Error */}
          {createError && (
            <div className={styles.errorMessage}>
              <AlertCircle size={16} />
              <span>{createError}</span>
            </div>
          )}
        </div>

        <div className={styles.modalFooter}>
          <button className={styles.cancelButton} onClick={handleClose}>
            {t('common.cancel')}
          </button>
          <button
            className={styles.createButton}
            onClick={handleCreateSite}
            disabled={!validationResult?.valid || !newSiteName.trim() || isCreating}
          >
            {isCreating ? (
              <>
                <Loader2 className={styles.spinningIcon} size={16} />
                {t('sites.add.creating')}
              </>
            ) : (
              <>
                <Plus size={16} />
                {t('sites.add.create')}
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

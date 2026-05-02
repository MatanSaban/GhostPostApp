'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Sparkles, Loader2, ImageIcon, RotateCcw, AlertCircle } from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import { useUser } from '@/app/context/user-context';
import { Button } from '@/app/dashboard/components';
import AddCreditsModal from '@/app/components/ui/AddCreditsModal';
import styles from './AIRegenerateModal.module.css';
import GCoinIcon from '@/app/components/ui/GCoinIcon';
import { REGENERATE_COST } from './useAIRegenerationJob';

const LANGUAGE_OPTIONS = [
  { code: 'en', label: 'English' },
  { code: 'he', label: 'עברית' },
  { code: 'ar', label: 'العربية' },
  { code: 'fr', label: 'Français' },
  { code: 'es', label: 'Español' },
  { code: 'de', label: 'Deutsch' },
  { code: 'pt', label: 'Português' },
  { code: 'ru', label: 'Русский' },
  { code: 'it', label: 'Italiano' },
];

/**
 * Controlled view of the AI regeneration job. The job state lives in the
 * parent (page.jsx) via {@link useAIRegenerationJob}, so closing this modal
 * mid-generation does NOT cancel the job - the page-level pill picks it up
 * and reopens the modal when the user wants to act on the result.
 */
export function AIRegenerateModal({ isOpen, onClose, job }) {
  const { t } = useLocale();
  const { user } = useUser();
  const [showAddCreditsModal, setShowAddCreditsModal] = useState(false);

  // Once the user tops up enough credits, drop the insufficient-credits banner.
  useEffect(() => {
    if (!job?.insufficientCredits) return;
    const limit = user?.aiCreditsLimit;
    const used = user?.aiCreditsUsed || 0;
    const remaining = limit == null ? Infinity : limit - used;
    if (remaining >= job.insufficientCredits.required) {
      job.clearInsufficientCredits();
    }
  }, [user?.aiCreditsLimit, user?.aiCreditsUsed, job]);

  // ESC closes the modal. Generation/replace continue in the background -
  // unlike before, we no longer block close while a job is in flight.
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  // Prevent background scroll while open
  useEffect(() => {
    if (!isOpen) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = original; };
  }, [isOpen]);

  if (!isOpen || !job?.target) return null;

  const {
    target,
    targetIsBroken: isBroken,
    instructions,
    aspectRatio,
    status,
    error,
    insufficientCredits,
    generated,
    setInstructions,
    setAspectRatio,
    setChosenLanguage,
    generate,
    acceptAndReplace,
    tryAgain,
  } = job;

  const existingAlt = target.alt_text || '';
  const existingTitle = target.title?.rendered || target.slug || '';
  const existingCaption = target.caption?.rendered?.replace(/<[^>]*>/g, '') || '';
  const existingDescription = target.description?.rendered?.replace(/<[^>]*>/g, '') || '';
  const hasMetadata = !!(existingAlt || existingTitle || existingCaption || existingDescription);
  const canGenerate = !isBroken || hasMetadata || instructions.trim().length > 0;

  const handleLanguageSubmit = (lang) => {
    setChosenLanguage(lang);
    generate(lang);
  };

  const generatedImageSrc = generated
    ? `data:${generated.mimeType};base64,${generated.base64}`
    : null;

  return createPortal(
    <>
    <div
      className={styles.overlay}
      onClick={(e) => {
        // Clicking the dim background closes the modal even mid-generation;
        // the job keeps running and the header pill takes over.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div className={styles.titleWrap}>
            <Sparkles className={styles.titleIcon} />
            <h2 className={styles.title}>
              {isBroken ? t('media.ai.titleGenerate') : t('media.ai.titleRegenerate')}
            </h2>
            <span className={styles.costBadge}>{t('media.ai.cost', { credits: REGENERATE_COST })}</span>
          </div>
          <button
            className={styles.closeButton}
            onClick={onClose}
            aria-label={t('common.close')}
          >
            <X />
          </button>
        </div>

        <div className={styles.body}>
          {status === 'needsLanguage' && (
            <div className={styles.section}>
              <div className={styles.infoBox}>
                <AlertCircle className={styles.infoIcon} />
                <div>
                  <div className={styles.infoTitle}>{t('media.ai.languageNeededTitle')}</div>
                  <div className={styles.infoText}>{t('media.ai.languageNeededBody')}</div>
                </div>
              </div>
              <div className={styles.languageGrid}>
                {LANGUAGE_OPTIONS.map((opt) => (
                  <button
                    key={opt.code}
                    type="button"
                    className={styles.languageButton}
                    onClick={() => handleLanguageSubmit(opt.code)}
                  >
                    {opt.label}
                    <span className={styles.languageCode}>{opt.code.toUpperCase()}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {status !== 'needsLanguage' && (
            <>
              {/* Context summary */}
              <div className={styles.section}>
                <div className={styles.sectionLabel}>{t('media.ai.contextLabel')}</div>
                <div className={styles.contextCard}>
                  <div className={styles.contextThumb}>
                    {!isBroken && target.source_url ? (
                      <img src={target.source_url} alt="" />
                    ) : (
                      <ImageIcon />
                    )}
                  </div>
                  <div className={styles.contextMeta}>
                    {existingTitle && <div><strong>{t('media.mediaTitle')}:</strong> {existingTitle}</div>}
                    {existingAlt && <div><strong>{t('media.altText')}:</strong> {existingAlt}</div>}
                    {existingCaption && <div><strong>{t('media.caption')}:</strong> {existingCaption}</div>}
                    {existingDescription && <div><strong>{t('media.description')}:</strong> {existingDescription}</div>}
                    {!hasMetadata && (
                      <div className={styles.contextEmpty}>{t('media.ai.noMetadataHint')}</div>
                    )}
                  </div>
                </div>
              </div>

              {/* Instructions */}
              <div className={styles.section}>
                <label className={styles.inputLabel} htmlFor="ai-regenerate-instructions">
                  {t('media.ai.instructionsLabel')}
                </label>
                <textarea
                  id="ai-regenerate-instructions"
                  className={styles.textarea}
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  placeholder={t('media.ai.instructionsPlaceholder')}
                  rows={4}
                  disabled={status === 'generating' || status === 'replacing'}
                />
              </div>

              {/* Aspect ratio */}
              <div className={styles.section}>
                <label className={styles.inputLabel} htmlFor="ai-regenerate-aspect">
                  {t('media.ai.aspectRatio')}
                </label>
                <select
                  id="ai-regenerate-aspect"
                  className={styles.select}
                  value={aspectRatio}
                  onChange={(e) => setAspectRatio(e.target.value)}
                  disabled={status === 'generating' || status === 'replacing'}
                >
                  <option value="16:9">16:9 ({t('media.ai.landscape')})</option>
                  <option value="4:3">4:3</option>
                  <option value="1:1">1:1 ({t('media.ai.square')})</option>
                  <option value="3:4">3:4</option>
                  <option value="9:16">9:16 ({t('media.ai.portrait')})</option>
                </select>
              </div>
            </>
          )}

          {status === 'generating' && (
            <div className={styles.loadingState}>
              <Loader2 className={styles.spinner} />
              <div>{t('media.ai.generating')}</div>
              <div className={styles.loadingHint}>{t('media.ai.generatingHint')}</div>
            </div>
          )}

          {status === 'replacing' && (
            <div className={styles.loadingState}>
              <Loader2 className={styles.spinner} />
              <div>{t('media.ai.uploading')}</div>
            </div>
          )}

          {status === 'preview' && generatedImageSrc && (
            <div className={styles.section}>
              <div className={styles.sectionLabel}>{t('media.ai.previewHeading')}</div>
              <div className={styles.previewWrap}>
                <img src={generatedImageSrc} alt="" className={styles.previewImage} />
              </div>
              {generated?.metadata && (
                <div className={styles.generatedMetaCard}>
                  {generated.metadata.title && <div><strong>{t('media.mediaTitle')}:</strong> {generated.metadata.title}</div>}
                  {generated.metadata.altText && <div><strong>{t('media.altText')}:</strong> {generated.metadata.altText}</div>}
                  {generated.metadata.caption && <div><strong>{t('media.caption')}:</strong> {generated.metadata.caption}</div>}
                  {generated.metadata.description && <div><strong>{t('media.description')}:</strong> {generated.metadata.description}</div>}
                  {generated.language && (
                    <div className={styles.languageTag}>
                      {t('media.ai.metadataLanguage', { language: generated.language.toUpperCase() })}
                    </div>
                  )}
                </div>
              )}
              {(() => {
                const v = generated?.verification;
                if (!v) return null;
                const problems = [];
                if (v.textLanguageCorrect === false) {
                  problems.push(t('media.ai.verification.languageMismatch', { language: (generated.language || '').toUpperCase() }));
                }
                if (v.instructionsFollowed === false && !!instructions) {
                  problems.push(t('media.ai.verification.instructionsNotFollowed'));
                }
                if (Array.isArray(v.issues)) {
                  problems.push(...v.issues.filter(Boolean).slice(0, 3));
                }
                const unique = Array.from(new Set(problems));
                if (unique.length === 0) {
                  return (
                    <div className={styles.verificationOk}>
                      <div className={styles.verificationTitle}>{t('media.ai.verification.allGoodTitle')}</div>
                      <div className={styles.verificationBody}>{t('media.ai.verification.allGoodBody')}</div>
                    </div>
                  );
                }
                return (
                  <div className={styles.verificationWarn}>
                    <div className={styles.verificationTitle}>
                      <AlertCircle className={styles.verificationIcon} />
                      {t('media.ai.verification.issuesTitle')}
                    </div>
                    <ul className={styles.verificationList}>
                      {unique.map((p, i) => <li key={i}>{p}</li>)}
                    </ul>
                  </div>
                );
              })()}
            </div>
          )}

          {insufficientCredits && (
            <div className={styles.insufficientCreditsBox}>
              <AlertCircle className={styles.errorIcon} />
              <div className={styles.insufficientCreditsBody}>
                <p className={styles.insufficientCreditsText}>
                  {t('media.ai.insufficientCredits', { required: insufficientCredits.required })}
                </p>
                <Button
                  variant="primary"
                  onClick={() => setShowAddCreditsModal(true)}
                  className={styles.purchaseCreditsButton}
                >
                  <GCoinIcon />
                  {t('user.addCredits')}
                </Button>
              </div>
            </div>
          )}

          {error && !insufficientCredits && (
            <div className={styles.errorBox}>
              <AlertCircle className={styles.errorIcon} />
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className={styles.footer}>
          {status === 'idle' || status === 'error' ? (
            <>
              <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
              <Button
                variant="primary"
                onClick={() => generate()}
                disabled={!canGenerate}
              >
                <Sparkles />
                {isBroken ? t('media.ai.generateButton') : t('media.ai.regenerateButton')}
                <span className={styles.buttonCost}>{REGENERATE_COST}</span>
              </Button>
            </>
          ) : status === 'generating' ? (
            <>
              <Button variant="ghost" onClick={onClose}>
                {t('media.ai.runInBackground')}
              </Button>
              <Button variant="primary" disabled>
                <Loader2 className={styles.spinner} />
                {t('media.ai.generating')}
              </Button>
            </>
          ) : status === 'replacing' ? (
            <Button variant="primary" disabled>
              <Loader2 className={styles.spinner} />
              {t('media.ai.uploading')}
            </Button>
          ) : status === 'needsLanguage' ? (
            <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          ) : status === 'preview' ? (
            <>
              <Button variant="ghost" onClick={tryAgain}>
                <RotateCcw />
                {t('media.ai.tryAgain')}
              </Button>
              <Button variant="primary" onClick={acceptAndReplace}>
                {t('media.ai.acceptReplace')}
              </Button>
            </>
          ) : null}
        </div>
      </div>
    </div>
    <AddCreditsModal
      isOpen={showAddCreditsModal}
      onClose={() => setShowAddCreditsModal(false)}
    />
    </>,
    document.body,
  );
}

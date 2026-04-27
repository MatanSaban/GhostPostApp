'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Sparkles, Loader2, ImageIcon, RotateCcw, Trash2, AlertCircle } from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import { useUser, CREDITS_UPDATED_EVENT } from '@/app/context/user-context';
import { Button } from '@/app/dashboard/components';
import AddCreditsModal from '@/app/components/ui/AddCreditsModal';
import styles from './AIRegenerateModal.module.css';
import GCoinIcon from '@/app/components/ui/GCoinIcon';

const REGENERATE_COST = 5;

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
 * Convert a base64-encoded image (e.g. PNG) to a WebP base64 string using the browser canvas.
 * Returns `{ base64, mimeType: 'image/webp' }` on success or throws on failure.
 */
async function convertBase64ToWebp(base64, sourceMime = 'image/png', quality = 0.9) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('Canvas 2D context unavailable'));
      ctx.drawImage(img, 0, 0);
      canvas.toBlob(
        (blob) => {
          if (!blob) return reject(new Error('Canvas toBlob returned null'));
          const reader = new FileReader();
          reader.onload = () => {
            const dataUrl = reader.result;
            const commaIdx = dataUrl.indexOf(',');
            const pureBase64 = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl;
            resolve({ base64: pureBase64, mimeType: 'image/webp' });
          };
          reader.onerror = () => reject(reader.error || new Error('FileReader failed'));
          reader.readAsDataURL(blob);
        },
        'image/webp',
        quality,
      );
    };
    img.onerror = () => reject(new Error('Failed to load generated image into canvas'));
    img.src = `data:${sourceMime};base64,${base64}`;
  });
}

export function AIRegenerateModal({
  isOpen,
  onClose,
  selectedItem,
  isBroken,
  siteId,
  onUploaded,
}) {
  const { t } = useLocale();
  const { user } = useUser();

  const [instructions, setInstructions] = useState('');
  const [aspectRatio, setAspectRatio] = useState('16:9');
  const [status, setStatus] = useState('idle'); // idle | generating | preview | uploading | done | error | needsLanguage
  const [error, setError] = useState(null);
  const [insufficientCredits, setInsufficientCredits] = useState(null); // { required } | null
  const [showAddCreditsModal, setShowAddCreditsModal] = useState(false);
  const [generated, setGenerated] = useState(null); // { base64, mimeType, metadata, language }
  const [uploadedItem, setUploadedItem] = useState(null);
  const [chosenLanguage, setChosenLanguage] = useState(null);

  // Reset state whenever the modal is re-opened
  useEffect(() => {
    if (!isOpen) return;
    setInstructions('');
    setAspectRatio('16:9');
    setStatus('idle');
    setError(null);
    setInsufficientCredits(null);
    setGenerated(null);
    setUploadedItem(null);
    setChosenLanguage(null);
  }, [isOpen, selectedItem?.id]);

  // ESC closes the modal (unless we're mid-upload — those shouldn't be interrupted)
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => {
      if (e.key === 'Escape' && status !== 'uploading' && status !== 'generating') {
        onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose, status]);

  // Prevent background scroll while the modal is open
  useEffect(() => {
    if (!isOpen) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = original; };
  }, [isOpen]);

  // Clear the insufficient-credits banner once the user tops up enough to cover the cost.
  useEffect(() => {
    if (!insufficientCredits) return;
    const limit = user?.aiCreditsLimit;
    const used = user?.aiCreditsUsed || 0;
    const remaining = limit == null ? Infinity : limit - used;
    if (remaining >= insufficientCredits.required) {
      setInsufficientCredits(null);
      if (status === 'error') setStatus('idle');
    }
  }, [user?.aiCreditsLimit, user?.aiCreditsUsed, insufficientCredits, status]);

  if (!isOpen || !selectedItem) return null;

  const existingAlt = selectedItem.alt_text || '';
  const existingTitle = selectedItem.title?.rendered || selectedItem.slug || '';
  const existingCaption = selectedItem.caption?.rendered?.replace(/<[^>]*>/g, '') || '';
  const existingDescription = selectedItem.description?.rendered?.replace(/<[^>]*>/g, '') || '';
  const hasMetadata = !!(existingAlt || existingTitle || existingCaption || existingDescription);

  const canGenerate = !isBroken || hasMetadata || instructions.trim().length > 0;

  async function callGenerate(languageOverride = null) {
    setStatus('generating');
    setError(null);
    setInsufficientCredits(null);

    try {
      const res = await fetch(`/api/sites/${siteId}/media/ai-regenerate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          existingImageUrl: isBroken ? null : selectedItem.source_url,
          isBroken: !!isBroken,
          altText: existingAlt,
          title: existingTitle,
          caption: existingCaption,
          description: existingDescription,
          userInstructions: instructions.trim(),
          aspectRatio,
          languageOverride,
        }),
      });

      const data = await res.json();

      if (res.status === 402 && data?.code === 'INSUFFICIENT_CREDITS') {
        setStatus('error');
        setInsufficientCredits({ required: data.required || REGENERATE_COST });
        return;
      }

      if (!res.ok) {
        setStatus('error');
        setError(data?.error || t('media.ai.generateFailed'));
        return;
      }

      if (data.needsLanguage) {
        setStatus('needsLanguage');
        return;
      }

      if (!data.image?.base64) {
        setStatus('error');
        setError(t('media.ai.generateFailed'));
        return;
      }

      setGenerated({
        base64: data.image.base64,
        mimeType: data.image.mimeType || 'image/png',
        metadata: data.metadata || {},
        language: data.language,
        verification: data.verification || null,
      });
      setStatus('preview');

      if (typeof window !== 'undefined' && window.dispatchEvent) {
        window.dispatchEvent(new CustomEvent(CREDITS_UPDATED_EVENT));
      }
    } catch (err) {
      console.error('[AIRegenerate] generate error', err);
      setStatus('error');
      setError(err.message || t('media.ai.generateFailed'));
    }
  }

  async function handleGenerate() {
    if (!canGenerate) return;
    await callGenerate(chosenLanguage);
  }

  async function handleLanguageSubmit(lang) {
    setChosenLanguage(lang);
    await callGenerate(lang);
  }

  async function handleUpload() {
    if (!generated) return;
    setStatus('uploading');
    setError(null);

    try {
      // Convert PNG → WebP on the client before uploading
      const webp = await convertBase64ToWebp(generated.base64, generated.mimeType, 0.9);

      const baseName = (existingTitle || 'generated-image')
        .toLowerCase()
        .replace(/[^a-z0-9֐-׿؀-ۿ]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 60) || 'generated-image';
      const filename = `${baseName}-${Date.now()}.webp`;

      const uploadRes = await fetch(`/api/sites/${siteId}/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          base64: webp.base64,
          filename,
          title: generated.metadata.title || existingTitle || '',
          alt: generated.metadata.altText || existingAlt || '',
          caption: generated.metadata.caption || '',
          description: generated.metadata.description || '',
        }),
      });
      const uploaded = await uploadRes.json();

      if (!uploadRes.ok) {
        setStatus('error');
        setError(uploaded?.error || t('media.ai.uploadFailed'));
        return;
      }

      setUploadedItem(uploaded);
      setStatus('done');
    } catch (err) {
      console.error('[AIRegenerate] upload error', err);
      setStatus('error');
      setError(err.message || t('media.ai.uploadFailed'));
    }
  }

  async function handleDiscard() {
    if (!uploadedItem?.id) {
      onClose();
      return;
    }
    try {
      await fetch(`/api/sites/${siteId}/media/${uploadedItem.id}`, { method: 'DELETE' });
    } catch (err) {
      console.warn('[AIRegenerate] discard delete failed:', err);
    }
    onClose();
  }

  function handleKeep() {
    if (uploadedItem && onUploaded) {
      onUploaded(uploadedItem, selectedItem.id);
    }
    onClose();
  }

  const generatedImageSrc = generated
    ? `data:${generated.mimeType};base64,${generated.base64}`
    : null;

  return createPortal(
    <>
    <div className={styles.overlay} onClick={(e) => { if (e.target === e.currentTarget && status !== 'uploading' && status !== 'generating') onClose(); }}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div className={styles.titleWrap}>
            <Sparkles className={styles.titleIcon} />
            <h2 className={styles.title}>
              {isBroken ? t('media.ai.titleGenerate') : t('media.ai.titleRegenerate')}
            </h2>
            <span className={styles.costBadge}>{t('media.ai.cost', { credits: REGENERATE_COST })}</span>
          </div>
          {status !== 'uploading' && status !== 'generating' && (
            <button
              className={styles.closeButton}
              onClick={onClose}
              aria-label={t('common.close')}
            >
              <X />
            </button>
          )}
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

          {status !== 'needsLanguage' && status !== 'done' && (
            <>
              {/* Context summary */}
              <div className={styles.section}>
                <div className={styles.sectionLabel}>{t('media.ai.contextLabel')}</div>
                <div className={styles.contextCard}>
                  <div className={styles.contextThumb}>
                    {!isBroken && selectedItem.source_url ? (
                      <img src={selectedItem.source_url} alt="" />
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
                  disabled={status === 'generating' || status === 'uploading'}
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
                  disabled={status === 'generating' || status === 'uploading'}
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

          {status === 'uploading' && (
            <div className={styles.loadingState}>
              <Loader2 className={styles.spinner} />
              <div>{t('media.ai.uploading')}</div>
            </div>
          )}

          {(status === 'preview' || status === 'done') && generatedImageSrc && (
            <div className={styles.section}>
              <div className={styles.sectionLabel}>
                {status === 'done' ? t('media.ai.uploadedHeading') : t('media.ai.previewHeading')}
              </div>
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
                // De-dupe in case the AI repeated itself.
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
                onClick={handleGenerate}
                disabled={!canGenerate}
              >
                <Sparkles />
                {isBroken ? t('media.ai.generateButton') : t('media.ai.regenerateButton')}
                <span className={styles.buttonCost}>{REGENERATE_COST}</span>
              </Button>
            </>
          ) : status === 'generating' || status === 'uploading' ? (
            <Button variant="ghost" disabled>
              <Loader2 className={styles.spinner} />
              {status === 'generating' ? t('media.ai.generating') : t('media.ai.uploading')}
            </Button>
          ) : status === 'needsLanguage' ? (
            <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          ) : status === 'preview' ? (
            <>
              <Button variant="ghost" onClick={() => { setGenerated(null); setStatus('idle'); }}>
                <RotateCcw />
                {t('media.ai.tryAgain')}
              </Button>
              <Button variant="primary" onClick={handleUpload}>
                {t('media.ai.saveToLibrary')}
              </Button>
            </>
          ) : status === 'done' ? (
            <>
              <Button variant="danger" onClick={handleDiscard}>
                <Trash2 />
                {t('media.ai.discardNew')}
              </Button>
              <Button variant="primary" onClick={handleKeep}>
                {t('media.ai.openInLibrary')}
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

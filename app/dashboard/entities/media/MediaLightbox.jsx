'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  ChevronLeft,
  ChevronRight,
  Copy,
  Check,
  File as FileIcon,
  Film,
  FileText,
  ExternalLink,
  Sparkles,
} from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import { Button } from '@/app/dashboard/components';
import { MediaFieldAIButton } from './MediaFieldAIButton';
import styles from './MediaLightbox.module.css';

function getFileIcon(mimeType) {
  if (mimeType?.startsWith('video/')) return Film;
  if (mimeType?.startsWith('application/pdf')) return FileText;
  return FileIcon;
}

function getMediaKind(item) {
  const mime = item?.mime_type || '';
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  return 'file';
}

function stripHtml(html) {
  if (!html) return '';
  return String(html).replace(/<[^>]*>/g, '').trim();
}

export function MediaLightbox({
  items = [],
  index,
  onClose,
  onIndexChange,
  onRegenerate,
  onSave,
  canEdit = false,
  siteId,
  brokenImageIds,
  regenerateCostCredits = 5,
}) {
  const { t, isRtl } = useLocale();
  const [urlCopied, setUrlCopied] = useState(false);
  const closeBtnRef = useRef(null);

  const isOpen = typeof index === 'number' && index >= 0 && index < items.length;
  const item = isOpen ? items[index] : null;
  const kind = item ? getMediaKind(item) : null;

  // Editable fields. Reset whenever the user navigates to a different item so
  // edits don't silently "follow" the carousel to the wrong row.
  const [editTitle, setEditTitle] = useState('');
  const [editAlt, setEditAlt] = useState('');
  const [editCaption, setEditCaption] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveFlash, setSaveFlash] = useState(null); // 'saved' | 'error' | null

  useEffect(() => {
    if (!item) return;
    setEditTitle(item.title?.rendered || item.slug || '');
    setEditAlt(item.alt_text || '');
    setEditCaption(stripHtml(item.caption?.rendered));
    setEditDescription(stripHtml(item.description?.rendered));
    setSaveFlash(null);
  }, [item?.id]);

  // Navigation is semantic: -1 = previous item, +1 = next item. The physical
  // side each arrow lives on is handled by logical CSS + icon choice below.
  const advance = (delta) => {
    if (!isOpen) return;
    const next = index + delta;
    if (next < 0 || next >= items.length) return;
    onIndexChange(next);
  };

  // Keyboard: Esc closes. Left arrow = previous, right arrow = next -
  // same convention as the on-screen buttons, in both LTR and RTL.
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowLeft') {
        advance(-1);
      } else if (e.key === 'ArrowRight') {
        advance(1);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, index, items.length, onClose]);

  // Lock scroll + focus close button on open so keyboard users aren't stranded.
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusTimer = setTimeout(() => closeBtnRef.current?.focus(), 0);
    return () => {
      document.body.style.overflow = prev;
      clearTimeout(focusTimer);
    };
  }, [isOpen]);

  // Reset the copied-url flash when navigating between items.
  useEffect(() => {
    setUrlCopied(false);
  }, [index]);

  if (!isOpen) return null;

  const originalTitle = item.title?.rendered || item.slug || '';
  const originalAlt = item.alt_text || '';
  const originalCaption = stripHtml(item.caption?.rendered);
  const originalDescription = stripHtml(item.description?.rendered);
  const mime = item.mime_type || '';
  const width = item.media_details?.width;
  const height = item.media_details?.height;
  const url = item.source_url;

  const isDirty =
    editTitle !== originalTitle ||
    editAlt !== originalAlt ||
    editCaption !== originalCaption ||
    editDescription !== originalDescription;

  const fieldContext = {
    title: editTitle,
    altText: editAlt,
    caption: editCaption,
    description: editDescription,
    filename: editTitle || item.slug || '',
    sourceUrl: url || '',
    mimeType: mime,
    width: width ?? null,
    height: height ?? null,
  };

  const atStart = index === 0;
  const atEnd = index === items.length - 1;
  const showAI = canEdit && siteId && item.id;

  const handleCopy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setUrlCopied(true);
      setTimeout(() => setUrlCopied(false), 1600);
    } catch {
      /* ignore - user just won't see the copied flash */
    }
  };

  const handleSave = async () => {
    if (!onSave || !isDirty || isSaving) return;
    setIsSaving(true);
    setSaveFlash(null);
    try {
      await onSave(item.id, {
        title: editTitle,
        alt: editAlt,
        caption: editCaption,
        description: editDescription,
      });
      setSaveFlash('saved');
      setTimeout(() => setSaveFlash(null), 1800);
    } catch (err) {
      console.error('[MediaLightbox] save failed:', err);
      setSaveFlash('error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  return createPortal(
    <div
      className={styles.backdrop}
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
    >
      <button
        ref={closeBtnRef}
        type="button"
        className={styles.closeButton}
        onClick={onClose}
        aria-label={t('media.lightbox.close')}
      >
        <X />
      </button>

      {/*
        Universal arrow convention matching the pagination buttons elsewhere
        in the app: left arrow = previous, right arrow = next regardless of
        text direction. Swapping action per direction caused confusion - this
        is what users here are used to.
      */}
      <button
        type="button"
        className={`${styles.navButton} ${styles.navLeft}`}
        onClick={() => advance(-1)}
        disabled={atStart}
        aria-label={t('media.lightbox.previous')}
      >
        <ChevronLeft />
      </button>

      <button
        type="button"
        className={`${styles.navButton} ${styles.navRight}`}
        onClick={() => advance(1)}
        disabled={atEnd}
        aria-label={t('media.lightbox.next')}
      >
        <ChevronRight />
      </button>

      <div className={styles.stage} onClick={handleBackdropClick}>
        <div className={styles.viewer}>
          {kind === 'image' ? (
            <img key={item.id} src={url} alt={editAlt} className={styles.image} />
          ) : kind === 'video' ? (
            <video
              key={item.id}
              src={url}
              controls
              playsInline
              className={styles.video}
            >
              {t('media.lightbox.videoNotSupported')}
            </video>
          ) : (
            <div className={styles.fileFallback}>
              {(() => {
                const Icon = getFileIcon(mime);
                return <Icon className={styles.fileIcon} />;
              })()}
              <div className={styles.fileLabel}>{editTitle || mime}</div>
              {url && (
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.openOriginal}
                >
                  <ExternalLink size={14} />
                  {t('media.lightbox.openOriginal')}
                </a>
              )}
            </div>
          )}
        </div>

        <aside className={styles.infoPanel} onClick={(e) => e.stopPropagation()}>
          <div className={styles.counter}>
            {t('media.lightbox.counter', { current: index + 1, total: items.length })}
          </div>

          {(width || height) && (
            <div className={styles.infoField}>
              <span className={styles.infoLabel}>{t('media.lightbox.dimensions')}</span>
              <span className={styles.infoValue}>{width} × {height}</span>
            </div>
          )}

          {mime && (
            <div className={styles.infoField}>
              <span className={styles.infoLabel}>{t('media.lightbox.mimeType')}</span>
              <span className={styles.infoValue}>{mime}</span>
            </div>
          )}

          {/* Editable fields - read-only when canEdit is false. Each field has
              an inline AI rewrite button that costs 1 credit. */}
          <div className={styles.editField}>
            <div className={styles.editFieldHeader}>
              <label className={styles.infoLabel} htmlFor="lightbox-title">
                {t('media.lightbox.filename')}
              </label>
              {showAI && (
                <MediaFieldAIButton
                  siteId={siteId}
                  mediaId={item.id}
                  field="title"
                  context={fieldContext}
                  onResult={(v) => setEditTitle(v)}
                />
              )}
            </div>
            <input
              id="lightbox-title"
              type="text"
              value={editTitle}
              readOnly={!canEdit}
              onChange={(e) => setEditTitle(e.target.value)}
              className={styles.editInput}
            />
          </div>

          <div className={styles.editField}>
            <div className={styles.editFieldHeader}>
              <label className={styles.infoLabel} htmlFor="lightbox-alt">
                {t('media.altText')}
              </label>
              {showAI && (
                <MediaFieldAIButton
                  siteId={siteId}
                  mediaId={item.id}
                  field="altText"
                  context={fieldContext}
                  onResult={(v) => setEditAlt(v)}
                />
              )}
            </div>
            <input
              id="lightbox-alt"
              type="text"
              value={editAlt}
              readOnly={!canEdit}
              onChange={(e) => setEditAlt(e.target.value)}
              className={styles.editInput}
            />
          </div>

          <div className={styles.editField}>
            <div className={styles.editFieldHeader}>
              <label className={styles.infoLabel} htmlFor="lightbox-caption">
                {t('media.caption')}
              </label>
              {showAI && (
                <MediaFieldAIButton
                  siteId={siteId}
                  mediaId={item.id}
                  field="caption"
                  context={fieldContext}
                  onResult={(v) => setEditCaption(v)}
                />
              )}
            </div>
            <textarea
              id="lightbox-caption"
              value={editCaption}
              readOnly={!canEdit}
              onChange={(e) => setEditCaption(e.target.value)}
              className={styles.editTextarea}
              rows={2}
            />
          </div>

          <div className={styles.editField}>
            <div className={styles.editFieldHeader}>
              <label className={styles.infoLabel} htmlFor="lightbox-description">
                {t('media.description')}
              </label>
              {showAI && (
                <MediaFieldAIButton
                  siteId={siteId}
                  mediaId={item.id}
                  field="description"
                  context={fieldContext}
                  onResult={(v) => setEditDescription(v)}
                />
              )}
            </div>
            <textarea
              id="lightbox-description"
              value={editDescription}
              readOnly={!canEdit}
              onChange={(e) => setEditDescription(e.target.value)}
              className={styles.editTextarea}
              rows={3}
            />
          </div>

          {url && (
            <div className={styles.urlRow}>
              <input
                type="text"
                value={url}
                readOnly
                dir="ltr"
                className={styles.urlInput}
                onClick={(e) => e.currentTarget.select()}
              />
              <button
                type="button"
                onClick={handleCopy}
                className={styles.copyButton}
                aria-label={t('common.copy')}
              >
                {urlCopied ? <Check size={14} /> : <Copy size={14} />}
              </button>
            </div>
          )}

          {canEdit && typeof onSave === 'function' && (
            <button
              type="button"
              onClick={handleSave}
              disabled={!isDirty || isSaving}
              className={styles.saveButton}
            >
              {isSaving
                ? t('media.lightbox.saving')
                : saveFlash === 'saved'
                ? t('media.lightbox.saved')
                : t('media.lightbox.saveChanges')}
            </button>
          )}

          {kind === 'image' && typeof onRegenerate === 'function' && (() => {
            const isBroken = brokenImageIds ? brokenImageIds.has(item.id) : false;
            // When the image is broken we can only regenerate if we have some
            // metadata to work from - otherwise the AI has nothing to go on.
            const hasAnyMeta = !!(editAlt || editTitle || editCaption || editDescription);
            if (isBroken && !hasAnyMeta) return null;
            return (
              <Button
                variant="primary"
                onClick={() => onRegenerate(item, index)}
                className={styles.regenerateButton}
              >
                <Sparkles />
                {isBroken ? t('media.ai.generateButton') : t('media.ai.regenerateButton')}
                <span className={styles.regenerateCost}>
                  {t('media.ai.costShort', { credits: regenerateCostCredits })}
                </span>
              </Button>
            );
          })()}
        </aside>
      </div>
    </div>,
    document.body,
  );
}

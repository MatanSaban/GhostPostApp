'use client';

import { useRef, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Check, Type, Tag, Calendar, Clock, Globe, ExternalLink, RefreshCw, Loader2, Sparkles, Eye, ChevronDown, ChevronUp, Pencil, Trash2 } from 'lucide-react';
import { ConfirmDialog } from '@/app/dashboard/admin/components/AdminModal';
import styles from './PostPopover.module.css';

const PIPELINE_STATUSES = [
  { value: 'draft', key: 'DRAFT' },
  { value: 'scheduled', key: 'SCHEDULED' },
  { value: 'processing', key: 'PROCESSING' },
  { value: 'readyToPublish', key: 'READY_TO_PUBLISH' },
  { value: 'published', key: 'PUBLISHED' },
];

const ENTITY_STATUSES = [
  { value: 'published', key: 'PUBLISHED' },
  { value: 'draft', key: 'DRAFT' },
  { value: 'pending', key: 'PENDING' },
  { value: 'scheduled', key: 'SCHEDULED' },
  { value: 'private', key: 'PRIVATE' },
];

/**
 * Shared post popover component for calendar views.
 * Used by content-planner and ai-content-wizard summary step.
 *
 * @param {Object} post - The post data
 * @param {DOMRect} rect - Position rect from click target
 * @param {Function} onClose - Close handler
 * @param {Object} translations - Translation labels
 * @param {Function} [onDateChange] - (newDate: string) => void
 * @param {Function} [onTimeChange] - (newTime: string) => void
 * @param {Function} [onRetrySuccess] - Called when retry is successful
 * @param {Function} [onTitleChange] - (newTitle: string) => void
 * @param {Function} [onStatusChange] - (newStatus: string) => Promise<void>
 * @param {Function} [onGenerate] - () => Promise<void>
 * @param {Function} [onDelete] - () => Promise<void> - delete the post
 */
export default function PostPopover({
  post,
  rect,
  onClose,
  translations = {},
  onDateChange,
  onTimeChange,
  onRetrySuccess,
  onTitleChange,
  onStatusChange,
  onGenerate,
  onDelete,
}) {
  const popoverRef = useRef(null);
  const [retrying, setRetrying] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [changingStatus, setChangingStatus] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [savingTitle, setSavingTitle] = useState(false);
  const [titleError, setTitleError] = useState(null);
  const t = translations;

  // Close on outside click (skip when confirm dialog is open — it's a portal outside the popover)
  useEffect(() => {
    const handler = (e) => {
      if (confirmDelete) return;
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose, confirmDelete]);

  if (!post || !rect) return null;

  // Extract date — for entity scheduled posts, prefer scheduledAt
  const dateStr = post.scheduledAt || post.publishedAt || post.createdAt;
  const postDate = dateStr ? new Date(dateStr) : null;
  const timeStr = postDate
    ? `${String(postDate.getHours()).padStart(2, '0')}:${String(postDate.getMinutes()).padStart(2, '0')}`
    : null;
  // Date input format: YYYY-MM-DD
  const dateInputStr = postDate
    ? `${postDate.getFullYear()}-${String(postDate.getMonth() + 1).padStart(2, '0')}-${String(postDate.getDate()).padStart(2, '0')}`
    : null;

  // Preview data — available for generated pipeline posts or entity posts
  const previewImage = post.aiResult?.featuredImage || post.featuredImage || null;
  const previewExcerpt = post.aiResult?.excerpt || post.excerpt || null;
  const previewHtml = post.aiResult?.html || post.content || null;
  const hasPreview = !!(previewImage || previewExcerpt || previewHtml);

  // Status mapping
  const STATUS_LABELS = {
    published: t.published || 'Published',
    scheduled: t.scheduled || 'Scheduled',
    processing: t.processing || 'Processing',
    readyToPublish: t.readyToPublish || 'Ready to Publish',
    failed: t.failed || 'Failed',
    draft: t.draft || 'Draft',
    pending: t.pending || 'Pending',
    private: t.private || 'Private',
  };

  const statusOptions = post.source === 'entity' ? ENTITY_STATUSES : PIPELINE_STATUSES;

  // Handle title save
  const handleTitleSave = async () => {
    const trimmed = titleDraft.trim();
    if (trimmed && trimmed !== post.title && onTitleChange) {
      setSavingTitle(true);
      setTitleError(null);
      try {
        await onTitleChange(trimmed);
        setEditingTitle(false);
      } catch (err) {
        setTitleError(err.message || t.titleSaveError || 'Failed to save title');
      } finally {
        setSavingTitle(false);
      }
    } else {
      setEditingTitle(false);
    }
  };

  const handleTitleKeyDown = (e) => {
    if (e.key === 'Enter') handleTitleSave();
    if (e.key === 'Escape' && !savingTitle) setEditingTitle(false);
  };

  // Handle status change
  const handleStatusChange = async (e) => {
    const newStatusKey = e.target.value;
    if (!onStatusChange || changingStatus) return;
    setChangingStatus(true);
    try {
      await onStatusChange(newStatusKey);
    } finally {
      setChangingStatus(false);
    }
  };

  // Handle generate
  const handleGenerate = async () => {
    if (!onGenerate || generating) return;
    setGenerating(true);
    try {
      await onGenerate();
    } finally {
      setGenerating(false);
    }
  };

  // Handle retry for failed posts
  const handleRetry = async (e) => {
    e.stopPropagation();
    if (!post.id || retrying) return;
    
    setRetrying(true);
    try {
      // Determine which phase failed based on whether aiResult exists
      // If aiResult exists → failed during publish → retry publish
      // If no aiResult → failed during processing → retry processing
      const hasAiResult = post.aiResult && (post.aiResult.html || post.aiResult.title);
      
      const retryData = hasAiResult 
        ? {
            status: 'READY_TO_PUBLISH',
            publishAttempts: 0,
            errorMessage: null,
          }
        : {
            status: 'SCHEDULED',
            processingAttempts: 0,
            errorMessage: null,
          };

      const res = await fetch(`/api/contents/${post.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(retryData),
      });
      
      if (res.ok) {
        onRetrySuccess?.();
        onClose();
      }
    } catch {
      // Silent fail
    } finally {
      setRetrying(false);
    }
  };

  return createPortal(
    <div className={styles.overlay} onClick={onClose}>
      <div
        ref={popoverRef}
        className={`${styles.popover} ${showPreview ? styles.popoverWide : ''}`}
        onClick={(e) => e.stopPropagation()}
        style={{
          top: Math.min(rect.bottom + 8, window.innerHeight - 300),
          left: Math.min(Math.max(rect.left, 16), window.innerWidth - (showPreview ? 420 : 320)),
        }}
      >
        <div className={styles.header}>
          {editingTitle ? (
            <div className={styles.titleEditRow}>
              <input
                className={styles.titleInput}
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onKeyDown={handleTitleKeyDown}
                autoFocus
                disabled={savingTitle}
              />
              <button className={styles.titleSaveBtn} onClick={handleTitleSave} title={t.save || 'Save'} disabled={savingTitle}>
                {savingTitle ? <Loader2 size={14} className={styles.spinner} /> : <Check size={14} />}
              </button>
              <button className={styles.titleCancelBtn} onClick={() => setEditingTitle(false)} title={t.cancel || 'Cancel'} disabled={savingTitle}>
                <X size={14} />
              </button>
            </div>
          ) : (
            <h4
              className={`${styles.title} ${onTitleChange ? styles.titleEditable : ''}`}
              onClick={() => {
                if (onTitleChange) {
                  setTitleDraft(post.title || '');
                  setEditingTitle(true);
                }
              }}
            >
              {post.title}
              {onTitleChange && <Pencil size={12} className={styles.titleEditIcon} />}
            </h4>
          )}
          {titleError && <p className={styles.titleError}>{titleError}</p>}
        </div>

        <div className={styles.body}>
          {/* Campaign */}
          {post.campaignName && (
            <div className={styles.row}>
              <span className={styles.colorDot} style={{ background: post.campaignDeleted ? '#999' : post.campaignColor }} />
              <span className={styles.label}>{t.campaign || 'Campaign'}</span>
              <span className={styles.value}>
                {post.campaignName}
                {post.campaignDeleted && <span className={styles.deletedBadge}>{t.deleted || 'deleted'}</span>}
              </span>
            </div>
          )}

          {/* Status */}
          {post.dotStatus && (
            <div className={styles.row}>
              <span className={`${styles.statusDot} ${styles[post.dotStatus]}`} />
              <span className={styles.label}>{t.status || 'Status'}</span>
              {onStatusChange && (post.source === 'pipeline' || post.source === 'entity') ? (
                <div className={styles.statusSelectWrapper}>
                  {changingStatus && <Loader2 size={12} className={styles.spinner} />}
                  <select
                    className={styles.statusSelect}
                    value={post.statusKey || post.dotStatus}
                    onChange={handleStatusChange}
                    disabled={changingStatus}
                  >
                    {statusOptions.map(s => (
                      <option key={s.key} value={s.key}>
                        {STATUS_LABELS[s.value] || s.value}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <span className={styles.value}>{STATUS_LABELS[post.dotStatus] || post.dotStatus}</span>
              )}
              {post.dotStatus === 'failed' && (
                <button 
                  className={styles.retryBtn}
                  onClick={handleRetry}
                  disabled={retrying}
                  title={t.retryPublish || 'Retry Publishing'}
                >
                  {retrying ? (
                    <Loader2 size={14} className={styles.spinner} />
                  ) : (
                    <RefreshCw size={14} />
                  )}
                </button>
              )}
            </div>
          )}

          {/* Type */}
          {post.type && (
            <div className={styles.row}>
              <Type size={14} />
              <span className={styles.label}>{t.type || 'Type'}</span>
              <span className={styles.value}>{post.typeLabel || post.type}</span>
            </div>
          )}

          {/* Keyword */}
          {(post.keywordText || post.keyword?.text) && (
            <div className={styles.row}>
              <Tag size={14} />
              <span className={styles.label}>{t.keyword || 'Keyword'}</span>
              <span className={styles.value}>{post.keywordText || post.keyword?.text}</span>
            </div>
          )}

          {/* Date - editable or read-only */}
          {postDate && (
            <div className={styles.row}>
              <Calendar size={14} />
              <span className={styles.label}>{t.date || 'Date'}</span>
              {onDateChange ? (
                <input
                  type="date"
                  className={styles.dateInput}
                  value={dateInputStr}
                  onChange={(e) => onDateChange(e.target.value)}
                />
              ) : (
                <span className={styles.value}>
                  {postDate.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                </span>
              )}
            </div>
          )}

          {/* Time - editable or read-only */}
          {postDate && timeStr && (
            <div className={styles.row}>
              <Clock size={14} />
              <span className={styles.label}>{t.time || 'Time'}</span>
              {onTimeChange ? (
                <input
                  type="time"
                  className={styles.timeInput}
                  value={timeStr}
                  onChange={(e) => onTimeChange(e.target.value)}
                />
              ) : (
                <span className={styles.value}>
                  {postDate.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </div>
          )}

          {/* Source (WordPress) */}
          {post.source === 'entity' && (
            <div className={styles.row}>
              <Globe size={14} />
              <span className={styles.label}>{t.source || 'Source'}</span>
              <span className={styles.value}>WordPress</span>
            </div>
          )}
        </div>

        {/* Content Preview */}
        {hasPreview && (
          <div className={styles.previewSection}>
            <button
              className={styles.previewToggle}
              onClick={() => setShowPreview(prev => !prev)}
            >
              <Eye size={14} />
              <span>{t.previewContent || 'Preview'}</span>
              {showPreview ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            {showPreview && (
              <div className={styles.previewBody}>
                {previewImage && (
                  <img
                    src={previewImage}
                    alt={post.title || ''}
                    className={styles.previewImage}
                  />
                )}
                {previewExcerpt && (
                  <p className={styles.previewExcerpt}>{previewExcerpt}</p>
                )}
                {previewHtml && (
                  <div
                    className={styles.previewHtml}
                    dangerouslySetInnerHTML={{ __html: previewHtml }}
                  />
                )}
              </div>
            )}
          </div>
        )}

        {/* Actions footer */}
        <div className={styles.footer}>
          <div className={styles.footerActions}>
            {/* Generate button - for pipeline posts without AI result */}
            {onGenerate && post.source === 'pipeline' && !post.aiResult && post.dotStatus !== 'published' && (
              <button
                className={styles.generateBtn}
                onClick={handleGenerate}
                disabled={generating}
              >
                {generating ? (
                  <Loader2 size={14} className={styles.spinner} />
                ) : (
                  <Sparkles size={14} />
                )}
                {generating ? (t.generating || 'Generating...') : (t.generate || 'Generate')}
              </button>
            )}
            {/* View on site link */}
            {post.url && (
              <a
                href={post.url}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.link}
              >
                <ExternalLink size={14} />
                {t.viewOnSite || 'View on site'}
              </a>
            )}
            {/* Delete button - for non-published pipeline posts */}
            {onDelete && post.source === 'pipeline' && post.dotStatus !== 'published' && (
              <button
                className={styles.deleteBtn}
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 size={14} />
                {t.deletePost || 'Delete'}
              </button>
            )}
          </div>
        </div>
      </div>
      {confirmDelete && (
        <ConfirmDialog
          isOpen={confirmDelete}
          onClose={() => setConfirmDelete(false)}
          onConfirm={async () => {
            setDeleting(true);
            try {
              await onDelete();
              setConfirmDelete(false);
              onClose();
            } finally {
              setDeleting(false);
            }
          }}
          title={t.deletePostTitle || 'Delete Post'}
          message={t.deletePostMessage || 'Are you sure you want to remove this post from the campaign and the calendar?'}
          confirmText={t.deletePostConfirm || 'Yes, Delete'}
          cancelText={t.deletePostCancel || 'No, Keep'}
          variant="danger"
          isLoading={deleting}
        />
      )}
    </div>,
    document.body
  );
}

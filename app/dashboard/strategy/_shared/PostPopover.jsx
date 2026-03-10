'use client';

import { useRef, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Type, Tag, Calendar, Clock, Globe, ExternalLink, RefreshCw, Loader2 } from 'lucide-react';
import styles from './PostPopover.module.css';

/**
 * Shared post popover component for calendar views.
 * Used by content-planner and ai-content-wizard summary step.
 *
 * @param {Object} post - The post data
 * @param {DOMRect} rect - Position rect from click target
 * @param {Function} onClose - Close handler
 * @param {Object} translations - Translation labels
 * @param {Function} [onDateChange] - (newDate: string) => void — if provided, shows editable date input
 * @param {Function} [onTimeChange] - (newTime: string) => void — if provided, shows editable time input
 * @param {Function} [onRetrySuccess] - Called when retry is successful
 */
export default function PostPopover({
  post,
  rect,
  onClose,
  translations = {},
  onDateChange,
  onTimeChange,
  onRetrySuccess,
}) {
  const popoverRef = useRef(null);
  const [retrying, setRetrying] = useState(false);
  const t = translations;

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  if (!post || !rect) return null;

  // Extract date
  const dateStr = post.publishedAt || post.scheduledAt || post.createdAt;
  const postDate = dateStr ? new Date(dateStr) : null;
  const timeStr = postDate
    ? `${String(postDate.getHours()).padStart(2, '0')}:${String(postDate.getMinutes()).padStart(2, '0')}`
    : null;
  // Date input format: YYYY-MM-DD
  const dateInputStr = postDate
    ? `${postDate.getFullYear()}-${String(postDate.getMonth() + 1).padStart(2, '0')}-${String(postDate.getDate()).padStart(2, '0')}`
    : null;

  // Status mapping
  const STATUS_LABELS = {
    published: t.published || 'Published',
    scheduled: t.scheduled || 'Scheduled',
    processing: t.processing || 'Processing',
    readyToPublish: t.readyToPublish || 'Ready to Publish',
    failed: t.failed || 'Failed',
    draft: t.draft || 'Draft',
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
        className={styles.popover}
        onClick={(e) => e.stopPropagation()}
        style={{
          top: Math.min(rect.bottom + 8, window.innerHeight - 300),
          left: Math.min(Math.max(rect.left, 16), window.innerWidth - 320),
        }}
      >
        <div className={styles.header}>
          <h4 className={styles.title}>{post.title}</h4>
          <button className={styles.closeBtn} onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className={styles.body}>
          {/* Campaign */}
          {post.campaignName && (
            <div className={styles.row}>
              <span className={styles.colorDot} style={{ background: post.campaignColor }} />
              <span className={styles.label}>{t.campaign || 'Campaign'}</span>
              <span className={styles.value}>{post.campaignName}</span>
            </div>
          )}

          {/* Status */}
          {post.dotStatus && (
            <div className={styles.row}>
              <span className={`${styles.statusDot} ${styles[post.dotStatus]}`} />
              <span className={styles.label}>{t.status || 'Status'}</span>
              <span className={styles.value}>{STATUS_LABELS[post.dotStatus] || post.dotStatus}</span>
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

          {/* Date — editable or read-only */}
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

          {/* Time — editable or read-only */}
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

        {/* Action link */}
        {post.url && (
          <div className={styles.footer}>
            <a
              href={post.url}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.link}
            >
              <ExternalLink size={14} />
              {t.viewOnSite || 'View on site'}
            </a>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

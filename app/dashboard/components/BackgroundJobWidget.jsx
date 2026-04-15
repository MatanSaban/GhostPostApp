'use client';

import { useState } from 'react';
import { Settings, Eye, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import styles from './BackgroundJobWidget.module.css';

/**
 * AI Agent Sidebar Widget for background job progress.
 * Displays when a content differentiation (or similar) job is running.
 * 
 * @param {{ job: Object|null, onViewProgress: Function }} props
 */
export default function BackgroundJobWidget({ job, onViewProgress }) {
  if (!job) return null;

  const isRunning = job.status === 'PENDING' || job.status === 'PROCESSING';
  const isCompleted = job.status === 'COMPLETED';
  const isFailed = job.status === 'FAILED';

  if (!isRunning && !isCompleted && !isFailed) return null;

  return (
    <div className={`${styles.widget} ${isCompleted ? styles.widgetCompleted : ''} ${isFailed ? styles.widgetFailed : ''}`}>
      <div className={styles.header}>
        {isRunning && <Loader2 size={16} className={styles.spinning} />}
        {isCompleted && <CheckCircle size={16} className={styles.checkIcon} />}
        {isFailed && <AlertCircle size={16} className={styles.errorIcon} />}
        <span className={styles.title}>
          {isRunning && `⚙️ AI is differentiating content... (${job.progress || 0}%)`}
          {isCompleted && '✅ Content differentiation strategy ready!'}
          {isFailed && '❌ Differentiation failed'}
        </span>
      </div>

      {job.message && (
        <p className={styles.message}>{job.message}</p>
      )}

      {isRunning && (
        <div className={styles.progressBar}>
          <div
            className={styles.progressFill}
            style={{ width: `${job.progress || 0}%` }}
          />
        </div>
      )}

      {job.error && isFailed && (
        <p className={styles.errorText}>{job.error}</p>
      )}

      <button
        type="button"
        className={styles.viewButton}
        onClick={onViewProgress}
      >
        <Eye size={14} />
        {isCompleted ? 'Review Strategy' : 'View Progress'}
      </button>
    </div>
  );
}

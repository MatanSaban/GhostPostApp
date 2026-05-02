'use client';

import { Loader2, Sparkles, AlertCircle, CheckCircle2, Languages } from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import styles from './AIBackgroundJobPill.module.css';

/**
 * Compact "background job" indicator shown in the media page header while the
 * AI regenerate modal is closed but a job is still running, has a preview
 * waiting for accept, needs a language pick, or hit an error. Clicking it
 * reopens the modal in whatever state the job is currently in.
 */
export function AIBackgroundJobPill({ status, onOpen }) {
  const { t } = useLocale();

  let Icon = Sparkles;
  let label = '';
  let variant = 'progress';

  switch (status) {
    case 'generating':
      Icon = Loader2;
      label = t('media.ai.pill.generating');
      variant = 'progress';
      break;
    case 'replacing':
      Icon = Loader2;
      label = t('media.ai.pill.replacing');
      variant = 'progress';
      break;
    case 'preview':
      Icon = CheckCircle2;
      label = t('media.ai.pill.previewReady');
      variant = 'ready';
      break;
    case 'needsLanguage':
      Icon = Languages;
      label = t('media.ai.pill.needsLanguage');
      variant = 'ready';
      break;
    case 'error':
      Icon = AlertCircle;
      label = t('media.ai.pill.error');
      variant = 'error';
      break;
    default:
      return null;
  }

  const isSpinning = status === 'generating' || status === 'replacing';

  return (
    <button
      type="button"
      className={`${styles.pill} ${styles[variant] || ''}`}
      onClick={onOpen}
    >
      <Icon className={`${styles.icon} ${isSpinning ? styles.spinning : ''}`} />
      <span className={styles.label}>{label}</span>
    </button>
  );
}

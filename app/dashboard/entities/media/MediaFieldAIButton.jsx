'use client';

import { useState } from 'react';
import { Sparkles, Loader2 } from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import { CREDITS_UPDATED_EVENT } from '@/app/context/user-context';
import AddCreditsModal from '@/app/components/ui/AddCreditsModal';
import styles from './MediaFieldAIButton.module.css';

const FIELD_COST = 1;

/**
 * Inline "rewrite with AI" button used inside both the details sidebar and
 * the lightbox info panel. Charges the caller's account 1 credit, generates
 * a new value for a single metadata field (alt / title / caption /
 * description) in the site's language, and calls `onResult(newValue)` so the
 * parent can replace the field contents.
 *
 * If the account runs out of credits, we surface the same AddCreditsModal
 * that the image-regenerate flow uses.
 */
export function MediaFieldAIButton({
  siteId,
  mediaId,
  field,
  context,
  onResult,
  disabled = false,
  className,
}) {
  const { t } = useLocale();
  const [isGenerating, setIsGenerating] = useState(false);
  const [showAddCredits, setShowAddCredits] = useState(false);
  const [error, setError] = useState(null);

  const handleClick = async (e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    if (isGenerating || disabled || !siteId || !mediaId) return;

    setIsGenerating(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/sites/${siteId}/media/${mediaId}/ai-regenerate-field`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ field, context: context || {} }),
        },
      );

      const data = await res.json().catch(() => ({}));

      if (res.status === 402 && data?.code === 'INSUFFICIENT_CREDITS') {
        setShowAddCredits(true);
        return;
      }

      if (!res.ok || typeof data?.value !== 'string') {
        setError(data?.error || t('media.fieldAi.generationFailed'));
        return;
      }

      onResult?.(data.value, data.language);

      // Let the rest of the app (header credit counter, etc.) know credits
      // changed. UserContext listens for this and refreshes the balance
      // endpoint — the creditsProgressBar in the user menu updates immediately.
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(CREDITS_UPDATED_EVENT));
      }
    } catch (err) {
      console.error('[MediaFieldAIButton] error:', err);
      setError(err?.message || t('media.fieldAi.generationFailed'));
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className={`${styles.button} ${className || ''}`}
        onClick={handleClick}
        disabled={disabled || isGenerating}
        title={
          error ||
          `${t('media.fieldAi.regenerate')} • ${t('media.fieldAi.cost', { credits: FIELD_COST })}`
        }
        aria-label={t('media.fieldAi.regenerate')}
      >
        {isGenerating ? (
          <Loader2 className={styles.spinIcon} size={14} />
        ) : (
          <Sparkles size={14} />
        )}
        <span className={styles.cost}>{FIELD_COST}</span>
      </button>
      <AddCreditsModal
        isOpen={showAddCredits}
        onClose={() => setShowAddCredits(false)}
      />
    </>
  );
}

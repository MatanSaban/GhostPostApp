'use client';

import { useCallback, useRef, useState } from 'react';
import { CREDITS_UPDATED_EVENT } from '@/app/context/user-context';

export const REGENERATE_COST = 5;

/**
 * Async PNG → WebP conversion via canvas. Pulled out of the modal so the
 * generation job (which can outlive the modal mount) owns the upload step too.
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

const slugifyName = (s) =>
  (s || 'generated-image')
    .toLowerCase()
    .replace(/[^a-z0-9֐-׿؀-ۿ]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'generated-image';

/**
 * Owns the lifecycle of a single AI regenerate job for the media library.
 *
 * Lifecycle: idle → generating → (preview | needsLanguage | error)
 *            preview → replacing → done (resets to idle)
 *
 * The state lives at the page level so the modal can be closed while a
 * generation is in flight - generation keeps running and the page-level
 * pill picks up the result.
 */
export function useAIRegenerationJob({ siteId, onReplaceComplete, t }) {
  // Locked snapshot of the item we're regenerating. Captured at start so the
  // user can change `selectedItem` in the grid without disturbing the job.
  const [target, setTarget] = useState(null);
  const [targetIsBroken, setTargetIsBroken] = useState(false);

  // User inputs (also kept here so they survive modal close/reopen)
  const [instructions, setInstructions] = useState('');
  const [aspectRatio, setAspectRatio] = useState('16:9');
  const [chosenLanguage, setChosenLanguage] = useState(null);

  // Status + result
  const [status, setStatus] = useState('idle'); // idle | generating | preview | needsLanguage | replacing | error
  const [error, setError] = useState(null);
  const [insufficientCredits, setInsufficientCredits] = useState(null); // { required } | null
  const [generated, setGenerated] = useState(null); // { base64, mimeType, metadata, language, verification }

  // Used to ignore stale responses if the user resets/restarts mid-flight.
  const runIdRef = useRef(0);

  const reset = useCallback(() => {
    runIdRef.current += 1;
    setTarget(null);
    setTargetIsBroken(false);
    setInstructions('');
    setAspectRatio('16:9');
    setChosenLanguage(null);
    setStatus('idle');
    setError(null);
    setInsufficientCredits(null);
    setGenerated(null);
  }, []);

  const startForItem = useCallback((item, isBroken) => {
    if (status === 'generating' || status === 'replacing') return;
    runIdRef.current += 1;
    setTarget(item || null);
    setTargetIsBroken(!!isBroken);
    setInstructions('');
    setAspectRatio('16:9');
    setChosenLanguage(null);
    setStatus('idle');
    setError(null);
    setInsufficientCredits(null);
    setGenerated(null);
  }, [status]);

  const generate = useCallback(async (languageOverride = null) => {
    if (!target || !siteId) return;
    if (status === 'generating' || status === 'replacing') return;

    const runId = ++runIdRef.current;
    setStatus('generating');
    setError(null);
    setInsufficientCredits(null);

    const existingAlt = target.alt_text || '';
    const existingTitle = target.title?.rendered || target.slug || '';
    const existingCaption = target.caption?.rendered?.replace(/<[^>]*>/g, '') || '';
    const existingDescription = target.description?.rendered?.replace(/<[^>]*>/g, '') || '';

    try {
      const res = await fetch(`/api/sites/${siteId}/media/ai-regenerate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          existingImageUrl: targetIsBroken ? null : target.source_url,
          isBroken: !!targetIsBroken,
          altText: existingAlt,
          title: existingTitle,
          caption: existingCaption,
          description: existingDescription,
          userInstructions: instructions.trim(),
          aspectRatio,
          languageOverride: languageOverride ?? chosenLanguage,
        }),
      });

      // If a newer run started while we were waiting, drop this response.
      if (runId !== runIdRef.current) return;

      const data = await res.json().catch(() => ({}));

      if (res.status === 402 && data?.code === 'INSUFFICIENT_CREDITS') {
        setStatus('error');
        setInsufficientCredits({ required: data.required || REGENERATE_COST });
        return;
      }

      if (!res.ok) {
        setStatus('error');
        setError(data?.error || (t ? t('media.ai.generateFailed') : 'Failed to generate image'));
        return;
      }

      if (data.needsLanguage) {
        setStatus('needsLanguage');
        return;
      }

      if (!data.image?.base64) {
        setStatus('error');
        setError(t ? t('media.ai.generateFailed') : 'Failed to generate image');
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
      if (runId !== runIdRef.current) return;
      console.error('[AIRegenerate] generate error', err);
      setStatus('error');
      setError(err.message || (t ? t('media.ai.generateFailed') : 'Failed to generate image'));
    }
  }, [siteId, target, targetIsBroken, instructions, aspectRatio, chosenLanguage, status, t]);

  /**
   * Accept the generated preview: upload the new file, then delete the original
   * so the new image takes its place in the library. Both succeed-or-fail
   * happens inside this single user action.
   */
  const acceptAndReplace = useCallback(async () => {
    if (!generated || !target || !siteId) return;
    if (status === 'replacing') return;

    const runId = ++runIdRef.current;
    setStatus('replacing');
    setError(null);

    const existingAlt = target.alt_text || '';
    const existingTitle = target.title?.rendered || target.slug || '';

    try {
      const webp = await convertBase64ToWebp(generated.base64, generated.mimeType, 0.9);
      const filename = `${slugifyName(existingTitle)}-${Date.now()}.webp`;

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
      const uploaded = await uploadRes.json().catch(() => ({}));

      if (runId !== runIdRef.current) return;

      if (!uploadRes.ok) {
        setStatus('error');
        setError(uploaded?.error || (t ? t('media.ai.uploadFailed') : 'Upload failed'));
        return;
      }

      // Hand off to the page so it can delete the original + patch the grid.
      if (onReplaceComplete) {
        await onReplaceComplete(uploaded, target.id);
      }

      if (runId !== runIdRef.current) return;
      reset();
    } catch (err) {
      if (runId !== runIdRef.current) return;
      console.error('[AIRegenerate] accept error', err);
      setStatus('error');
      setError(err.message || (t ? t('media.ai.uploadFailed') : 'Upload failed'));
    }
  }, [generated, target, siteId, status, onReplaceComplete, reset, t]);

  /**
   * Discard the current preview and return to the idle input state for the
   * same target item, so the user can tweak instructions and try again.
   */
  const tryAgain = useCallback(() => {
    if (status === 'replacing') return;
    runIdRef.current += 1;
    setGenerated(null);
    setStatus('idle');
    setError(null);
    setInsufficientCredits(null);
  }, [status]);

  const clearInsufficientCredits = useCallback(() => {
    setInsufficientCredits(null);
    if (status === 'error') setStatus('idle');
  }, [status]);

  // True whenever there's anything the user might want to come back to after
  // closing the modal: an in-flight generation, a preview waiting for accept,
  // a language prompt, or an error worth surfacing.
  const isActive =
    status === 'generating' ||
    status === 'preview' ||
    status === 'needsLanguage' ||
    status === 'replacing' ||
    status === 'error';

  return {
    // state
    target,
    targetIsBroken,
    instructions,
    aspectRatio,
    chosenLanguage,
    status,
    error,
    insufficientCredits,
    generated,
    isActive,
    // setters used by the modal as a controlled view
    setInstructions,
    setAspectRatio,
    setChosenLanguage,
    // actions
    startForItem,
    generate,
    acceptAndReplace,
    tryAgain,
    reset,
    clearInsufficientCredits,
  };
}

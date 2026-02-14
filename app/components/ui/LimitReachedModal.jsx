'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  ShieldAlert,
  ShoppingCart,
  ArrowUpRight,
  Loader2,
  Send,
  CheckCircle2,
  Lock,
} from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import { usePermissions } from '@/app/hooks/usePermissions';
import { useRouter } from 'next/navigation';
import styles from './LimitReachedModal.module.css';

/**
 * Resource key → human-readable label key mapping for i18n
 */
const RESOURCE_LABEL_KEY = {
  siteAudits: 'limits.resources.audits',
  maxSites: 'limits.resources.sites',
  maxMembers: 'limits.resources.members',
  aiCredits: 'limits.resources.aiCredits',
  maxKeywords: 'limits.resources.keywords',
  maxContent: 'limits.resources.content',
};

/**
 * LimitReachedModal
 *
 * Dynamic popup that adapts based on:
 *  1. Which resource hit the limit
 *  2. Whether the user has BILLING_MANAGE / Owner permission
 *
 * State A (has permission): "Purchase add-on" CTA
 * State B (no permission):  "Request upgrade from owner" CTA
 */
export default function LimitReachedModal({
  isOpen,
  onClose,
  resourceKey,
  accountId,
  usage,
}) {
  const { t, locale } = useLocale();
  const { isOwner, hasRawPermission, isLoading: permLoading } = usePermissions();
  const router = useRouter();

  const [addOn, setAddOn] = useState(null);
  const [isLoadingAddOn, setIsLoadingAddOn] = useState(true);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isRequesting, setIsRequesting] = useState(false);
  const [purchaseResult, setPurchaseResult] = useState(null); // { success, message }
  const [requestResult, setRequestResult] = useState(null);

  const canManageBilling = isOwner || hasRawPermission('ACCOUNT_BILLING_MANAGE');

  // ── Fetch relevant add-on for this resource ────────────────
  useEffect(() => {
    if (!isOpen || !resourceKey) return;
    let cancelled = false;

    (async () => {
      try {
        setIsLoadingAddOn(true);
        const res = await fetch(
          `/api/account/addon-for-resource?resourceKey=${resourceKey}&locale=${locale}`
        );
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (!cancelled) setAddOn(data.addOn || null);
      } catch {
        if (!cancelled) setAddOn(null);
      } finally {
        if (!cancelled) setIsLoadingAddOn(false);
      }
    })();

    return () => { cancelled = true; };
  }, [isOpen, resourceKey, locale]);

  if (!isOpen) return null;

  const resourceLabel = t(RESOURCE_LABEL_KEY[resourceKey] || 'limits.resources.generic');

  // ── Purchase add-on ────────────────────────────────────────
  const handlePurchase = async () => {
    if (!addOn) return;
    setIsPurchasing(true);
    setPurchaseResult(null);
    try {
      const res = await fetch('/api/account/purchase-addon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ addOnId: addOn.id, accountId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Purchase failed');
      setPurchaseResult({ success: true, message: t('limits.purchaseSuccess') });
    } catch (err) {
      setPurchaseResult({ success: false, message: err.message });
    } finally {
      setIsPurchasing(false);
    }
  };

  // ── Request upgrade from owner ─────────────────────────────
  const handleRequestUpgrade = async () => {
    setIsRequesting(true);
    setRequestResult(null);
    try {
      const res = await fetch('/api/account/request-addon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resourceKey, accountId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Request failed');
      setRequestResult({ success: true, message: data.message || t('limits.requestSent') });
    } catch (err) {
      setRequestResult({ success: false, message: err.message });
    } finally {
      setIsRequesting(false);
    }
  };

  // ── Format price display ──────────────────────────────────
  const formatPrice = () => {
    if (!addOn) return '';
    const sym = addOn.currency === 'ILS' ? '₪' : addOn.currency === 'EUR' ? '€' : '$';
    const period = addOn.billingType === 'RECURRING' ? `/${t('limits.month')}` : '';
    return `${sym}${addOn.price}${period}`;
  };

  const formatQuantity = () => {
    if (!addOn?.quantity) return '';
    return `+${addOn.quantity.toLocaleString()}`;
  };

  return createPortal(
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Close button */}
        <button className={styles.closeBtn} onClick={onClose}>
          <X size={20} />
        </button>

        {/* Icon */}
        <div className={styles.iconWrapper}>
          {canManageBilling ? (
            <ShieldAlert size={32} className={styles.iconAlert} />
          ) : (
            <Lock size={32} className={styles.iconLock} />
          )}
        </div>

        {/* Header */}
        <h2 className={styles.title}>
          {canManageBilling
            ? t('limits.limitReachedTitle', { resource: resourceLabel })
            : t('limits.limitReachedNoPermTitle')}
        </h2>

        {/* Body text */}
        <p className={styles.body}>
          {canManageBilling
            ? t('limits.limitReachedBody', {
                resource: resourceLabel,
                used: usage?.used ?? '—',
                limit: usage?.limit ?? '—',
              })
            : t('limits.limitReachedNoPermBody', { resource: resourceLabel })}
        </p>

        {/* Usage bar */}
        {usage && usage.limit !== null && (
          <div className={styles.usageBar}>
            <div className={styles.usageBarTrack}>
              <div
                className={styles.usageBarFill}
                style={{ width: `${Math.min(100, usage.percentUsed)}%` }}
              />
            </div>
            <span className={styles.usageLabel}>
              {usage.used} / {usage.limit} {t('limits.used')}
            </span>
          </div>
        )}

        {/* ── State A: Has billing permission ──────────────── */}
        {canManageBilling && !permLoading && (
          <div className={styles.actions}>
            {/* Purchase result */}
            {purchaseResult && (
              <div className={`${styles.resultBanner} ${purchaseResult.success ? styles.resultSuccess : styles.resultError}`}>
                {purchaseResult.success ? <CheckCircle2 size={16} /> : <ShieldAlert size={16} />}
                <span>{purchaseResult.message}</span>
              </div>
            )}

            {/* Add-on card */}
            {isLoadingAddOn ? (
              <div className={styles.loadingRow}>
                <Loader2 size={18} className={styles.spinning} />
                <span>{t('limits.loadingAddons')}</span>
              </div>
            ) : addOn ? (
              <div className={styles.addonCard}>
                <div className={styles.addonInfo}>
                  <span className={styles.addonName}>{addOn.name}</span>
                  {addOn.description && (
                    <span className={styles.addonDesc}>{addOn.description}</span>
                  )}
                </div>
                <div className={styles.addonPricing}>
                  <span className={styles.addonQty}>{formatQuantity()} {resourceLabel}</span>
                  <span className={styles.addonPrice}>{formatPrice()}</span>
                </div>
              </div>
            ) : null}

            {/* Primary CTA */}
            {addOn && !purchaseResult?.success && (
              <button
                className={styles.primaryBtn}
                onClick={handlePurchase}
                disabled={isPurchasing}
              >
                {isPurchasing ? (
                  <Loader2 size={18} className={styles.spinning} />
                ) : (
                  <ShoppingCart size={18} />
                )}
                {isPurchasing
                  ? t('limits.purchasing')
                  : t('limits.purchaseAddon', {
                      name: addOn.name,
                      quantity: formatQuantity(),
                      price: formatPrice(),
                    })}
              </button>
            )}

            {/* Secondary link */}
            <button
              className={styles.secondaryBtn}
              onClick={() => {
                onClose();
                router.push(addOn
                  ? '/dashboard/settings?tab=addons'
                  : '/dashboard/settings?tab=subscription'
                );
              }}
            >
              <ArrowUpRight size={16} />
              {addOn ? t('limits.manageAddons') : t('limits.upgradeSubscription')}
            </button>
          </div>
        )}

        {/* ── State B: No billing permission ───────────────── */}
        {!canManageBilling && !permLoading && (
          <div className={styles.actions}>
            {requestResult && (
              <div className={`${styles.resultBanner} ${requestResult.success ? styles.resultSuccess : styles.resultError}`}>
                {requestResult.success ? <CheckCircle2 size={16} /> : <ShieldAlert size={16} />}
                <span>{requestResult.message}</span>
              </div>
            )}

            {!requestResult?.success && (
              <button
                className={styles.primaryBtn}
                onClick={handleRequestUpgrade}
                disabled={isRequesting}
              >
                {isRequesting ? (
                  <Loader2 size={18} className={styles.spinning} />
                ) : (
                  <Send size={18} />
                )}
                {isRequesting
                  ? t('limits.sending')
                  : t('limits.requestUpgrade')}
              </button>
            )}

            <button className={styles.secondaryBtn} onClick={onClose}>
              {t('common.cancel')}
            </button>
          </div>
        )}

        {/* Loading permissions */}
        {permLoading && (
          <div className={styles.loadingRow}>
            <Loader2 size={18} className={styles.spinning} />
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

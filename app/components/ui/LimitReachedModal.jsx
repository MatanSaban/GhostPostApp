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
import { emitCreditsUpdated } from '@/app/context/user-context';
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
 * State A (has permission): list every active add-on for the resource —
 *                           RECURRING (permanent) options first, then ONE_TIME.
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

  const [addOns, setAddOns] = useState([]);
  const [isLoadingAddOns, setIsLoadingAddOns] = useState(true);
  const [purchasingId, setPurchasingId] = useState(null);
  const [isRequesting, setIsRequesting] = useState(false);
  const [purchaseResult, setPurchaseResult] = useState(null); // { success, message }
  const [requestResult, setRequestResult] = useState(null);
  const [currentUsage, setCurrentUsage] = useState(usage);

  // Reset local usage whenever the prop changes (e.g. modal re-opened for a new resource)
  useEffect(() => {
    setCurrentUsage(usage);
  }, [usage]);

  const canManageBilling = isOwner || hasRawPermission('ACCOUNT_BILLING_MANAGE');

  // Fetch all add-on options for this resource
  useEffect(() => {
    if (!isOpen || !resourceKey) return;
    let cancelled = false;

    (async () => {
      try {
        setIsLoadingAddOns(true);
        const res = await fetch(
          `/api/account/addon-for-resource?resourceKey=${resourceKey}&locale=${locale}`
        );
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (!cancelled) {
          setAddOns(
            Array.isArray(data.addOns)
              ? data.addOns
              : (data.addOn ? [data.addOn] : [])
          );
        }
      } catch {
        if (!cancelled) setAddOns([]);
      } finally {
        if (!cancelled) setIsLoadingAddOns(false);
      }
    })();

    return () => { cancelled = true; };
  }, [isOpen, resourceKey, locale]);

  if (!isOpen) return null;

  const resourceLabel = t(RESOURCE_LABEL_KEY[resourceKey] || 'limits.resources.generic');

  const handlePurchase = async (addOn) => {
    if (!addOn) return;
    setPurchasingId(addOn.id);
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

      // Refresh usage shown inside the modal
      try {
        const usageRes = await fetch(`/api/account/usage?resourceKey=${resourceKey}`);
        if (usageRes.ok) {
          const fresh = await usageRes.json();
          if (fresh && typeof fresh.used !== 'undefined') {
            setCurrentUsage(fresh);
          }
        }
      } catch {
        // Non-critical — user-context polling will catch up
      }

      // Notify the rest of the app (DashboardHeader credits bar, etc.)
      emitCreditsUpdated();
    } catch (err) {
      setPurchaseResult({ success: false, message: err.message });
    } finally {
      setPurchasingId(null);
    }
  };

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

  const formatPrice = (addOn) => {
    if (!addOn) return '';
    const sym = addOn.currency === 'ILS' ? '₪' : addOn.currency === 'EUR' ? '€' : '$';
    const period = addOn.billingType === 'RECURRING' ? `/${t('limits.month')}` : '';
    return `${sym}${addOn.price}${period}`;
  };

  const formatQuantity = (addOn) => {
    if (!addOn?.quantity) return '';
    return `+${addOn.quantity.toLocaleString()}`;
  };

  const recurringAddOns = addOns.filter((a) => a.billingType === 'RECURRING');
  const oneTimeAddOns = addOns.filter((a) => a.billingType === 'ONE_TIME');

  const renderAddOnCard = (addOn) => {
    const isThisPurchasing = purchasingId === addOn.id;
    const disabled = purchasingId !== null;
    return (
      <div key={addOn.id} className={styles.addonCard}>
        <div className={styles.addonInfo}>
          <div className={styles.addonHeader}>
            <span className={styles.addonName}>
              <bdi>{addOn.name}</bdi>
            </span>
            <span
              className={`${styles.addonBadge} ${
                addOn.billingType === 'RECURRING'
                  ? styles.badgeRecurring
                  : styles.badgeOneTime
              }`}
            >
              {addOn.billingType === 'RECURRING'
                ? t('limits.permanentBadge')
                : t('limits.oneTimeBadge')}
            </span>
          </div>
          {addOn.description && (
            <span className={styles.addonDesc}>{addOn.description}</span>
          )}
        </div>
        <button
          className={styles.addonBuyBtn}
          onClick={() => handlePurchase(addOn)}
          disabled={disabled}
        >
          {isThisPurchasing ? (
            <Loader2 size={16} className={styles.spinning} />
          ) : (
            <ShoppingCart size={16} />
          )}
          <span>
            {isThisPurchasing
              ? t('limits.purchasing')
              : (() => {
                  const template = t('limits.purchaseAddon', {
                    name: 'NAME',
                    price: 'PRICE',
                  });
                  return template
                    .split(/(NAME|PRICE)/)
                    .map((part, i) => {
                      if (part === 'NAME') return <bdi key={i}>{addOn.name}</bdi>;
                      if (part === 'PRICE') return <bdi key={i}>{formatPrice(addOn)}</bdi>;
                      return part;
                    });
                })()}
          </span>
        </button>
      </div>
    );
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
                used: currentUsage?.used ?? '-',
                limit: currentUsage?.limit ?? '-',
              })
            : t('limits.limitReachedNoPermBody', { resource: resourceLabel })}
        </p>

        {/* Usage bar */}
        {currentUsage && currentUsage.limit !== null && (
          <div className={styles.usageBar}>
            <div className={styles.usageBarTrack}>
              <div
                className={styles.usageBarFill}
                style={{ width: `${Math.min(100, currentUsage.percentUsed)}%` }}
              />
            </div>
            <span className={styles.usageLabel}>
              {currentUsage.used} / {currentUsage.limit} {t('limits.used')}
            </span>
          </div>
        )}

        {/* State A: Has billing permission */}
        {canManageBilling && !permLoading && (
          <div className={styles.actions}>
            {purchaseResult && (
              <div className={`${styles.resultBanner} ${purchaseResult.success ? styles.resultSuccess : styles.resultError}`}>
                {purchaseResult.success ? <CheckCircle2 size={16} /> : <ShieldAlert size={16} />}
                <span>{purchaseResult.message}</span>
              </div>
            )}

            {isLoadingAddOns ? (
              <div className={styles.loadingRow}>
                <Loader2 size={18} className={styles.spinning} />
                <span>{t('limits.loadingAddons')}</span>
              </div>
            ) : addOns.length === 0 ? (
              <p className={styles.emptyAddons}>{t('limits.noAddonsAvailable')}</p>
            ) : (
              <div className={styles.addonGroups}>
                {recurringAddOns.length > 0 && (
                  <div className={styles.addonGroup}>
                    <span className={styles.addonGroupLabel}>
                      {t('limits.permanentAddonsLabel')}
                    </span>
                    <div className={styles.addonList}>
                      {recurringAddOns.map(renderAddOnCard)}
                    </div>
                  </div>
                )}
                {oneTimeAddOns.length > 0 && (
                  <div className={styles.addonGroup}>
                    <span className={styles.addonGroupLabel}>
                      {t('limits.oneTimeAddonsLabel')}
                    </span>
                    <div className={styles.addonList}>
                      {oneTimeAddOns.map(renderAddOnCard)}
                    </div>
                  </div>
                )}
              </div>
            )}

            <button
              className={styles.secondaryBtn}
              onClick={() => {
                onClose();
                router.push(addOns.length > 0
                  ? '/dashboard/settings?tab=addons'
                  : '/dashboard/settings?tab=subscription'
                );
              }}
            >
              <ArrowUpRight size={16} />
              {addOns.length > 0 ? t('limits.manageAddons') : t('limits.upgradeSubscription')}
            </button>
          </div>
        )}

        {/* State B: No billing permission */}
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

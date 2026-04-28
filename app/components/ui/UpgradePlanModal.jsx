'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Check,
  Sparkles,
  Loader2,
  Crown,
  ArrowRight,
  ShoppingCart,
  AlertTriangle,
} from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import { useModalResize, ModalResizeButton } from '@/app/components/ui/ModalResizeButton';
import { useUser } from '@/app/context/user-context';
import { useRouter } from 'next/navigation';
import CardComPaymentForm from './CardComPaymentForm';
import styles from './UpgradePlanModal.module.css';

/**
 * UpgradePlanModal
 * 
 * Shows available plans in a popup with the current plan highlighted.
 * Step 1: Select plan
 * Step 2: Payment via CardCom Open Fields
 */
export default function UpgradePlanModal({ isOpen, onClose }) {
  const { t, locale } = useLocale();
  const { user, refreshUser } = useUser();
  const router = useRouter();
  const [plans, setPlans] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // Payment step state
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [paymentComplete, setPaymentComplete] = useState(false);
  const [prorationData, setProrationData] = useState(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const { isMaximized, toggleMaximize } = useModalResize();

  // Downgrade confirmation state
  const [downgradeAgreed, setDowngradeAgreed] = useState(false);
  const [isDowngrading, setIsDowngrading] = useState(false);
  const [downgradeError, setDowngradeError] = useState(null);

  // Current plan slug
  const currentPlanSlug = user?.subscription?.plan?.slug || null;

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;

    (async () => {
      try {
        setIsLoading(true);
        const res = await fetch(`/api/public/plans?lang=${locale}`);
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (!cancelled) setPlans(data.plans || []);
      } catch {
        if (!cancelled) setPlans([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    // Reset state
    setSelectedPlan(null);
    setPaymentComplete(false);
    setProrationData(null);

    return () => { cancelled = true; };
  }, [isOpen, locale]);

  if (!isOpen) return null;

  const formatPrice = (plan) => {
    if (plan.monthlyPrice !== undefined) {
      // Always format in USD - the modal is a consumer-facing upgrade
      // surface and the canonical plan price is USD, regardless of what
      // currency the plan record was seeded with. Using 'en-US' locale so
      // the "$" prefix and Latin digits render the same in both EN and HE.
      const price = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
      }).format(plan.monthlyPrice);
      return price;
    }
    return plan.price || '';
  };

  const formatAmount = (amount, currency = 'USD') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const handleSelectPlan = async (plan) => {
    // If plan is free or same as current, just navigate
    if (plan.monthlyPrice === 0 || plan.monthlyPrice === undefined) {
      onClose();
      router.push(`/dashboard/settings?tab=subscription&upgradeTo=${plan.slug}`);
      return;
    }

    // Fetch proration data
    setIsCalculating(true);
    setSelectedPlan(plan);
    try {
      const res = await fetch('/api/payment/prorate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPlanId: plan.id, lang: locale }),
      });
      if (res.ok) {
        const data = await res.json();
        setProrationData(data);
      } else {
        const data = await res.json().catch(() => ({}));
        if (res.status === 400 && data.error === 'Already on this plan') {
          setSelectedPlan(null);
          setProrationData(null);
          return;
        }
        // Fallback: use full price if proration fails
        setProrationData(null);
      }
    } catch {
      setProrationData(null);
    } finally {
      setIsCalculating(false);
    }
  };

  const handlePaymentSuccess = (result) => {
    setPaymentComplete(true);
    refreshUser?.();
  };

  const handlePaymentBack = () => {
    setSelectedPlan(null);
    setProrationData(null);
    setDowngradeAgreed(false);
    setDowngradeError(null);
  };

  const handleClose = () => {
    if (paymentComplete) {
      refreshUser?.();
    }
    onClose();
  };

  // Check if this is a downgrade where the user has surplus credit (netAmount = 0)
  const isDowngradeWithSurplus = selectedPlan && prorationData
    && prorationData.type === 'downgrade'
    && prorationData.netAmount === 0
    && prorationData.unusedCredit > 0;

  const handleDowngradeConfirm = async () => {
    if (!downgradeAgreed) return;
    setIsDowngrading(true);
    setDowngradeError(null);
    try {
      const res = await fetch('/api/payment/downgrade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planSlug: selectedPlan.slug,
          planId: selectedPlan.id,
          unusedCredit: prorationData.unusedCredit,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setPaymentComplete(true);
        refreshUser?.();
      } else {
        setDowngradeError(data.error || 'Failed to downgrade');
      }
    } catch {
      setDowngradeError('Failed to downgrade plan');
    } finally {
      setIsDowngrading(false);
    }
  };

  return createPortal(
    <div className={styles.overlay} onClick={handleClose}>
      <div className={`${styles.modal} ${isMaximized ? 'modal-maximized' : ''}`} onClick={(e) => e.stopPropagation()}>
        {/* Close */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', position: 'absolute', top: '1rem', right: '1rem', zIndex: 1 }}>
          <ModalResizeButton isMaximized={isMaximized} onToggle={toggleMaximize} className={styles.closeBtn} />
          <button className={styles.closeBtn} onClick={handleClose}>
            <X size={20} />
          </button>
        </div>

        {/* Payment Step */}
        {selectedPlan ? (
          paymentComplete ? (
            // Success view
            <div className={styles.successView}>
              <div className={styles.successIconLarge}>
                <Check size={36} />
              </div>
              <h2 className={styles.title}>
                {t('payment.successTitle') || 'Payment Successful!'}
              </h2>
              <p className={styles.subtitle}>
                {prorationData?.type === 'downgrade'
                  ? (t('upgradePlanModal.downgradedTo') || 'Downgraded to')
                  : (t('upgradePlanModal.upgradedTo') || 'Upgraded to')
                } {selectedPlan.name}
              </p>
              <button className={styles.footerLink} onClick={handleClose}>
                {t('common.close') || 'Close'}
              </button>
            </div>
          ) : isCalculating ? (
            // Loading proration
            <div className={styles.loading}>
              <Loader2 size={24} className={styles.spinning} />
            </div>
          ) : isDowngradeWithSurplus ? (
            // Downgrade confirmation view - user forfeits surplus credit
            <>
              <div className={styles.header}>
                <div className={styles.iconWrapper} style={{ background: 'rgba(245, 158, 11, 0.12)', color: '#f59e0b' }}>
                  <AlertTriangle size={28} />
                </div>
                <h2 className={styles.title}>
                  {t('downgrade.title') || 'Downgrade Plan'}
                </h2>
                <p className={styles.subtitle}>
                  {selectedPlan.name} - {formatPrice(selectedPlan)}{selectedPlan.period || '/month'}
                </p>
              </div>

              {/* Proration breakdown */}
              <div className={styles.downgradeCard}>
                <div className={styles.prorationRow}>
                  <span>{t('proration.currentPlan') || 'Current plan'}</span>
                  <span>{prorationData.currentPlanName} ({formatAmount(prorationData.currentMonthlyPrice, selectedPlan.currency || 'USD')}/{t('proration.mo') || 'mo'})</span>
                </div>
                <div className={styles.prorationRow}>
                  <span>{t('proration.newPlan') || 'New plan'}</span>
                  <span>{prorationData.newPlanName} ({formatAmount(prorationData.newMonthlyPrice, selectedPlan.currency || 'USD')}/{t('proration.mo') || 'mo'})</span>
                </div>
                <div className={styles.prorationDivider} />
                <div className={styles.prorationRow}>
                  <span>{t('proration.unusedCredit') || 'Credit for unused days'}</span>
                  <span className={styles.prorationCredit}>−{formatAmount(prorationData.creditAmount, selectedPlan.currency || 'USD')}</span>
                </div>
                <div className={styles.prorationRow}>
                  <span>{t('proration.newPlanCharge') || 'New plan remaining days'}</span>
                  <span>{formatAmount(prorationData.chargeAmount, selectedPlan.currency || 'USD')}</span>
                </div>
                <div className={styles.prorationRow} style={{ opacity: 0.6, fontSize: '0.75rem' }}>
                  <span>{prorationData.remainingDays} {t('proration.daysLeft') || 'days left'} / {prorationData.totalDays} {t('proration.daysInMonth') || 'days in month'}</span>
                </div>
                <div className={styles.prorationDivider} />
                <div className={`${styles.prorationRow} ${styles.prorationTotal}`}>
                  <span>{t('downgrade.forfeitedAmount') || 'Amount forfeited (no refund)'}</span>
                  <span style={{ color: '#ef4444' }}>{formatAmount(prorationData.unusedCredit, selectedPlan.currency || 'USD')}</span>
                </div>
                <div className={styles.prorationNote}>
                  {t('proration.nextBillingNote') || 'Next billing on'} {new Date(prorationData.nextBillingDate).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' })} - {formatAmount(prorationData.newMonthlyPrice, selectedPlan.currency || 'USD')}
                </div>
              </div>

              {/* Warning + checkbox */}
              <div className={styles.downgradeWarning}>
                <AlertTriangle size={16} />
                <p>{t('downgrade.warningText') || 'By downgrading, you will lose the unused credit from your current plan. This amount cannot be refunded.'}</p>
              </div>

              <label className={styles.downgradeCheckbox}>
                <input
                  type="checkbox"
                  checked={downgradeAgreed}
                  onChange={(e) => setDowngradeAgreed(e.target.checked)}
                />
                <span>{t('downgrade.agreeText') || 'I understand that I will not receive a refund for the unused portion of my current plan.'}</span>
              </label>

              {downgradeError && (
                <div className={styles.downgradeError}>
                  {downgradeError}
                </div>
              )}

              <div className={styles.downgradeActions}>
                <button className={styles.downgradeBackBtn} onClick={handlePaymentBack}>
                  <ArrowRight size={16} style={{ transform: locale === 'he' ? 'none' : 'rotate(180deg)' }} />
                  {t('common.back') || 'Back'}
                </button>
                <button
                  className={styles.downgradeConfirmBtn}
                  onClick={handleDowngradeConfirm}
                  disabled={!downgradeAgreed || isDowngrading}
                >
                  {isDowngrading ? (
                    <><Loader2 size={16} className={styles.spinning} /> {t('payment.processing') || 'Processing...'}</>
                  ) : (
                    t('downgrade.confirm') || 'Confirm Downgrade'
                  )}
                </button>
              </div>
            </>
          ) : (
            // Payment form
            <>
              <div className={styles.header}>
                <div className={styles.iconWrapper}>
                  <ShoppingCart size={28} />
                </div>
                <h2 className={styles.title}>
                  {t('payment.payNow') || 'Pay Now'}
                </h2>
                <p className={styles.subtitle}>
                  {selectedPlan.name} - {formatPrice(selectedPlan)}{selectedPlan.period || '/month'}
                </p>
              </div>
              <CardComPaymentForm
                amount={prorationData ? (prorationData.netAmount ?? prorationData.proratedAmount) : selectedPlan.monthlyPrice}
                currency={selectedPlan.currency || 'USD'}
                usdToIlsRate={selectedPlan.usdToIlsRate}
                productName={selectedPlan.name}
                action={{
                  type: 'plan_upgrade',
                  planSlug: selectedPlan.slug,
                  planId: selectedPlan.id,
                  itemId: selectedPlan.id,
                  proration: prorationData || null,
                }}
                onSuccess={handlePaymentSuccess}
                onError={(err) => console.error('Payment error:', err)}
                onBack={handlePaymentBack}
                defaultName={[user?.firstName, user?.lastName].filter(Boolean).join(' ')}
                defaultEmail={user?.email || ''}
                defaultPhone={user?.phoneNumber || ''}
                showOrderSummary={true}
                orderSummaryContent={prorationData ? (
                  <div>
                    {prorationData.type === 'new' ? (
                      <>
                        <div className={styles.prorationRow}>
                          <span>{t('proration.newPlan') || 'Plan'}</span>
                          <span>{prorationData.newPlanName}</span>
                        </div>
                        <div className={styles.prorationRow}>
                          <span>{t('proration.monthlyPrice') || 'Monthly price'}</span>
                          <span>{formatAmount(prorationData.fullMonthlyPrice, selectedPlan.currency || 'USD')}</span>
                        </div>
                        <div className={styles.prorationRow}>
                          <span>{t('proration.remainingDays') || 'Remaining days this month'}</span>
                          <span>{prorationData.remainingDays} / {prorationData.totalDays}</span>
                        </div>
                        <div className={styles.prorationDivider} />
                        <div className={`${styles.prorationRow} ${styles.prorationTotal}`}>
                          <span>{t('proration.payToday') || 'Pay today (prorated)'}</span>
                          <span>{formatAmount(prorationData.proratedAmount, selectedPlan.currency || 'USD')}</span>
                        </div>
                        <div className={styles.prorationNote}>
                          {t('proration.nextBillingNote') || 'Next billing on'} {new Date(prorationData.nextBillingDate).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' })} - {formatAmount(prorationData.fullMonthlyPrice, selectedPlan.currency || 'USD')}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className={styles.prorationRow}>
                          <span>{t('proration.currentPlan') || 'Current plan'}</span>
                          <span>{prorationData.currentPlanName} ({formatAmount(prorationData.currentMonthlyPrice, selectedPlan.currency || 'USD')}/{t('proration.mo') || 'mo'})</span>
                        </div>
                        <div className={styles.prorationRow}>
                          <span>{t('proration.newPlan') || 'New plan'}</span>
                          <span>{prorationData.newPlanName} ({formatAmount(prorationData.newMonthlyPrice, selectedPlan.currency || 'USD')}/{t('proration.mo') || 'mo'})</span>
                        </div>
                        <div className={styles.prorationDivider} />
                        <div className={styles.prorationRow}>
                          <span>{t('proration.unusedCredit') || 'Credit for unused days'}</span>
                          <span className={styles.prorationCredit}>−{formatAmount(prorationData.creditAmount, selectedPlan.currency || 'USD')}</span>
                        </div>
                        <div className={styles.prorationRow}>
                          <span>{t('proration.newPlanCharge') || 'New plan remaining days'}</span>
                          <span>{formatAmount(prorationData.chargeAmount, selectedPlan.currency || 'USD')}</span>
                        </div>
                        <div className={styles.prorationRow} style={{ opacity: 0.6, fontSize: '0.75rem' }}>
                          <span>{prorationData.remainingDays} {t('proration.daysLeft') || 'days left'} / {prorationData.totalDays} {t('proration.daysInMonth') || 'days in month'}</span>
                        </div>
                        <div className={styles.prorationDivider} />
                        <div className={`${styles.prorationRow} ${styles.prorationTotal}`}>
                          <span>{t('proration.payToday') || 'Pay today'}</span>
                          <span>{formatAmount(prorationData.netAmount, selectedPlan.currency || 'USD')}</span>
                        </div>
                        <div className={styles.prorationNote}>
                          {t('proration.nextBillingNote') || 'Next billing on'} {new Date(prorationData.nextBillingDate).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' })} - {formatAmount(prorationData.newMonthlyPrice, selectedPlan.currency || 'USD')}
                        </div>
                      </>
                    )}
                  </div>
                ) : null}
              />
            </>
          )
        ) : (
          <>
            {/* Header */}
            <div className={styles.header}>
              <div className={styles.iconWrapper}>
                <Crown size={28} />
              </div>
              <h2 className={styles.title}>
                {t('upgradePlanModal.title') || 'Upgrade Your Plan'}
              </h2>
              <p className={styles.subtitle}>
                {t('upgradePlanModal.subtitle') || 'Choose the plan that best fits your needs'}
              </p>
            </div>

            {/* Plans */}
            {isLoading ? (
              <div className={styles.loading}>
                <Loader2 size={24} className={styles.spinning} />
              </div>
            ) : plans.length === 0 ? (
              <p className={styles.empty}>
                {t('upgradePlanModal.noPlans') || 'No plans available'}
              </p>
            ) : (
              <div className={styles.plansGrid}>
                {plans.map((plan) => {
                  const isCurrent = plan.slug === currentPlanSlug;

                  // Number formatter: small numbers render with thousands
                  // separators (1,000), big ones abbreviate (10K, 1M) so
                  // the bullet rows don't grow wide.
                  const fmtNum = (n) => {
                    if (n == null || n === '' || Number.isNaN(Number(n))) return '';
                    const num = Number(n);
                    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
                    if (num >= 10_000) return `${(num / 1_000).toFixed(1)}K`;
                    return num.toLocaleString(locale === 'he' ? 'he-IL' : 'en-US');
                  };

                  /*
                   * Render a limitation as "N Label" (or "Unlimited Label"
                   * / "- Label" for the unlimited / falsy cases). The
                   * stored label is the noun ("Keywords", "מילות מפתח"),
                   * `.value` is the numeric cap. If the label is already a
                   * full sentence (contains digits or common count words
                   * inline), we trust it and use it as-is.
                   */
                  const unlimitedWord = t('upgradePlanModal.unlimited') || 'Unlimited';
                  const formatLimitation = (lim) => {
                    if (!lim) return '';
                    if (typeof lim === 'string') return lim;
                    const label = lim.label || lim.key || '';
                    if (!label) return '';
                    // If the translator already wrote the full sentence,
                    // don't double-prefix a number in front of it.
                    if (/\d/.test(label)) return label;
                    const value = lim.value;
                    if (lim.type === 'unlimited' || value === -1) {
                      return `${unlimitedWord} ${label}`;
                    }
                    if (value == null || value === '' || value === 0) return label;
                    const isRtl = locale === 'he';
                    const formatted = fmtNum(value);
                    if (!formatted) return label;
                    // In Hebrew the noun conventionally comes before the
                    // number ("מילות מפתח: 100"), in English the number
                    // comes first ("100 Keywords"). Colon separator keeps
                    // it clean in both.
                    return isRtl ? `${label}: ${formatted}` : `${formatted} ${label}`;
                  };

                  const toLabel = (x) =>
                    typeof x === 'string' ? x : (x?.label || x?.key || '');
                  const limitations = Array.isArray(plan.limitations)
                    ? plan.limitations.map(formatLimitation).filter(Boolean)
                    : [];
                  const features = Array.isArray(plan.features)
                    ? plan.features.map(toLabel).filter(Boolean)
                    : [];

                  return (
                    <div
                      key={plan.id || plan.slug}
                      className={`${styles.planCard} ${plan.popular ? styles.popular : ''} ${isCurrent ? styles.current : ''}`}
                      aria-current={isCurrent ? 'true' : undefined}
                    >
                      {plan.popular && !isCurrent && (
                        <div className={styles.popularBadge}>
                          <Sparkles size={10} />
                          {t('upgradePlanModal.popular') || 'Popular'}
                        </div>
                      )}
                      {/*
                       * Visual "current plan" indicator - top-anchored pill
                       * with a check so the selected state is obvious at a
                       * glance, not only via the disabled button at the
                       * bottom of the card.
                       */}
                      {isCurrent && (
                        <div className={styles.currentBadge}>
                          <Check size={10} />
                          {' '}
                          {t('upgradePlanModal.currentPlan') || 'Current Plan'}
                        </div>
                      )}
                      <h3 className={styles.planName}>{plan.name}</h3>
                      {plan.description && (
                        <p className={styles.planDescription}>{plan.description}</p>
                      )}

                      <div className={styles.planPrice}>
                        <span className={styles.priceAmount}>{formatPrice(plan)}</span>
                        <span className={styles.pricePeriod}>{plan.period || '/month'}</span>
                      </div>

                      {/*
                       * Limitations first, then features - same order and
                       * checkmark styling gp-ws uses on the public pricing
                       * page. We render the full list (not a sliced preview)
                       * so the modal shows the same information the user
                       * saw before signing up.
                       */}
                      {(limitations.length > 0 || features.length > 0) && (
                        <ul className={styles.featuresList}>
                          {limitations.map((limitation, i) => (
                            <li key={`limit-${i}`} className={styles.featureItem}>
                              <Check size={14} className={styles.featureCheck} />
                              <span>{limitation}</span>
                            </li>
                          ))}
                          {features.map((feature, i) => (
                            <li key={`feat-${i}`} className={styles.featureItem}>
                              <Check size={14} className={styles.featureCheck} />
                              <span>{feature}</span>
                            </li>
                          ))}
                        </ul>
                      )}

                      <button
                        className={`${styles.selectBtn} ${isCurrent ? styles.selectBtnCurrent : ''}`}
                        onClick={() => !isCurrent && handleSelectPlan(plan)}
                        disabled={isCurrent}
                        aria-disabled={isCurrent ? 'true' : undefined}
                      >
                        {isCurrent ? (
                          <>
                            <Check size={14} />
                            {t('upgradePlanModal.currentPlan') || 'Current Plan'}
                          </>
                        ) : (
                          <>
                            {t('upgradePlanModal.selectPlan') || 'Select Plan'}
                            <ArrowRight size={14} />
                          </>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Footer link */}
            <button
              className={styles.footerLink}
              onClick={() => {
                handleClose();
                router.push('/dashboard/settings?tab=subscription');
              }}
            >
              {t('upgradePlanModal.manageSubscription') || 'Manage Subscription'}
              <ArrowRight size={14} />
            </button>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}

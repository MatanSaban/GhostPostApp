'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Lock,
  Loader2,
  AlertCircle,
  Check,
  ArrowLeft,
  Ticket,
  X,
} from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import { applyCouponToOrder } from '@/lib/coupon-pricing';
import styles from './CardComPaymentForm.module.css';

const CARDCOM_BASE = 'https://secure.cardcom.solutions';

/**
 * CardComPaymentForm
 * 
 * Reusable PCI-compliant payment form using CardCom Open Fields.
 * Card number and CVV are rendered inside secure CardCom iframes.
 * 
 * Props:
 *  - amount: number (total to charge)
 *  - currency: string ('ILS'|'USD'|'EUR')
 *  - productName: string
 *  - action: { type: 'addon_purchase'|'plan_upgrade', ...metadata }
 *  - onSuccess: (result) => void
 *  - onError: (error) => void
 *  - onBack: () => void  (optional back button)
 *  - defaultName: string (prefilled cardholder name)
 *  - defaultEmail: string (prefilled email)
 *  - defaultPhone: string (prefilled phone)
 *  - showOrderSummary: boolean
 *  - orderSummaryContent: ReactNode (custom order summary)
 */
export default function CardComPaymentForm({
  amount,
  currency = 'USD',
  productName,
  action,
  onSuccess,
  onError,
  onBack,
  defaultName = '',
  defaultEmail = '',
  defaultPhone = '',
  showOrderSummary = true,
  orderSummaryContent = null,
  usdToIlsRate,
}) {
  const { t, locale, direction } = useLocale();
  const lang = locale === 'he' ? 'he' : 'en';

  // State
  const [lowProfileId, setLowProfileId] = useState(null);
  const [paymentId, setPaymentId] = useState(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [initError, setInitError] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentResult, setPaymentResult] = useState(null); // { success, message }

  // Form fields (non-iframe)
  const [cardholderName, setCardholderName] = useState(defaultName);
  const [citizenId, setCitizenId] = useState('');
  const [billingEmail, setBillingEmail] = useState(defaultEmail);
  const [cardOwnerPhone, setCardOwnerPhone] = useState(defaultPhone);
  const [expirationMonth, setExpirationMonth] = useState('');
  const [expirationYear, setExpirationYear] = useState('');
  const [numberOfPayments] = useState('1');

  // Validation state from iframes
  const [cardNumberValid, setCardNumberValid] = useState(null);
  const [cvvValid, setCvvValid] = useState(null);

  // True once we've posted init for the current LowProfile AND given CardCom
  // a moment to internally bind. Pay Now is disabled until this flips so we
  // can't post doTransaction to a master iframe that hasn't been bound yet
  // (which silently drops the message — the failure mode users hit on coupon
  // apply, where the iframe fully remounts behind the loader).
  const [iframeReady, setIframeReady] = useState(false);

  // Coupon state
  const [couponCode, setCouponCode] = useState('');
  const [couponData, setCouponData] = useState(null);
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponError, setCouponError] = useState('');

  // Saved-payment-method picker (D1). Two modes:
  //   'saved' → user picked a previously-saved card; we POST to
  //              /api/payment/charge-saved-card with the paymentMethodId.
  //   'new'   → "Use a different card" — show the iframe flow which now goes
  //              through J2 + DoTransaction and saves a new token on success.
  // Defaults to 'saved' when there's an eligible method, else 'new'.
  const [savedMethods, setSavedMethods] = useState([]);
  const [savedLoaded, setSavedLoaded] = useState(false);
  const [paymentMode, setPaymentMode] = useState('new');
  const [selectedSavedId, setSelectedSavedId] = useState(null);

  const iframeInitialized = useRef(false);
  const masterFrameRef = useRef(null);

  // Coupon math via the centralized helper so PERCENTAGE / FIXED_DISCOUNT /
  // FIXED_PRICE / legacy FIXED_AMOUNT all behave identically across the
  // registration flow, dashboard addon flow, and the recurring billing engine.
  const couponResult = applyCouponToOrder(amount, couponData);
  const effectiveAmount = couponResult.applies ? couponResult.finalUsd : amount;

  // Load 3DS script
  useEffect(() => {
    const existingScript = document.querySelector('script[src*="cardcom.solutions/External/OpenFields/3DS"]');
    if (!existingScript) {
      const script = document.createElement('script');
      script.src = `${CARDCOM_BASE}/External/OpenFields/3DS.js?v=${Date.now()}`;
      script.async = true;
      document.head.appendChild(script);
    }
  }, []);

  // Load saved payment methods on mount. We only show cards that are
  // eligible for this flow — gift cards never; debit cards OK because the
  // dashboard addon path explicitly allows them. The default-isDefault card
  // is preselected; user can switch or pick "Use a different card".
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/payment-methods');
        if (!res.ok) throw new Error('failed');
        const data = await res.json();
        const eligible = (data.paymentMethods || []).filter((pm) => pm.cardInfo !== 'GiftCard');
        if (cancelled) return;
        setSavedMethods(eligible);
        if (eligible.length > 0) {
          const def = eligible.find((pm) => pm.isDefault) || eligible[0];
          setSelectedSavedId(def.id);
          setPaymentMode('saved');
        }
      } catch {
        // No saved cards available — silently fall back to "new card" mode.
      } finally {
        if (!cancelled) setSavedLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Initialize payment session. Skipped when:
  //   - coupon covers the full amount (no charge needed)
  //   - paymentMode === 'saved' (we'll charge the saved token via a separate
  //     endpoint instead of going through the iframe / J2 flow)
  useEffect(() => {
    if (effectiveAmount <= 0 || paymentMode === 'saved') {
      setIsInitializing(false);
      setInitError(null);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        setIsInitializing(true);
        setInitError(null);

        const res = await fetch('/api/payment/init', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount: effectiveAmount,
            currency,
            productName,
            language: lang,
            action: {
              ...action,
              coupon: couponData ? { code: couponData.code, discountType: couponData.discountType, discountValue: couponData.discountValue } : null,
            },
          }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to initialize payment');
        
        if (!cancelled) {
          setLowProfileId(data.lowProfileId);
          setPaymentId(data.paymentId);
        }
      } catch (err) {
        if (!cancelled) {
          setInitError(err.message);
          onError?.(err.message);
        }
      } finally {
        if (!cancelled) setIsInitializing(false);
      }
    })();

    return () => { cancelled = true; };
  }, [effectiveAmount, currency, productName, lang, paymentMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Build the init payload (LP + themed CSS) every time we need to (re)apply
  // styling. Reads CSS variables from the parent document so the iframe fields
  // match the active theme.
  const buildInitPayload = useCallback(() => {
    const rootStyles = getComputedStyle(document.documentElement);
    const borderColor = rootStyles.getPropertyValue('--input-border').trim() || '#d1d5db';
    const focusColor = rootStyles.getPropertyValue('--primary').trim() || '#7b2cbf';
    const bgColor = rootStyles.getPropertyValue('--input-background').trim() || 'transparent';
    const textColor = rootStyles.getPropertyValue('--foreground').trim() || '#111827';
    const placeholderColor = rootStyles.getPropertyValue('--muted-foreground').trim() || '#9ca3af';
    const isDark = document.documentElement.classList.contains('dark');
    const focusShadow = isDark
      ? `0 0 0 2px rgba(155, 77, 224, 0.25)`
      : `0 0 0 2px rgba(123, 44, 191, 0.15)`;

    const cardFieldCSS = `
      body { margin: 0; padding: 0; display: flex; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: transparent; }
      #cardNumber {
        border: 1px solid ${borderColor};
        border-radius: 0.5rem;
        height: 42px;
        width: 100%;
        padding: 0 12px 0 2.25rem;
        font-size: 0.75rem;
        outline: none;
        direction: ltr;
        background: ${bgColor};
        color: ${textColor};
        transition: border-color 0.15s, box-shadow 0.15s;
        box-sizing: border-box;
      }
      #cardNumber::placeholder { color: ${placeholderColor}; }
      #cardNumber:focus { border-color: ${focusColor}; box-shadow: ${focusShadow}; }
      #cardNumber.invalid { border-color: #ef4444; box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.2); }
      input::-webkit-outer-spin-button, input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
      input[type=number] { -moz-appearance: textfield; }
    `;

    const cvvFieldCSS = `
      body { margin: 0; padding: 0; display: flex; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: transparent; }
      #cvvField {
        border: 1px solid ${borderColor};
        border-radius: 0.5rem;
        height: 42px;
        width: 100%;
        padding: 0 12px;
        font-size: 0.75rem;
        outline: none;
        direction: ltr;
        background: ${bgColor};
        color: ${textColor};
        transition: border-color 0.15s, box-shadow 0.15s;
      }
      #cvvField::placeholder { color: ${placeholderColor}; }
      #cvvField:focus { border-color: ${focusColor}; box-shadow: ${focusShadow}; }
      #cvvField.invalid { border-color: #ef4444; box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.2); }
      input::-webkit-outer-spin-button, input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
      input[type=number] { -moz-appearance: textfield; }
    `;

    return {
      action: 'init',
      lowProfileCode: lowProfileId,
      cardFieldCSS,
      cvvFieldCSS,
      placeholder: '0000 0000 0000 0000',
      cvvPlaceholder: '123',
      language: lang,
    };
  }, [lowProfileId, lang]);

  // Post the init payload to CardCom's master iframe. Idempotent — safe to call
  // any time we suspect the iframe styling needs to be (re-)applied.
  const sendIframeInit = useCallback(() => {
    if (!lowProfileId) return;
    const masterFrame = document.getElementById('CardComMasterFrame');
    if (!masterFrame || !masterFrame.contentWindow) return;
    masterFrameRef.current = masterFrame;
    masterFrame.contentWindow.postMessage(buildInitPayload(), '*');
    iframeInitialized.current = true;
  }, [lowProfileId, buildInitPayload]);

  // Initialize iframes when a LowProfile becomes available.
  // - The 1000ms init delay matches the original timing heuristic: CardCom's JS
  //   inside the master iframe needs time to set up its postMessage listeners.
  //   Posting init too early just gets the message dropped, leaving the master
  //   frame unbound and doTransaction silent.
  // - We then wait an additional 500ms before flipping iframeReady=true so
  //   CardCom can finish processing init (binding to the new LowProfile) before
  //   we let the user submit. This is the gate that prevents Pay Now from
  //   landing on an unbound master iframe after a coupon-driven LP change.
  useEffect(() => {
    setIframeReady(false);
    if (!lowProfileId) return;
    const initTimer = setTimeout(() => sendIframeInit(), 1000);
    const readyTimer = setTimeout(() => setIframeReady(true), 1500);
    return () => {
      clearTimeout(initTimer);
      clearTimeout(readyTimer);
    };
  }, [lowProfileId, sendIframeInit]);

  // Listen for iframe messages
  const handleMessage = useCallback(async (event) => {
    // Only process messages from CardCom
    if (!event.data || !event.data.action) return;

    const msg = event.data;

    switch (msg.action) {
      case 'HandleSubmit': {
        const data = msg.data;
        if (data?.IsSuccess) {
          // Confirm payment on our backend
          try {
            const confirmRes = await fetch('/api/payment/confirm', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ paymentId, lowProfileId }),
            });
            const confirmData = await confirmRes.json();

            if (confirmRes.ok && confirmData.success) {
              setPaymentResult({ success: true, message: data.Description || t('payment.success') || 'Payment successful!' });
              onSuccess?.(confirmData);
            } else {
              setPaymentResult({ success: false, message: confirmData.error || t('payment.confirmFailed') || 'Payment confirmation failed' });
              onError?.(confirmData.error);
            }
          } catch (err) {
            setPaymentResult({ success: false, message: t('payment.confirmFailed') || 'Payment confirmation failed' });
            onError?.(err.message);
          }
        } else {
          setPaymentResult({ success: false, message: data?.Description || t('payment.failed') || 'Payment failed' });
          onError?.(data?.Description);
          // CardCom resets the iframe DOM after a declined transaction, which
          // wipes out our themed CSS. Re-post the init payload so the user
          // can retry without seeing unstyled white card / CVV inputs.
          sendIframeInit();
        }
        setIsProcessing(false);
        break;
      }
      case 'HandleEror': {
        setIsProcessing(false);
        setPaymentResult({ success: false, message: msg.message || t('payment.error') || 'Payment error' });
        onError?.(msg.message);
        // Same recovery path as a declined transaction — restore styling.
        sendIframeInit();
        break;
      }
      case 'handleValidations': {
        if (msg.field === 'cvv') setCvvValid(msg.isValid);
        if (msg.field === 'cardNumber') setCardNumberValid(msg.isValid);
        break;
      }
      default:
        break;
    }
  }, [paymentId, lowProfileId, onSuccess, onError, t, sendIframeInit]);

  useEffect(() => {
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [handleMessage]);

  // Update card owner details on iframes (for 3DS)
  const updateCardOwnerDetails = useCallback(() => {
    const masterFrame = masterFrameRef.current || document.getElementById('CardComMasterFrame');
    if (masterFrame?.contentWindow) {
      masterFrame.contentWindow.postMessage({
        action: 'setCardOwnerDetails',
        data: {
          cardOwnerName: cardholderName,
          cardOwnerEmail: billingEmail,
          cardOwnerPhone: cardOwnerPhone,
        },
      }, '*');
    }
  }, [cardholderName, billingEmail, cardOwnerPhone]);

  // Submit payment
  const handleSubmit = async (e) => {
    e.preventDefault();

    // Saved-card path: bypass the iframe entirely and run the
    // /charge-saved-card endpoint, which calls CardCom DoTransaction with
    // the stored token. No card-data entry, no J2 round-trip.
    if (paymentMode === 'saved' && selectedSavedId) {
      setIsProcessing(true);
      setPaymentResult(null);
      try {
        const res = await fetch('/api/payment/charge-saved-card', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            paymentMethodId: selectedSavedId,
            amount: effectiveAmount,
            currency,
            productName,
            language: lang,
            action: {
              ...action,
              coupon: couponData ? {
                code: couponData.code,
                discountType: couponData.discountType,
                discountValue: couponData.discountValue,
              } : null,
            },
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Charge failed');
        }
        setPaymentResult({ success: true, message: t('payment.success') || 'Payment successful!' });
        onSuccess?.(data);
      } catch (err) {
        setPaymentResult({ success: false, message: err.message || t('payment.failed') || 'Payment failed' });
        onError?.(err.message);
      } finally {
        setIsProcessing(false);
      }
      return;
    }

    // New-card path: hand off to CardCom's iframe via postMessage. The init
    // we posted earlier was a CreateTokenOnly+J2, so this doTransaction will
    // run J2 → return HandleSubmit → /payment/confirm runs the actual charge
    // and persists the token.
    const masterFrame = masterFrameRef.current || document.getElementById('CardComMasterFrame');
    if (!masterFrame?.contentWindow) {
      setPaymentResult({ success: false, message: t('payment.iframeError') || 'Payment system not ready' });
      return;
    }

    setIsProcessing(true);
    setPaymentResult(null);

    updateCardOwnerDetails();

    const transactionData = {
      action: 'doTransaction',
      cardOwnerId: citizenId || '000000000',
      cardOwnerName: cardholderName,
      cardOwnerEmail: billingEmail,
      cardOwnerPhone: cardOwnerPhone || '0000000000',
      expirationMonth,
      expirationYear,
      numberOfPayments,
    };

    masterFrame.contentWindow.postMessage(transactionData, '*');
  };

  const formatPrice = (val) => {
    const sym = currency === 'ILS' ? '₪' : currency === 'USD' ? '$' : '€';
    return `${sym}${Number(val).toLocaleString(lang === 'he' ? 'he-IL' : 'en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  };

  // ILS estimate next to USD prices. Only shown when we know the rate.
  // Bank converts at its own rate at charge time so the user knows the
  // actual hit on their statement may vary slightly from what we show.
  const formatIlsEstimate = (val) => {
    if (currency !== 'USD' || !usdToIlsRate) return null;
    return `≈ ₪${Math.round(Number(val) * usdToIlsRate)}`;
  };
  const showUsdDisclaimer = currency === 'USD';
  const usdDisclaimer = lang === 'he'
    ? 'החיוב מתבצע בדולרים. הסכום בשקלים הוא הערכה לפי השער היומי; הבנק שלך יבצע המרה לפי השער שלו ועשוי להשתנות מעט.'
    : 'Charged in USD. ILS amount is a daily-rate estimate; your bank converts at its own rate at the time of charge.';

  // Coupon handlers
  const handleApplyCoupon = async () => {
    if (!couponCode.trim()) return;
    setCouponLoading(true);
    setCouponError('');
    try {
      // Build the validate payload based on what's actually being purchased.
      // Misrouting an add-on id as planId triggers the "not applicable to the
      // selected plan" rejection (the validate endpoint does a plan lookup).
      const isAddOn = action?.type === 'addon_purchase';
      const validatePayload = { code: couponCode };
      if (isAddOn) {
        validatePayload.addOnId = action?.addOnId || action?.itemId || null;
      } else {
        validatePayload.planId = action?.planId || action?.itemId || null;
      }
      const res = await fetch('/api/public/coupons/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validatePayload),
      });
      const data = await res.json();
      if (res.ok && data.valid) {
        setCouponData(data.coupon);
        // Reset LP so it re-initializes with discounted amount
        setLowProfileId(null);
        iframeInitialized.current = false;
      } else {
        const errorMsg = data.errorCode ? t(`payment.coupon.${data.errorCode}`) : null;
        setCouponError(errorMsg || data.error || t('payment.coupon.invalid') || 'Invalid or expired coupon code');
        setCouponData(null);
      }
    } catch {
      setCouponError(t('payment.coupon.error') || 'Failed to validate coupon');
    } finally {
      setCouponLoading(false);
    }
  };

  const handleRemoveCoupon = () => {
    setCouponData(null);
    setCouponCode('');
    setCouponError('');
    // Reset LP so it re-initializes with original amount
    setLowProfileId(null);
    iframeInitialized.current = false;
  };

  // Handle free upgrade when coupon covers full amount
  const handleFreeCouponConfirm = async () => {
    setIsProcessing(true);
    setPaymentResult(null);
    try {
      const res = await fetch('/api/payment/free-with-coupon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: {
            ...action,
            coupon: { code: couponData.code, discountType: couponData.discountType, discountValue: couponData.discountValue },
          },
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setPaymentResult({ success: true, message: t('payment.success') || 'Payment successful!' });
        onSuccess?.(data);
      } else {
        setPaymentResult({ success: false, message: data.error || t('payment.failed') || 'Failed' });
        onError?.(data.error);
      }
    } catch (err) {
      setPaymentResult({ success: false, message: t('payment.error') || 'Error' });
      onError?.(err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const isFormValid =
    cardholderName.trim().length > 0 &&
    billingEmail.includes('@') &&
    expirationMonth.length === 2 &&
    expirationYear.length === 2 &&
    citizenId.length >= 5;

  // Success state
  if (paymentResult?.success) {
    return (
      <div className={styles.successContainer}>
        <div className={styles.successIcon}>
          <Check size={32} />
        </div>
        <h3 className={styles.successTitle}>
          {t('payment.successTitle') || 'Payment Successful!'}
        </h3>
        <p className={styles.successMessage}>{paymentResult.message}</p>
      </div>
    );
  }

  // Loading state
  if (isInitializing) {
    return (
      <div className={styles.loadingContainer}>
        <Loader2 size={28} className={styles.spinning} />
        <p>{t('payment.initializing') || 'Setting up secure payment...'}</p>
      </div>
    );
  }

  // Error state
  if (initError) {
    return (
      <div className={styles.errorContainer}>
        <AlertCircle size={28} />
        <p>{initError}</p>
        {onBack && (
          <button className={styles.backBtn} onClick={onBack}>
            <ArrowLeft size={16} />
            {t('common.back') || 'Back'}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={styles.paymentFormContainer} dir={direction}>
      {/* Back button */}
      {onBack && (
        <button className={styles.backBtn} onClick={onBack} disabled={isProcessing}>
          <ArrowLeft size={16} />
          {t('common.back') || 'Back'}
        </button>
      )}

      {/* Order summary */}
      {showOrderSummary && (
        <div className={styles.orderSummary}>
          {orderSummaryContent || (
            <>
              <div className={styles.orderRow}>
                <span>{productName}</span>
                <span className={couponData ? '' : styles.orderPrice}>
                  {formatPrice(amount)}
                  {formatIlsEstimate(amount) && (
                    <span style={{ fontSize: '0.75rem', opacity: 0.7, marginInlineStart: '0.375rem' }}>
                      {formatIlsEstimate(amount)}
                    </span>
                  )}
                </span>
              </div>
              {couponData && (
                <div className={styles.orderRow} style={{ color: 'var(--success-color, #22c55e)' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <Ticket size={14} />
                    {t('payment.coupon.discount') || 'Coupon Discount'}
                    <span style={{ fontSize: '0.6875rem', opacity: 0.8 }}>
                      ({couponData.discountType === 'PERCENTAGE' ? `${couponData.discountValue}%` : formatPrice(couponData.discountValue)})
                    </span>
                  </span>
                  <span>
                    -{formatPrice(amount - effectiveAmount)}
                    {formatIlsEstimate(amount - effectiveAmount) && (
                      <span style={{ fontSize: '0.75rem', opacity: 0.7, marginInlineStart: '0.375rem' }}>
                        ≈ -₪{Math.round((amount - effectiveAmount) * usdToIlsRate)}
                      </span>
                    )}
                  </span>
                </div>
              )}
              {couponData && (
                <div className={`${styles.orderRow} ${styles.orderTotal}`}>
                  <span>{t('payment.total') || 'Total'}</span>
                  <span className={styles.orderPrice}>
                    {formatPrice(effectiveAmount)}
                    {formatIlsEstimate(effectiveAmount) && (
                      <span style={{ fontSize: '0.8125rem', opacity: 0.75, marginInlineStart: '0.375rem' }}>
                        {formatIlsEstimate(effectiveAmount)}
                      </span>
                    )}
                  </span>
                </div>
              )}
              {showUsdDisclaimer && (
                <p style={{ fontSize: '0.75rem', opacity: 0.7, marginTop: '0.5rem', lineHeight: 1.5 }}>
                  {usdDisclaimer}
                </p>
              )}
            </>
          )}

          {/* Coupon Code */}
          <div className={styles.couponSection}>
            <label className={styles.couponLabel}>
              <Ticket size={14} />
              {t('payment.coupon.label') || 'Coupon Code'}
            </label>
            {couponData ? (
              <div className={styles.couponApplied}>
                <Check size={16} className={styles.couponAppliedIcon} />
                <span className={styles.couponAppliedCode}>{couponData.code}</span>
                {(couponData.hasLimitationOverrides || couponData.hasExtraFeatures) && (
                  <span className={styles.couponBonusWrap}>
                    <span className={styles.couponBonusBadge}>
                      + {t('payment.coupon.bonuses') || 'Bonuses'}
                    </span>
                    <span className={styles.couponBonusTooltip}>
                      {couponData.limitationOverrides?.map((o, i) => (
                        <span key={`lo-${i}`} className={styles.bonusTooltipItem}>
                          ✦ {t(`settings.subscription.limitations.${o.key}`) || o.key}: {o.value?.toLocaleString()}
                        </span>
                      ))}
                      {couponData.extraFeatures?.map((f, i) => (
                        <span key={`ef-${i}`} className={styles.bonusTooltipItem}>
                          ✦ {t(`settings.subscription.features.${f}`) || f}
                        </span>
                      ))}
                    </span>
                  </span>
                )}
                <button type="button" onClick={handleRemoveCoupon} className={styles.couponRemoveBtn}>
                  <X size={16} />
                </button>
              </div>
            ) : (
              <div className={styles.couponInputRow}>
                <input
                  type="text"
                  value={couponCode}
                  onChange={(e) => { setCouponCode(e.target.value.toUpperCase()); setCouponError(''); }}
                  placeholder={t('payment.coupon.placeholder') || 'Enter coupon code'}
                  dir="ltr"
                  className={`${styles.couponInput} ${couponError ? styles.couponInputError : ''}`}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleApplyCoupon(); } }}
                  disabled={isProcessing}
                />
                <button
                  type="button"
                  onClick={handleApplyCoupon}
                  disabled={couponLoading || !couponCode.trim() || isProcessing}
                  className={styles.couponApplyBtn}
                >
                  {couponLoading ? <Loader2 size={14} className={styles.spinning} /> : (t('payment.coupon.apply') || 'Apply')}
                </button>
              </div>
            )}
            {couponError && (
              <p className={styles.couponErrorMsg}>{couponError}</p>
            )}
            {couponData?.durationMonths && (
              <p className={styles.couponDuration}>
                {(t('payment.coupon.durationNote') || 'Applied for {months} months').replace('{months}', couponData.durationMonths)}
              </p>
            )}
          </div>
        </div>
      )}

      {/* CardCom Hidden Master Frame.
          NOT keyed by lowProfileId — remounting the iframe on LP change leaves
          CardCom's internal session in a state where doTransaction silently
          drops, so the iframe stays mounted across coupon-driven LP changes
          and the init useEffect just re-posts the new LP + themed CSS. */}
      {effectiveAmount > 0 && paymentMode === 'new' && (
        <iframe
          id="CardComMasterFrame"
          name="CardComMasterFrame"
          src={`${CARDCOM_BASE}/api/openfields/master`}
          style={{ display: 'block', width: 0, height: 0, border: 'none' }}
          title="CardCom Master"
        />
      )}

      {/* Free coupon - no payment needed */}
      {effectiveAmount <= 0 && couponData ? (
        <div className={styles.form}>
          {/* Success Message */}
          {paymentResult?.success && (
            <div className={styles.successMsg}>
              <Check size={14} />
              <span>{paymentResult.message}</span>
            </div>
          )}

          {/* Error Message */}
          {paymentResult && !paymentResult.success && (
            <div className={styles.errorMsg}>
              <AlertCircle size={14} />
              <span>{paymentResult.message}</span>
            </div>
          )}

          <button
            type="button"
            className={styles.submitBtn}
            onClick={handleFreeCouponConfirm}
            disabled={isProcessing || paymentResult?.success}
          >
            {isProcessing ? (
              <>
                <Loader2 size={16} className={styles.spinning} />
                {t('payment.processing') || 'Processing...'}
              </>
            ) : (
              <>
                <Check size={16} />
                {t('payment.confirmFree') || 'Confirm'}
              </>
            )}
          </button>
        </div>
      ) : (
      /* Payment Form */
      <form onSubmit={handleSubmit} className={styles.form}>
        {/* Saved-card picker (D1). Only renders when the account has at least
            one eligible saved card. Default selection is the isDefault card.
            Switching to "Use a different card" hides the saved-card form
            and reveals the iframe + manual entry fields below. */}
        {savedLoaded && savedMethods.length > 0 && (
          <div className={styles.formGroup}>
            <label className={styles.label}>
              {t('payment.savedCardLabel') || 'Payment method'}
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
              {savedMethods.map((pm) => {
                const last4 = pm.cardLast4 ? `•••• ${pm.cardLast4}` : '';
                const display = pm.nickname
                  ? `${pm.nickname} ${last4}`.trim()
                  : (pm.cardBrand ? `${pm.cardBrand} ${last4}`.trim() : last4 || (t('payment.savedCardUnnamed') || 'Card'));
                const checked = paymentMode === 'saved' && selectedSavedId === pm.id;
                return (
                  <label
                    key={pm.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      padding: '0.5rem 0.625rem',
                      border: checked ? '1px solid var(--primary, #7b2cbf)' : '1px solid var(--input-border, #e5e7eb)',
                      borderRadius: '0.5rem',
                      cursor: 'pointer',
                      background: checked ? 'rgba(123,44,191,0.04)' : 'transparent',
                    }}
                  >
                    <input
                      type="radio"
                      name="cardcom-payment-method"
                      checked={checked}
                      onChange={() => { setPaymentMode('saved'); setSelectedSavedId(pm.id); }}
                      disabled={isProcessing}
                    />
                    <span style={{ flex: 1, fontSize: '0.875rem' }}>{display}</span>
                  </label>
                );
              })}
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.5rem 0.625rem',
                  border: paymentMode === 'new' ? '1px solid var(--primary, #7b2cbf)' : '1px solid var(--input-border, #e5e7eb)',
                  borderRadius: '0.5rem',
                  cursor: 'pointer',
                  background: paymentMode === 'new' ? 'rgba(123,44,191,0.04)' : 'transparent',
                }}
              >
                <input
                  type="radio"
                  name="cardcom-payment-method"
                  checked={paymentMode === 'new'}
                  onChange={() => { setPaymentMode('new'); setSelectedSavedId(null); }}
                  disabled={isProcessing}
                />
                <span style={{ flex: 1, fontSize: '0.875rem' }}>
                  {t('payment.useDifferentCard') || 'Use a different card'}
                </span>
              </label>
            </div>
          </div>
        )}

        {/* Cardholder Name */}
        {paymentMode === 'new' && (
        <div className={styles.formGroup}>
          <label className={styles.label}>
            {t('payment.cardholderName') || 'Cardholder Name'}
          </label>
          <input
            type="text"
            value={cardholderName}
            onChange={(e) => setCardholderName(e.target.value)}
            onBlur={updateCardOwnerDetails}
            className={styles.input}
            placeholder={t('payment.cardholderNamePlaceholder') || 'Full name as on card'}
            required
            disabled={isProcessing}
          />
        </div>
        )}

        {/* New-card-only fields. Saved-card path skips all of this and
            charges the stored token directly via /charge-saved-card. */}
        {paymentMode === 'new' && (<>
        {/* Citizen ID */}
        <div className={styles.formGroup}>
          <label className={styles.label}>
            {t('payment.citizenId') || 'ID Number'}
          </label>
          <input
            type="text"
            value={citizenId}
            onChange={(e) => setCitizenId(e.target.value.replace(/\D/g, '').slice(0, 9))}
            className={styles.input}
            placeholder={t('payment.citizenIdPlaceholder') || 'Enter ID number'}
            dir="ltr"
            required
            disabled={isProcessing}
          />
        </div>

        {/* Billing Email */}
        <div className={styles.formGroup}>
          <label className={styles.label}>
            {t('payment.billingEmail') || 'Billing Email'}
          </label>
          <input
            type="email"
            value={billingEmail}
            onChange={(e) => setBillingEmail(e.target.value)}
            onBlur={updateCardOwnerDetails}
            className={styles.input}
            placeholder={t('payment.emailPlaceholder') || 'email@example.com'}
            dir="ltr"
            required
            disabled={isProcessing}
          />
        </div>

        {/* Phone (optional but recommended for 3DS) */}
        <div className={styles.formGroup}>
          <label className={styles.label}>
            {t('payment.phone') || 'Phone'}
          </label>
          <input
            type="tel"
            value={cardOwnerPhone}
            onChange={(e) => setCardOwnerPhone(e.target.value.replace(/[^\d\-+]/g, '').slice(0, 15))}
            onBlur={updateCardOwnerDetails}
            className={styles.input}
            placeholder={t('payment.phonePlaceholder') || '050-0000000'}
            dir="ltr"
            disabled={isProcessing}
          />
        </div>

        {/* Card Number (CardCom iframe) */}
        <div className={styles.formGroup}>
          <label className={styles.label}>
            <svg width="18" height="13" viewBox="0 0 24 17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginInlineEnd: '0.35rem', verticalAlign: 'middle', opacity: 0.7 }}><rect x="1" y="1" width="22" height="15" rx="3" /><line x1="1" y1="6" x2="23" y2="6" /></svg>
            {t('payment.cardNumber') || 'Card Number'}
          </label>
          <div className={`${styles.iframeWrapper} ${styles.cardInputWrapper} ${cardNumberValid === false ? styles.iframeInvalid : ''}`}>
            <svg className={styles.cardInputIcon} width="22" height="16" viewBox="0 0 24 17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="1" width="22" height="15" rx="3" /><line x1="1" y1="6" x2="23" y2="6" /></svg>
            <iframe
              id="CardComCardNumber"
              name="CardComCardNumber"
              src={`${CARDCOM_BASE}/api/openfields/cardNumber`}
              className={styles.cardIframe}
              title="Card Number"
            />
          </div>
        </div>

        {/* Expiration & CVV Row */}
        <div className={styles.formRow}>
          <div className={styles.formGroup}>
            <label className={styles.label}>
              {t('payment.expMonth') || 'Month'}
            </label>
            <input
              type="text"
              value={expirationMonth}
              onChange={(e) => setExpirationMonth(e.target.value.replace(/\D/g, '').slice(0, 2))}
              className={styles.input}
              placeholder="MM"
              dir="ltr"
              maxLength={2}
              required
              disabled={isProcessing}
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.label}>
              {t('payment.expYear') || 'Year'}
            </label>
            <input
              type="text"
              value={expirationYear}
              onChange={(e) => setExpirationYear(e.target.value.replace(/\D/g, '').slice(0, 2))}
              className={styles.input}
              placeholder="YY"
              dir="ltr"
              maxLength={2}
              required
              disabled={isProcessing}
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.label}>CVV</label>
            <div className={`${styles.iframeWrapper} ${cvvValid === false ? styles.iframeInvalid : ''}`}>
              <iframe
                id="CardComCvv"
                name="CardComCvv"
                src={`${CARDCOM_BASE}/api/openfields/CVV`}
                className={styles.cvvIframe}
                title="CVV"
              />
            </div>
          </div>
        </div>
        </>)}

        {/* Error Message */}
        {paymentResult && !paymentResult.success && (
          <div className={styles.errorMsg}>
            <AlertCircle size={14} />
            <span>{paymentResult.message}</span>
          </div>
        )}

        {/* Secure Payment Note */}
        <div className={styles.secureNote}>
          <Lock size={14} />
          <span>{t('payment.securePayment') || 'Secure payment processed by CardCom'}</span>
        </div>

        {/* Submit. The saved-card path doesn't need iframeReady or
            isFormValid (no card-data fields) — it's enabled as soon as a
            saved card is selected. */}
        <button
          type="submit"
          className={styles.submitBtn}
          disabled={
            isProcessing
            || (paymentMode === 'saved' ? !selectedSavedId : (!isFormValid || !iframeReady))
          }
        >
          {isProcessing ? (
            <>
              <Loader2 size={16} className={styles.spinning} />
              {t('payment.processing') || 'Processing...'}
            </>
          ) : (paymentMode === 'new' && !iframeReady) ? (
            <>
              <Loader2 size={16} className={styles.spinning} />
              {t('payment.initializing') || 'Setting up secure payment...'}
            </>
          ) : (
            <>
              <Lock size={16} />
              {t('payment.payNow') || 'Pay Now'} {formatPrice(effectiveAmount)}
            </>
          )}
        </button>
      </form>
      )}
    </div>
  );
}

'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Lock, Loader2, Ticket, Check, X, AlertCircle } from 'lucide-react';
import { ArrowIcon } from '@/app/components/ui/arrow-icon';
import { calculateNewSubscriptionProration } from '@/lib/proration';
import { isValidIsraeliId } from '@/lib/israeli-id';
import { applyCouponToOrder } from '@/lib/coupon-pricing';
import styles from '../auth.module.css';

const CARDCOM_BASE = 'https://secure.cardcom.solutions';

export function PaymentStep({ translations, selectedPlan, userData, onComplete }) {
  // Trial plans skip CardCom entirely — see /api/auth/registration/payment-skip-for-trial.
  // The flag also gates the LP init useEffect below so we don't waste a CardCom session.
  const isTrialPlan = (selectedPlan?.trialDays ?? 0) > 0;

  // Auto-populate cardholder name from user's first and last name
  const defaultCardholderName = userData
    ? `${userData.firstName || ''} ${userData.lastName || ''}`.trim()
    : '';
  
  // Default billing email from registration
  const defaultBillingEmail = userData?.email || '';
  const defaultPhone = userData?.phoneNumber || '';

  // CardCom state
  const [lowProfileId, setLowProfileId] = useState(null);
  const [isInitializing, setIsInitializing] = useState(false);
  const [initError, setInitError] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentError, setPaymentError] = useState(null);

  // Form fields
  const [cardholderName, setCardholderName] = useState(defaultCardholderName);
  const [citizenId, setCitizenId] = useState('');
  const [citizenIdTouched, setCitizenIdTouched] = useState(false);
  const isCitizenIdValid = isValidIsraeliId(citizenId);
  const showCitizenIdError = citizenIdTouched && citizenId.length > 0 && !isCitizenIdValid;
  const [billingEmail, setBillingEmail] = useState(defaultBillingEmail);
  const [cardOwnerPhone, setCardOwnerPhone] = useState(defaultPhone);
  // Combined "MM/YY" expiry — stored as up to 4 raw digits; the first two are
  // the month, the last two are the year. handleSubmit derives the separate
  // values CardCom expects.
  const [expiry, setExpiry] = useState('');
  const expirationMonth = expiry.slice(0, 2);
  const expirationYear = expiry.slice(2, 4);
  const [numberOfPayments] = useState('1');

  // Refs for the React-controlled inputs so we can auto-advance focus to the
  // next empty field when one completes (e.g. ID → email → phone → card).
  const cardholderNameInputRef = useRef(null);
  const citizenIdInputRef = useRef(null);
  const billingEmailInputRef = useRef(null);
  const cardOwnerPhoneInputRef = useRef(null);
  const expiryInputRef = useRef(null);

  // Validation state from iframes
  const [cardNumberValid, setCardNumberValid] = useState(null);
  const [cvvValid, setCvvValid] = useState(null);

  // True once we've posted init for the current LowProfile AND given CardCom
  // a moment to bind. Pay Now stays disabled until this flips so we don't
  // post doTransaction to a master iframe that's still bound to an old LP.
  const [iframeReady, setIframeReady] = useState(false);

  const iframeInitialized = useRef(false);
  const masterFrameRef = useRef(null);
  // Tracks the previous LowProfile so we can detect LP-change events (e.g.
  // coupon apply / remove) and force a CardCom session reset.
  const previousLpRef = useRef(null);

  // Coupon state
  const [couponCode, setCouponCode] = useState('');
  const [couponData, setCouponData] = useState(null);
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponError, setCouponError] = useState('');

  // Prices are stored in USD (per the Plan seed convention). Charges run in
  // USD too (CardCom ISOCoinId 2) — Israeli cardholders' banks convert to
  // ILS at their own rate at the time of charge. We still show an ILS
  // estimate next to every USD figure so the user has a sense of the actual
  // cost. Fallback rate covers the resumed-session case before the status
  // endpoint hydrates the plan.
  const USD_TO_ILS_RATE = selectedPlan?.usdToIlsRate || 3.6;
  const VAT_RATE = 0.18;

  // Active UI locale (used by the USD-charge disclaimer + iframe init).
  const lang = typeof document !== 'undefined' && document.documentElement.lang === 'en' ? 'en' : 'he';

  const round2 = (n) => Math.round((n || 0) * 100) / 100;
  const formatUsd = (usd) => `$${(usd || 0).toFixed(2)}`;
  const formatIlsEstimate = (usd) => `₪${Math.round((usd || 0) * USD_TO_ILS_RATE)}`;

  const getPriceBreakdown = (plan) => {
    if (!plan?.monthlyPrice) return {
      basePriceUsd: 0,
      fullMonthlyPriceUsd: 0,
      discountUsd: 0,
      discountedPriceUsd: 0,
      vatAmountUsd: 0,
      totalPriceUsd: 0,
      recurringTotalUsd: 0,
      proration: null,
    };

    // Prorate for remaining days in the month (align to 1st)
    const proration = calculateNewSubscriptionProration(plan.monthlyPrice);
    const basePriceUsd = round2(proration.proratedAmount);
    const fullMonthlyPriceUsd = round2(plan.monthlyPrice);

    // First-charge coupon application — the helper handles all four types
    // (PERCENTAGE, FIXED_DISCOUNT, FIXED_PRICE, legacy FIXED_AMOUNT) and the
    // FIXED_PRICE > order edge case.
    const firstCharge = applyCouponToOrder(basePriceUsd, couponData);
    const discountUsd = firstCharge.applies ? firstCharge.discountUsd : 0;
    const discountedPriceUsd = firstCharge.applies ? firstCharge.finalUsd : basePriceUsd;
    const vatAmountUsd = round2(discountedPriceUsd * VAT_RATE);
    const totalPriceUsd = round2(discountedPriceUsd + vatAmountUsd);

    // Recurring monthly cycle (what we'll bill on the 1st each month). Only
    // applied while the coupon's durationMonths window is active; once it
    // lapses, the recurring engine reverts to the plan price.
    const recurringCoupon = couponData && !couponData.durationMonths ? couponData : null;
    const recurringCharge = applyCouponToOrder(fullMonthlyPriceUsd, recurringCoupon);
    const recurringDiscountedUsd = recurringCharge.applies ? recurringCharge.finalUsd : fullMonthlyPriceUsd;
    const recurringVatUsd = round2(recurringDiscountedUsd * VAT_RATE);
    const recurringTotalUsd = round2(recurringDiscountedUsd + recurringVatUsd);

    return {
      basePriceUsd,
      fullMonthlyPriceUsd,
      discountUsd,
      discountedPriceUsd,
      vatAmountUsd,
      totalPriceUsd,
      recurringTotalUsd,
      proration,
    };
  };

  const priceBreakdown = getPriceBreakdown(selectedPlan);

  // Load 3DS script on mount
  useEffect(() => {
    const existingScript = document.querySelector('script[src*="cardcom.solutions/External/OpenFields/3DS"]');
    if (!existingScript) {
      const script = document.createElement('script');
      script.src = `${CARDCOM_BASE}/External/OpenFields/3DS.js?v=${Date.now()}`;
      script.async = true;
      document.head.appendChild(script);
    }
  }, []);

  // Initialize CardCom LowProfile session.
  // lowProfileId MUST be in the deps so that when handleApplyCoupon /
  // handleRemoveCoupon reset it to null, this effect re-fires and fetches a
  // new LP for the updated amount. Without it, the button stays stuck in
  // "Setting up secure payment..." because lowProfileId never gets reassigned.
  useEffect(() => {
    if (isTrialPlan) return;
    if (!priceBreakdown.totalPriceUsd || priceBreakdown.totalPriceUsd <= 0) return;
    if (lowProfileId) return;

    let cancelled = false;

    (async () => {
      try {
        setIsInitializing(true);
        setInitError(null);

        const res = await fetch('/api/auth/registration/payment-init', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount: priceBreakdown.totalPriceUsd,
            language: document.documentElement.lang === 'en' ? 'en' : 'he',
          }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to initialize payment');

        if (!cancelled) {
          setLowProfileId(data.lowProfileId);
        }
      } catch (err) {
        if (!cancelled) {
          setInitError(err.message);
        }
      } finally {
        if (!cancelled) setIsInitializing(false);
      }
    })();

    return () => { cancelled = true; };
  }, [priceBreakdown.totalPriceUsd, lowProfileId]);

  // Initialize iframes once LP is ready (or re-initialize after coupon-driven
  // LP changes). CardCom's master iframe is "sticky" — once initialized for an
  // LP, posting a second init message to the same iframe does not reliably
  // rebind it to the new LP, so doTransaction from Pay Now silently targets
  // the old (now-superseded) LP and produces no response. We work around this
  // by reloading all three iframe sources whenever the LP changes, giving
  // CardCom a clean session for the new LP.
  useEffect(() => {
    setIframeReady(false);
    if (!lowProfileId) return;

    const isReinit = previousLpRef.current !== null && previousLpRef.current !== lowProfileId;
    previousLpRef.current = lowProfileId;

    if (isReinit) {
      iframeInitialized.current = false;
      const masterFrame = document.getElementById('CardComMasterFrame');
      if (masterFrame) masterFrame.src = `${CARDCOM_BASE}/api/openfields/master`;
      const cardFrame = document.getElementById('CardComCardNumber');
      if (cardFrame) cardFrame.src = `${CARDCOM_BASE}/api/openfields/cardNumber`;
      const cvvFrame = document.getElementById('CardComCvv');
      if (cvvFrame) cvvFrame.src = `${CARDCOM_BASE}/api/openfields/CVV`;
    }

    if (iframeInitialized.current) {
      // Already initialized for this LP, nothing to re-post.
      setIframeReady(true);
      return;
    }

    // 1500ms gives the iframes time to load (longer when reloading on reinit)
    // before CardCom's JS sets up its postMessage listeners. Posting earlier
    // gets the message dropped.
    const initTimer = setTimeout(() => {
      const masterFrame = document.getElementById('CardComMasterFrame');
      if (masterFrame && masterFrame.contentWindow) {
        masterFrameRef.current = masterFrame;

        // Read computed theme values from the parent document
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

        const lang = document.documentElement.lang === 'en' ? 'en' : 'he';

        masterFrame.contentWindow.postMessage({
          action: 'init',
          lowProfileCode: lowProfileId,
          cardFieldCSS,
          cvvFieldCSS,
          placeholder: '0000 0000 0000 0000',
          cvvPlaceholder: '123',
          language: lang,
        }, '*');
        iframeInitialized.current = true;
      }
    }, 1500);

    // Hold Pay Now disabled until CardCom has had a moment to process init
    // and bind to the new LP.
    const readyTimer = setTimeout(() => setIframeReady(true), 2000);

    return () => {
      clearTimeout(initTimer);
      clearTimeout(readyTimer);
    };
  }, [lowProfileId]);

  // Listen for iframe messages
  const handleMessage = useCallback(async (event) => {
    if (!event.data || !event.data.action) return;
    const msg = event.data;

    switch (msg.action) {
      case 'HandleSubmit': {
        const data = msg.data;
        if (data?.IsSuccess) {
          // Verify payment on our backend
          try {
            const confirmRes = await fetch('/api/auth/registration/payment-confirm', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ lowProfileId }),
            });
            const confirmData = await confirmRes.json();

            if (confirmRes.ok && confirmData.success) {
              // Payment verified – proceed to finalize registration
              onComplete();
            } else {
              setPaymentError(confirmData.error || translations.confirmFailed);
            }
          } catch {
            setPaymentError(translations.confirmFailed);
          }
        } else {
          setPaymentError(data?.Description || translations.paymentFailed);
        }
        setIsProcessing(false);
        break;
      }
      case 'HandleEror': {
        setIsProcessing(false);
        setPaymentError(msg.message || translations.paymentError);
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
  }, [lowProfileId, onComplete, translations]);

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

    // Trial flow: plan has trialDays > 0 and the account hasn't used a trial.
    // Skip CardCom entirely — finalize will create a TRIALING subscription
    // and we'll collect a card later (or not, if they don't convert).
    if (isTrialPlan) {
      setIsProcessing(true);
      try {
        const res = await fetch('/api/auth/registration/payment-skip-for-trial', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || translations.confirmFailed);
        }
        onComplete();
      } catch (err) {
        setPaymentError(err.message || translations.confirmFailed);
        setIsProcessing(false);
      }
      return;
    }

    // Free flow: a 100%-off coupon (PERCENTAGE / FIXED_DISCOUNT large enough
    // to wipe out the order, or FIXED_PRICE=$0) brought the first-charge
    // total to $0. We skip CardCom entirely but must still flip
    // paymentConfirmed=true on the draft account so /finalize will accept.
    if (priceBreakdown.totalPriceUsd <= 0) {
      setIsProcessing(true);
      try {
        const res = await fetch('/api/auth/registration/payment-free-with-coupon', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || translations.confirmFailed);
        }
        onComplete();
      } catch (err) {
        setPaymentError(err.message || translations.confirmFailed);
        setIsProcessing(false);
      }
      return;
    }

    const masterFrame = masterFrameRef.current || document.getElementById('CardComMasterFrame');
    if (!masterFrame?.contentWindow) {
      setPaymentError(translations.iframeError);
      return;
    }

    setIsProcessing(true);
    setPaymentError(null);

    // Update card owner details before transaction
    updateCardOwnerDetails();

    masterFrame.contentWindow.postMessage({
      action: 'doTransaction',
      cardOwnerId: citizenId || '000000000',
      cardOwnerName: cardholderName,
      cardOwnerEmail: billingEmail,
      cardOwnerPhone: cardOwnerPhone || '0000000000',
      expirationMonth,
      expirationYear,
      numberOfPayments,
    }, '*');
  };

  // Coupon validation
  const handleApplyCoupon = async () => {
    if (!couponCode.trim()) return;
    setCouponLoading(true);
    setCouponError('');
    try {
      const res = await fetch('/api/public/coupons/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: couponCode, planId: selectedPlan?.id }),
      });
      const data = await res.json();
      if (res.ok && data.valid) {
        // Pre-flight: a FIXED_PRICE coupon that exceeds the current order total
        // refuses to apply unless the admin marked floorOrderToZero. The
        // helper centralizes this rule across registration + recurring billing.
        const baseUsd = round2((selectedPlan?.monthlyPrice
          ? calculateNewSubscriptionProration(selectedPlan.monthlyPrice).proratedAmount
          : 0));
        const preflight = applyCouponToOrder(baseUsd, data.coupon);
        if (!preflight.applies) {
          setCouponError(translations.coupon?.notApplicable || data.coupon?.notApplicableReason || 'This coupon doesn\'t apply to this order');
          setCouponData(null);
          return;
        }

        setCouponData(data.coupon);
        // Also save coupon to registration
        await fetch('/api/auth/registration/coupon', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ couponCode: data.coupon.code }),
        });
        // Reset LP so it re-initializes with new amount
        setLowProfileId(null);
        iframeInitialized.current = false;
      } else {
        const errorMsg = data.errorCode ? translations.coupon?.[data.errorCode] : null;
        setCouponError(errorMsg || data.error || translations.coupon?.invalid);
        setCouponData(null);
      }
    } catch {
      setCouponError(translations.coupon?.error);
    } finally {
      setCouponLoading(false);
    }
  };

  const handleRemoveCoupon = async () => {
    setCouponData(null);
    setCouponCode('');
    setCouponError('');
    await fetch('/api/auth/registration/coupon', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ couponCode: null }),
    });
    // Reset LP so it re-initializes with original amount
    setLowProfileId(null);
    iframeInitialized.current = false;
  };

  // Expiry validation: MM must be 01-12, YY must not be in the past.
  const isExpiryValid = (() => {
    if (expiry.length !== 4) return false;
    const m = parseInt(expirationMonth, 10);
    const y = parseInt(expirationYear, 10);
    if (Number.isNaN(m) || Number.isNaN(y)) return false;
    if (m < 1 || m > 12) return false;
    const fullYear = 2000 + y;
    const now = new Date();
    if (fullYear < now.getFullYear()) return false;
    if (fullYear === now.getFullYear() && m < now.getMonth() + 1) return false;
    return true;
  })();

  const isPaidPlan = priceBreakdown.totalPriceUsd > 0;

  // Tightened validity: for paid plans we also require CardCom to have
  // confirmed the card number and CVV are valid (so we don't post
  // doTransaction with a broken card / CVV that some Israeli issuers would
  // approve anyway), and the expiry must be a real future date.
  const isFormValid = !isPaidPlan || (
    cardholderName.trim().length > 0 &&
    billingEmail.includes('@') &&
    isExpiryValid &&
    isCitizenIdValid &&
    cardNumberValid === true &&
    cvvValid === true
  );

  // Advance focus from a given field to the next field that's still empty.
  // Skip-filled lets pre-populated fields (e.g. email/phone from registration)
  // not steal focus when the previous field completes.
  const advanceFocusFrom = (currentName) => {
    const fields = [
      { name: 'cardholderName', ref: cardholderNameInputRef, complete: cardholderName.trim().length > 0 },
      { name: 'citizenId', ref: citizenIdInputRef, complete: isValidIsraeliId(citizenId) },
      { name: 'billingEmail', ref: billingEmailInputRef, complete: /\S+@\S+\.\S+/.test(billingEmail) },
      { name: 'cardOwnerPhone', ref: cardOwnerPhoneInputRef, complete: cardOwnerPhone.replace(/\D/g, '').length >= 10 },
      { name: 'cardNumber', iframeId: 'CardComCardNumber', complete: cardNumberValid === true },
      { name: 'expiry', ref: expiryInputRef, complete: expiry.length === 4 },
      { name: 'cvv', iframeId: 'CardComCvv', complete: cvvValid === true },
    ];
    const idx = fields.findIndex(f => f.name === currentName);
    if (idx < 0) return;
    for (let i = idx + 1; i < fields.length; i++) {
      const f = fields[i];
      if (f.complete) continue;
      if (f.iframeId) {
        document.getElementById(f.iframeId)?.focus();
      } else {
        f.ref?.current?.focus();
      }
      return;
    }
  };

  // Trial plan UI — short-circuit the full payment form. No CardCom, no
  // coupon math, just a confirm-and-go panel that calls
  // /api/auth/registration/payment-skip-for-trial on submit.
  if (isTrialPlan) {
    const trialDays = selectedPlan?.trialDays ?? 0;
    const trialEnd = new Date(Date.now() + trialDays * 86400000);
    const trialEndStr = `${String(trialEnd.getDate()).padStart(2, '0')}/${String(trialEnd.getMonth() + 1).padStart(2, '0')}/${trialEnd.getFullYear()}`;
    const description = (translations.trialDescription || '')
      .replace('{days}', String(trialDays))
      .replace('{plan}', selectedPlan?.name || '');
    const endsOn = (translations.trialEndsOn || '').replace('{date}', trialEndStr);

    return (
      <div className={styles.paymentContainer}>
        <div className={styles.paymentHeader}>
          <h2 className={styles.paymentTitle}>{translations.trialTitle || translations.title}</h2>
          <p className={styles.paymentSubtitle}>{translations.trialSubtitle || translations.subtitle}</p>
        </div>
        <form onSubmit={handleSubmit} className={styles.paymentContent}>
          <div className={styles.orderSummary}>
            <h3 className={styles.orderSummaryTitle}>{translations.orderSummary}</h3>
            <div className={styles.orderDetails}>
              <div className={styles.orderRow}>
                <span>{translations.plan}</span>
                <span>{selectedPlan?.name}</span>
              </div>
              <div className={styles.orderRow}>
                <span>{translations.subscriptionType}</span>
                <span>{translations.monthly}</span>
              </div>
              <p style={{ fontSize: '0.875rem', opacity: 0.85, marginTop: '0.75rem', lineHeight: 1.6 }}>
                {description}
              </p>
              <p style={{ fontSize: '0.8125rem', opacity: 0.75, marginTop: '0.5rem' }}>
                {endsOn}
              </p>
            </div>
          </div>

          {paymentError && (
            <div className={styles.paymentErrorMsg} role="alert">
              <AlertCircle size={14} />
              <span>{paymentError}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={isProcessing}
            className={styles.submitButton}
          >
            <span className={styles.buttonContent}>
              {isProcessing ? (
                <>
                  <Loader2 size={16} className={styles.spinIcon} />
                  {translations.processing}
                </>
              ) : (
                <>
                  {translations.startTrial || translations.payNow}
                  <ArrowIcon className={styles.buttonIcon} />
                </>
              )}
            </span>
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className={styles.paymentContainer}>
      <div className={styles.paymentHeader}>
        <h2 className={styles.paymentTitle}>{translations.title}</h2>
        <p className={styles.paymentSubtitle}>{translations.subtitle}</p>
      </div>

      <div className={styles.paymentContent}>
        {/* Order Summary */}
        <div className={styles.orderSummary}>
          <h3 className={styles.orderSummaryTitle}>{translations.orderSummary}</h3>
          <div className={styles.orderDetails}>
            <div className={styles.orderRow}>
              <span>{translations.plan}</span>
              <span>{selectedPlan?.name}</span>
            </div>
            <div className={styles.orderRow}>
              <span>{translations.subscriptionType}</span>
              <span>{translations.monthly}</span>
            </div>
            <div className={styles.orderRow}>
              <span>{translations.planPrice}</span>
              <span>
                {formatUsd(priceBreakdown.fullMonthlyPriceUsd)}
                <span style={{ fontSize: '0.75rem', opacity: 0.7, marginInlineStart: '0.375rem' }}>
                  ≈ {formatIlsEstimate(priceBreakdown.fullMonthlyPriceUsd)}
                </span>
              </span>
            </div>
            {priceBreakdown.proration && priceBreakdown.proration.remainingDays < priceBreakdown.proration.totalDays && (
              <div className={styles.orderRow} style={{ fontSize: '0.75rem', opacity: 0.7 }}>
                <span>{translations.prorated} ({priceBreakdown.proration.remainingDays}/{priceBreakdown.proration.totalDays} {translations.days})</span>
                <span>
                  {formatUsd(priceBreakdown.basePriceUsd)}
                  <span style={{ marginInlineStart: '0.375rem' }}>
                    ≈ {formatIlsEstimate(priceBreakdown.basePriceUsd)}
                  </span>
                </span>
              </div>
            )}
            {priceBreakdown.discountUsd > 0 && (
              <div className={styles.orderRow} style={{ color: '#22c55e' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <Ticket size={14} />
                  {translations.coupon?.discount}
                  {couponData && (
                    <span style={{ fontSize: '0.75rem', opacity: 0.8 }}>
                      ({couponData.discountType === 'PERCENTAGE' ? `${couponData.discountValue}%` : `$${couponData.discountValue}`})
                    </span>
                  )}
                </span>
                <span>
                  -{formatUsd(priceBreakdown.discountUsd)}
                  <span style={{ fontSize: '0.75rem', opacity: 0.7, marginInlineStart: '0.375rem' }}>
                    ≈ -{formatIlsEstimate(priceBreakdown.discountUsd)}
                  </span>
                </span>
              </div>
            )}
            <div className={styles.orderRow}>
              <span>{translations.vat}</span>
              <span>
                {formatUsd(priceBreakdown.vatAmountUsd)}
                <span style={{ fontSize: '0.75rem', opacity: 0.7, marginInlineStart: '0.375rem' }}>
                  ≈ {formatIlsEstimate(priceBreakdown.vatAmountUsd)}
                </span>
              </span>
            </div>
            <div className={`${styles.orderRow} ${styles.orderTotal}`}>
              <span>{translations.total}</span>
              <span>
                {formatUsd(priceBreakdown.totalPriceUsd)}
                <span style={{ fontSize: '0.8125rem', opacity: 0.75, marginInlineStart: '0.375rem' }}>
                  ≈ {formatIlsEstimate(priceBreakdown.totalPriceUsd)}
                </span>
              </span>
            </div>
            <div className={styles.orderRow}>
              <span>{translations.recurringMonthly}</span>
              <span>
                {formatUsd(priceBreakdown.recurringTotalUsd)}
                <span style={{ fontSize: '0.75rem', opacity: 0.7, marginInlineStart: '0.375rem' }}>
                  ≈ {formatIlsEstimate(priceBreakdown.recurringTotalUsd)}{selectedPlan?.period}
                </span>
              </span>
            </div>
            {couponData?.recurringPriceSchedule?.length > 0 && (
              // The displayed "Recurring monthly" above is only accurate when
              // the coupon doesn't have a multi-segment schedule. For
              // schedule-driven coupons the recurring engine bills different
              // amounts per cycle, so warn the user that future months may
              // differ from this single number.
              <p style={{ fontSize: '0.75rem', opacity: 0.7, marginTop: '0.25rem', lineHeight: 1.5 }}>
                {translations.coupon?.scheduleHint || (lang === 'he'
                  ? 'הקופון כולל לוח חיוב מדורג; הסכומים בחודשים הבאים עשויים להשתנות בהתאם לתנאי הקופון.'
                  : 'This coupon has a multi-month price schedule; charges for upcoming months may differ from the amount shown.')}
              </p>
            )}
            <p style={{ fontSize: '0.75rem', opacity: 0.7, marginTop: '0.75rem', lineHeight: 1.5 }}>
              {translations.usdDisclaimer || (lang === 'he'
                ? 'החיוב מתבצע בדולרים אמריקאים. הסכום בשקלים הוא הערכה לפי השער היומי; החיוב בפועל יומר על ידי הבנק שלך לפי השער שלו ועשוי להשתנות מעט.'
                : 'Charged in USD. ILS amount shown is a daily-rate estimate; your bank converts at its own rate at the time of charge.')}
            </p>
            {priceBreakdown.proration && priceBreakdown.proration.remainingDays < priceBreakdown.proration.totalDays && (() => {
              const d = priceBreakdown.proration.nextBillingDate;
              const dateStr = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
              return (
                <p style={{ fontSize: '0.75rem', opacity: 0.75, marginTop: '0.75rem', lineHeight: 1.5 }}>
                  {translations.billingDisclaimer
                    ?.replace('{now}', formatUsd(priceBreakdown.totalPriceUsd))
                    .replace('{date}', dateStr)
                    .replace('{recurring}', formatUsd(priceBreakdown.recurringTotalUsd))}
                </p>
              );
            })()}
          </div>

          {/* Coupon Code Input */}
          <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border, #e5e7eb)' }}>
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, marginBottom: '0.5rem', color: 'var(--foreground, #111)' }}>
              {translations.coupon?.label}
            </label>
            {couponData ? (
              <div style={{ 
                display: 'flex', alignItems: 'center', gap: '0.5rem',
                padding: '0.5rem 0.75rem',
                background: 'rgba(34, 197, 94, 0.1)',
                border: '1px solid rgba(34, 197, 94, 0.3)',
                borderRadius: '0.5rem',
              }}>
                <Check size={16} style={{ color: '#22c55e' }} />
                <span style={{ flex: 1, fontFamily: 'monospace', fontWeight: 600 }}>{couponData.code}</span>
                {(couponData.hasLimitationOverrides || couponData.hasExtraFeatures) && (
                  <span style={{ position: 'relative', display: 'inline-flex' }} className="couponBonusWrap">
                    <span style={{ fontSize: '0.6875rem', color: '#22c55e', padding: '0.125rem 0.5rem', background: 'rgba(34,197,94,0.15)', borderRadius: '9999px', cursor: 'help' }}>
                      + {translations.coupon?.bonuses}
                    </span>
                    <span style={{
                      position: 'absolute', bottom: 'calc(100% + 6px)', insetInlineStart: '50%', transform: 'translateX(-50%)',
                      background: '#1f2937', color: '#f9fafb', fontSize: '0.6875rem', padding: '0.5rem 0.75rem',
                      borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '0.25rem',
                      whiteSpace: 'nowrap', opacity: 0, visibility: 'hidden', transition: 'opacity 0.15s, visibility 0.15s',
                      pointerEvents: 'none', zIndex: 9999, boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
                    }} className="couponBonusTooltip">
                      {couponData.limitationOverrides?.map((o, i) => (
                        <span key={`lo-${i}`}>✦ {translations.limitations?.[o.key] || o.key}: {o.value?.toLocaleString()}</span>
                      ))}
                      {couponData.extraFeatures?.map((f, i) => (
                        <span key={`ef-${i}`}>✦ {translations.features?.[f] || f}</span>
                      ))}
                    </span>
                    <style>{`
                      .couponBonusWrap:hover .couponBonusTooltip {
                        opacity: 1 !important;
                        visibility: visible !important;
                      }
                    `}</style>
                  </span>
                )}
                <button
                  type="button"
                  onClick={handleRemoveCoupon}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem', color: '#6b7280' }}
                >
                  <X size={16} />
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  type="text"
                  value={couponCode}
                  onChange={(e) => { setCouponCode(e.target.value.toUpperCase()); setCouponError(''); }}
                  placeholder={translations.coupon?.placeholder}
                  dir="ltr"
                  style={{
                    flex: 1, padding: '0.5rem 0.75rem', fontSize: '0.9375rem',
                    fontFamily: 'monospace', textTransform: 'uppercase',
                    border: `1px solid ${couponError ? '#ef4444' : 'var(--input-border, #e5e7eb)'}`,
                    borderRadius: '0.5rem', outline: 'none',
                    background: 'var(--input-background, white)',
                    color: 'var(--foreground, #111)',
                  }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleApplyCoupon(); } }}
                />
                <button
                  type="button"
                  onClick={handleApplyCoupon}
                  disabled={couponLoading || !couponCode.trim()}
                  style={{
                    padding: '0.5rem 1rem', fontSize: '0.8125rem', fontWeight: 500,
                    background: 'var(--primary, #7b2cbf)', color: 'white',
                    border: 'none', borderRadius: '0.5rem', cursor: 'pointer',
                    opacity: couponLoading || !couponCode.trim() ? 0.5 : 1,
                  }}
                >
                  {couponLoading ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : translations.coupon?.apply}
                </button>
              </div>
            )}
            {couponError && (
              <p style={{ fontSize: '0.75rem', color: '#ef4444', marginTop: '0.375rem', margin: '0.375rem 0 0' }}>
                {couponError}
              </p>
            )}
            {couponData?.durationMonths && (
              <p style={{ fontSize: '0.75rem', color: 'var(--muted-foreground, #6b7280)', marginTop: '0.25rem', margin: '0.25rem 0 0' }}>
                {translations.coupon?.durationNote?.replace('{months}', couponData.durationMonths)}
              </p>
            )}
          </div>
        </div>

        {/* Payment Form */}
        <div className={styles.paymentForm}>
          {/* CardCom initializing state */}
          {isPaidPlan && isInitializing && (
            <div className={styles.paymentInitializing}>
              <Loader2 size={24} className={styles.spinIcon} />
              <span>{translations.initializing}</span>
            </div>
          )}

          {/* CardCom init error */}
          {isPaidPlan && initError && (
            <div className={styles.paymentInitError}>
              <AlertCircle size={20} />
              <span>{initError}</span>
            </div>
          )}

          {/* CardCom Hidden Master Frame (always rendered for paid plans) */}
          {isPaidPlan && (
            <iframe
              id="CardComMasterFrame"
              name="CardComMasterFrame"
              src={`${CARDCOM_BASE}/api/openfields/master`}
              style={{ display: 'block', width: 0, height: 0, border: 'none' }}
              title="CardCom Master"
            />
          )}

          <form onSubmit={handleSubmit}>
            <div className={styles.formGroup}>
              <label htmlFor="cardholderName" className={styles.formLabel}>
                {translations.cardholderName}
              </label>
              <input
                ref={cardholderNameInputRef}
                type="text"
                id="cardholderName"
                value={cardholderName}
                onChange={(e) => setCardholderName(e.target.value)}
                onBlur={updateCardOwnerDetails}
                className={styles.formInput}
                placeholder={translations.cardholderNamePlaceholder}
                required
                disabled={isProcessing}
              />
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="citizenId" className={styles.formLabel}>
                  {translations.citizenId}
              </label>
              <input
                ref={citizenIdInputRef}
                type="text"
                id="citizenId"
                value={citizenId}
                onChange={(e) => {
                  const next = e.target.value.replace(/\D/g, '').slice(0, 9);
                  setCitizenId(next);
                  if (next.length === 9 && isValidIsraeliId(next)) {
                    advanceFocusFrom('citizenId');
                  }
                }}
                onBlur={() => setCitizenIdTouched(true)}
                className={`${styles.formInput} ${showCitizenIdError ? styles.formInputError : ''}`}
                placeholder={translations.citizenIdPlaceholder}
                dir="ltr"
                required
                disabled={isProcessing}
                aria-invalid={showCitizenIdError || undefined}
                aria-describedby={showCitizenIdError ? 'citizenId-error' : undefined}
              />
              {showCitizenIdError && (
                <span id="citizenId-error" className={styles.fieldError}>
                  {translations.citizenIdInvalid}
                </span>
              )}
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="billingEmail" className={styles.formLabel}>
                  {translations.billingEmail}
              </label>
              <input
                ref={billingEmailInputRef}
                type="email"
                id="billingEmail"
                value={billingEmail}
                onChange={(e) => setBillingEmail(e.target.value)}
                onBlur={updateCardOwnerDetails}
                className={styles.formInput}
                placeholder={translations.billingEmailPlaceholder}
                dir="ltr"
                required
                disabled={isProcessing}
              />
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="cardOwnerPhone" className={styles.formLabel}>
                {translations.phone}
              </label>
              <input
                ref={cardOwnerPhoneInputRef}
                type="tel"
                id="cardOwnerPhone"
                value={cardOwnerPhone}
                onChange={(e) => {
                  const next = e.target.value.replace(/[^\d\-+]/g, '').slice(0, 15);
                  setCardOwnerPhone(next);
                  if (next.replace(/\D/g, '').length === 10) {
                    advanceFocusFrom('cardOwnerPhone');
                  }
                }}
                onBlur={updateCardOwnerDetails}
                className={styles.formInput}
                placeholder={translations.phonePlaceholder}
                dir="ltr"
                disabled={isProcessing}
              />
            </div>

            {isPaidPlan && (
              <>
                {/* Card Number (CardCom iframe) */}
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>
                    <svg width="18" height="13" viewBox="0 0 24 17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginInlineEnd: '0.35rem', verticalAlign: 'middle', opacity: 0.7 }}><rect x="1" y="1" width="22" height="15" rx="3" /><line x1="1" y1="6" x2="23" y2="6" /></svg>
                    {translations.cardNumber}
                  </label>
                  <div className={`${styles.iframeWrapper} ${styles.cardInputWrapper} ${cardNumberValid === false ? styles.iframeInvalid : ''}`}>
                    <svg className={styles.cardInputIcon} width="22" height="16" viewBox="0 0 24 17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="1" width="22" height="15" rx="3" /><line x1="1" y1="6" x2="23" y2="6" /></svg>
                    <iframe
                      id="CardComCardNumber"
                      name="CardComCardNumber"
                      src={`${CARDCOM_BASE}/api/openfields/cardNumber`}
                      className={styles.cardIframeField}
                      title="Card Number"
                      scrolling="no"
                    />
                  </div>
                </div>

                {/* Expiration (combined MM/YY) & CVV Row */}
                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>
                      {translations.expiry || translations.expMonth}
                    </label>
                    <input
                      ref={expiryInputRef}
                      type="text"
                      inputMode="numeric"
                      value={expiry.length <= 2 ? expiry : `${expiry.slice(0, 2)}/${expiry.slice(2)}`}
                      onChange={(e) => {
                        const digits = e.target.value.replace(/\D/g, '').slice(0, 4);
                        setExpiry(digits);
                        if (digits.length === 4) {
                          advanceFocusFrom('expiry');
                        }
                      }}
                      className={styles.formInput}
                      placeholder="MM/YY"
                      dir="ltr"
                      style={{ textAlign: 'center' }}
                      maxLength={5}
                      required
                      disabled={isProcessing}
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>{translations.cvv}</label>
                    <div className={`${styles.iframeWrapper} ${cvvValid === false ? styles.iframeInvalid : ''}`}>
                      <iframe
                        id="CardComCvv"
                        name="CardComCvv"
                        src={`${CARDCOM_BASE}/api/openfields/CVV`}
                        className={styles.cvvIframeField}
                        title="CVV"
                        scrolling="no"
                      />
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Error Message */}
            {paymentError && (
              <div className={styles.paymentErrorMsg}>
                <AlertCircle size={14} />
                <span>{paymentError}</span>
              </div>
            )}

            <div className={styles.securePaymentNote}>
              <Lock size={14} />
              <span>{translations.securePayment}</span>
            </div>

            <button
              type="submit"
              className={styles.submitButton}
              disabled={!isFormValid || isProcessing || (isPaidPlan && (!lowProfileId || !iframeReady))}
            >
              <span className={styles.buttonContent}>
                {isProcessing ? (
                  <>
                    <Loader2 size={16} className={styles.spinIcon} />
                    {translations.processing}
                  </>
                ) : isPaidPlan && (!lowProfileId || !iframeReady) ? (
                  <>
                    <Loader2 size={16} className={styles.spinIcon} />
                    {translations.initializing}
                  </>
                ) : (
                  <>
                    <Lock size={16} />
                    {translations.payNow}
                    {isPaidPlan ? ` ${formatUsd(priceBreakdown.totalPriceUsd)}` : ''}
                    <ArrowIcon className={styles.buttonIcon} />
                  </>
                )}
              </span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

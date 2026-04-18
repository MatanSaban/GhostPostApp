'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Lock, Loader2, Ticket, Check, X, AlertCircle } from 'lucide-react';
import { ArrowIcon } from '@/app/components/ui/arrow-icon';
import { calculateNewSubscriptionProration } from '@/lib/proration';
import styles from '../auth.module.css';

const CARDCOM_BASE = 'https://secure.cardcom.solutions';

export function PaymentStep({ translations, selectedPlan, userData, onComplete }) {
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
  const [billingEmail, setBillingEmail] = useState(defaultBillingEmail);
  const [cardOwnerPhone, setCardOwnerPhone] = useState(defaultPhone);
  const [expirationMonth, setExpirationMonth] = useState('');
  const [expirationYear, setExpirationYear] = useState('');
  const [numberOfPayments] = useState('1');

  // Validation state from iframes
  const [cardNumberValid, setCardNumberValid] = useState(null);
  const [cvvValid, setCvvValid] = useState(null);

  const iframeInitialized = useRef(false);
  const masterFrameRef = useRef(null);

  // Coupon state
  const [couponCode, setCouponCode] = useState('');
  const [couponData, setCouponData] = useState(null);
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponError, setCouponError] = useState('');

  // Calculate prices (convert USD to ILS using live rate from API, fallback to 3.6)
  const USD_TO_ILS_RATE = selectedPlan?.usdToIlsRate || 3.6;
  const VAT_RATE = 0.18;
  
  const getPriceBreakdown = (plan) => {
    if (!plan?.monthlyPrice) return { basePrice: 0, discount: 0, discountedPrice: 0, vatAmount: 0, totalPrice: 0, proration: null };
    
    // Prorate for remaining days in the month (align to 1st)
    const proration = calculateNewSubscriptionProration(plan.monthlyPrice);
    let basePrice = proration.proratedAmount;
    if (plan.currency === 'USD' || !plan.currency) {
      basePrice = Math.round(basePrice * USD_TO_ILS_RATE);
    }
    
    let discount = 0;
    if (couponData) {
      if (couponData.discountType === 'PERCENTAGE') {
        discount = Math.round(basePrice * (couponData.discountValue / 100));
      } else if (couponData.discountType === 'FIXED_AMOUNT') {
        discount = Math.round(couponData.discountValue * (plan.currency === 'USD' || !plan.currency ? USD_TO_ILS_RATE : 1));
      }
    }
    
    const discountedPrice = Math.max(0, basePrice - discount);
    const vatAmount = Math.round(discountedPrice * VAT_RATE);
    const totalPrice = discountedPrice + vatAmount;
    
    return { basePrice, discount, discountedPrice, vatAmount, totalPrice, proration };
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

  // Initialize CardCom LowProfile session
  useEffect(() => {
    // Skip if free plan or already initialized
    if (!priceBreakdown.totalPrice || priceBreakdown.totalPrice <= 0) return;
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
            amount: priceBreakdown.totalPrice,
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
  }, [priceBreakdown.totalPrice]); // eslint-disable-line react-hooks/exhaustive-deps

  // Initialize iframes once LP is ready
  useEffect(() => {
    if (!lowProfileId || iframeInitialized.current) return;

    const timer = setTimeout(() => {
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
            font-size: 0.875rem;
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
            font-size: 0.875rem;
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
    }, 1000);

    return () => clearTimeout(timer);
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
  const handleSubmit = (e) => {
    e.preventDefault();

    // For free plans, skip payment
    if (priceBreakdown.totalPrice <= 0) {
      setIsProcessing(true);
      onComplete();
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

  const isFormValid = priceBreakdown.totalPrice <= 0 || (
    cardholderName.trim().length > 0 &&
    billingEmail.includes('@') &&
    expirationMonth.length === 2 &&
    expirationYear.length === 2 &&
    citizenId.length >= 5
  );

  const isPaidPlan = priceBreakdown.totalPrice > 0;

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
              <span>₪{priceBreakdown.basePrice}</span>
            </div>
            {priceBreakdown.proration && priceBreakdown.proration.remainingDays < priceBreakdown.proration.totalDays && (
              <div className={styles.orderRow} style={{ fontSize: '0.75rem', opacity: 0.7 }}>
                <span>{translations.prorated} ({priceBreakdown.proration.remainingDays}/{priceBreakdown.proration.totalDays} {translations.days})</span>
              </div>
            )}
            {priceBreakdown.discount > 0 && (
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
                <span>-₪{priceBreakdown.discount}</span>
              </div>
            )}
            <div className={styles.orderRow}>
              <span>{translations.vat}</span>
              <span>₪{priceBreakdown.vatAmount}</span>
            </div>
            <div className={`${styles.orderRow} ${styles.orderTotal}`}>
              <span>{translations.total}</span>
              <span>₪{priceBreakdown.totalPrice}{selectedPlan?.period}</span>
            </div>
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
                    flex: 1, padding: '0.5rem 0.75rem', fontSize: '0.875rem',
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
                type="text"
                id="citizenId"
                value={citizenId}
                onChange={(e) => setCitizenId(e.target.value.replace(/\D/g, '').slice(0, 9))}
                className={styles.formInput}
                placeholder={translations.citizenIdPlaceholder}
                dir="ltr"
                required
                disabled={isProcessing}
              />
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="billingEmail" className={styles.formLabel}>
                  {translations.billingEmail}
              </label>
              <input
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
                type="tel"
                id="cardOwnerPhone"
                value={cardOwnerPhone}
                onChange={(e) => setCardOwnerPhone(e.target.value.replace(/[^\d\-+]/g, '').slice(0, 15))}
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
                    />
                  </div>
                </div>

                {/* Expiration & CVV Row */}
                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>
                      {translations.expMonth}
                    </label>
                    <input
                      type="text"
                      value={expirationMonth}
                      onChange={(e) => setExpirationMonth(e.target.value.replace(/\D/g, '').slice(0, 2))}
                      className={styles.formInput}
                      placeholder="MM"
                      dir="ltr"
                      maxLength={2}
                      required
                      disabled={isProcessing}
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>
                      {translations.expYear}
                    </label>
                    <input
                      type="text"
                      value={expirationYear}
                      onChange={(e) => setExpirationYear(e.target.value.replace(/\D/g, '').slice(0, 2))}
                      className={styles.formInput}
                      placeholder="YY"
                      dir="ltr"
                      maxLength={2}
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
              disabled={!isFormValid || isProcessing || (isPaidPlan && !lowProfileId)}
            >
              <span className={styles.buttonContent}>
                {isProcessing ? (
                  <>
                    <Loader2 size={16} className={styles.spinIcon} />
                    {translations.processing}
                  </>
                ) : (
                  <>
                    <Lock size={16} />
                    {translations.payNow} {isPaidPlan ? `₪${priceBreakdown.totalPrice}` : ''}
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

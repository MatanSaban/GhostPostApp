'use client';

import { useState } from 'react';
import { CreditCard, Lock, Loader2 } from 'lucide-react';
import { ArrowIcon } from '@/app/components/ui/arrow-icon';
import styles from '../auth.module.css';

export function PaymentStep({ translations, selectedPlan, userData, onComplete }) {
  // Auto-populate cardholder name from user's first and last name
  const defaultCardholderName = userData 
    ? `${userData.firstName || ''} ${userData.lastName || ''}`.trim()
    : '';
  
  // Default billing email from registration
  const defaultBillingEmail = userData?.email || '';

  const [formData, setFormData] = useState({
    cardNumber: '',
    expiry: '',
    cvv: '',
    cardholderName: defaultCardholderName,
    citizenId: '',
    billingEmail: defaultBillingEmail,
  });
  const [isProcessing, setIsProcessing] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    let formattedValue = value;

    if (name === 'cardNumber') {
      formattedValue = value
        .replace(/\s/g, '')
        .replace(/(\d{4})/g, '$1 ')
        .trim()
        .slice(0, 19);
    } else if (name === 'expiry') {
      formattedValue = value
        .replace(/\D/g, '')
        .replace(/(\d{2})(\d)/, '$1/$2')
        .slice(0, 5);
    } else if (name === 'cvv') {
      formattedValue = value.replace(/\D/g, '').slice(0, 4);
    } else if (name === 'citizenId') {
      formattedValue = value.replace(/\D/g, '').slice(0, 9);
    }

    setFormData(prev => ({
      ...prev,
      [name]: formattedValue,
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setIsProcessing(true);
    
    // Simulate payment processing
    setTimeout(() => {
      onComplete();
    }, 2000);
  };

  // For demo purposes, allow any input - in production, use strict validation
  const isFormValid = 
    formData.cardNumber.length > 0 &&
    formData.expiry.length > 0 &&
    formData.cvv.length > 0 &&
    formData.cardholderName.trim().length > 0 &&
    formData.citizenId.length >= 5 &&
    formData.billingEmail.includes('@');

  // Calculate prices (convert USD to ILS)
  const USD_TO_ILS_RATE = 3.6;
  const VAT_RATE = 0.18;
  
  const getPriceBreakdown = (plan) => {
    if (!plan?.monthlyPrice) return { basePrice: 0, vatAmount: 0, totalPrice: 0 };
    
    let basePrice = plan.monthlyPrice;
    if (plan.currency === 'USD' || !plan.currency) {
      basePrice = Math.round(plan.monthlyPrice * USD_TO_ILS_RATE);
    }
    
    const vatAmount = Math.round(basePrice * VAT_RATE);
    const totalPrice = basePrice + vatAmount;
    
    return { basePrice, vatAmount, totalPrice };
  };

  const priceBreakdown = getPriceBreakdown(selectedPlan);

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
              <span>{translations.subscriptionType || 'סוג מנוי'}</span>
              <span>{translations.monthly || 'חודשי'}</span>
            </div>
            <div className={styles.orderRow}>
              <span>{translations.planPrice || 'מחיר תוכנית'}</span>
              <span>₪{priceBreakdown.basePrice}</span>
            </div>
            <div className={styles.orderRow}>
              <span>{translations.vat || 'מע״מ (18%)'}</span>
              <span>₪{priceBreakdown.vatAmount}</span>
            </div>
            <div className={`${styles.orderRow} ${styles.orderTotal}`}>
              <span>{translations.total}</span>
              <span>₪{priceBreakdown.totalPrice}{selectedPlan?.period}</span>
            </div>
          </div>
        </div>

        {/* Payment Form */}
        <form onSubmit={handleSubmit} className={styles.paymentForm}>
          <div className={styles.formGroup}>
            <label htmlFor="cardholderName" className={styles.formLabel}>
              {translations.cardholderName}
            </label>
            <input
              type="text"
              id="cardholderName"
              name="cardholderName"
              value={formData.cardholderName}
              onChange={handleChange}
              className={styles.formInput}
              placeholder={translations.cardholderNamePlaceholder}
              required
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="citizenId" className={styles.formLabel}>
              {translations.citizenId || 'תעודת זהות'}
            </label>
            <input
              type="text"
              id="citizenId"
              name="citizenId"
              value={formData.citizenId}
              onChange={handleChange}
              className={styles.formInput}
              placeholder={translations.citizenIdPlaceholder || 'הכנס תעודת זהות'}
              dir="ltr"
              required
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="billingEmail" className={styles.formLabel}>
              {translations.billingEmail || 'אימייל לחיוב'}
            </label>
            <input
              type="email"
              id="billingEmail"
              name="billingEmail"
              value={formData.billingEmail}
              onChange={handleChange}
              className={styles.formInput}
              placeholder={translations.billingEmailPlaceholder || 'אימייל לקבלת חשבונית'}
              dir="ltr"
              required
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="cardNumber" className={styles.formLabel}>
              {translations.cardNumber}
            </label>
            <div className={styles.cardInputWrapper}>
              <CreditCard size={18} className={styles.cardIcon} />
              <input
                type="text"
                id="cardNumber"
                name="cardNumber"
                value={formData.cardNumber}
                onChange={handleChange}
                className={`${styles.formInput} ${styles.cardInput}`}
                placeholder={translations.cardNumberPlaceholder}
                dir="ltr"
                required
              />
            </div>
          </div>

          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label htmlFor="expiry" className={styles.formLabel}>
                {translations.expiry}
              </label>
              <input
                type="text"
                id="expiry"
                name="expiry"
                value={formData.expiry}
                onChange={handleChange}
                className={styles.formInput}
                placeholder={translations.expiryPlaceholder}
                dir="ltr"
                required
              />
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="cvv" className={styles.formLabel}>
                {translations.cvv}
              </label>
              <input
                type="text"
                id="cvv"
                name="cvv"
                value={formData.cvv}
                onChange={handleChange}
                className={styles.formInput}
                placeholder={translations.cvvPlaceholder}
                dir="ltr"
                required
              />
            </div>
          </div>

          <div className={styles.securePaymentNote}>
            <Lock size={14} />
            <span>{translations.securePayment}</span>
          </div>

          <button 
            type="submit"
            className={styles.submitButton}
            disabled={!isFormValid || isProcessing}
          >
            <span className={styles.buttonContent}>
              {isProcessing ? (
                <>
                  <Loader2 size={16} className={styles.spinIcon} />
                  {translations.processing}
                </>
              ) : (
                <>
                  {translations.payNow}
                  <ArrowIcon className={styles.buttonIcon} />
                </>
              )}
            </span>
          </button>
        </form>
      </div>
    </div>
  );
}

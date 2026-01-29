'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { ArrowIcon } from '@/app/components/ui/arrow-icon';
import styles from '../auth.module.css';

export function RegisterForm({ translations, onSubmit, isLoading = false, error = '', initialData = {} }) {
  const [formData, setFormData] = useState({
    firstName: initialData.firstName || '',
    lastName: initialData.lastName || '',
    phoneNumber: initialData.phoneNumber || '',
    email: initialData.email || '',
    password: '',
    confirmPassword: '',
    acceptTerms: false,
  });
  const [googleConsentError, setGoogleConsentError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
    // Clear field error when user starts typing/checking
    if (fieldErrors[name]) {
      setFieldErrors(prev => ({ ...prev, [name]: false }));
    }
    // Clear Google consent error when user checks the box
    if (name === 'acceptTerms' && checked) {
      setGoogleConsentError('');
    }
  };

  const validateForm = () => {
    const errors = {};
    
    if (!formData.firstName.trim()) errors.firstName = true;
    if (!formData.lastName.trim()) errors.lastName = true;
    if (!formData.phoneNumber.trim()) errors.phoneNumber = true;
    if (!formData.email.trim()) errors.email = true;
    if (!formData.password) errors.password = true;
    if (!formData.confirmPassword) errors.confirmPassword = true;
    if (formData.password !== formData.confirmPassword) {
      errors.confirmPassword = true;
    }
    if (!formData.acceptTerms) errors.acceptTerms = true;
    
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validateForm()) return;
    if (onSubmit) {
      onSubmit(formData);
    }
  };

  const handleGoogleRegister = () => {
    // Check if terms are accepted before Google registration
    if (!formData.acceptTerms) {
      setGoogleConsentError(translations.consentRequiredForGoogle || 'Please accept the terms before continuing with Google');
      setFieldErrors(prev => ({ ...prev, acceptTerms: true }));
      return;
    }
    // Redirect to Google OAuth with consent confirmed
    window.location.href = '/api/auth/google?mode=register&consent=true';
  };

  const getInputClassName = (fieldName) => {
    return `${styles.formInput} ${fieldErrors[fieldName] ? styles.inputError : ''}`;
  };

  return (
    <>
      <form onSubmit={handleSubmit} className={styles.authForm} noValidate>
        <div className={styles.formRow}>
          <div className={styles.formGroup}>
            <label htmlFor="firstName" className={styles.formLabel}>
              {translations.firstName}
            </label>
            <input
              type="text"
              id="firstName"
              name="firstName"
              value={formData.firstName}
              onChange={handleChange}
              className={getInputClassName('firstName')}
              placeholder={translations.firstNamePlaceholder}
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="lastName" className={styles.formLabel}>
              {translations.lastName}
            </label>
            <input
              type="text"
              id="lastName"
              name="lastName"
              value={formData.lastName}
              onChange={handleChange}
              className={getInputClassName('lastName')}
              placeholder={translations.lastNamePlaceholder}
            />
          </div>
        </div>

        <div className={styles.formRow}>
          <div className={styles.formGroup}>
            <label htmlFor="phoneNumber" className={styles.formLabel}>
              {translations.phoneNumber}
            </label>
            <input
              type="tel"
              id="phoneNumber"
              name="phoneNumber"
              value={formData.phoneNumber}
              onChange={handleChange}
              className={getInputClassName('phoneNumber')}
              placeholder={translations.phoneNumberPlaceholder}
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="email" className={styles.formLabel}>
              {translations.email}
            </label>
            <input
              type="email"
              id="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              className={getInputClassName('email')}
              placeholder={translations.emailPlaceholder}
            />
          </div>
        </div>

        <div className={styles.formRow}>
          <div className={styles.formGroup}>
            <label htmlFor="password" className={styles.formLabel}>
              {translations.password}
            </label>
            <input
              type="password"
              id="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              className={getInputClassName('password')}
              placeholder={translations.createPasswordPlaceholder}
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="confirmPassword" className={styles.formLabel}>
              {translations.confirmPassword}
            </label>
            <input
              type="password"
              id="confirmPassword"
              name="confirmPassword"
              value={formData.confirmPassword}
              onChange={handleChange}
              className={getInputClassName('confirmPassword')}
              placeholder={translations.confirmPasswordPlaceholder}
            />
          </div>
        </div>

        <div className={`${styles.termsGroup} ${fieldErrors.acceptTerms ? styles.termsGroupError : ''}`}>
          <input
            type="checkbox"
            id="acceptTerms"
            name="acceptTerms"
            checked={formData.acceptTerms}
            onChange={handleChange}
            className={`${styles.checkbox} ${fieldErrors.acceptTerms ? styles.checkboxError : ''}`}
          />
          <label htmlFor="acceptTerms" className={styles.termsLabel}>
            {translations.consentText} <Link href="#">{translations.termsOfService}</Link> {translations.and}{' '}
            <Link href="#">{translations.privacyPolicy}</Link>
          </label>
        </div>

        {error && (
          <div className={styles.errorMessage}>{error}</div>
        )}

        {googleConsentError && (
          <div className={styles.errorMessage}>{googleConsentError}</div>
        )}

        <button type="submit" className={styles.submitButton} disabled={isLoading}>
          <span className={styles.buttonContent}>
            {isLoading ? (
              <>
                <Loader2 size={16} className={styles.spinIcon} />
                {translations.creating}
              </>
            ) : (
              <>
                {translations.createAccount}
                <ArrowIcon className={styles.buttonIcon} />
              </>
            )}
          </span>
        </button>
      </form>

      <div className={styles.divider}>
        <span className={styles.dividerText}>{translations.orContinueWith}</span>
      </div>

      <div className={styles.socialButtons}>
        <button type="button" className={styles.socialButton} onClick={handleGoogleRegister}>
          <svg className={styles.socialIcon} viewBox="0 0 24 24" fill="currentColor">
            <path d="M12.545,10.239v3.821h5.445c-0.712,2.315-2.647,3.972-5.445,3.972c-3.332,0-6.033-2.701-6.033-6.032s2.701-6.032,6.033-6.032c1.498,0,2.866,0.549,3.921,1.453l2.814-2.814C17.503,2.988,15.139,2,12.545,2C7.021,2,2.543,6.477,2.543,12s4.478,10,10.002,10c8.396,0,10.249-7.85,9.426-11.748L12.545,10.239z"/>
          </svg>
          {translations.google}
        </button>
      </div>
    </>
  );
}

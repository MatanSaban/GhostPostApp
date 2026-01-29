'use client';

import { useState, useEffect, useCallback } from 'react';
import styles from '../auth.module.css';

// Check if a string contains only English characters
const isEnglishOnly = (str) => /^[a-zA-Z\s]+$/.test(str);

// Convert a string to slug format (snake_case with hyphens)
const toSlug = (str) => {
  return str
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')      // Replace spaces with hyphens
    .replace(/[^a-z0-9-]/g, '') // Remove non-alphanumeric chars except hyphens
    .replace(/-+/g, '-')        // Replace multiple hyphens with single
    .replace(/^-|-$/g, '');     // Remove leading/trailing hyphens
};

export function AccountSetupStep({ translations, onComplete, initialData = {} }) {
  const [formData, setFormData] = useState({
    name: initialData?.name || '',
    slug: initialData?.slug || '',
  });
  const [slugEdited, setSlugEdited] = useState(!!initialData?.slug);
  const [isCheckingSlug, setIsCheckingSlug] = useState(false);
  const [slugAvailable, setSlugAvailable] = useState(initialData?.slug ? true : null);
  const [slugError, setSlugError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Debounced slug check
  const checkSlugAvailability = useCallback(async (slug) => {
    if (!slug || slug.length < 3) {
      setSlugAvailable(null);
      setSlugError(slug && slug.length < 3 ? translations?.slugTooShort : '');
      return;
    }

    setIsCheckingSlug(true);
    setSlugError('');

    try {
      const response = await fetch('/api/auth/account/check-slug', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug }),
      });

      const data = await response.json();

      if (data.available) {
        setSlugAvailable(true);
        setSlugError('');
      } else {
        setSlugAvailable(false);
        setSlugError(data.error || translations?.slugTaken);
      }
    } catch (err) {
      setSlugAvailable(null);
      setSlugError(translations?.checkError);
    } finally {
      setIsCheckingSlug(false);
    }
  }, [translations]);

  // Debounce effect for slug checking
  useEffect(() => {
    if (!formData.slug) {
      setSlugAvailable(null);
      setSlugError('');
      return;
    }

    const timeoutId = setTimeout(() => {
      checkSlugAvailability(formData.slug);
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [formData.slug, checkSlugAvailability]);

  const handleNameChange = (e) => {
    const name = e.target.value;
    setFormData(prev => ({ ...prev, name }));

    // Auto-generate slug if not manually edited and name is in English
    if (!slugEdited && isEnglishOnly(name)) {
      const generatedSlug = toSlug(name);
      setFormData(prev => ({ ...prev, slug: generatedSlug }));
    }
  };

  const handleSlugChange = (e) => {
    const rawSlug = e.target.value;
    // Convert to valid slug format as user types
    const slug = rawSlug.toLowerCase().replace(/[^a-z0-9-]/g, '');
    setFormData(prev => ({ ...prev, slug }));
    setSlugEdited(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      setError(translations?.nameRequired);
      return;
    }

    if (!formData.slug) {
      setError(translations?.slugRequired);
      return;
    }

    if (!slugAvailable) {
      setError(translations?.slugNotAvailable);
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      const response = await fetch('/api/auth/account/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // tempRegId is read from cookie by the API
          name: formData.name.trim(),
          slug: formData.slug,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || translations?.createError);
      }

      onComplete(data.accountSetup);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const isFormValid = formData.name.trim() && formData.slug && slugAvailable && !isCheckingSlug;

  return (
    <div className={styles.interviewStepContainer}>
      <div className={styles.interviewHeader}>
        <h2 className={styles.interviewTitle}>
          {translations?.title}
        </h2>
        <p className={styles.interviewSubtitle}>
          {translations?.description}
        </p>
      </div>

      <form onSubmit={handleSubmit} className={styles.authForm}>
        <div className={styles.formGroup}>
          <label htmlFor="orgName" className={styles.formLabel}>
            {translations?.nameLabel}
          </label>
          <input
            type="text"
            id="orgName"
            value={formData.name}
            onChange={handleNameChange}
            placeholder={translations?.namePlaceholder}
            className={styles.formInput}
            autoFocus
          />
        </div>

        <div className={styles.formGroup}>
          <label htmlFor="slug" className={styles.formLabel}>
            {translations?.slugLabel}
          </label>
          <div className={styles.slugInputWrapper}>
            <span className={styles.slugPrefix}>{translations?.slugPrefix}</span>
            <input
              type="text"
              id="slug"
              value={formData.slug}
              onChange={handleSlugChange}
              placeholder={translations?.slugPlaceholder}
              className={`${styles.slugInput} ${
                slugAvailable === true ? styles.slugValid : 
                slugAvailable === false ? styles.slugInvalid : ''
              }`}
            />
            {isCheckingSlug && (
              <span className={styles.slugLoading}>⏳</span>
            )}
            {!isCheckingSlug && slugAvailable === true && (
              <span className={styles.slugCheck}>✓</span>
            )}
            {!isCheckingSlug && slugAvailable === false && (
              <span className={styles.slugX}>✗</span>
            )}
          </div>
          {slugError && (
            <p className={styles.fieldError}>{slugError}</p>
          )}
          {slugAvailable && (
            <p className={styles.fieldSuccess}>
              {translations?.slugAvailable}
            </p>
          )}
          <p className={styles.fieldHint}>
            {translations?.slugHint}
          </p>
        </div>

        {error && (
          <div className={styles.errorMessage}>{error}</div>
        )}

        <button
          type="submit"
          disabled={!isFormValid || isSubmitting}
          className={styles.submitButton}
        >
          {isSubmitting 
            ? translations?.creating 
            : translations?.continue
          }
        </button>
      </form>
    </div>
  );
}

'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useAuthModal } from '../../../context/auth-modal-context';
import styles from './AuthModal.module.css';

export function AuthModal() {
  const router = useRouter();
  const { isOpen, mode, setMode, close } = useAuthModal();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Close on escape key
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') close();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [isOpen, close]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    // Simulate form submission
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    setIsSubmitting(false);
    close();
    router.push('/dashboard');
  };

  if (!isOpen) return null;

  return createPortal(
    <div className={styles.overlay}>
      {/* Backdrop */}
      <div className={styles.backdrop} onClick={close} />

      {/* Modal */}
      <div className={styles.modal}>
        <div className={styles.card}>
          {/* Glow effect */}
          <div className={styles.glow} />

          {/* Close Button */}
          <button onClick={close} className={styles.closeButton} aria-label="Close modal">
            <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {/* Title */}
          <div className={styles.header}>
            <h2 className={styles.title}>
              {mode === 'login' ? 'System Access' : 'Create Account'}
            </h2>
            <p className={styles.subtitle}>
              {mode === 'login' 
                ? 'Connect to your Ghost Post workspace' 
                : 'Join Ghost Post and automate your SEO'}
            </p>
          </div>

          {/* Mode Toggle */}
          <div className={styles.modeToggle}>
            <button
              type="button"
              onClick={() => setMode('login')}
              className={`${styles.modeButton} ${mode === 'login' ? styles.active : ''}`}
            >
              Login
            </button>
            <button
              type="button"
              onClick={() => setMode('register')}
              className={`${styles.modeButton} ${mode === 'register' ? styles.active : ''}`}
            >
              Register
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className={styles.form}>
            {/* Name Field (Register only) */}
            {mode === 'register' && (
              <div className={styles.formGroup}>
                <label htmlFor="auth-name" className={styles.label}>Full Name</label>
                <input
                  type="text"
                  id="auth-name"
                  placeholder="John Doe"
                  className={styles.input}
                  required
                />
              </div>
            )}

            {/* Email Field */}
            <div className={styles.formGroup}>
              <label htmlFor="auth-email" className={styles.label}>Email</label>
              <input
                type="email"
                id="auth-email"
                defaultValue={mode === 'login' ? 'demo@ghostpost.ai' : ''}
                placeholder={mode === 'register' ? 'your@email.com' : ''}
                className={styles.input}
                readOnly={mode === 'login'}
                required
              />
            </div>

            {/* Password Field */}
            <div className={styles.formGroup}>
              <label htmlFor="auth-password" className={styles.label}>Password</label>
              <input
                type="password"
                id="auth-password"
                defaultValue={mode === 'login' ? '••••••••' : ''}
                placeholder={mode === 'register' ? 'Create a strong password' : ''}
                className={styles.input}
                readOnly={mode === 'login'}
                required
              />
            </div>

            {/* Confirm Password Field (Register only) */}
            {mode === 'register' && (
              <div className={styles.formGroup}>
                <label htmlFor="auth-confirm-password" className={styles.label}>Confirm Password</label>
                <input
                  type="password"
                  id="auth-confirm-password"
                  placeholder="Confirm your password"
                  className={styles.input}
                  required
                />
              </div>
            )}

            {/* Forgot Password (Login only) */}
            {mode === 'login' && (
              <div className={styles.forgotPassword}>
                <button type="button" className={styles.forgotLink}>
                  Forgot password?
                </button>
              </div>
            )}

            {/* Terms (Register only) */}
            {mode === 'register' && (
              <div className={styles.terms}>
                <input type="checkbox" id="auth-terms" className={styles.checkbox} required />
                <label htmlFor="auth-terms" className={styles.termsLabel}>
                  I agree to the{' '}
                  <a href="/terms" className={styles.termsLink}>Terms of Service</a>
                  {' '}and{' '}
                  <a href="/privacy" className={styles.termsLink}>Privacy Policy</a>
                </label>
              </div>
            )}

            {/* Submit Button */}
            <button type="submit" className={styles.submitButton} disabled={isSubmitting}>
              <span>{isSubmitting ? 'Connecting...' : (mode === 'login' ? 'Connect' : 'Create Account')}</span>
              {!isSubmitting && (
                <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              )}
            </button>
          </form>

          {/* Social Login Divider */}
          <div className={styles.divider}>
            <div className={styles.dividerLine} />
            <span className={styles.dividerText}>Or continue with</span>
            <div className={styles.dividerLine} />
          </div>

          {/* Social Login Buttons */}
          <div className={styles.socialButtons}>
            <button type="button" className={styles.socialButton} aria-label="Login with Google">
              <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12.545,10.239v3.821h5.445c-0.712,2.315-2.647,3.972-5.445,3.972c-3.332,0-6.033-2.701-6.033-6.032s2.701-6.032,6.033-6.032c1.498,0,2.866,0.549,3.921,1.453l2.814-2.814C17.503,2.988,15.139,2,12.545,2C7.021,2,2.543,6.477,2.543,12s4.478,10,10.002,10c8.396,0,10.249-7.85,9.426-11.748L12.545,10.239z"/>
              </svg>
              <span>Google</span>
            </button>
            <button type="button" className={styles.socialButton} aria-label="Login with GitHub">
              <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
              </svg>
              <span>GitHub</span>
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

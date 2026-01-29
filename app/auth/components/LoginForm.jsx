'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { ArrowIcon } from '@/app/components/ui/arrow-icon';
import styles from '../auth.module.css';

export function LoginForm({ translations }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || translations.loginFailed);
      }

      if (data.isTempRegistration) {
        // User has a pending registration - cookie is already set by API
        // Store temp registration info for display purposes
        localStorage.setItem('tempRegistration', JSON.stringify({
          email: data.tempReg.email,
          firstName: data.tempReg.firstName,
          lastName: data.tempReg.lastName,
        }));
        // Clear any existing user data
        localStorage.removeItem('user');
      } else {
        // Regular user login
        // Store user data in localStorage for now (replace with proper session management)
        localStorage.setItem('user', JSON.stringify(data.user));
        // Clear any temp registration data
        localStorage.removeItem('tempRegistration');
      }

      // Redirect based on registration step
      router.push(data.redirectTo);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <form onSubmit={handleSubmit} className={styles.authForm}>
        <div className={styles.formGroup}>
          <label htmlFor="email" className={styles.formLabel}>
            {translations.email}
          </label>
          <input
            type="email"
            id="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={styles.formInput}
            placeholder={translations.emailPlaceholder}
            required
          />
        </div>

        <div className={styles.formGroup}>
          <label htmlFor="password" className={styles.formLabel}>
            {translations.password}
          </label>
          <input
            type="password"
            id="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={styles.formInput}
            placeholder={translations.passwordPlaceholder}
            required
          />
        </div>

        <div className={styles.forgotPassword}>
          <Link href="#" className={styles.forgotLink}>
            {translations.forgotPassword}
          </Link>
        </div>

        {error && (
          <div className={styles.errorMessage}>{error}</div>
        )}

        <button type="submit" className={styles.submitButton} disabled={isLoading}>
          <span className={styles.buttonContent}>
            {isLoading ? (
              <>
                <Loader2 size={16} className={styles.spinIcon} />
                {translations.connecting}
              </>
            ) : (
              <>
                {translations.connect}
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
        <button 
          type="button" 
          className={styles.socialButton}
          onClick={() => window.location.href = '/api/auth/google?mode=login'}
        >
          <svg className={styles.socialIcon} viewBox="0 0 24 24" fill="currentColor">
            <path d="M12.545,10.239v3.821h5.445c-0.712,2.315-2.647,3.972-5.445,3.972c-3.332,0-6.033-2.701-6.033-6.032s2.701-6.032,6.033-6.032c1.498,0,2.866,0.549,3.921,1.453l2.814-2.814C17.503,2.988,15.139,2,12.545,2C7.021,2,2.543,6.477,2.543,12s4.478,10,10.002,10c8.396,0,10.249-7.85,9.426-11.748L12.545,10.239z"/>
          </svg>
          {translations.google}
        </button>
      </div>
    </>
  );
}

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
        <button type="button" className={styles.socialButton}>
          <svg className={styles.socialIcon} viewBox="0 0 24 24" fill="currentColor">
            <path d="M12.545,10.239v3.821h5.445c-0.712,2.315-2.647,3.972-5.445,3.972c-3.332,0-6.033-2.701-6.033-6.032s2.701-6.032,6.033-6.032c1.498,0,2.866,0.549,3.921,1.453l2.814-2.814C17.503,2.988,15.139,2,12.545,2C7.021,2,2.543,6.477,2.543,12s4.478,10,10.002,10c8.396,0,10.249-7.85,9.426-11.748L12.545,10.239z"/>
          </svg>
          {translations.google}
        </button>
        <button type="button" className={styles.socialButton}>
          <svg className={styles.socialIcon} viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
          </svg>
          {translations.github}
        </button>
      </div>
    </>
  );
}

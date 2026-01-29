'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Loader2, CheckCircle2, XCircle, Mail, Lock, User, Building2, Shield, Phone } from 'lucide-react';
import styles from '../auth.module.css';

// RTL languages
const RTL_LANGUAGES = ['HE', 'AR'];

// Translations for the accept invite page
const pageTranslations = {
  EN: {
    loading: 'Loading...',
    acceptInvite: {
      title: "You're Invited!",
      subtitle: 'Accept this invitation to join',
      invalidToken: 'Invalid or Expired Invitation',
      invalidTokenMessage: 'This invitation link is invalid or has expired. Please contact the person who invited you to request a new invitation.',
      expiredToken: 'Invitation Expired',
      expiredTokenMessage: 'This invitation has expired. Please contact the person who invited you to request a new invitation.',
      alreadyAccepted: 'Invitation Already Accepted',
      alreadyAcceptedMessage: 'You have already accepted this invitation. You can log in to your account.',
      accountInfo: 'Account Information',
      accountName: 'Account',
      yourRole: 'Your Role',
      invitedBy: 'Invited By',
      existingUser: {
        title: 'Welcome Back!',
        subtitle: 'Sign in to accept your invitation',
        password: 'Password',
        passwordPlaceholder: 'Enter your password',
        forgotPassword: 'Forgot password?',
        signIn: 'Sign In & Join',
        signingIn: 'Signing in...',
        wrongCredentials: 'Invalid password',
      },
      newUser: {
        title: 'Create Your Account',
        subtitle: 'Fill in your details to accept the invitation',
        firstName: 'First Name',
        firstNamePlaceholder: 'Enter your first name',
        lastName: 'Last Name',
        lastNamePlaceholder: 'Enter your last name',
        email: 'Email',
        phone: 'Phone Number',
        phonePlaceholder: 'Enter your phone number',
        password: 'Password',
        passwordPlaceholder: 'Create a password',
        confirmPassword: 'Confirm Password',
        confirmPasswordPlaceholder: 'Confirm your password',
        passwordMismatch: 'Passwords do not match',
        passwordTooShort: 'Password must be at least 8 characters',
        createAccount: 'Create Account & Join',
        creating: 'Creating account...',
      },
      success: {
        title: 'Welcome to the Team!',
        subtitle: "You've successfully joined",
        goToDashboard: 'Go to Dashboard',
      },
      goToLogin: 'Go to Login',
    },
  },
  HE: {
    loading: 'טוען...',
    acceptInvite: {
      title: 'הוזמנת!',
      subtitle: 'קבל/י את ההזמנה להצטרף',
      invalidToken: 'הזמנה לא תקינה או פגה',
      invalidTokenMessage: 'קישור ההזמנה אינו תקין או שפג תוקפו. אנא צור/י קשר עם מי שהזמין אותך כדי לבקש הזמנה חדשה.',
      expiredToken: 'ההזמנה פגה',
      expiredTokenMessage: 'תוקף ההזמנה פג. אנא צור/י קשר עם מי שהזמין אותך כדי לבקש הזמנה חדשה.',
      alreadyAccepted: 'ההזמנה כבר התקבלה',
      alreadyAcceptedMessage: 'כבר קיבלת את ההזמנה הזו. ניתן להתחבר לחשבון שלך.',
      accountInfo: 'פרטי החשבון',
      accountName: 'חשבון',
      yourRole: 'התפקיד שלך',
      invitedBy: 'הוזמנת על ידי',
      existingUser: {
        title: 'ברוך שובך!',
        subtitle: 'התחבר/י כדי לקבל את ההזמנה',
        password: 'סיסמה',
        passwordPlaceholder: 'הזן/י את הסיסמה שלך',
        forgotPassword: 'שכחת סיסמה?',
        signIn: 'התחבר/י והצטרף/י',
        signingIn: 'מתחבר...',
        wrongCredentials: 'סיסמה שגויה',
      },
      newUser: {
        title: 'צור/י את החשבון שלך',
        subtitle: 'מלא/י את הפרטים כדי לקבל את ההזמנה',
        firstName: 'שם פרטי',
        firstNamePlaceholder: 'הזן/י את שמך הפרטי',
        lastName: 'שם משפחה',
        lastNamePlaceholder: 'הזן/י את שם משפחתך',
        email: 'אימייל',
        phone: 'מספר טלפון',
        phonePlaceholder: 'הזן/י את מספר הטלפון שלך',
        password: 'סיסמה',
        passwordPlaceholder: 'צור/י סיסמה',
        confirmPassword: 'אימות סיסמה',
        confirmPasswordPlaceholder: 'הזן/י שוב את הסיסמה',
        passwordMismatch: 'הסיסמאות אינן תואמות',
        passwordTooShort: 'הסיסמה חייבת להכיל לפחות 8 תווים',
        createAccount: 'צור/י חשבון והצטרף/י',
        creating: 'יוצר חשבון...',
      },
      success: {
        title: 'ברוך הבא לצוות!',
        subtitle: 'הצטרפת בהצלחה ל',
        goToDashboard: 'מעבר ללוח הבקרה',
      },
      goToLogin: 'מעבר להתחברות',
    },
  },
};

export function AcceptInviteFlow({ token, translations: fallbackTranslations }) {
  const router = useRouter();
  const [status, setStatus] = useState('loading'); // loading, valid, invalid, expired, accepted, success, error
  const [inviteData, setInviteData] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [language, setLanguage] = useState('EN');
  
  // Form data for new users
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    password: '',
    confirmPassword: '',
  });
  
  // Form data for existing users
  const [loginData, setLoginData] = useState({
    password: '',
  });

  // Get translations based on invite language
  const t = pageTranslations[language] || pageTranslations.EN;
  const isRtl = RTL_LANGUAGES.includes(language);

  // Apply RTL to document when language changes
  useEffect(() => {
    if (status === 'valid' && inviteData?.language) {
      document.documentElement.dir = isRtl ? 'rtl' : 'ltr';
      document.documentElement.lang = language.toLowerCase();
    }
    
    return () => {
      // Reset on unmount
      document.documentElement.dir = 'ltr';
    };
  }, [status, language, isRtl, inviteData]);

  // Verify token on mount
  useEffect(() => {
    if (!token) {
      setStatus('invalid');
      return;
    }
    
    verifyToken();
  }, [token]);

  const verifyToken = async () => {
    try {
      const res = await fetch(`/api/auth/accept-invite/verify?token=${encodeURIComponent(token)}`);
      const data = await res.json();
      
      if (!res.ok) {
        if (data.code === 'EXPIRED') {
          setStatus('expired');
        } else if (data.code === 'ALREADY_ACCEPTED') {
          setStatus('accepted');
        } else {
          setStatus('invalid');
        }
        return;
      }
      
      setInviteData(data);
      setLanguage(data.language || 'EN');
      setStatus('valid');
    } catch (err) {
      console.error('Error verifying token:', err);
      setStatus('error');
    }
  };

  const handleNewUserSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    if (formData.password !== formData.confirmPassword) {
      setError(t.acceptInvite.newUser.passwordMismatch);
      return;
    }
    
    if (formData.password.length < 8) {
      setError(t.acceptInvite.newUser.passwordTooShort);
      return;
    }
    
    try {
      setIsSubmitting(true);
      
      const res = await fetch('/api/auth/accept-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          firstName: formData.firstName,
          lastName: formData.lastName,
          password: formData.password,
        }),
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        setError(data.error || 'Failed to accept invitation');
        return;
      }
      
      setStatus('success');
    } catch (err) {
      console.error('Error accepting invite:', err);
      setError('An unexpected error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleExistingUserSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    try {
      setIsSubmitting(true);
      
      const res = await fetch('/api/auth/accept-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          password: loginData.password,
          existingUser: true,
        }),
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        setError(data.error || t.acceptInvite.existingUser.wrongCredentials);
        return;
      }
      
      setStatus('success');
    } catch (err) {
      console.error('Error accepting invite:', err);
      setError('An unexpected error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Loading state
  if (status === 'loading') {
    return (
      <div className={styles.acceptInviteLoading}>
        <Loader2 className={styles.spinner} size={32} />
        <p>{t.loading}</p>
      </div>
    );
  }

  // Invalid token
  if (status === 'invalid') {
    return (
      <div className={styles.acceptInviteError}>
        <XCircle size={48} className={styles.errorIcon} />
        <h2>{t.acceptInvite.invalidToken}</h2>
        <p>{t.acceptInvite.invalidTokenMessage}</p>
        <Link href="/auth/login" className={styles.authBtn}>
          {t.acceptInvite.goToLogin}
        </Link>
      </div>
    );
  }

  // Expired token
  if (status === 'expired') {
    return (
      <div className={styles.acceptInviteError}>
        <XCircle size={48} className={styles.errorIcon} />
        <h2>{t.acceptInvite.expiredToken}</h2>
        <p>{t.acceptInvite.expiredTokenMessage}</p>
        <Link href="/auth/login" className={styles.authBtn}>
          {t.acceptInvite.goToLogin}
        </Link>
      </div>
    );
  }

  // Already accepted
  if (status === 'accepted') {
    return (
      <div className={styles.acceptInviteInfo}>
        <CheckCircle2 size={48} className={styles.successIcon} />
        <h2>{t.acceptInvite.alreadyAccepted}</h2>
        <p>{t.acceptInvite.alreadyAcceptedMessage}</p>
        <Link href="/auth/login" className={styles.authBtn}>
          {t.acceptInvite.goToLogin}
        </Link>
      </div>
    );
  }

  // Success - invitation accepted
  if (status === 'success') {
    return (
      <div className={styles.acceptInviteSuccess}>
        <CheckCircle2 size={48} className={styles.successIcon} />
        <h2>{t.acceptInvite.success.title}</h2>
        <p>{t.acceptInvite.success.subtitle} <strong>{inviteData?.accountName}</strong></p>
        <button 
          onClick={() => router.push('/dashboard')} 
          className={styles.authBtn}
        >
          {t.acceptInvite.success.goToDashboard}
        </button>
      </div>
    );
  }

  // Valid invite - show form
  return (
    <div className={styles.acceptInviteValid}>
      <h2 className={styles.authTitle}>{t.acceptInvite.title}</h2>
      <p className={styles.authSubtitle}>{t.acceptInvite.subtitle}</p>
      
      {/* Account info card */}
      <div className={styles.inviteInfoCard}>
        <h3>{t.acceptInvite.accountInfo}</h3>
        <div className={styles.inviteInfoRow}>
          <Building2 size={18} />
          <span>{t.acceptInvite.accountName}:</span>
          <strong>{inviteData?.accountName}</strong>
        </div>
        <div className={styles.inviteInfoRow}>
          <Shield size={18} />
          <span>{t.acceptInvite.yourRole}:</span>
          <strong>{inviteData?.roleName}</strong>
        </div>
        {inviteData?.inviterName && (
          <div className={styles.inviteInfoRow}>
            <User size={18} />
            <span>{t.acceptInvite.invitedBy}:</span>
            <strong>{inviteData.inviterName}</strong>
          </div>
        )}
      </div>

      {error && (
        <div className={styles.authError}>
          <XCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* Form for new users */}
      {!inviteData?.existingUser && (
        <form onSubmit={handleNewUserSubmit} className={styles.authForm}>
          <h3 className={styles.formSectionTitle}>{t.acceptInvite.newUser.title}</h3>
          <p className={styles.formSectionSubtitle}>{t.acceptInvite.newUser.subtitle}</p>
          
          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label htmlFor="firstName">{t.acceptInvite.newUser.firstName}</label>
              <div className={styles.inputWrapper}>
                <User size={18} className={styles.inputIcon} />
                <input
                  id="firstName"
                  type="text"
                  value={formData.firstName}
                  onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                  placeholder={t.acceptInvite.newUser.firstNamePlaceholder}
                  required
                />
              </div>
            </div>
            <div className={styles.formGroup}>
              <label htmlFor="lastName">{t.acceptInvite.newUser.lastName}</label>
              <div className={styles.inputWrapper}>
                <User size={18} className={styles.inputIcon} />
                <input
                  id="lastName"
                  type="text"
                  value={formData.lastName}
                  onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                  placeholder={t.acceptInvite.newUser.lastNamePlaceholder}
                  required
                />
              </div>
            </div>
          </div>
          
          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label htmlFor="email">{t.acceptInvite.newUser.email}</label>
              <div className={styles.inputWrapper}>
                <Mail size={18} className={styles.inputIcon} />
                <input
                  id="email"
                  type="email"
                  value={inviteData?.email || ''}
                  disabled
                  className={styles.disabledInput}
                />
              </div>
            </div>
            <div className={styles.formGroup}>
              <label htmlFor="phone">{t.acceptInvite.newUser.phone}</label>
              <div className={styles.inputWrapper}>
                <Phone size={18} className={styles.inputIcon} />
                <input
                  id="phone"
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder={t.acceptInvite.newUser.phonePlaceholder}
                />
              </div>
            </div>
          </div>
          
          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label htmlFor="password">{t.acceptInvite.newUser.password}</label>
              <div className={styles.inputWrapper}>
                <Lock size={18} className={styles.inputIcon} />
                <input
                  id="password"
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder={t.acceptInvite.newUser.passwordPlaceholder}
                  required
                  minLength={8}
                />
              </div>
            </div>
            <div className={styles.formGroup}>
              <label htmlFor="confirmPassword">{t.acceptInvite.newUser.confirmPassword}</label>
              <div className={styles.inputWrapper}>
                <Lock size={18} className={styles.inputIcon} />
                <input
                  id="confirmPassword"
                  type="password"
                  value={formData.confirmPassword}
                  onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                  placeholder={t.acceptInvite.newUser.confirmPasswordPlaceholder}
                  required
                  minLength={8}
                />
              </div>
            </div>
          </div>
          
          <button
            type="submit"
            className={styles.authBtn}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 size={18} className={styles.spinner} />
                {t.acceptInvite.newUser.creating}
              </>
            ) : (
              t.acceptInvite.newUser.createAccount
            )}
          </button>
        </form>
      )}

      {/* Form for existing users */}
      {inviteData?.existingUser && (
        <form onSubmit={handleExistingUserSubmit} className={styles.authForm}>
          <h3 className={styles.formSectionTitle}>{t.acceptInvite.existingUser.title}</h3>
          <p className={styles.formSectionSubtitle}>{t.acceptInvite.existingUser.subtitle}</p>
          
          <div className={styles.formGroup}>
            <label htmlFor="email">{t.acceptInvite.existingUser.email}</label>
            <div className={styles.inputWrapper}>
              <Mail size={18} className={styles.inputIcon} />
              <input
                id="email"
                type="email"
                value={inviteData?.email || ''}
                disabled
                className={styles.disabledInput}
              />
            </div>
          </div>
          
          <div className={styles.formGroup}>
            <label htmlFor="password">{t.acceptInvite.existingUser.password}</label>
            <div className={styles.inputWrapper}>
              <Lock size={18} className={styles.inputIcon} />
              <input
                id="password"
                type="password"
                value={loginData.password}
                onChange={(e) => setLoginData({ ...loginData, password: e.target.value })}
                placeholder={t.acceptInvite.existingUser.passwordPlaceholder}
                required
              />
            </div>
            <Link href="/auth/forgot-password" className={styles.forgotPasswordLink}>
              {t.acceptInvite.existingUser.forgotPassword}
            </Link>
          </div>
          
          <button
            type="submit"
            className={styles.authBtn}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 size={18} className={styles.spinner} />
                {t.acceptInvite.existingUser.signingIn}
              </>
            ) : (
              t.acceptInvite.existingUser.signIn
            )}
          </button>
        </form>
      )}
    </div>
  );
}

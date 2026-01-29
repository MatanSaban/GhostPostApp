import { HeaderActions } from '@/app/components/ui/header-actions';
import { AcceptInviteFlow } from './AcceptInviteFlow';
import { getTranslations } from '@/i18n/server';
import styles from '../auth.module.css';

export const metadata = {
  title: 'Accept Invitation | Ghost Post',
  description: 'Accept your invitation to join an account on Ghost Post',
};

export default async function AcceptInvitePage({ searchParams }) {
  const t = await getTranslations();
  const params = await searchParams;
  const token = params?.token || '';

  const translations = {
    loading: t('common.loading') || 'Loading...',
    error: t('common.error') || 'Error',
    acceptInvite: {
      title: t('acceptInvite.title') || 'You\'re Invited!',
      subtitle: t('acceptInvite.subtitle') || 'Accept this invitation to join',
      invalidToken: t('acceptInvite.invalidToken') || 'Invalid or expired invitation',
      invalidTokenMessage: t('acceptInvite.invalidTokenMessage') || 'This invitation link is invalid or has expired. Please contact the person who invited you to request a new invitation.',
      expiredToken: t('acceptInvite.expiredToken') || 'Invitation Expired',
      expiredTokenMessage: t('acceptInvite.expiredTokenMessage') || 'This invitation has expired. Please contact the person who invited you to request a new invitation.',
      alreadyAccepted: t('acceptInvite.alreadyAccepted') || 'Invitation Already Accepted',
      alreadyAcceptedMessage: t('acceptInvite.alreadyAcceptedMessage') || 'You have already accepted this invitation. You can log in to your account.',
      accountInfo: t('acceptInvite.accountInfo') || 'Account Information',
      accountName: t('acceptInvite.accountName') || 'Account',
      yourRole: t('acceptInvite.yourRole') || 'Your Role',
      invitedBy: t('acceptInvite.invitedBy') || 'Invited By',
      existingUser: {
        title: t('acceptInvite.existingUser.title') || 'Welcome Back!',
        subtitle: t('acceptInvite.existingUser.subtitle') || 'Sign in to accept your invitation',
        email: t('auth.email') || 'Email',
        password: t('auth.password') || 'Password',
        passwordPlaceholder: t('auth.passwordPlaceholder') || 'Enter your password',
        forgotPassword: t('auth.forgotPassword') || 'Forgot password?',
        signIn: t('auth.login') || 'Sign In',
        signingIn: t('common.loading') || 'Signing in...',
        wrongCredentials: t('auth.invalidCredentials') || 'Invalid email or password',
      },
      newUser: {
        title: t('acceptInvite.newUser.title') || 'Create Your Account',
        subtitle: t('acceptInvite.newUser.subtitle') || 'Fill in your details to accept the invitation',
        firstName: t('auth.firstName') || 'First Name',
        firstNamePlaceholder: t('auth.firstNamePlaceholder') || 'Enter your first name',
        lastName: t('auth.lastName') || 'Last Name',
        lastNamePlaceholder: t('auth.lastNamePlaceholder') || 'Enter your last name',
        email: t('auth.email') || 'Email',
        password: t('auth.password') || 'Password',
        passwordPlaceholder: t('auth.createPasswordPlaceholder') || 'Create a password',
        confirmPassword: t('auth.confirmPassword') || 'Confirm Password',
        confirmPasswordPlaceholder: t('auth.confirmPasswordPlaceholder') || 'Confirm your password',
        passwordMismatch: t('auth.passwordMismatch') || 'Passwords do not match',
        createAccount: t('auth.createAccount') || 'Create Account & Join',
        creating: t('common.loading') || 'Creating account...',
      },
      success: {
        title: t('acceptInvite.success.title') || 'Welcome to the team!',
        subtitle: t('acceptInvite.success.subtitle') || 'You\'ve successfully joined',
        goToDashboard: t('acceptInvite.success.goToDashboard') || 'Go to Dashboard',
      },
      goToLogin: t('acceptInvite.goToLogin') || 'Go to Login',
      requestNewInvite: t('acceptInvite.requestNewInvite') || 'Request New Invite',
    },
  };

  return (
    <div className={styles.acceptInviteContainer}>
      <div className={styles.acceptInviteCard}>
        <div className={styles.authGlow} />
        
        <div className={`${styles.authLogo} ${styles.fixedLogo}`}>
          <img 
            src="/ghostpost_logo.png" 
            alt="Ghost Post" 
            className={styles.logoImage}
          />
          <span className={styles.logoText}>Ghost Post</span>
        </div>
        
        <HeaderActions />
        
        <AcceptInviteFlow token={token} translations={translations} />
      </div>
    </div>
  );
}

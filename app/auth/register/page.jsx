import Link from 'next/link';
import Image from 'next/image';
import { HeaderActions } from '@/app/components/ui/header-actions';
import { RegistrationFlow } from '../components';
import { getTranslations } from '@/i18n/server';
import styles from '../auth.module.css';

export default async function RegisterPage({ searchParams }) {
  const t = await getTranslations();
  const params = await searchParams;
  const initialStep = params?.step || 'form';

  const translations = {
    steps: {
      account: t('registration.steps.account'),
      verify: t('registration.steps.verify'),
      organization: t('registration.steps.organization'),
      interview: t('registration.steps.interview'),
      plan: t('registration.steps.plan'),
      payment: t('registration.steps.payment'),
    },
    progressSteps: {
      goToStep: t('registration.progressSteps.goToStep'),
    },
    form: {
      firstName: t('auth.firstName'),
      firstNamePlaceholder: t('auth.firstNamePlaceholder'),
      lastName: t('auth.lastName'),
      lastNamePlaceholder: t('auth.lastNamePlaceholder'),
      phoneNumber: t('auth.phoneNumber'),
      phoneNumberPlaceholder: t('auth.phoneNumberPlaceholder'),
      email: t('auth.email'),
      emailPlaceholder: t('auth.emailPlaceholder'),
      password: t('auth.password'),
      createPasswordPlaceholder: t('auth.createPasswordPlaceholder'),
      confirmPassword: t('auth.confirmPassword'),
      confirmPasswordPlaceholder: t('auth.confirmPasswordPlaceholder'),
      consentText: t('auth.consentText'),
      termsOfService: t('auth.termsOfService'),
      and: t('common.and'),
      privacyPolicy: t('auth.privacyPolicy'),
      createAccount: t('auth.createAccount'),
      orContinueWith: t('auth.orContinueWith'),
      google: t('auth.google'),
      consentRequiredForGoogle: t('auth.consentRequiredForGoogle'),
    },
    otp: {
      chooseMethod: t('registration.otp.chooseMethod'),
      viaSms: t('registration.otp.viaSms'),
      viaEmail: t('registration.otp.viaEmail'),
      codeSentToPhone: t('registration.otp.codeSentToPhone'),
      codeSentToEmail: t('registration.otp.codeSentToEmail'),
      enterCode: t('registration.otp.enterCode'),
      verify: t('registration.otp.verify'),
      resendCode: t('registration.otp.resendCode'),
      resendIn: t('registration.otp.resendIn'),
      seconds: t('registration.otp.seconds'),
      verificationSuccess: t('registration.otp.verificationSuccess'),
      verificationSuccessMessage: t('registration.otp.verificationSuccessMessage'),
      verificationFailed: t('registration.otp.verificationFailed'),
      verificationFailedMessage: t('registration.otp.verificationFailedMessage'),
      tryAgain: t('registration.otp.tryAgain'),
      continue: t('registration.otp.continue'),
      verifying: t('registration.otp.verifying'),
      devModeCode: t('registration.otp.devModeCode'),
      verificationError: t('registration.otp.verificationError'),
      failedToVerify: t('registration.otp.failedToVerify'),
      failedToResend: t('registration.otp.failedToResend'),
    },
    accountSetup: {
      title: t('registration.accountSetup.title'),
      description: t('registration.accountSetup.description'),
      nameLabel: t('registration.accountSetup.nameLabel'),
      namePlaceholder: t('registration.accountSetup.namePlaceholder'),
      slugLabel: t('registration.accountSetup.slugLabel'),
      slugPlaceholder: t('registration.accountSetup.slugPlaceholder'),
      slugPrefix: t('registration.accountSetup.slugPrefix'),
      slugHint: t('registration.accountSetup.slugHint'),
      slugAvailable: t('registration.accountSetup.slugAvailable'),
      slugTooShort: t('registration.accountSetup.slugTooShort'),
      slugTaken: t('registration.accountSetup.slugTaken'),
      checkError: t('registration.accountSetup.checkError'),
      nameRequired: t('registration.accountSetup.nameRequired'),
      slugRequired: t('registration.accountSetup.slugRequired'),
      slugNotAvailable: t('registration.accountSetup.slugNotAvailable'),
      createError: t('registration.accountSetup.createError'),
      creating: t('registration.accountSetup.creating'),
      continue: t('registration.accountSetup.continue'),
    },
    interview: {
      title: t('registration.interview.title'),
      subtitle: t('registration.interview.subtitle'),
    },
    plans: {
      title: t('registration.plans.title'),
      subtitle: t('registration.plans.subtitle'),
      selectPlan: t('registration.plans.selectPlan'),
      selected: t('registration.plans.selected'),
      popular: t('registration.plans.popular'),
      continueToPay: t('registration.plans.continueToPay'),
      basic: {
        name: t('registration.plans.basic.name'),
        price: t('registration.plans.basic.price'),
        period: t('registration.plans.basic.period'),
        description: t('registration.plans.basic.description'),
        features: [
          t('registration.plans.basic.features.0'),
          t('registration.plans.basic.features.1'),
          t('registration.plans.basic.features.2'),
          t('registration.plans.basic.features.3'),
          t('registration.plans.basic.features.4'),
        ],
      },
      pro: {
        name: t('registration.plans.pro.name'),
        price: t('registration.plans.pro.price'),
        period: t('registration.plans.pro.period'),
        description: t('registration.plans.pro.description'),
        features: [
          t('registration.plans.pro.features.0'),
          t('registration.plans.pro.features.1'),
          t('registration.plans.pro.features.2'),
          t('registration.plans.pro.features.3'),
          t('registration.plans.pro.features.4'),
          t('registration.plans.pro.features.5'),
        ],
      },
      enterprise: {
        name: t('registration.plans.enterprise.name'),
        price: t('registration.plans.enterprise.price'),
        period: t('registration.plans.enterprise.period'),
        description: t('registration.plans.enterprise.description'),
        features: [
          t('registration.plans.enterprise.features.0'),
          t('registration.plans.enterprise.features.1'),
          t('registration.plans.enterprise.features.2'),
          t('registration.plans.enterprise.features.3'),
          t('registration.plans.enterprise.features.4'),
          t('registration.plans.enterprise.features.5'),
          t('registration.plans.enterprise.features.6'),
        ],
      },
    },
    payment: {
      title: t('registration.payment.title'),
      subtitle: t('registration.payment.subtitle'),
      cardNumber: t('registration.payment.cardNumber'),
      cardNumberPlaceholder: t('registration.payment.cardNumberPlaceholder'),
      expiry: t('registration.payment.expiry'),
      expiryPlaceholder: t('registration.payment.expiryPlaceholder'),
      cvv: t('registration.payment.cvv'),
      cvvPlaceholder: t('registration.payment.cvvPlaceholder'),
      cardholderName: t('registration.payment.cardholderName'),
      cardholderNamePlaceholder: t('registration.payment.cardholderNamePlaceholder'),
      payNow: t('registration.payment.payNow'),
      processing: t('registration.payment.processing'),
      securePayment: t('registration.payment.securePayment'),
      orderSummary: t('registration.payment.orderSummary'),
      plan: t('registration.payment.plan'),
      billingCycle: t('registration.payment.billingCycle'),
      total: t('registration.payment.total'),
    },
    success: {
      successTitle: t('registration.success.successTitle'),
      successMessage: t('registration.success.successMessage'),
      yourPlan: t('registration.success.yourPlan'),
      goToDashboard: t('registration.success.goToDashboard'),
    },
    brandInitial: t('brand.initial'),
    brandName: t('brand.name'),
    createAccount: t('auth.createAccount'),
    joinGhostPost: t('auth.joinGhostPost'),
    login: t('auth.login'),
    register: t('auth.register'),
    hasAccount: t('auth.hasAccount'),
    loginNow: t('auth.loginNow'),
  };

  return (
    <div className={styles.authContainer}>
      <div className={styles.themeToggleWrapper}>
        <HeaderActions />
      </div>
      
      <div className={styles.authCardWide}>
        <div className={styles.authGlow}></div>
        
        <div className={styles.authHeader}>
          <div className={styles.authLogo}>
            <Image src="/ghostpost_logo.png" alt="Ghost Post" width={48} height={48} className={styles.logoImage} />
            <span className={styles.logoText}>{translations.brandName}</span>
          </div>
          <h1 className={styles.authTitle}>{translations.createAccount}</h1>
          <p className={styles.authSubtitle}>{translations.joinGhostPost}</p>
        </div>

        <RegistrationFlow translations={translations} initialStep={initialStep} />

        <div className={styles.authFooter}>
          {translations.hasAccount} <Link href="/auth/login">{translations.loginNow}</Link>
        </div>
      </div>
    </div>
  );
}

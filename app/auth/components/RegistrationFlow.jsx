'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { RegisterForm } from './RegisterForm';
import { OtpMethodModal } from './OtpMethodModal';
import { OtpVerificationStep } from './OtpVerificationStep';
import { AccountSetupStep } from './AccountSetupStep';
import { InterviewStep } from './InterviewStep';
import { PlanSelectionStep } from './PlanSelectionStep';
import { PaymentStep } from './PaymentStep';
import { PaymentSuccessStep } from './PaymentSuccessStep';
import { ProgressSteps } from './ProgressSteps';
import { StepNavigation } from './StepNavigation';
import styles from '../auth.module.css';

// Map URL step param to internal step names
const STEP_MAP = {
  'form': 'form',
  'verify': 'verify',
  'account-setup': 'account-setup',
  'interview': 'interview',
  'plan': 'plan',
  'payment': 'payment',
};

// Map server registration step to step index
const SERVER_STEP_TO_INDEX = {
  'FORM': 0,
  'VERIFY': 1,
  'ACCOUNT_SETUP': 2,
  'INTERVIEW': 3,
  'PLAN': 4,
  'PAYMENT': 5,
};

// Map URL step to index for validation
const URL_STEP_TO_INDEX = {
  'form': 0,
  'verify': 1,
  'account-setup': 2,
  'interview': 3,
  'plan': 4,
  'payment': 5,
};

export function RegistrationFlow({ translations, initialStep = 'form' }) {
  const router = useRouter();
  const mappedInitialStep = STEP_MAP[initialStep] || 'form';
  const [currentStep, setCurrentStep] = useState(mappedInitialStep);
  const [highestCompletedIndex, setHighestCompletedIndex] = useState(-1); // Track highest completed step
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true); // Always check on mount
  const [error, setError] = useState('');
  const [registrationData, setRegistrationData] = useState({
    tempRegId: null,
    formData: {},
    otpMethod: '',
    otpCode: '', // For development - will show the code
    accountData: null, // Account setup data
    interviewData: {},
    selectedPlan: null,
  });

  // Load temp registration data and check status
  useEffect(() => {
    const checkRegistrationStatus = async () => {
      try {
        // Fetch current registration status from cookies-based API
        const response = await fetch('/api/auth/registration/status');
        const data = await response.json();

        if (response.ok && data.success) {
          if (data.hasTempRegistration && data.tempReg) {
            // We have an existing temp registration
            const tempReg = data.tempReg;
            
            setRegistrationData(prev => ({
              ...prev,
              tempRegId: tempReg.id,
              formData: {
                firstName: tempReg.firstName,
                lastName: tempReg.lastName,
                email: tempReg.email,
                phoneNumber: tempReg.phoneNumber,
              },
              accountData: tempReg.accountName ? {
                name: tempReg.accountName,
                slug: tempReg.accountSlug,
              } : null,
              interviewData: tempReg.interviewData || {},
            }));

            // Get the server's current step index (this is the step they should be on)
            const serverStep = tempReg.currentStep;
            const serverStepIndex = SERVER_STEP_TO_INDEX[serverStep] ?? 0;
            
            // The user has completed up to the step BEFORE their current step
            setHighestCompletedIndex(serverStepIndex - 1);

            // Get the requested URL step index
            const requestedStepIndex = URL_STEP_TO_INDEX[mappedInitialStep] ?? 0;

            // Validate: user can only access steps up to their current server step
            // They can go back to completed steps OR stay on their current step
            if (requestedStepIndex > serverStepIndex) {
              // Trying to access a step they haven't reached yet - redirect to their current step
              router.push(`/auth/register?step=${data.currentStep}`);
              return;
            }

            // Valid step - use the requested step (they're going back or on current)
            setCurrentStep(mappedInitialStep);
          } else {
            // No temp registration exists
            if (initialStep !== 'form') {
              // Trying to access a step without registration, redirect to form
              router.push('/auth/register');
              return;
            }
            // No temp registration and on form step - that's fine
            setCurrentStep('form');
          }
        } else {
          // API error but has response - redirect to form if not already there
          if (initialStep !== 'form') {
            router.push('/auth/register');
            return;
          }
        }

        setIsCheckingAuth(false);
      } catch {
        // Fetch error - redirect to form if not already there
        if (initialStep !== 'form') {
          router.push('/auth/register');
          return;
        }
        setIsCheckingAuth(false);
      }
    };

    checkRegistrationStatus();
  }, [initialStep, mappedInitialStep, router]);

  const steps = [
    { id: 'form', label: translations.steps.account },
    { id: 'verify', label: translations.steps.verify },
    { id: 'account-setup', label: translations.steps.organization },
    { id: 'interview', label: translations.steps.interview },
    { id: 'plan', label: translations.steps.plan },
    { id: 'payment', label: translations.steps.payment },
  ];

  const getCurrentStepIndex = () => {
    if (currentStep === 'success') return steps.length - 1;
    return steps.findIndex(s => s.id === currentStep);
  };

  const handleFormSubmit = async (formData) => {
    setIsLoading(true);
    setError('');
    
    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: formData.firstName,
          lastName: formData.lastName,
          email: formData.email,
          phoneNumber: formData.phoneNumber,
          password: formData.password,
          consent: formData.acceptTerms,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || translations.errors?.registrationFailed);
      }

      // tempRegId is now stored in httpOnly cookie by the API
      setRegistrationData(prev => ({ 
        ...prev, 
        formData,
        tempRegId: data.tempRegId,
      }));
      setHighestCompletedIndex(0); // Completed form step
      setShowOtpModal(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOtpMethodSelect = async (method) => {
    setIsLoading(true);
    setError('');

    try {
      const response = await fetch('/api/auth/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // tempRegId is read from cookie by the API
          method: method.toUpperCase(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || translations.errors?.failedToSendOtp);
      }

      setRegistrationData(prev => ({ 
        ...prev, 
        otpMethod: method,
        otpCode: data.code || '', // Development only
      }));
      setShowOtpModal(false);
      setCurrentStep('verify');
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOtpVerified = () => {
    // Step is already updated to ACCOUNT_SETUP in the OTP verify API
    setHighestCompletedIndex(prev => Math.max(prev, 1)); // Completed 'verify' (index 1)
    setCurrentStep('account-setup');
  };

  const handleAccountSetupComplete = (accountData) => {
    // Step is already updated to INTERVIEW in the account create API
    setHighestCompletedIndex(prev => Math.max(prev, 2)); // Completed 'account-setup' (index 2)
    setRegistrationData(prev => ({ ...prev, accountData }));
    setCurrentStep('interview');
  };

  // Save interview answers incrementally
  const handleInterviewAnswerSaved = async (interviewData, isComplete) => {
    try {
      const response = await fetch('/api/auth/registration/interview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interviewData, isComplete }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save interview data');
      }

      // Update local state with latest data
      setRegistrationData(prev => ({ ...prev, interviewData }));
    } catch (err) {
      console.error('Failed to save interview answer:', err);
      throw err; // Re-throw so InterviewStep knows it failed
    }
  };

  const handleInterviewComplete = async (interviewData) => {
    // Data was already saved via handleInterviewAnswerSaved with isComplete=true
    setHighestCompletedIndex(prev => Math.max(prev, 3)); // Completed 'interview' (index 3)
    setRegistrationData(prev => ({ ...prev, interviewData }));
    setCurrentStep('plan');
  };

  const handlePlanSelected = async (plan) => {
    setIsLoading(true);
    setError('');
    
    try {
      const response = await fetch('/api/auth/registration/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: plan.id }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save plan selection');
      }

      setHighestCompletedIndex(prev => Math.max(prev, 4)); // Completed 'plan' (index 4)
      setRegistrationData(prev => ({ ...prev, selectedPlan: plan }));
      setCurrentStep('payment');
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePaymentComplete = async () => {
    setIsLoading(true);
    setError('');
    
    try {
      // Finalize registration - creates real User and Account
      const response = await fetch('/api/auth/registration/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to complete registration');
      }

      // Store the real user in localStorage for session
      localStorage.setItem('user', JSON.stringify(data.user));

      setHighestCompletedIndex(prev => Math.max(prev, 5)); // Completed 'payment' (index 5)
      setCurrentStep('success');
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoToDashboard = () => {
    router.push('/dashboard');
  };

  const handleStepClick = (stepId, stepIndex) => {
    // Only allow navigating to completed steps (not current or future)
    if (stepIndex < getCurrentStepIndex()) {
      setCurrentStep(stepId);
    }
  };

  const handlePrevious = () => {
    const currentIndex = getCurrentStepIndex();
    if (currentIndex > 0) {
      setCurrentStep(steps[currentIndex - 1].id);
    }
  };

  const handleNext = () => {
    const currentIndex = getCurrentStepIndex();
    // Can only go forward if the next step has been completed before
    if (currentIndex < highestCompletedIndex) {
      setCurrentStep(steps[currentIndex + 1].id);
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 'form':
        return (
          <RegisterForm 
            translations={translations.form} 
            onSubmit={handleFormSubmit}
            isLoading={isLoading}
            error={error}
            initialData={registrationData.formData}
          />
        );
      case 'verify':
        return (
          <OtpVerificationStep
            translations={translations.otp}
            method={registrationData.otpMethod}
            devCode={registrationData.otpCode}
            onVerified={handleOtpVerified}
          />
        );
      case 'account-setup':
        return (
          <AccountSetupStep
            translations={translations.accountSetup}
            onComplete={handleAccountSetupComplete}
            initialData={registrationData.accountData}
          />
        );
      case 'interview':
        return (
          <InterviewStep
            translations={translations.interview}
            onComplete={handleInterviewComplete}
            initialData={registrationData.interviewData}
            onAnswerSaved={handleInterviewAnswerSaved}
          />
        );
      case 'plan':
        return (
          <PlanSelectionStep
            translations={translations.plans}
            onSelect={handlePlanSelected}
          />
        );
      case 'payment':
        return (
          <PaymentStep
            translations={translations.payment}
            selectedPlan={registrationData.selectedPlan}
            onComplete={handlePaymentComplete}
          />
        );
      case 'success':
        return (
          <PaymentSuccessStep
            translations={translations.success}
            selectedPlan={registrationData.selectedPlan}
            onGoToDashboard={handleGoToDashboard}
          />
        );
      default:
        return null;
    }
  };

  // Show loading while checking authentication for non-form steps
  if (isCheckingAuth) {
    return (
      <div className={styles.registrationFlowContainer}>
        <div className={styles.loadingContainer}>
          <div className={styles.loader}></div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.registrationFlowContainer}>
      {currentStep !== 'form' && currentStep !== 'success' && (
        <ProgressSteps 
          steps={steps} 
          currentStepIndex={getCurrentStepIndex()}
          onStepClick={handleStepClick}
          translations={translations.progressSteps}
        />
      )}
      
      {error && currentStep !== 'form' && (
        <div className={styles.errorMessage}>{error}</div>
      )}
      
      {renderStep()}

      {/* Navigation buttons - only show between verify and payment steps */}
      {currentStep !== 'form' && currentStep !== 'success' && (
        <StepNavigation
          currentStepIndex={getCurrentStepIndex()}
          totalSteps={steps.length}
          highestCompletedIndex={highestCompletedIndex}
          onPrevious={handlePrevious}
          onNext={handleNext}
          translations={translations.navigation || { previous: 'הקודם', next: 'הבא' }}
        />
      )}

      {showOtpModal && (
        <OtpMethodModal
          translations={translations.otp}
          onSelect={handleOtpMethodSelect}
          onClose={() => setShowOtpModal(false)}
          isLoading={isLoading}
        />
      )}
    </div>
  );
}

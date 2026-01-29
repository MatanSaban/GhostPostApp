'use client';

import { useState, useRef, useEffect } from 'react';
import { CheckCircle2, XCircle, RefreshCw, Loader2 } from 'lucide-react';
import { ArrowIcon } from '@/app/components/ui/arrow-icon';
import styles from '../auth.module.css';

export function OtpVerificationStep({ translations, method, devCode, onVerified }) {
  const [code, setCode] = useState(['', '', '', '']);
  const [status, setStatus] = useState('input'); // 'input' | 'success' | 'failed'
  const [isVerifying, setIsVerifying] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [resendTimer, setResendTimer] = useState(30);
  const [canResend, setCanResend] = useState(false);
  const inputRefs = useRef([]);

  useEffect(() => {
    if (resendTimer > 0) {
      const timer = setTimeout(() => setResendTimer(resendTimer - 1), 1000);
      return () => clearTimeout(timer);
    } else {
      setCanResend(true);
    }
  }, [resendTimer]);

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  const handleInputChange = (index, value) => {
    if (value.length > 1) {
      value = value.slice(-1);
    }
    
    if (!/^\d*$/.test(value)) return;

    const newCode = [...code];
    newCode[index] = value;
    setCode(newCode);

    // Move to next input
    if (value && index < 3) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').slice(0, 4);
    if (!/^\d+$/.test(pastedData)) return;
    
    const newCode = [...code];
    for (let i = 0; i < pastedData.length; i++) {
      newCode[i] = pastedData[i];
    }
    setCode(newCode);
    
    const focusIndex = Math.min(pastedData.length, 3);
    inputRefs.current[focusIndex]?.focus();
  };

  const handleVerify = async () => {
    const enteredCode = code.join('');
    setIsVerifying(true);
    setErrorMessage('');

    try {
      const response = await fetch('/api/auth/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // tempRegId is read from cookie by the API
          code: enteredCode,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setErrorMessage(data.error || translations.verificationError);
        if (data.remainingAttempts !== undefined && data.remainingAttempts <= 0) {
          setStatus('failed');
        }
        return;
      }

      setStatus('success');
    } catch (err) {
      setErrorMessage(translations.failedToVerify);
    } finally {
      setIsVerifying(false);
    }
  };

  const handleTryAgain = () => {
    setCode(['', '', '', '']);
    setStatus('input');
    setErrorMessage('');
    inputRefs.current[0]?.focus();
  };

  const handleResend = async () => {
    try {
      const response = await fetch('/api/auth/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // tempRegId is read from cookie by the API
          method: method.toUpperCase(),
        }),
      });

      if (response.ok) {
        setResendTimer(30);
        setCanResend(false);
        setCode(['', '', '', '']);
        setErrorMessage('');
        inputRefs.current[0]?.focus();
      }
    } catch (err) {
      setErrorMessage(translations.failedToResend);
    }
  };

  const isCodeComplete = code.every(digit => digit !== '');

  if (status === 'success') {
    return (
      <div className={styles.otpResultContainer}>
        <div className={styles.otpResultCard}>
          <div className={styles.otpResultIconSuccess}>
            <CheckCircle2 size={48} />
          </div>
          <h2 className={styles.otpResultTitle}>{translations.verificationSuccess}</h2>
          <p className={styles.otpResultMessage}>{translations.verificationSuccessMessage}</p>
          <button className={styles.submitButton} onClick={onVerified}>
            <span className={styles.buttonContent}>
              {translations.continue}
              <ArrowIcon className={styles.buttonIcon} />
            </span>
          </button>
        </div>
      </div>
    );
  }

  if (status === 'failed') {
    return (
      <div className={styles.otpResultContainer}>
        <div className={styles.otpResultCard}>
          <div className={styles.otpResultIconFailed}>
            <XCircle size={48} />
          </div>
          <h2 className={styles.otpResultTitle}>{translations.verificationFailed}</h2>
          <p className={styles.otpResultMessage}>{translations.verificationFailedMessage}</p>
          <button className={styles.submitButton} onClick={handleTryAgain}>
            <span className={styles.buttonContent}>
              {translations.tryAgain}
              <RefreshCw size={16} className={styles.buttonIcon} />
            </span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.otpVerificationContainer}>
      <div className={styles.otpVerificationCard}>
        <h2 className={styles.otpTitle}>
          {method === 'sms' ? translations.codeSentToPhone : translations.codeSentToEmail}
        </h2>
        <p className={styles.otpSubtitle}>{translations.enterCode}</p>

        <div className={styles.otpInputGroup} onPaste={handlePaste}>
          {code.map((digit, index) => (
            <input
              key={index}
              ref={el => inputRefs.current[index] = el}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={(e) => handleInputChange(index, e.target.value)}
              onKeyDown={(e) => handleKeyDown(index, e)}
              className={styles.otpInput}
            />
          ))}
        </div>

        {devCode && (
          <div className={styles.devCodeHint}>
            {translations.devModeCode} <strong>{devCode}</strong>
          </div>
        )}

        {errorMessage && (
          <div className={styles.errorMessage}>{errorMessage}</div>
        )}

        <button 
          className={styles.submitButton}
          onClick={handleVerify}
          disabled={!isCodeComplete || isVerifying}
        >
          <span className={styles.buttonContent}>
            {isVerifying ? (
              <>
                <Loader2 size={16} className={styles.spinIcon} />
                {translations.verifying}
              </>
            ) : (
              <>
                {translations.verify}
                <ArrowIcon className={styles.buttonIcon} />
              </>
            )}
          </span>
        </button>

        <div className={styles.resendContainer}>
          {canResend ? (
            <button className={styles.resendButton} onClick={handleResend}>
              <RefreshCw size={14} />
              {translations.resendCode}
            </button>
          ) : (
            <span className={styles.resendTimer}>
              {translations.resendIn} {resendTimer} {translations.seconds}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

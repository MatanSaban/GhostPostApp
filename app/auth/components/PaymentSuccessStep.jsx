'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, Sparkles } from 'lucide-react';
import { ArrowIcon } from '@/app/components/ui/arrow-icon';
import styles from '../auth.module.css';

function Confetti() {
  const [particles, setParticles] = useState([]);

  useEffect(() => {
    const colors = ['#7b2cbf', '#9d4edd', '#c77dff', '#e0aaff', '#10b981', '#fbbf24', '#f472b6'];
    const newParticles = [];
    
    for (let i = 0; i < 100; i++) {
      newParticles.push({
        id: i,
        x: Math.random() * 100,
        delay: Math.random() * 3,
        duration: 2 + Math.random() * 2,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: 6 + Math.random() * 8,
        rotation: Math.random() * 360,
      });
    }
    
    setParticles(newParticles);
  }, []);

  return (
    <div className={styles.confettiContainer}>
      {particles.map((particle) => (
        <div
          key={particle.id}
          className={styles.confettiPiece}
          style={{
            left: `${particle.x}%`,
            backgroundColor: particle.color,
            width: `${particle.size}px`,
            height: `${particle.size * 0.4}px`,
            animationDelay: `${particle.delay}s`,
            animationDuration: `${particle.duration}s`,
            transform: `rotate(${particle.rotation}deg)`,
          }}
        />
      ))}
    </div>
  );
}

export function PaymentSuccessStep({ translations, selectedPlan, onGoToDashboard }) {
  const [showConfetti, setShowConfetti] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowConfetti(false);
    }, 5000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className={styles.paymentSuccessContainer}>
      {showConfetti && <Confetti />}
      
      <div className={styles.successCard}>
        <div className={styles.successIconWrapper}>
          <div className={styles.successIcon}>
            <CheckCircle2 size={48} />
          </div>
          <div className={styles.successSparkles}>
            <Sparkles size={20} className={styles.sparkle1} />
            <Sparkles size={16} className={styles.sparkle2} />
            <Sparkles size={14} className={styles.sparkle3} />
          </div>
        </div>

        <h2 className={styles.successTitle}>{translations.successTitle}</h2>
        <p className={styles.successMessage}>{translations.successMessage}</p>

        <div className={styles.successPlanInfo}>
          <span className={styles.successPlanLabel}>{translations.yourPlan}</span>
          <span className={styles.successPlanName}>{selectedPlan?.name}</span>
          <span className={styles.successPlanPrice}>
            {selectedPlan?.price}{selectedPlan?.period}
          </span>
        </div>

        <button 
          className={styles.submitButton}
          onClick={onGoToDashboard}
        >
          <span className={styles.buttonContent}>
            {translations.goToDashboard}
            <ArrowIcon className={styles.buttonIcon} />
          </span>
        </button>
      </div>
    </div>
  );
}

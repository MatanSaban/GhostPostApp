'use client';

import { Check } from 'lucide-react';
import styles from '../auth.module.css';

export function ProgressSteps({ steps, currentStepIndex, onStepClick, translations }) {
  return (
    <div className={styles.progressStepsContainer}>
      {steps.map((step, index) => {
        const isCompleted = index < currentStepIndex;
        const isActive = index === currentStepIndex;
        const isClickable = isCompleted; // Can only click on completed steps
        
        const handleClick = () => {
          if (isClickable && onStepClick) {
            onStepClick(step.id, index);
          }
        };

        return (
          <div key={step.id} className={styles.progressStepItem}>
            <button
              type="button"
              onClick={handleClick}
              disabled={!isClickable}
              className={`${styles.progressStepCircle} ${isCompleted ? styles.completed : ''} ${isActive ? styles.active : ''} ${isClickable ? styles.clickable : ''}`}
              aria-label={translations?.goToStep ? `${translations.goToStep} ${step.label}` : step.label}
            >
              {isCompleted ? (
                <Check size={14} />
              ) : (
                <span>{index + 1}</span>
              )}
            </button>
            <span 
              className={`${styles.progressStepLabel} ${isActive ? styles.active : ''} ${isClickable ? styles.clickable : ''}`}
              onClick={handleClick}
              role={isClickable ? 'button' : undefined}
              tabIndex={isClickable ? 0 : undefined}
            >
              {step.label}
            </span>
            {index < steps.length - 1 && (
              <div className={`${styles.progressStepLine} ${isCompleted ? styles.completed : ''}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import styles from '../auth.module.css';

export function StepNavigation({ 
  translations,
  currentStepIndex,
  totalSteps,
  highestCompletedIndex,
  onPrevious,
  onNext,
  showPrevious = true,
  showNext = true,
  isPreviousDisabled = false,
  isNextDisabled = false,
}) {
  // Can go back if not on first step
  const canGoPrevious = currentStepIndex > 0 && !isPreviousDisabled;
  
  // Can go forward if current step is already completed (highestCompleted >= current)
  const canGoNext = currentStepIndex <= highestCompletedIndex && currentStepIndex < totalSteps - 1 && !isNextDisabled;

  return (
    <div className={styles.stepNavigation}>
      {showPrevious && currentStepIndex > 0 ? (
        <button
          type="button"
          className={`${styles.navButton} ${styles.navButtonPrevious}`}
          onClick={onPrevious}
          disabled={!canGoPrevious}
        >
          <ChevronLeft size={18} />
          <span>{translations?.previous}</span>
        </button>
      ) : (
        <div className={styles.navSpacer}></div>
      )}

      {showNext && currentStepIndex < totalSteps - 1 ? (
        <button
          type="button"
          className={`${styles.navButton} ${styles.navButtonNext}`}
          onClick={onNext}
          disabled={!canGoNext}
        >
          <span>{translations?.next}</span>
          <ChevronRight size={18} />
        </button>
      ) : (
        <div className={styles.navSpacer}></div>
      )}
    </div>
  );
}

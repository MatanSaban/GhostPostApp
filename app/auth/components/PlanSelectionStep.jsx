'use client';

import { useState } from 'react';
import { Check, Sparkles } from 'lucide-react';
import { ArrowIcon } from '@/app/components/ui/arrow-icon';
import styles from '../auth.module.css';

export function PlanSelectionStep({ translations, onSelect }) {
  const [selectedPlan, setSelectedPlan] = useState(null);

  const plans = [
    {
      id: 'basic',
      name: translations.basic.name,
      price: translations.basic.price,
      period: translations.basic.period,
      description: translations.basic.description,
      features: translations.basic.features,
      popular: false,
    },
    {
      id: 'pro',
      name: translations.pro.name,
      price: translations.pro.price,
      period: translations.pro.period,
      description: translations.pro.description,
      features: translations.pro.features,
      popular: true,
    },
    {
      id: 'enterprise',
      name: translations.enterprise.name,
      price: translations.enterprise.price,
      period: translations.enterprise.period,
      description: translations.enterprise.description,
      features: translations.enterprise.features,
      popular: false,
    },
  ];

  const handleContinue = () => {
    if (selectedPlan) {
      const plan = plans.find(p => p.id === selectedPlan);
      onSelect(plan);
    }
  };

  return (
    <div className={styles.planSelectionContainer}>
      <div className={styles.planSelectionHeader}>
        <h2 className={styles.planSelectionTitle}>{translations.title}</h2>
        <p className={styles.planSelectionSubtitle}>{translations.subtitle}</p>
      </div>

      <div className={styles.plansGrid}>
        {plans.map((plan) => (
          <div
            key={plan.id}
            className={`${styles.planCard} ${selectedPlan === plan.id ? styles.planCardSelected : ''} ${plan.popular ? styles.planCardPopular : ''}`}
            onClick={() => setSelectedPlan(plan.id)}
          >
            {plan.popular && (
              <div className={styles.popularBadge}>
                <Sparkles size={12} />
                {translations.popular}
              </div>
            )}
            
            <div className={styles.planHeader}>
              <h3 className={styles.planName}>{plan.name}</h3>
              <p className={styles.planDescription}>{plan.description}</p>
            </div>

            <div className={styles.planPricing}>
              <span className={styles.planPrice}>{plan.price}</span>
              <span className={styles.planPeriod}>{plan.period}</span>
            </div>

            <ul className={styles.planFeatures}>
              {plan.features.map((feature, index) => (
                <li key={index} className={styles.planFeature}>
                  <Check size={16} className={styles.featureCheck} />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>

            <button 
              className={`${styles.planSelectBtn} ${selectedPlan === plan.id ? styles.planSelectBtnActive : ''}`}
            >
              {selectedPlan === plan.id ? translations.selected : translations.selectPlan}
            </button>
          </div>
        ))}
      </div>

      <div className={styles.planContinueWrapper}>
        <button 
          className={styles.submitButton}
          onClick={handleContinue}
          disabled={!selectedPlan}
        >
          <span className={styles.buttonContent}>
            {translations.continueToPay}
            <ArrowIcon className={styles.buttonIcon} />
          </span>
        </button>
      </div>
    </div>
  );
}

'use client';

import { useState, useEffect } from 'react';
import { Check, Sparkles, Loader2 } from 'lucide-react';
import { ArrowIcon } from '@/app/components/ui/arrow-icon';
import { useLocale } from '@/app/context/locale-context';
import styles from '../auth.module.css';

export function PlanSelectionStep({ translations, onSelect }) {
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { locale } = useLocale();

  useEffect(() => {
    const fetchPlans = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch(`/api/public/plans?lang=${locale}`);
        
        if (!response.ok) {
          throw new Error('Failed to fetch plans');
        }
        
        const data = await response.json();
        setPlans(data.plans || []);
      } catch (err) {
        console.error('Error fetching plans:', err);
        setError(err.message);
        // Fallback to static translations if API fails
        setPlans(getStaticPlans(translations));
      } finally {
        setLoading(false);
      }
    };

    fetchPlans();
  }, [locale, translations]);

  // Fallback static plans from translations
  const getStaticPlans = (t) => [
    {
      id: 'basic',
      slug: 'basic',
      name: t?.basic?.name || 'Basic',
      price: t?.basic?.price || '$29',
      period: t?.basic?.period || '/month',
      description: t?.basic?.description || '',
      features: t?.basic?.features ? Object.values(t.basic.features) : [],
      popular: false,
    },
    {
      id: 'pro',
      slug: 'pro',
      name: t?.pro?.name || 'Pro',
      price: t?.pro?.price || '$79',
      period: t?.pro?.period || '/month',
      description: t?.pro?.description || '',
      features: t?.pro?.features ? Object.values(t.pro.features) : [],
      popular: true,
    },
    {
      id: 'enterprise',
      slug: 'enterprise',
      name: t?.enterprise?.name || 'Enterprise',
      price: t?.enterprise?.price || '$199',
      period: t?.enterprise?.period || '/month',
      description: t?.enterprise?.description || '',
      features: t?.enterprise?.features ? Object.values(t.enterprise.features) : [],
      popular: false,
    },
  ];

  // Format price for display (convert USD to ILS + 18% VAT)
  const formatPrice = (plan) => {
    const USD_TO_ILS_RATE = 3.6; // Approximate conversion rate
    const VAT_RATE = 1.18; // 18% Israeli VAT
    
    if (plan.monthlyPrice !== undefined) {
      // If price is in USD, convert to ILS
      if (plan.currency === 'USD' || !plan.currency) {
        const ilsPrice = Math.round(plan.monthlyPrice * USD_TO_ILS_RATE * VAT_RATE);
        return `₪${ilsPrice}`;
      }
      // Already in ILS, just add VAT
      const ilsPrice = Math.round(plan.monthlyPrice * VAT_RATE);
      return `₪${ilsPrice}`;
    }
    return plan.price || '';
  };

  const handleContinue = () => {
    if (selectedPlan) {
      const plan = plans.find(p => p.id === selectedPlan || p.slug === selectedPlan);
      onSelect(plan);
    }
  };

  if (loading) {
    return (
      <div className={styles.planSelectionContainer}>
        <div className={styles.planSelectionHeader}>
          <h2 className={styles.planSelectionTitle}>{translations?.title || 'Choose Your Plan'}</h2>
          <p className={styles.planSelectionSubtitle}>{translations?.subtitle || 'Select the plan that best fits your needs'}</p>
        </div>
        <div className={styles.loadingContainer}>
          <Loader2 className={styles.spinner} size={32} />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.planSelectionContainer}>
      <div className={styles.planSelectionHeader}>
        <h2 className={styles.planSelectionTitle}>{translations?.title || 'Choose Your Plan'}</h2>
        <p className={styles.planSelectionSubtitle}>{translations?.subtitle || 'Select the plan that best fits your needs'}</p>
      </div>

      <div className={styles.plansGrid}>
        {plans.map((plan) => {
          const planId = plan.id || plan.slug;
          const displayPrice = formatPrice(plan);
          // Handle features as array of objects {key, label} or array of strings
          const rawFeatures = Array.isArray(plan.features) 
            ? plan.features 
            : (plan.features ? Object.values(plan.features) : []);
          const featuresList = rawFeatures.map(f => 
            typeof f === 'string' ? f : (f.label || f.key || '')
          ).filter(Boolean);
          
          return (
            <div
              key={planId}
              className={`${styles.planCard} ${selectedPlan === planId ? styles.planCardSelected : ''} ${plan.popular ? styles.planCardPopular : ''}`}
              onClick={() => setSelectedPlan(planId)}
            >
              {plan.popular && (
                <div className={styles.popularBadge}>
                  <Sparkles size={12} />
                  {translations?.popular || 'Most Popular'}
                </div>
              )}
              
              <div className={styles.planHeader}>
                <h3 className={styles.planName}>{plan.name}</h3>
                <p className={styles.planDescription}>{plan.description}</p>
              </div>

              <div className={styles.planPricing}>
                <span className={styles.planPrice}>{displayPrice}</span>
                <span className={styles.planPeriod}>{plan.period}</span>
              </div>

              <ul className={styles.planFeatures}>
                {featuresList.map((feature, index) => (
                  <li key={index} className={styles.planFeature}>
                    <Check size={16} className={styles.featureCheck} />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <button 
                className={`${styles.planSelectBtn} ${selectedPlan === planId ? styles.planSelectBtnActive : ''}`}
              >
                {selectedPlan === planId ? (translations?.selected || 'Selected') : (translations?.selectPlan || 'Select Plan')}
              </button>
            </div>
          );
        })}
      </div>

      <div className={styles.planContinueWrapper}>
        <button 
          className={styles.submitButton}
          onClick={handleContinue}
          disabled={!selectedPlan}
        >
          <span className={styles.buttonContent}>
            {translations?.continueToPay || 'Continue to Payment'}
            <ArrowIcon className={styles.buttonIcon} />
          </span>
        </button>
      </div>
    </div>
  );
}

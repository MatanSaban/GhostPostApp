'use client';

import { useState, useEffect } from 'react';
import { Check, Sparkles, Loader2, Gift } from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import styles from '../auth.module.css';

export function PlanSelectionStep({
  translations,
  onSelect,
  initialPlanSlug = null,
  submitRef,
  onSelectionChange,
}) {
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
        const fetchedPlans = data.plans || [];
        setPlans(fetchedPlans);

        // Auto-select plan if initialPlanSlug is provided
        if (initialPlanSlug && !selectedPlan) {
          const match = fetchedPlans.find(p =>
            p.slug?.toLowerCase() === initialPlanSlug.toLowerCase() ||
            p.name?.toLowerCase() === initialPlanSlug.toLowerCase()
          );
          if (match) setSelectedPlan(match.id || match.slug);
        }
      } catch (err) {
        console.error('Error fetching plans:', err);
        setError(err.message);
        // Fallback to static translations if API fails
        const staticPlans = getStaticPlans(translations);
        setPlans(staticPlans);

        if (initialPlanSlug && !selectedPlan) {
          const match = staticPlans.find(p =>
            p.slug?.toLowerCase() === initialPlanSlug.toLowerCase()
          );
          if (match) setSelectedPlan(match.id || match.slug);
        }
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

  // Primary price (USD). Matches gp-ws pricing page: dollars are the
  // canonical headline price; ILS shows below as a daily-rate estimate.
  const formatUsdPrice = (plan) => {
    if (plan.monthlyPrice !== undefined && plan.monthlyPrice !== null) {
      return `$${plan.monthlyPrice}`;
    }
    return plan.price || '';
  };

  // Secondary ILS estimate (incl. VAT). Falls through to a fallback rate
  // when the public-plans endpoint hasn't supplied a live USD→ILS rate yet.
  const formatIlsEstimate = (plan) => {
    if (plan.monthlyPrice == null) return null;
    if (plan.monthlyPrice === 0) return null;
    if (plan.ilsMonthlyPrice) return `₪${plan.ilsMonthlyPrice}`;
    const FALLBACK_RATE = 3.6;
    const VAT_RATE = 1.18;
    const ils = Math.round(plan.monthlyPrice * FALLBACK_RATE * VAT_RATE);
    return `₪${ils}`;
  };

  const handleContinue = () => {
    if (selectedPlan) {
      const plan = plans.find(p => p.id === selectedPlan || p.slug === selectedPlan);
      onSelect(plan);
    }
  };

  // Register the submit handler so the parent's "Next" button can drive
  // the plan-selection submit; mirrors the AccountSetupStep pattern.
  useEffect(() => {
    if (submitRef) submitRef.current = handleContinue;
    return () => {
      if (submitRef) submitRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitRef, selectedPlan, plans]);

  // Tell the parent whether a plan is selected so it can enable / disable
  // its "Next" button.
  useEffect(() => {
    onSelectionChange?.(!!selectedPlan);
  }, [selectedPlan, onSelectionChange]);

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
          const usdPrice = formatUsdPrice(plan);
          const ilsEstimate = formatIlsEstimate(plan);
          // Handle limitations + features as array of objects {key, label} or array of strings
          const rawLimitations = Array.isArray(plan.limitations)
            ? plan.limitations
            : (plan.limitations ? Object.values(plan.limitations) : []);
          const rawFeatures = Array.isArray(plan.features) 
            ? plan.features 
            : (plan.features ? Object.values(plan.features) : []);
          const featuresList = [...rawLimitations, ...rawFeatures].map(f => 
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
                <span className={styles.planPrice}>{usdPrice}</span>
                <span className={styles.planPeriod}>{plan.period}</span>
              </div>
              {ilsEstimate && (
                <p
                  style={{
                    margin: '0.25rem 0 0',
                    fontSize: '0.8125rem',
                    opacity: 0.7,
                    lineHeight: 1.4,
                  }}
                >
                  ≈ {ilsEstimate}
                  {plan.period}{' '}
                  {(translations?.inclVat || (locale === 'he' ? 'כולל מע״מ' : 'incl. VAT'))}
                </p>
              )}

              {plan.trialDays > 0 && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.5rem 0.75rem',
                    margin: '0.5rem 0 0.75rem',
                    borderRadius: '0.5rem',
                    background: 'rgba(34, 197, 94, 0.12)',
                    border: '1px solid rgba(34, 197, 94, 0.35)',
                    color: '#22c55e',
                    fontSize: '0.8125rem',
                    lineHeight: 1.3,
                  }}
                >
                  <Gift size={14} />
                  <span>
                    <strong>
                      {(translations?.trialBadge || '{days}-day free trial').replace('{days}', plan.trialDays)}
                    </strong>
                    <span style={{ opacity: 0.85, marginInlineStart: '0.375rem' }}>
                      · {translations?.trialNoCard || 'No credit card required'}
                    </span>
                  </span>
                </div>
              )}

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

    </div>
  );
}

'use client';

import { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { useUser } from '@/app/context/user-context';
import { ONBOARDING_STEPS } from '@/lib/onboarding';

const OnboardingContext = createContext(null);

export function useOnboarding() {
  const ctx = useContext(OnboardingContext);
  if (!ctx) {
    throw new Error('useOnboarding must be used within <OnboardingProvider>');
  }
  return ctx;
}

export function OnboardingProvider({ children }) {
  const { user } = useUser();
  const accountId = user?.accountId;

  const [state, setState] = useState({
    step: ONBOARDING_STEPS.GREETING,
    completed: false,
    skipped: false,
    startedAt: null,
    completedAt: null,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isGuideOpen, setIsGuideOpen] = useState(false);

  const refresh = useCallback(async () => {
    if (!accountId) return;
    try {
      const res = await fetch('/api/onboarding/progress', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      setState({
        step: data.step,
        completed: !!data.completed,
        skipped: !!data.skipped,
        startedAt: data.startedAt || null,
        completedAt: data.completedAt || null,
      });
    } catch (err) {
      console.error('OnboardingProvider refresh failed:', err);
    } finally {
      setIsLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    if (!accountId) return;
    setIsLoading(true);
    refresh();
  }, [accountId, refresh]);

  const post = useCallback(async (body) => {
    const res = await fetch('/api/onboarding/progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    const data = await res.json();
    setState({
      step: data.step,
      completed: !!data.completed,
      skipped: !!data.skipped,
      startedAt: data.startedAt || null,
      completedAt: data.completedAt || null,
    });
    return data;
  }, []);

  const advance = useCallback(() => post({ action: 'advance' }), [post]);
  const skip = useCallback(() => post({ action: 'skip' }), [post]);
  const restart = useCallback(() => post({ action: 'restart' }), [post]);
  const setStep = useCallback((step) => post({ action: 'setStep', step }), [post]);

  const startGuide = useCallback(() => setIsGuideOpen(true), []);
  const closeGuide = useCallback(() => setIsGuideOpen(false), []);

  const value = useMemo(() => ({
    step: state.step,
    completed: state.completed,
    skipped: state.skipped,
    startedAt: state.startedAt,
    completedAt: state.completedAt,
    isLoading,
    isGuideOpen,
    advance,
    skip,
    restart,
    setStep,
    refresh,
    startGuide,
    closeGuide,
  }), [state, isLoading, isGuideOpen, advance, skip, restart, setStep, refresh, startGuide, closeGuide]);

  return (
    <OnboardingContext.Provider value={value}>
      {children}
    </OnboardingContext.Provider>
  );
}

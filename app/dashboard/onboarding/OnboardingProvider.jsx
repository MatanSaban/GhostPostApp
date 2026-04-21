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
    finishedSeen: false,
  });
  const [completedGuides, setCompletedGuides] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [activeGuideId, setActiveGuideId] = useState(null);

  const refresh = useCallback(async () => {
    if (!accountId) return;
    try {
      const [progressRes, guidesRes] = await Promise.all([
        fetch('/api/onboarding/progress', { cache: 'no-store' }),
        fetch('/api/onboarding/guides', { cache: 'no-store' }),
      ]);
      if (progressRes.ok) {
        const data = await progressRes.json();
        setState({
          step: data.step,
          completed: !!data.completed,
          skipped: !!data.skipped,
          startedAt: data.startedAt || null,
          completedAt: data.completedAt || null,
          finishedSeen: !!data.finishedSeen,
        });
      }
      if (guidesRes.ok) {
        const data = await guidesRes.json();
        setCompletedGuides(Array.isArray(data.completedGuides) ? data.completedGuides : []);
      }
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
      finishedSeen: !!data.finishedSeen,
    });
    return data;
  }, []);

  const advance = useCallback(() => post({ action: 'advance' }), [post]);
  const skip = useCallback(() => post({ action: 'skip' }), [post]);
  const restart = useCallback(() => post({ action: 'restart' }), [post]);
  const setStep = useCallback((step) => post({ action: 'setStep', step }), [post]);
  const dismissFinished = useCallback(() => post({ action: 'dismissFinished' }), [post]);

  const startGuide = useCallback(() => setIsGuideOpen(true), []);
  const closeGuide = useCallback(() => setIsGuideOpen(false), []);

  const markGuideComplete = useCallback(async (guideId) => {
    if (!guideId) return;
    setCompletedGuides((prev) => (prev.includes(guideId) ? prev : [...prev, guideId]));
    try {
      const res = await fetch('/api/onboarding/guides', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'complete', guideId }),
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.completedGuides)) setCompletedGuides(data.completedGuides);
      }
    } catch (err) {
      console.error('markGuideComplete failed:', err);
    }
  }, []);

  const resetGuide = useCallback(async (guideId) => {
    if (!guideId) return;
    setCompletedGuides((prev) => prev.filter((id) => id !== guideId));
    try {
      await fetch('/api/onboarding/guides', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset', guideId }),
      });
    } catch (err) {
      console.error('resetGuide failed:', err);
    }
  }, []);

  const launchGuide = useCallback((guideId) => {
    setActiveGuideId(guideId);
  }, []);
  const stopActiveGuide = useCallback(() => setActiveGuideId(null), []);

  const value = useMemo(() => ({
    step: state.step,
    completed: state.completed,
    skipped: state.skipped,
    startedAt: state.startedAt,
    completedAt: state.completedAt,
    finishedSeen: state.finishedSeen,
    completedGuides,
    isLoading,
    isGuideOpen,
    activeGuideId,
    advance,
    skip,
    restart,
    setStep,
    dismissFinished,
    refresh,
    startGuide,
    closeGuide,
    markGuideComplete,
    resetGuide,
    launchGuide,
    stopActiveGuide,
  }), [
    state,
    completedGuides,
    isLoading,
    isGuideOpen,
    activeGuideId,
    advance,
    skip,
    restart,
    setStep,
    dismissFinished,
    refresh,
    startGuide,
    closeGuide,
    markGuideComplete,
    resetGuide,
    launchGuide,
    stopActiveGuide,
  ]);

  return (
    <OnboardingContext.Provider value={value}>
      {children}
    </OnboardingContext.Provider>
  );
}

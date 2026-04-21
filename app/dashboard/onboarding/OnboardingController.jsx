'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useLocale } from '@/app/context/locale-context';
import { useUser } from '@/app/context/user-context';
import { useSite } from '@/app/context/site-context';
import { ONBOARDING_STEPS, isBannerVisibleAt, isFinished, getNextStep } from '@/lib/onboarding';
import { ONBOARDING_STEP_TO_GUIDE } from '@/lib/guides';
import { useOnboarding } from './OnboardingProvider';
import { GreetingModal } from './GreetingModal';
import { FinishedModal } from './FinishedModal';
import { OnboardingTour } from './OnboardingTour';
import { BlockingBanner } from './BlockingBanner';
import {
  buildConnectAnalyticsSteps,
  CONNECT_ANALYTICS_START_PATH,
} from './tours/connectAnalytics';
import {
  buildDetectEntitiesSteps,
  DETECT_ENTITIES_START_PATH,
} from './tours/detectEntities';
import {
  buildInstallPluginSteps,
  INSTALL_PLUGIN_START_PATH,
} from './tours/installPlugin';
import {
  buildKeywordsSteps,
  KEYWORDS_START_PATH,
} from './tours/keywords';
import {
  buildCompetitorsSteps,
  COMPETITORS_START_PATH,
} from './tours/competitors';
import {
  buildSiteAuditSteps,
  SITE_AUDIT_START_PATH,
} from './tours/siteAudit';
import {
  buildAiAgentSteps,
  AI_AGENT_START_PATH,
} from './tours/aiAgent';
import {
  buildContentPlannerSteps,
  CONTENT_PLANNER_START_PATH,
} from './tours/contentPlanner';
import {
  buildContentWizardSteps,
  CONTENT_WIZARD_START_PATH,
} from './tours/contentWizard';

const TOUR_END_STATUSES = ['finished', 'skipped'];

function getTourConfig(step, t, { integrationStatus, keywordsState } = {}) {
  switch (step) {
    case ONBOARDING_STEPS.CONNECT_ANALYTICS:
      return {
        steps: buildConnectAnalyticsSteps(t, integrationStatus),
        startPath: CONNECT_ANALYTICS_START_PATH,
      };
    case ONBOARDING_STEPS.DETECT_ENTITIES:
      return { steps: buildDetectEntitiesSteps(t), startPath: DETECT_ENTITIES_START_PATH };
    case ONBOARDING_STEPS.INSTALL_PLUGIN:
      return { steps: buildInstallPluginSteps(t), startPath: INSTALL_PLUGIN_START_PATH };
    case ONBOARDING_STEPS.KEYWORDS:
      return {
        steps: buildKeywordsSteps(t, keywordsState || {}),
        startPath: KEYWORDS_START_PATH,
      };
    case ONBOARDING_STEPS.COMPETITORS:
      return { steps: buildCompetitorsSteps(t), startPath: COMPETITORS_START_PATH };
    case ONBOARDING_STEPS.SITE_AUDIT:
      return { steps: buildSiteAuditSteps(t), startPath: SITE_AUDIT_START_PATH };
    case ONBOARDING_STEPS.AI_AGENT:
      return { steps: buildAiAgentSteps(t), startPath: AI_AGENT_START_PATH };
    case ONBOARDING_STEPS.CONTENT_PLANNER:
      return { steps: buildContentPlannerSteps(t), startPath: CONTENT_PLANNER_START_PATH };
    case ONBOARDING_STEPS.CONTENT_WIZARD:
      return { steps: buildContentWizardSteps(t), startPath: CONTENT_WIZARD_START_PATH };
    default:
      return null;
  }
}

const RTL_PLACEMENT_FLIP = { left: 'right', right: 'left' };

export function OnboardingController() {
  const { t, isRtl } = useLocale();
  const { user } = useUser();
  const { selectedSite } = useSite();
  const router = useRouter();
  const pathname = usePathname();
  const {
    step,
    completed,
    skipped,
    finishedSeen,
    isLoading,
    isGuideOpen,
    advance,
    skip,
    closeGuide,
    markGuideComplete,
    dismissFinished,
  } = useOnboarding();

  const [isStarting, setIsStarting] = useState(false);
  const [tourRunning, setTourRunning] = useState(false);
  const [tourIndex, setTourIndex] = useState(0);
  const [finishedDismissed, setFinishedDismissed] = useState(false);
  const [integrationStatus, setIntegrationStatus] = useState(null);
  const [keywordsState, setKeywordsState] = useState(null);
  const hasAutoStartedForStepRef = useRef(null);

  // Fetch integration status when starting the CONNECT_ANALYTICS tour so the
  // builder can drop steps the user has already completed.
  useEffect(() => {
    if (step !== ONBOARDING_STEPS.CONNECT_ANALYTICS) return;
    if (!selectedSite?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/settings/integrations/google?siteId=${selectedSite.id}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setIntegrationStatus(data);
      } catch {
        /* ignore - falls back to showing all steps */
      }
    })();
    return () => { cancelled = true; };
  }, [step, selectedSite?.id, pathname]);

  // Fetch a lightweight presence check for keywords so the tour can branch
  // between "empty workspace → start AI Interview" and "has keywords → add more".
  useEffect(() => {
    if (step !== ONBOARDING_STEPS.KEYWORDS) return;
    if (!selectedSite?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/keywords?siteId=${selectedSite.id}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) {
          setKeywordsState({ hasKeywords: Array.isArray(data.keywords) && data.keywords.length > 0 });
        }
      } catch {
        /* ignore - falls back to the empty-state shape */
      }
    })();
    return () => { cancelled = true; };
  }, [step, selectedSite?.id, pathname]);

  const tourConfig = useMemo(() => {
    const config = getTourConfig(step, t, { integrationStatus, keywordsState });
    if (!config || !isRtl) return config;
    // In RTL the sidebar sits on the right edge of the viewport, so a
    // placement of `right` pushes the tooltip off-screen. Swap left↔right so
    // the tooltip opens into the page content instead.
    return {
      ...config,
      steps: config.steps.map((s) => ({
        ...s,
        placement: RTL_PLACEMENT_FLIP[s.placement] || s.placement,
      })),
    };
  }, [step, t, integrationStatus, keywordsState, isRtl]);

  // Reset the "dismissed" latch whenever a fresh run arrives at FINISHED.
  useEffect(() => {
    if (!isFinished(step)) setFinishedDismissed(false);
  }, [step]);

  // Auto-start tour when user lands on the right page for the active step.
  useEffect(() => {
    if (!tourConfig) return;
    if (isLoading) return;
    if (skipped) return;
    if (hasAutoStartedForStepRef.current === step) return;

    const targetPath = tourConfig.startPath.split('?')[0];
    if (pathname !== targetPath) return;

    // For CONNECT_ANALYTICS, wait for integration status so the step list
    // reflects what the user actually still has to do.
    if (step === ONBOARDING_STEPS.CONNECT_ANALYTICS && integrationStatus === null) return;
    // For KEYWORDS, wait for keyword presence so we know whether to show the
    // empty-state AI Interview step.
    if (step === ONBOARDING_STEPS.KEYWORDS && keywordsState === null) return;

    const timer = setTimeout(() => {
      setTourIndex(0);
      setTourRunning(true);
      hasAutoStartedForStepRef.current = step;
    }, 350);
    return () => clearTimeout(timer);
  }, [step, tourConfig, pathname, isLoading, skipped, integrationStatus, keywordsState]);

  useEffect(() => {
    if (hasAutoStartedForStepRef.current && hasAutoStartedForStepRef.current !== step) {
      hasAutoStartedForStepRef.current = null;
    }
  }, [step]);

  // If the current step targets an element that lives inside a collapsed
  // sidebar nav group (strategy, tools, entities…), expand that group so the
  // spotlight actually lands on a visible element. Nudges Joyride to
  // reposition once the group finishes animating open.
  useEffect(() => {
    if (!tourRunning || !tourConfig) return;
    const selector = tourConfig.steps[tourIndex]?.target;
    if (typeof selector !== 'string') return;

    const tryExpand = () => {
      const target = document.querySelector(selector);
      if (!target) return false;
      const group = target.closest('[data-nav-group]');
      if (!group) return true;
      if (group.getAttribute('data-nav-group-open') === 'true') return true;
      const chevron = group.querySelector('[data-nav-group-chevron]');
      if (chevron instanceof HTMLElement) {
        chevron.click();
        // After the group's open animation, ping Joyride to recompute the
        // tooltip placement against the now-visible target.
        setTimeout(() => {
          window.dispatchEvent(new Event('resize'));
        }, 250);
      }
      return true;
    };

    if (tryExpand()) return;
    // Target not mounted yet - retry briefly while the page settles.
    const retry = setInterval(() => {
      if (tryExpand()) clearInterval(retry);
    }, 120);
    const stop = setTimeout(() => clearInterval(retry), 2000);
    return () => {
      clearInterval(retry);
      clearTimeout(stop);
    };
  }, [tourRunning, tourConfig, tourIndex]);

  // Action-locked steps declare a `waitForEvent` - the user's click on the
  // spotlighted control triggers business logic that dispatches this event
  // on window, and we auto-advance when it fires. If the waiting step is the
  // last in the tour, the event finishes the tour and advances the stage.
  useEffect(() => {
    if (!tourRunning || !tourConfig) return;
    const currentStep = tourConfig.steps[tourIndex];
    const eventName = currentStep?.waitForEvent;
    if (!eventName) return;
    const isLast = tourIndex >= tourConfig.steps.length - 1;

    const handler = async () => {
      if (!isLast) {
        setTourIndex((prev) => (prev === tourIndex ? prev + 1 : prev));
        return;
      }
      setTourRunning(false);
      const finishedGuideId = ONBOARDING_STEP_TO_GUIDE[step];
      if (finishedGuideId) markGuideComplete(finishedGuideId);
      const nextStep = getNextStep(step);
      await advance();
      const nextConfig = getTourConfig(nextStep, t);
      if (nextConfig?.startPath) {
        const nextBase = nextConfig.startPath.split('?')[0];
        if (pathname !== nextBase) router.push(nextConfig.startPath);
      }
    };

    window.addEventListener(eventName, handler);
    return () => window.removeEventListener(eventName, handler);
  }, [tourRunning, tourConfig, tourIndex, step, advance, pathname, router, t]);

  if (!user?.accountId) return null;
  if (isLoading) return null;

  const showFinished = isFinished(step) && !finishedDismissed && !finishedSeen && !skipped;
  const showGreeting = step === ONBOARDING_STEPS.GREETING;

  // Tour/banner path: only while an active guided step is in progress.
  const inActiveGuide = !isFinished(step) && !completed && (!skipped || isGuideOpen);

  if (!showFinished && !showGreeting && !inActiveGuide) return null;

  const handleStart = async () => {
    setIsStarting(true);
    try {
      await advance(); // GREETING → CONNECT_ANALYTICS
      const next = getTourConfig(ONBOARDING_STEPS.CONNECT_ANALYTICS, t);
      if (next?.startPath && pathname !== next.startPath.split('?')[0]) {
        router.push(next.startPath);
      }
    } finally {
      setIsStarting(false);
    }
  };

  const handleSkipAll = async () => {
    setTourRunning(false);
    await skip();
    closeGuide();
  };

  const handleResume = () => {
    if (!tourConfig) return;
    const targetPath = tourConfig.startPath.split('?')[0];
    if (pathname !== targetPath) {
      router.push(tourConfig.startPath);
    }
    setTourIndex(0);
    setTourRunning(true);
    hasAutoStartedForStepRef.current = step;
  };

  const handleTourCallback = async (data) => {
    const { status, action, index, type } = data || {};

    if (type === 'step:after' && action === 'next') {
      setTourIndex(index + 1);
      return;
    }
    if (type === 'step:after' && action === 'prev') {
      setTourIndex(Math.max(0, index - 1));
      return;
    }

    // If Joyride can't find a step target, don't trap the user under the overlay -
    // skip past the missing step.
    if (type === 'error:target_not_found') {
      if (tourConfig && index < tourConfig.steps.length - 1) {
        setTourIndex(index + 1);
      } else {
        setTourRunning(false);
        await advance();
      }
      return;
    }

    if (type === 'tour:end' && TOUR_END_STATUSES.includes(status)) {
      setTourRunning(false);
      if (status === 'finished') {
        const finishedGuideId = ONBOARDING_STEP_TO_GUIDE[step];
        if (finishedGuideId) markGuideComplete(finishedGuideId);
        const nextStep = getNextStep(step);
        await advance();
        const nextConfig = getTourConfig(nextStep, t);
        if (nextConfig?.startPath) {
          const nextBase = nextConfig.startPath.split('?')[0];
          if (pathname !== nextBase) {
            router.push(nextConfig.startPath);
          }
        }
      } else if (status === 'skipped') {
        await skip();
        closeGuide();
      }
    }
  };

  const handleFinishedClose = () => {
    setFinishedDismissed(true);
    dismissFinished();
    closeGuide();
  };

  const showBanner = inActiveGuide && isBannerVisibleAt(step) && !tourRunning;

  return (
    <>
      {showGreeting && (
        <GreetingModal
          onStart={handleStart}
          onSkip={handleSkipAll}
          isStarting={isStarting}
        />
      )}

      {inActiveGuide && tourConfig && (
        <OnboardingTour
          run={tourRunning}
          steps={tourConfig.steps}
          stepIndex={tourIndex}
          onCallback={handleTourCallback}
          isFinalStage={step === ONBOARDING_STEPS.CONTENT_WIZARD}
        />
      )}

      {showBanner && (
        <BlockingBanner
          step={step}
          onResume={handleResume}
          onSkip={handleSkipAll}
        />
      )}

      {showFinished && <FinishedModal onClose={handleFinishedClose} />}
    </>
  );
}

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useLocale } from '@/app/context/locale-context';
import { useUser } from '@/app/context/user-context';
import { ONBOARDING_STEPS, isBannerVisibleAt, isFinished, getNextStep } from '@/lib/onboarding';
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

function getTourConfig(step, t) {
  switch (step) {
    case ONBOARDING_STEPS.CONNECT_ANALYTICS:
      return { steps: buildConnectAnalyticsSteps(t), startPath: CONNECT_ANALYTICS_START_PATH };
    case ONBOARDING_STEPS.DETECT_ENTITIES:
      return { steps: buildDetectEntitiesSteps(t), startPath: DETECT_ENTITIES_START_PATH };
    case ONBOARDING_STEPS.INSTALL_PLUGIN:
      return { steps: buildInstallPluginSteps(t), startPath: INSTALL_PLUGIN_START_PATH };
    case ONBOARDING_STEPS.KEYWORDS:
      return { steps: buildKeywordsSteps(t), startPath: KEYWORDS_START_PATH };
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

export function OnboardingController() {
  const { t } = useLocale();
  const { user } = useUser();
  const router = useRouter();
  const pathname = usePathname();
  const {
    step,
    completed,
    skipped,
    isLoading,
    isGuideOpen,
    advance,
    skip,
    closeGuide,
  } = useOnboarding();

  const [isStarting, setIsStarting] = useState(false);
  const [tourRunning, setTourRunning] = useState(false);
  const [tourIndex, setTourIndex] = useState(0);
  const [finishedDismissed, setFinishedDismissed] = useState(false);
  const hasAutoStartedForStepRef = useRef(null);

  const tourConfig = useMemo(() => getTourConfig(step, t), [step, t]);

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

    const timer = setTimeout(() => {
      setTourIndex(0);
      setTourRunning(true);
      hasAutoStartedForStepRef.current = step;
    }, 350);
    return () => clearTimeout(timer);
  }, [step, tourConfig, pathname, isLoading, skipped]);

  useEffect(() => {
    if (hasAutoStartedForStepRef.current && hasAutoStartedForStepRef.current !== step) {
      hasAutoStartedForStepRef.current = null;
    }
  }, [step]);

  if (!user?.accountId) return null;
  if (isLoading) return null;

  const showFinished = isFinished(step) && !finishedDismissed && !skipped;
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

    // If Joyride can't find a step target, don't trap the user under the overlay —
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

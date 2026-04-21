'use client';

import { useCallback, useMemo } from 'react';
import { useOnboarding } from './OnboardingProvider';
import { getGuide } from '@/lib/guides';

/**
 * Thin wrapper around the OnboardingProvider's guide API for page-level
 * callers. A page that hosts a feature guide does:
 *
 *   const { launch, isComplete, markComplete } = useFeatureGuide(GUIDES.KEYWORDS);
 *   <button onClick={launch}>Replay Keywords tour</button>
 *
 * The actual tour rendering is owned by <FeatureGuideRunner> (mounted once
 * near the top of the dashboard tree, same level as <OnboardingController>).
 * When a guide is launched, the runner picks it up via `activeGuideId` from
 * the provider.
 *
 * If called without a guideId, returns raw provider controls so the caller
 * can query/launch any guide by id.
 */
export function useFeatureGuide(guideId) {
  const {
    completedGuides,
    activeGuideId,
    launchGuide,
    stopActiveGuide,
    markGuideComplete,
    resetGuide,
  } = useOnboarding();

  const guide = useMemo(() => (guideId ? getGuide(guideId) : null), [guideId]);

  const launch = useCallback(() => {
    if (guideId) launchGuide(guideId);
  }, [guideId, launchGuide]);

  const markComplete = useCallback(() => {
    if (guideId) return markGuideComplete(guideId);
    return Promise.resolve();
  }, [guideId, markGuideComplete]);

  const reset = useCallback(() => {
    if (guideId) return resetGuide(guideId);
    return Promise.resolve();
  }, [guideId, resetGuide]);

  const isComplete = guideId ? completedGuides.includes(guideId) : false;
  const isActive = guideId ? activeGuideId === guideId : false;

  return {
    guide,
    isComplete,
    isActive,
    completedGuides,
    activeGuideId,
    launch,
    launchById: launchGuide,
    stop: stopActiveGuide,
    markComplete,
    markCompleteById: markGuideComplete,
    reset,
    resetById: resetGuide,
  };
}

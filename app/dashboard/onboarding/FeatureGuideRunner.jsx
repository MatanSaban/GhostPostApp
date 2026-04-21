'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useLocale } from '@/app/context/locale-context';
import { useSite } from '@/app/context/site-context';
import { ONBOARDING_STEPS } from '@/lib/onboarding';
import { useOnboarding } from './OnboardingProvider';
import { OnboardingTour } from './OnboardingTour';
import { getGuideTour } from './guideTours';

const TOUR_END_STATUSES = ['finished', 'skipped'];
const RTL_PLACEMENT_FLIP = { left: 'right', right: 'left' };

/**
 * Runs a feature guide tour on demand. Listens to `activeGuideId` from the
 * OnboardingProvider; when set, resolves the tour from `guideTours`, fetches
 * any extra state, navigates to the tour's startPath if needed, and drives
 * Joyride until the user finishes or skips.
 *
 * Separate from <OnboardingController> because the two have different
 * lifecycle responsibilities:
 *  - Controller auto-starts based on the first-run `step` machine and calls
 *    `advance()` at the end of each stage.
 *  - Runner starts explicitly from `activeGuideId`, calls
 *    `markGuideComplete(id)` on finish, and never advances the first-run
 *    step. The two never run simultaneously because the runner refuses to
 *    start if there's an ongoing first-run tour (see guard below).
 */
export function FeatureGuideRunner() {
  const { t, isRtl } = useLocale();
  const { selectedSite } = useSite();
  const router = useRouter();
  const pathname = usePathname();
  const {
    activeGuideId,
    stopActiveGuide,
    markGuideComplete,
    step: firstRunStep,
    completed: firstRunCompleted,
    skipped: firstRunSkipped,
  } = useOnboarding();

  const [tourRunning, setTourRunning] = useState(false);
  const [tourIndex, setTourIndex] = useState(0);
  const [extraState, setExtraState] = useState(null);
  const [extraResolved, setExtraResolved] = useState(false);
  const hasNavigatedRef = useRef(false);

  const tourSpec = useMemo(
    () => (activeGuideId ? getGuideTour(activeGuideId) : null),
    [activeGuideId],
  );

  // Reset local state whenever the active guide changes.
  useEffect(() => {
    setTourRunning(false);
    setTourIndex(0);
    setExtraState(null);
    setExtraResolved(false);
    hasNavigatedRef.current = false;
  }, [activeGuideId]);

  // Fetch any extra state the builder needs (e.g., integration status,
  // keyword presence). Skipped when the spec has no fetchExtra.
  useEffect(() => {
    if (!tourSpec) return;
    if (!tourSpec.fetchExtra) {
      setExtraResolved(true);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const result = await tourSpec.fetchExtra({ siteId: selectedSite?.id });
        if (!cancelled) {
          setExtraState(result || {});
          setExtraResolved(true);
        }
      } catch {
        if (!cancelled) {
          setExtraState({});
          setExtraResolved(true);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [tourSpec, selectedSite?.id]);

  // Navigate to the tour's startPath if the user launched it from elsewhere.
  useEffect(() => {
    if (!tourSpec) return;
    if (hasNavigatedRef.current) return;
    const targetPath = tourSpec.startPath.split('?')[0];
    if (pathname === targetPath) {
      hasNavigatedRef.current = true;
      return;
    }
    router.push(tourSpec.startPath);
    hasNavigatedRef.current = true;
  }, [tourSpec, pathname, router]);

  const steps = useMemo(() => {
    if (!tourSpec) return null;
    if (tourSpec.waitForExtra && !extraResolved) return null;
    const raw = tourSpec.builder(t, extraState);
    if (!isRtl) return raw;
    return raw.map((s) => ({
      ...s,
      placement: RTL_PLACEMENT_FLIP[s.placement] || s.placement,
    }));
  }, [tourSpec, extraState, extraResolved, t, isRtl]);

  // Auto-start the tour once the target path is mounted and extra state is
  // ready. Small delay lets the page finish mounting its anchors.
  useEffect(() => {
    if (!steps || steps.length === 0) return;
    if (tourRunning) return;
    if (!tourSpec) return;
    const targetPath = tourSpec.startPath.split('?')[0];
    if (pathname !== targetPath) return;

    const timer = setTimeout(() => {
      setTourIndex(0);
      setTourRunning(true);
    }, 350);
    return () => clearTimeout(timer);
  }, [steps, pathname, tourSpec, tourRunning]);

  // Expand collapsed sidebar nav groups so tooltip targets are visible.
  useEffect(() => {
    if (!tourRunning || !steps) return;
    const selector = steps[tourIndex]?.target;
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
        setTimeout(() => window.dispatchEvent(new Event('resize')), 250);
      }
      return true;
    };

    if (tryExpand()) return;
    const retry = setInterval(() => {
      if (tryExpand()) clearInterval(retry);
    }, 120);
    const stop = setTimeout(() => clearInterval(retry), 2000);
    return () => {
      clearInterval(retry);
      clearTimeout(stop);
    };
  }, [tourRunning, steps, tourIndex]);

  // Action-locked steps (waitForEvent) - auto-advance when the spotlighted
  // UI dispatches the expected window event.
  useEffect(() => {
    if (!tourRunning || !steps) return;
    const current = steps[tourIndex];
    const eventName = current?.waitForEvent;
    if (!eventName) return;
    const isLast = tourIndex >= steps.length - 1;

    const handler = () => {
      if (isLast) {
        setTourRunning(false);
        if (activeGuideId) markGuideComplete(activeGuideId);
        stopActiveGuide();
        return;
      }
      setTourIndex((prev) => (prev === tourIndex ? prev + 1 : prev));
    };

    window.addEventListener(eventName, handler);
    return () => window.removeEventListener(eventName, handler);
  }, [tourRunning, steps, tourIndex, activeGuideId, markGuideComplete, stopActiveGuide]);

  // Don't run a feature guide while the first-run flow is mid-stage - would
  // double-spotlight the page. First-run is "active" while the user is still
  // between GREETING and FINISHED, hasn't completed it, and hasn't skipped.
  const firstRunActive =
    !firstRunCompleted &&
    !firstRunSkipped &&
    firstRunStep !== ONBOARDING_STEPS.GREETING &&
    firstRunStep !== ONBOARDING_STEPS.FINISHED;
  if (firstRunActive) return null;

  if (!activeGuideId || !steps || steps.length === 0) return null;

  const handleCallback = (data) => {
    const { status, action, index, type } = data || {};

    if (type === 'step:after' && action === 'next') {
      setTourIndex(index + 1);
      return;
    }
    if (type === 'step:after' && action === 'prev') {
      setTourIndex(Math.max(0, index - 1));
      return;
    }
    if (type === 'error:target_not_found') {
      if (index < steps.length - 1) {
        setTourIndex(index + 1);
      } else {
        setTourRunning(false);
        stopActiveGuide();
      }
      return;
    }
    if (type === 'tour:end' && TOUR_END_STATUSES.includes(status)) {
      setTourRunning(false);
      if (status === 'finished' && activeGuideId) {
        markGuideComplete(activeGuideId);
      }
      stopActiveGuide();
    }
  };

  return (
    <OnboardingTour
      run={tourRunning}
      steps={steps}
      stepIndex={tourIndex}
      onCallback={handleCallback}
      isFinalStage={false}
    />
  );
}

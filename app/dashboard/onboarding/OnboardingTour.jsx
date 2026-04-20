'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { useLocale } from '@/app/context/locale-context';
import { OnboardingTooltip } from './OnboardingTooltip';

const Joyride = dynamic(
  () => import('react-joyride').then((mod) => mod.Joyride),
  { ssr: false },
);

export function OnboardingTour({ run, steps, stepIndex = 0, onCallback, isFinalStage = false }) {
  const { t, isRtl } = useLocale();
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    const sync = () => setIsDark(root.classList.contains('dark'));
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  const primary = '#7c3aed';
  const background = isDark ? '#14141f' : '#ffffff';
  const textColor = isDark ? '#f5f5f7' : '#0f0f17';

  return (
    <Joyride
      run={run}
      steps={steps}
      stepIndex={stepIndex}
      continuous
      onEvent={onCallback}
      tooltipComponent={OnboardingTooltip}
      locale={{
        back: t('onboarding.common.back'),
        close: t('onboarding.common.close'),
        last: isFinalStage
          ? t('onboarding.common.finish')
          : t('onboarding.common.nextStage'),
        next: t('onboarding.common.next'),
        skip: t('onboarding.common.skipTour'),
      }}
      options={{
        buttons: ['back', 'skip', 'primary'],
        overlayClickAction: false,
        skipBeacon: true,
        blockTargetInteraction: false,
        primaryColor: primary,
        backgroundColor: background,
        textColor,
        overlayColor: 'rgba(0, 0, 0, 0.55)',
        arrowColor: background,
        spotlightRadius: 12,
      }}
      styles={{
        overlay: { zIndex: 110 },
        tooltip: { zIndex: 111 },
      }}
    />
  );
}

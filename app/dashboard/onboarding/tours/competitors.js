export function buildCompetitorsSteps(t) {
  return [
    {
      target: '[data-onboarding="nav-competitors"]',
      title: t('onboarding.competitors.step1.title'),
      content: t('onboarding.competitors.step1.content'),
      placement: 'right',
      disableBeacon: true,
    },
    {
      target: '[data-onboarding="page-competitors"]',
      title: t('onboarding.competitors.step2.title'),
      content: t('onboarding.competitors.step2.content'),
      placement: 'bottom',
      disableBeacon: true,
    },
    {
      target: '[data-onboarding="competitors-ai-discover"]',
      title: t('onboarding.competitors.stepAiDiscover.title'),
      content: t('onboarding.competitors.stepAiDiscover.content'),
      placement: 'bottom',
      disableBeacon: true,
      hideFooter: true,
      waitForEvent: 'ghostpost:onboarding:competitors-discovered',
      actionHint: t('onboarding.competitors.stepAiDiscover.actionHint'),
    },
    {
      target: '[data-onboarding="competitors-add-cta"]',
      title: t('onboarding.competitors.stepAdd.title'),
      content: t('onboarding.competitors.stepAdd.content'),
      placement: 'bottom',
      disableBeacon: true,
    },
  ];
}

export const COMPETITORS_START_PATH = '/dashboard/strategy/competitors';

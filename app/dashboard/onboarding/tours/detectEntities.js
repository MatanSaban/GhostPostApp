export function buildDetectEntitiesSteps(t) {
  return [
    {
      target: '[data-onboarding="nav-entities"]',
      title: t('onboarding.detectEntities.step1.title'),
      content: t('onboarding.detectEntities.step1.content'),
      placement: 'right',
      disableBeacon: true,
    },
    {
      target: '[data-onboarding="page-entities"]',
      title: t('onboarding.detectEntities.step2.title'),
      content: t('onboarding.detectEntities.step2.content'),
      placement: 'bottom',
      disableBeacon: true,
    },
    {
      target: '[data-onboarding="entities-detect-section"]',
      title: t('onboarding.detectEntities.step3.title'),
      content: t('onboarding.detectEntities.step3.content'),
      placement: 'bottom',
      disableBeacon: true,
    },
    {
      target: '[data-onboarding="entities-discovery-card"]',
      title: t('onboarding.detectEntities.step4.title'),
      content: t('onboarding.detectEntities.step4.content'),
      placement: 'top',
      disableBeacon: true,
    },
    {
      target: '[data-onboarding="entities-save-populate"]',
      title: t('onboarding.detectEntities.step5.title'),
      content: t('onboarding.detectEntities.step5.content'),
      placement: 'top',
      disableBeacon: true,
    },
  ];
}

export const DETECT_ENTITIES_START_PATH = '/dashboard/entities';

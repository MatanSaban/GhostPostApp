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
      target: '[data-onboarding="entities-detect-button"]',
      title: t('onboarding.detectEntities.step3.title'),
      content: t('onboarding.detectEntities.step3.content'),
      placement: 'bottom',
      disableBeacon: true,
      hideFooter: true,
      waitForEvent: 'ghostpost:onboarding:platform-detected',
      actionHint: t('onboarding.detectEntities.step3.actionHint'),
    },
    {
      target: '[data-onboarding="entities-scan-button"]',
      title: t('onboarding.detectEntities.stepScan.title'),
      content: t('onboarding.detectEntities.stepScan.content'),
      placement: 'top',
      disableBeacon: true,
      hideFooter: true,
      waitForEvent: 'ghostpost:onboarding:entities-discovered',
      actionHint: t('onboarding.detectEntities.stepScan.actionHint'),
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
      hideFooter: true,
      waitForEvent: 'ghostpost:onboarding:entities-populate-started',
      actionHint: t('onboarding.detectEntities.step5.actionHint'),
    },
  ];
}

export const DETECT_ENTITIES_START_PATH = '/dashboard/entities';

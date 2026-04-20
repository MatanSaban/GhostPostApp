export function buildContentWizardSteps(t) {
  return [
    {
      target: '[data-onboarding="nav-ai-content-wizard"]',
      title: t('onboarding.contentWizard.step1.title'),
      content: t('onboarding.contentWizard.step1.content'),
      placement: 'right',
      disableBeacon: true,
    },
    {
      target: '[data-onboarding="page-ai-wizard"]',
      title: t('onboarding.contentWizard.step2.title'),
      content: t('onboarding.contentWizard.step2.content'),
      placement: 'bottom',
      disableBeacon: true,
    },
  ];
}

export const CONTENT_WIZARD_START_PATH = '/dashboard/strategy/ai-content-wizard';

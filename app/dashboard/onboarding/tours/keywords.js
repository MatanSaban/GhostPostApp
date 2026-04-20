export function buildKeywordsSteps(t) {
  return [
    {
      target: '[data-onboarding="nav-keywords"]',
      title: t('onboarding.keywords.step1.title'),
      content: t('onboarding.keywords.step1.content'),
      placement: 'right',
      disableBeacon: true,
    },
    {
      target: '[data-onboarding="page-keywords"]',
      title: t('onboarding.keywords.step2.title'),
      content: t('onboarding.keywords.step2.content'),
      placement: 'bottom',
      disableBeacon: true,
    },
    {
      target: '[data-onboarding="keywords-add-cta"]',
      title: t('onboarding.keywords.step3.title'),
      content: t('onboarding.keywords.step3.content'),
      placement: 'bottom',
      disableBeacon: true,
    },
  ];
}

export const KEYWORDS_START_PATH = '/dashboard/strategy/keywords';

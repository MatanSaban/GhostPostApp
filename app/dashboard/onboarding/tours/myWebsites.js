export function buildMyWebsitesSteps(t) {
  return [
    {
      target: '[data-onboarding="nav-my-websites"]',
      title: t('onboarding.myWebsites.step1.title'),
      content: t('onboarding.myWebsites.step1.content'),
      placement: 'right',
      disableBeacon: true,
    },
    {
      target: '[data-onboarding="page-my-websites"]',
      title: t('onboarding.myWebsites.step2.title'),
      content: t('onboarding.myWebsites.step2.content'),
      placement: 'bottom',
      disableBeacon: true,
    },
    {
      target: '[data-onboarding="my-websites-add-cta"]',
      title: t('onboarding.myWebsites.step3.title'),
      content: t('onboarding.myWebsites.step3.content'),
      placement: 'bottom',
      disableBeacon: true,
    },
    {
      target: '[data-onboarding="my-websites-search"]',
      title: t('onboarding.myWebsites.step4.title'),
      content: t('onboarding.myWebsites.step4.content'),
      placement: 'bottom',
      disableBeacon: true,
    },
    {
      target: '[data-onboarding="my-websites-view-toggle"]',
      title: t('onboarding.myWebsites.step5.title'),
      content: t('onboarding.myWebsites.step5.content'),
      placement: 'bottom',
      disableBeacon: true,
    },
    {
      target: '[data-onboarding="my-websites-list"]',
      title: t('onboarding.myWebsites.step6.title'),
      content: t('onboarding.myWebsites.step6.content'),
      placement: 'top',
      disableBeacon: true,
    },
  ];
}

export const MY_WEBSITES_START_PATH = '/dashboard/my-websites';

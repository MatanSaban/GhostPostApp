export function buildContentPlannerSteps(t) {
  return [
    {
      target: '[data-onboarding="nav-content-planner"]',
      title: t('onboarding.contentPlanner.step1.title'),
      content: t('onboarding.contentPlanner.step1.content'),
      placement: 'right',
      disableBeacon: true,
    },
    {
      target: '[data-onboarding="page-content-planner"]',
      title: t('onboarding.contentPlanner.step2.title'),
      content: t('onboarding.contentPlanner.step2.content'),
      placement: 'bottom',
      disableBeacon: true,
    },
    {
      target: '[data-onboarding="content-planner-wizard-cta"]',
      title: t('onboarding.contentPlanner.step3.title'),
      content: t('onboarding.contentPlanner.step3.content'),
      placement: 'bottom',
      disableBeacon: true,
    },
  ];
}

export const CONTENT_PLANNER_START_PATH = '/dashboard/strategy/content-planner';

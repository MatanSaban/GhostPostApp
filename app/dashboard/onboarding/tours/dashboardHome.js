export function buildDashboardHomeSteps(t) {
  return [
    {
      target: '[data-onboarding="nav-dashboard"]',
      title: t('onboarding.dashboardHome.step1.title'),
      content: t('onboarding.dashboardHome.step1.content'),
      placement: 'right',
      disableBeacon: true,
    },
    {
      target: '[data-onboarding="dashboard-welcome"]',
      title: t('onboarding.dashboardHome.step2.title'),
      content: t('onboarding.dashboardHome.step2.content'),
      placement: 'bottom',
      disableBeacon: true,
    },
    {
      target: '[data-onboarding="dashboard-kpis"]',
      title: t('onboarding.dashboardHome.step3.title'),
      content: t('onboarding.dashboardHome.step3.content'),
      placement: 'bottom',
      disableBeacon: true,
    },
    {
      target: '[data-onboarding="dashboard-chart"]',
      title: t('onboarding.dashboardHome.step4.title'),
      content: t('onboarding.dashboardHome.step4.content'),
      placement: 'top',
      disableBeacon: true,
    },
    {
      target: '[data-onboarding="dashboard-top-keywords"]',
      title: t('onboarding.dashboardHome.step5.title'),
      content: t('onboarding.dashboardHome.step5.content'),
      placement: 'top',
      disableBeacon: true,
    },
    {
      target: '[data-onboarding="dashboard-ai-traffic"]',
      title: t('onboarding.dashboardHome.step6.title'),
      content: t('onboarding.dashboardHome.step6.content'),
      placement: 'top',
      disableBeacon: true,
    },
  ];
}

export const DASHBOARD_HOME_START_PATH = '/dashboard';

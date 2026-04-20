/**
 * Connect Analytics tour: Settings → Integrations → Connect Google.
 *
 * Joyride `target` selectors point at `data-onboarding` attributes on the
 * anchor elements so the tour survives unrelated markup/CSS changes.
 */

export function buildConnectAnalyticsSteps(t) {
  return [
    {
      target: '[data-onboarding="nav-settings"]',
      title: t('onboarding.connectAnalytics.step1.title'),
      content: t('onboarding.connectAnalytics.step1.content'),
      placement: 'right',
      disableBeacon: true,
    },
    {
      target: '[data-onboarding="settings-tab-integrations"]',
      title: t('onboarding.connectAnalytics.step2.title'),
      content: t('onboarding.connectAnalytics.step2.content'),
      placement: 'bottom',
      disableBeacon: true,
    },
    {
      target: '[data-onboarding="connect-google-section"]',
      title: t('onboarding.connectAnalytics.step3.title'),
      content: t('onboarding.connectAnalytics.step3.content'),
      placement: 'bottom',
      disableBeacon: true,
    },
  ];
}

/**
 * URL the controller should navigate to before starting this tour.
 */
export const CONNECT_ANALYTICS_START_PATH = '/dashboard/settings?tab=integrations';

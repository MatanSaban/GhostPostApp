/**
 * Connect Analytics tour: Settings → Integrations → Connect Google → GA4 → GSC.
 *
 * Steps adapt to the user's current integration state so they are never asked
 * to connect something that is already live. Joyride `target` selectors point
 * at `data-onboarding` attributes so the tour survives unrelated markup/CSS
 * changes.
 *
 * @param {Function} t - translation function
 * @param {object} [status] - integration status from /api/settings/integrations/google
 *   { connected, integration: { gaConnected, gscConnected }, needsGAScope, needsGSCScope }
 */
export function buildConnectAnalyticsSteps(t, status = null) {
  const connected = Boolean(status?.connected);
  const gaReady = Boolean(status?.integration?.gaConnected) && !status?.needsGAScope;
  const gscReady = Boolean(status?.integration?.gscConnected) && !status?.needsGSCScope;

  const steps = [
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
  ];

  if (!connected) {
    steps.push({
      target: '[data-onboarding="connect-google-section"]',
      title: t('onboarding.connectAnalytics.step3.title'),
      content: t('onboarding.connectAnalytics.step3.content'),
      placement: 'bottom',
      disableBeacon: true,
    });
  }

  if (!gaReady) {
    steps.push({
      target: '[data-onboarding="ga-section"]',
      title: t('onboarding.connectAnalytics.stepGa.title'),
      content: t('onboarding.connectAnalytics.stepGa.content'),
      placement: 'top',
      disableBeacon: true,
    });
  }

  if (!gscReady) {
    steps.push({
      target: '[data-onboarding="gsc-section"]',
      title: t('onboarding.connectAnalytics.stepGsc.title'),
      content: t('onboarding.connectAnalytics.stepGsc.content'),
      placement: 'top',
      disableBeacon: true,
    });
  }

  return steps;
}

/**
 * URL the controller should navigate to before starting this tour.
 */
export const CONNECT_ANALYTICS_START_PATH = '/dashboard/settings?tab=integrations';

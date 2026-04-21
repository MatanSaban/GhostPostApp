export function buildSettingsSteps(t) {
  return [
    {
      target: '[data-onboarding="nav-settings"]',
      title: t('onboarding.settings.step1.title'),
      content: t('onboarding.settings.step1.content'),
      placement: 'right',
      disableBeacon: true,
    },
    {
      target: '[data-onboarding="settings-main-tabs"]',
      title: t('onboarding.settings.step2.title'),
      content: t('onboarding.settings.step2.content'),
      placement: 'bottom',
      disableBeacon: true,
    },
    {
      target: '[data-onboarding="settings-tabs"]',
      title: t('onboarding.settings.step3.title'),
      content: t('onboarding.settings.step3.content'),
      placement: 'bottom',
      disableBeacon: true,
    },
    {
      target: '[data-onboarding="settings-tab-integrations"]',
      title: t('onboarding.settings.step4.title'),
      content: t('onboarding.settings.step4.content'),
      placement: 'bottom',
      disableBeacon: true,
    },
    {
      target: '[data-onboarding="settings-content-panel"]',
      title: t('onboarding.settings.step5.title'),
      content: t('onboarding.settings.step5.content'),
      placement: 'top',
      disableBeacon: true,
    },
  ];
}

export const SETTINGS_START_PATH = '/dashboard/settings';

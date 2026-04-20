export function buildInstallPluginSteps(t) {
  return [
    {
      target: '[data-onboarding="page-entities"]',
      title: t('onboarding.installPlugin.step1.title'),
      content: t('onboarding.installPlugin.step1.content'),
      placement: 'bottom',
      disableBeacon: true,
    },
    {
      target: '[data-onboarding="plugin-download-button"]',
      title: t('onboarding.installPlugin.step2.title'),
      content: t('onboarding.installPlugin.step2.content'),
      placement: 'bottom',
      disableBeacon: true,
    },
  ];
}

export const INSTALL_PLUGIN_START_PATH = '/dashboard/entities';

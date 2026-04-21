export function buildNotificationsSteps(t) {
  return [
    {
      target: '[data-onboarding="nav-notifications"]',
      title: t('onboarding.notifications.step1.title'),
      content: t('onboarding.notifications.step1.content'),
      placement: 'right',
      disableBeacon: true,
    },
    {
      target: '[data-onboarding="page-notifications"]',
      title: t('onboarding.notifications.step2.title'),
      content: t('onboarding.notifications.step2.content'),
      placement: 'bottom',
      disableBeacon: true,
    },
    {
      target: '[data-onboarding="notifications-filters"]',
      title: t('onboarding.notifications.step3.title'),
      content: t('onboarding.notifications.step3.content'),
      placement: 'bottom',
      disableBeacon: true,
    },
    {
      target: '[data-onboarding="notifications-list"]',
      title: t('onboarding.notifications.step4.title'),
      content: t('onboarding.notifications.step4.content'),
      placement: 'top',
      disableBeacon: true,
    },
  ];
}

export const NOTIFICATIONS_START_PATH = '/dashboard/notifications';

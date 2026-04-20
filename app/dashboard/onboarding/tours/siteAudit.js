export function buildSiteAuditSteps(t) {
  return [
    {
      target: '[data-onboarding="nav-site-audit"]',
      title: t('onboarding.siteAudit.step1.title'),
      content: t('onboarding.siteAudit.step1.content'),
      placement: 'right',
      disableBeacon: true,
    },
    {
      target: '[data-onboarding="page-site-audit"]',
      title: t('onboarding.siteAudit.step2.title'),
      content: t('onboarding.siteAudit.step2.content'),
      placement: 'bottom',
      disableBeacon: true,
    },
    {
      target: '[data-onboarding="site-audit-run-cta"]',
      title: t('onboarding.siteAudit.step3.title'),
      content: t('onboarding.siteAudit.step3.content'),
      placement: 'bottom',
      disableBeacon: true,
    },
  ];
}

export const SITE_AUDIT_START_PATH = '/dashboard/technical-seo/site-audit';

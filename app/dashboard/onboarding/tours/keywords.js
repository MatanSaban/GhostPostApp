export function buildKeywordsSteps(t, { hasKeywords } = {}) {
  const steps = [
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
  ];

  // When the workspace is empty, the fastest bootstrap is the AI Interview
  // (site-profile). Action-lock on the Link click so the tour hands off
  // cleanly to the interview flow.
  if (!hasKeywords) {
    steps.push({
      target: '[data-onboarding="keywords-empty-ai-interview"]',
      title: t('onboarding.keywords.stepAiInterview.title'),
      content: t('onboarding.keywords.stepAiInterview.content'),
      placement: 'top',
      disableBeacon: true,
      hideFooter: true,
      waitForEvent: 'ghostpost:onboarding:keywords-interview-started',
      actionHint: t('onboarding.keywords.stepAiInterview.actionHint'),
    });
  }

  steps.push({
    target: '[data-onboarding="keywords-add-cta"]',
    title: t('onboarding.keywords.stepAdd.title'),
    content: t('onboarding.keywords.stepAdd.content'),
    placement: 'bottom',
    disableBeacon: true,
  });

  return steps;
}

export const KEYWORDS_START_PATH = '/dashboard/strategy/keywords';

export function buildAiAgentSteps(t) {
  return [
    {
      target: '[data-onboarding="nav-agent"]',
      title: t('onboarding.aiAgent.step1.title'),
      content: t('onboarding.aiAgent.step1.content'),
      placement: 'right',
      disableBeacon: true,
    },
    {
      target: '[data-onboarding="page-agent"]',
      title: t('onboarding.aiAgent.step2.title'),
      content: t('onboarding.aiAgent.step2.content'),
      placement: 'bottom',
      disableBeacon: true,
    },
    {
      target: '[data-onboarding="agent-run-cta"]',
      title: t('onboarding.aiAgent.step3.title'),
      content: t('onboarding.aiAgent.step3.content'),
      placement: 'bottom',
      disableBeacon: true,
    },
  ];
}

export const AI_AGENT_START_PATH = '/dashboard/agent';

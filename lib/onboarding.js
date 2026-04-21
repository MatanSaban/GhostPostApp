/**
 * First-time dashboard onboarding state - step enum + gating helpers.
 *
 * Persisted on Account.onboardingStep (string). Server/client both import
 * from here so the canonical order lives in one place.
 */

export const ONBOARDING_STEPS = {
  GREETING: 'GREETING',
  CONNECT_ANALYTICS: 'CONNECT_ANALYTICS',
  DETECT_ENTITIES: 'DETECT_ENTITIES',
  INSTALL_PLUGIN: 'INSTALL_PLUGIN',
  KEYWORDS: 'KEYWORDS',
  COMPETITORS: 'COMPETITORS',
  SITE_AUDIT: 'SITE_AUDIT',
  AI_AGENT: 'AI_AGENT',
  CONTENT_PLANNER: 'CONTENT_PLANNER',
  CONTENT_WIZARD: 'CONTENT_WIZARD',
  FINISHED: 'FINISHED',
};

export const ONBOARDING_ORDER = [
  ONBOARDING_STEPS.GREETING,
  ONBOARDING_STEPS.CONNECT_ANALYTICS,
  ONBOARDING_STEPS.DETECT_ENTITIES,
  ONBOARDING_STEPS.INSTALL_PLUGIN,
  ONBOARDING_STEPS.KEYWORDS,
  ONBOARDING_STEPS.COMPETITORS,
  ONBOARDING_STEPS.SITE_AUDIT,
  ONBOARDING_STEPS.AI_AGENT,
  ONBOARDING_STEPS.CONTENT_PLANNER,
  ONBOARDING_STEPS.CONTENT_WIZARD,
  ONBOARDING_STEPS.FINISHED,
];

export function isValidOnboardingStep(step) {
  return ONBOARDING_ORDER.includes(step);
}

export function getStepIndex(step) {
  const i = ONBOARDING_ORDER.indexOf(step);
  return i === -1 ? 0 : i;
}

export function getNextStep(step) {
  const i = getStepIndex(step);
  return ONBOARDING_ORDER[Math.min(i + 1, ONBOARDING_ORDER.length - 1)];
}

export function isFinished(step) {
  return step === ONBOARDING_STEPS.FINISHED;
}

/**
 * The "floating guide banner" only starts being visible once the user has
 * reached the WordPress plugin step. Earlier steps use full-screen modals
 * or dimmed UI rather than the banner.
 */
export function isBannerVisibleAt(step) {
  const i = getStepIndex(step);
  return i >= getStepIndex(ONBOARDING_STEPS.INSTALL_PLUGIN) &&
    step !== ONBOARDING_STEPS.FINISHED;
}

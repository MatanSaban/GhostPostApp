/**
 * Client-side registry mapping guide IDs → tour builder + launch config.
 *
 * Kept separate from `lib/guides.js` (which carries metadata) so the API
 * route and other server-side callers don't have to pull in the tour-step
 * modules and their translation strings.
 *
 * Each entry shape:
 *   builder: (t, extraState?) => JoyrideStep[]
 *   startPath: string   - where the tour wants the user to be
 *   fetchExtra?: async (deps) => extraState
 *       deps = { siteId, locale }
 *       Anything the builder needs beyond `t`. Called by FeatureGuideRunner
 *       right before launching so the tour can branch on workspace state.
 *   waitForExtra?: (extra) => boolean
 *       If truthy, runner waits until extra is resolved (non-null) before
 *       rendering steps. Defaults to false (start immediately).
 */

import { GUIDES } from '@/lib/guides';
import {
  buildConnectAnalyticsSteps,
  CONNECT_ANALYTICS_START_PATH,
} from './tours/connectAnalytics';
import {
  buildDetectEntitiesSteps,
  DETECT_ENTITIES_START_PATH,
} from './tours/detectEntities';
import {
  buildInstallPluginSteps,
  INSTALL_PLUGIN_START_PATH,
} from './tours/installPlugin';
import {
  buildKeywordsSteps,
  KEYWORDS_START_PATH,
} from './tours/keywords';
import {
  buildCompetitorsSteps,
  COMPETITORS_START_PATH,
} from './tours/competitors';
import {
  buildSiteAuditSteps,
  SITE_AUDIT_START_PATH,
} from './tours/siteAudit';
import {
  buildAiAgentSteps,
  AI_AGENT_START_PATH,
} from './tours/aiAgent';
import {
  buildContentPlannerSteps,
  CONTENT_PLANNER_START_PATH,
} from './tours/contentPlanner';
import {
  buildContentWizardSteps,
  CONTENT_WIZARD_START_PATH,
} from './tours/contentWizard';
import {
  buildDashboardHomeSteps,
  DASHBOARD_HOME_START_PATH,
} from './tours/dashboardHome';
import {
  buildMyWebsitesSteps,
  MY_WEBSITES_START_PATH,
} from './tours/myWebsites';
import {
  buildNotificationsSteps,
  NOTIFICATIONS_START_PATH,
} from './tours/notifications';
import {
  buildSettingsSteps,
  SETTINGS_START_PATH,
} from './tours/settings';

async function fetchIntegrationStatus({ siteId }) {
  if (!siteId) return {};
  try {
    const res = await fetch(`/api/settings/integrations/google?siteId=${siteId}`);
    if (!res.ok) return {};
    return await res.json();
  } catch {
    return {};
  }
}

async function fetchKeywordsState({ siteId }) {
  if (!siteId) return { hasKeywords: false };
  try {
    const res = await fetch(`/api/keywords?siteId=${siteId}`);
    if (!res.ok) return { hasKeywords: false };
    const data = await res.json();
    return { hasKeywords: Array.isArray(data.keywords) && data.keywords.length > 0 };
  } catch {
    return { hasKeywords: false };
  }
}

export const GUIDE_TOURS = {
  [GUIDES.CONNECT_ANALYTICS]: {
    builder: (t, integrationStatus) => buildConnectAnalyticsSteps(t, integrationStatus),
    startPath: CONNECT_ANALYTICS_START_PATH,
    fetchExtra: fetchIntegrationStatus,
    waitForExtra: true,
  },
  [GUIDES.INSTALL_PLUGIN]: {
    builder: (t) => buildInstallPluginSteps(t),
    startPath: INSTALL_PLUGIN_START_PATH,
  },
  [GUIDES.DETECT_ENTITIES]: {
    builder: (t) => buildDetectEntitiesSteps(t),
    startPath: DETECT_ENTITIES_START_PATH,
  },
  [GUIDES.KEYWORDS]: {
    builder: (t, keywordsState) => buildKeywordsSteps(t, keywordsState || {}),
    startPath: KEYWORDS_START_PATH,
    fetchExtra: fetchKeywordsState,
    waitForExtra: true,
  },
  [GUIDES.COMPETITORS]: {
    builder: (t) => buildCompetitorsSteps(t),
    startPath: COMPETITORS_START_PATH,
  },
  [GUIDES.SITE_AUDIT]: {
    builder: (t) => buildSiteAuditSteps(t),
    startPath: SITE_AUDIT_START_PATH,
  },
  [GUIDES.AI_AGENT]: {
    builder: (t) => buildAiAgentSteps(t),
    startPath: AI_AGENT_START_PATH,
  },
  [GUIDES.CONTENT_PLANNER]: {
    builder: (t) => buildContentPlannerSteps(t),
    startPath: CONTENT_PLANNER_START_PATH,
  },
  [GUIDES.CONTENT_WIZARD]: {
    builder: (t) => buildContentWizardSteps(t),
    startPath: CONTENT_WIZARD_START_PATH,
  },
  [GUIDES.DASHBOARD_HOME]: {
    builder: (t) => buildDashboardHomeSteps(t),
    startPath: DASHBOARD_HOME_START_PATH,
  },
  [GUIDES.MY_WEBSITES]: {
    builder: (t) => buildMyWebsitesSteps(t),
    startPath: MY_WEBSITES_START_PATH,
  },
  [GUIDES.NOTIFICATIONS]: {
    builder: (t) => buildNotificationsSteps(t),
    startPath: NOTIFICATIONS_START_PATH,
  },
  [GUIDES.SETTINGS]: {
    builder: (t) => buildSettingsSteps(t),
    startPath: SETTINGS_START_PATH,
  },
};

export function getGuideTour(guideId) {
  return GUIDE_TOURS[guideId] || null;
}

export function isGuideLaunchable(guideId) {
  return !!GUIDE_TOURS[guideId];
}

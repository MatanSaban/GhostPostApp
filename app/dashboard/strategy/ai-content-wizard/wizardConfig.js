/**
 * Article type definitions for the AI Content Wizard
 * Matches the ContentType enum in Prisma schema
 */
export const ARTICLE_TYPES = [
  { id: 'SEO', minWords: 1500, maxWords: 3000 },
  { id: 'BLOG_POST', minWords: 800, maxWords: 2000 },
  { id: 'GUIDE', minWords: 2000, maxWords: 5000 },
  { id: 'HOW_TO', minWords: 1000, maxWords: 2500 },
  { id: 'LISTICLE', minWords: 800, maxWords: 2000 },
  { id: 'COMPARISON', minWords: 1200, maxWords: 3000 },
  { id: 'REVIEW', minWords: 1000, maxWords: 2500 },
  { id: 'NEWS', minWords: 400, maxWords: 1000 },
  { id: 'TUTORIAL', minWords: 1500, maxWords: 4000 },
  { id: 'CASE_STUDY', minWords: 1200, maxWords: 3000 },
];

/**
 * Map article type ID to translation key
 */
export const ARTICLE_TYPE_KEY_MAP = {
  SEO: 'seo',
  BLOG_POST: 'blogPost',
  GUIDE: 'guide',
  HOW_TO: 'howTo',
  LISTICLE: 'listicle',
  COMPARISON: 'comparison',
  REVIEW: 'review',
  NEWS: 'news',
  TUTORIAL: 'tutorial',
  CASE_STUDY: 'caseStudy',
};

/**
 * Days of the week configuration
 */
export const WEEK_DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/**
 * Translate an intent string like "Informational - How-to" using the intents map.
 * Splits on " - ", translates each part, falls back to the original if no match.
 */
export function translateIntent(intentStr, intentsMap) {
  if (!intentStr || !intentsMap) return intentStr || '';
  const parts = intentStr.split(' - ');
  return parts.map(p => intentsMap[p.trim()] || p.trim()).join(' - ');
}

/**
 * Initial wizard state
 */
export const INITIAL_WIZARD_STATE = {
  // Step 1 - Campaign
  campaignId: null,
  campaignName: '',
  campaignColor: '#6366f1',
  campaignStatus: 'DRAFT',
  isNewCampaign: true,

  // Topic cluster context — set when wizard is launched via ?clusterId=
  // Drives pillar/keyword pre-fill, gap suggestions, and is persisted on the
  // resulting Campaign so preflight can fire on activate.
  topicClusterId: null,
  clusterContext: null, // { name, mainKeyword, pillarUrl, pillarTitle, memberCount } — display-only

  // Step 2 - Pillar Page
  pillarPageUrl: '',
  pillarEntityId: null,

  // Step 3 - Main Keyword
  mainKeyword: '',

  // Step 4 - Post count
  postsCount: 4,

  // Step 5 - Article types + content settings (merged)
  articleTypes: [{ id: 'SEO', count: 4 }],
  contentSettings: {},

  // Step 6 - Subjects
  subjects: [],
  subjectSuggestions: [],

  // Step 7 - Prompts
  textPrompt: '',
  imagePrompt: '',

  // Step 8 - Schedule
  startDate: '',
  endDate: '',
  publishDays: ['sun', 'mon', 'tue', 'wed', 'thu'],
  publishTimeMode: 'random',
  publishTimeStart: '09:00',
  publishTimeEnd: '18:00',

  // Step 9 - Generated plan
  generatedPlan: null,
  planNeedsRegeneration: false,

  // DEPRECATED - kept for backward compat with old campaigns
  selectedKeywordIds: [],
  manualKeywords: [],
};

export const WIZARD_STEPS = [
  { id: 1, key: 'campaign', iconName: 'FolderOpen' },
  { id: 2, key: 'pillarPage', iconName: 'Globe' },
  { id: 3, key: 'mainKeyword', iconName: 'Search' },
  { id: 4, key: 'postCount', iconName: 'Hash' },
  { id: 5, key: 'articleTypes', iconName: 'FileText' },
  { id: 6, key: 'subjects', iconName: 'BookOpen' },
  { id: 7, key: 'prompts', iconName: 'MessageSquare' },
  { id: 8, key: 'schedule', iconName: 'Calendar' },
  { id: 9, key: 'summary', iconName: 'Sparkles' },
];

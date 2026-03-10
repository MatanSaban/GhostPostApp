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
 * Initial wizard state
 */
export const INITIAL_WIZARD_STATE = {
  // Step 1 - Campaign
  campaignId: null,
  campaignName: '',
  campaignColor: '#6366f1',
  campaignStatus: 'DRAFT',
  isNewCampaign: true,

  // Step 2 - Post count
  postsCount: 4,

  // Step 3 - Schedule
  startDate: '',
  endDate: '',
  publishDays: ['sun', 'mon', 'tue', 'wed', 'thu'],
  publishTimeMode: 'random',
  publishTimeStart: '09:00',
  publishTimeEnd: '18:00',

  // Step 4 - Article types
  articleTypes: [{ id: 'SEO', count: 4 }],

  // Step 5 - Content settings (per article type)
  contentSettings: {},

  // Step 6 - Keywords  
  selectedKeywordIds: [],
  manualKeywords: [],

  // Step 7 - Subjects
  subjects: [],
  subjectSuggestions: [],

  // Step 8 - Prompts
  textPrompt: '',
  imagePrompt: '',

  // Step 9 - Generated plan
  generatedPlan: null,
  planNeedsRegeneration: false,
};

export const WIZARD_STEPS = [
  { id: 1, key: 'campaign', iconName: 'FolderOpen' },
  { id: 2, key: 'postCount', iconName: 'Hash' },
  { id: 3, key: 'schedule', iconName: 'Calendar' },
  { id: 4, key: 'articleTypes', iconName: 'FileText' },
  { id: 5, key: 'contentSettings', iconName: 'Settings' },
  { id: 6, key: 'keywords', iconName: 'Search' },
  { id: 7, key: 'subjects', iconName: 'BookOpen' },
  { id: 8, key: 'prompts', iconName: 'MessageSquare' },
  { id: 9, key: 'summary', iconName: 'Sparkles' },
];

/**
 * Seed Interview Questions
 * 
 * This script creates the initial interview questions for the GhostPost platform.
 * Run with: node scripts/seed-interview-questions.js
 * 
 * NEW FLOW (11 questions):
 * 1. Website URL - crawl on submit
 * 2. Content Language - auto-detected from crawl
 * 3. Business Confirmation - editable crawled data
 * 4. Keywords - AI suggests from crawl data
 * 5. Target Location - where user wants to be found (countries/worldwide)
 * 6. Competitors - Google Search based on keywords + location (max 5 keywords, 5 competitors each)
 * 7. Fetch Articles - fetch last 10 blog articles
 * 8. Writing Style - AI analyzes fetched posts
 * 9. Website Platform - crawl/AI detection with user confirmation
 * 10. Internal Links - per 1000 words, default from posts analysis
 * 11. Favorite Articles - select 3 from 10 fetched
 * 
 * Note: Greeting is NOT a question - it shows before the interview starts
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const interviewQuestions = [
  // Q1: Website URL
  {
    order: 1,
    translationKey: 'registration.interview.questions.websiteUrl',
    questionType: 'INPUT',
    inputConfig: {
      inputType: 'url',
      placeholderKey: 'registration.interview.placeholders.websiteUrl',
    },
    validation: {
      required: true,
      pattern: '^https?://.*',
      errorKey: 'registration.interview.errors.invalidUrl',
    },
    aiPromptHint: 'Ask the user for their website URL. Explain that you will analyze their website to better understand their business.',
    allowedActions: ['CRAWL_WEBSITE'],
    autoActions: [
      { action: 'CRAWL_WEBSITE', triggerOn: 'submit' }
    ],
    saveToField: 'websiteUrl',
    isActive: true,
  },
  // Q2: Content Language (auto-detected from crawl)
  {
    order: 2,
    translationKey: 'registration.interview.questions.contentLanguage',
    questionType: 'SELECTION',
    inputConfig: {
      selectionMode: 'searchable',
      defaultFromCrawl: 'language', // Pre-select detected language
      autoDetect: true, // AI should try to detect from crawl
      options: [
        { value: 'en', labelKey: 'registration.languages.english' },
        { value: 'he', labelKey: 'registration.languages.hebrew' },
        { value: 'es', labelKey: 'registration.languages.spanish' },
        { value: 'fr', labelKey: 'registration.languages.french' },
        { value: 'de', labelKey: 'registration.languages.german' },
        { value: 'pt', labelKey: 'registration.languages.portuguese' },
        { value: 'it', labelKey: 'registration.languages.italian' },
        { value: 'ru', labelKey: 'registration.languages.russian' },
        { value: 'ar', labelKey: 'registration.languages.arabic' },
        { value: 'zh', labelKey: 'registration.languages.chinese' },
        { value: 'ja', labelKey: 'registration.languages.japanese' },
      ],
    },
    validation: {
      required: true,
    },
    aiPromptHint: 'The language was detected from the website crawl. Ask the user to confirm or change the content language.',
    allowedActions: [],
    autoActions: null,
    saveToField: 'contentLanguage',
    isActive: true,
  },
  // Q3: Business Confirmation (editable crawled data)
  {
    order: 3,
    translationKey: 'registration.interview.questions.businessConfirmation',
    questionType: 'EDITABLE_DATA',
    inputConfig: {
      dataSource: 'crawledData',
      editableFields: [
        { key: 'businessName', labelKey: 'registration.interview.fields.businessName', type: 'text' },
        { key: 'phone', labelKey: 'registration.interview.fields.phone', type: 'tel' },
        { key: 'email', labelKey: 'registration.interview.fields.email', type: 'email' },
        { key: 'about', labelKey: 'registration.interview.fields.about', type: 'textarea' },
        { key: 'category', labelKey: 'registration.interview.fields.category', type: 'text' },
        { key: 'address', labelKey: 'registration.interview.fields.address', type: 'text' },
      ],
    },
    validation: {
      required: true,
    },
    aiPromptHint: 'Show the user the information crawled from their website and ask them to confirm or edit it.',
    allowedActions: ['SAVE_BUSINESS_DATA'],
    autoActions: null,
    saveToField: 'businessInfo',
    isActive: true,
  },
  // Q4: Keywords (AI suggests from crawl data)
  {
    order: 4,
    translationKey: 'registration.interview.questions.keywords',
    questionType: 'AI_SUGGESTION',
    inputConfig: {
      selectionMode: 'tags',
      suggestionsSource: 'generateKeywords', // Generate from crawl data
      allowCustom: true,
      maxSelections: 20,
      minSelections: 3,
    },
    validation: {
      required: true,
      minSelections: 3,
      maxSelections: 20,
    },
    aiPromptHint: 'Generate keyword suggestions based on the crawled website content, business category, and description. Let the user select relevant keywords and add their own.',
    allowedActions: ['GENERATE_KEYWORDS'],
    autoActions: [
      { action: 'GENERATE_KEYWORDS', triggerOn: 'display' }
    ],
    saveToField: 'keywords',
    isActive: true,
  },
  // Q5: Target Location (where user wants to be found)
  {
    order: 5,
    translationKey: 'registration.interview.questions.targetLocation',
    questionType: 'SELECTION',
    inputConfig: {
      selectionMode: 'searchable',
      multiple: true, // Allow selecting multiple countries
      allowWorldwide: true, // Show "Worldwide" option
      defaultFromCrawl: 'detectedCountry', // Pre-select detected country
      showDetectedBadge: true,
      options: [
        { value: 'worldwide', labelKey: 'registration.countries.worldwide' },
        { value: 'IL', labelKey: 'registration.countries.israel' },
        { value: 'US', labelKey: 'registration.countries.unitedStates' },
        { value: 'GB', labelKey: 'registration.countries.unitedKingdom' },
        { value: 'CA', labelKey: 'registration.countries.canada' },
        { value: 'AU', labelKey: 'registration.countries.australia' },
        { value: 'DE', labelKey: 'registration.countries.germany' },
        { value: 'FR', labelKey: 'registration.countries.france' },
        { value: 'ES', labelKey: 'registration.countries.spain' },
        { value: 'IT', labelKey: 'registration.countries.italy' },
        { value: 'NL', labelKey: 'registration.countries.netherlands' },
        { value: 'BR', labelKey: 'registration.countries.brazil' },
        { value: 'MX', labelKey: 'registration.countries.mexico' },
        { value: 'IN', labelKey: 'registration.countries.india' },
        { value: 'JP', labelKey: 'registration.countries.japan' },
        { value: 'CN', labelKey: 'registration.countries.china' },
        { value: 'KR', labelKey: 'registration.countries.southKorea' },
        { value: 'RU', labelKey: 'registration.countries.russia' },
        { value: 'AE', labelKey: 'registration.countries.uae' },
        { value: 'SA', labelKey: 'registration.countries.saudiArabia' },
        { value: 'ZA', labelKey: 'registration.countries.southAfrica' },
        { value: 'PL', labelKey: 'registration.countries.poland' },
        { value: 'SE', labelKey: 'registration.countries.sweden' },
        { value: 'NO', labelKey: 'registration.countries.norway' },
        { value: 'DK', labelKey: 'registration.countries.denmark' },
        { value: 'FI', labelKey: 'registration.countries.finland' },
        { value: 'AT', labelKey: 'registration.countries.austria' },
        { value: 'CH', labelKey: 'registration.countries.switzerland' },
        { value: 'BE', labelKey: 'registration.countries.belgium' },
        { value: 'PT', labelKey: 'registration.countries.portugal' },
        { value: 'GR', labelKey: 'registration.countries.greece' },
        { value: 'TR', labelKey: 'registration.countries.turkey' },
        { value: 'TH', labelKey: 'registration.countries.thailand' },
        { value: 'SG', labelKey: 'registration.countries.singapore' },
        { value: 'MY', labelKey: 'registration.countries.malaysia' },
        { value: 'ID', labelKey: 'registration.countries.indonesia' },
        { value: 'PH', labelKey: 'registration.countries.philippines' },
        { value: 'VN', labelKey: 'registration.countries.vietnam' },
        { value: 'AR', labelKey: 'registration.countries.argentina' },
        { value: 'CL', labelKey: 'registration.countries.chile' },
        { value: 'CO', labelKey: 'registration.countries.colombia' },
        { value: 'NZ', labelKey: 'registration.countries.newZealand' },
        { value: 'IE', labelKey: 'registration.countries.ireland' },
      ],
    },
    validation: {
      required: true,
      minSelections: 1,
    },
    aiPromptHint: 'Ask the user where they want their website to be found. They can select multiple countries or choose worldwide. The default should be based on the detected language/country from the website.',
    allowedActions: [],
    autoActions: null,
    saveToField: 'targetLocations',
    isActive: true,
  },
  // Q6: Competitors (Google Search based on keywords + location)
  {
    order: 6,
    translationKey: 'registration.interview.questions.competitors',
    questionType: 'AI_SUGGESTION',
    inputConfig: {
      selectionMode: 'competitorCards',
      suggestionsSource: 'findCompetitors', // Find competitors using Google Search
      allowCustom: true, // Allow manual URL entry
      customInputPlaceholder: 'registration.interview.placeholders.competitorUrl',
      maxKeywordsToSearch: 5, // Search competitors for max 5 keywords
      competitorsPerKeyword: 5, // 5 competitors per keyword
      maxSelections: 10,
      useGoogleSearch: true, // Use Google Search grounding for real results
    },
    validation: {
      required: false,
    },
    aiPromptHint: 'Search Google for real competitors based on the selected keywords and target location. Show 5 competitors per keyword (max 5 keywords). User can select relevant competitors or add their own competitor URLs manually.',
    allowedActions: ['FIND_COMPETITORS'],
    autoActions: [
      { action: 'FIND_COMPETITORS', triggerOn: 'display' }
    ],
    saveToField: 'competitors',
    isActive: true,
  },
  // Q7: Fetch Articles (auto-fetch last 10 blog posts)
  {
    order: 7,
    translationKey: 'registration.interview.questions.fetchArticles',
    questionType: 'AUTO_ACTION',
    inputConfig: {
      actionToRun: 'FETCH_ARTICLES',
      showProgress: true,
      articlesToFetch: 10,
    },
    validation: {
      required: false,
    },
    aiPromptHint: 'Automatically fetch the last 10 articles from the website blog. Show progress to the user.',
    allowedActions: ['FETCH_ARTICLES'],
    autoActions: [
      { action: 'FETCH_ARTICLES', triggerOn: 'display', params: { limit: 10 } }
    ],
    saveToField: 'fetchedArticles',
    isActive: true,
  },
  // Q8: Writing Style (AI analyzes fetched posts)
  {
    order: 8,
    translationKey: 'registration.interview.questions.writingStyle',
    questionType: 'AI_SUGGESTION',
    inputConfig: {
      selectionMode: 'cards',
      suggestionsSource: 'analyzeWritingStyle', // Analyze from fetched articles
      analyzeFromArticles: true, // Use fetched articles for analysis
      allowCustom: true,
      options: [
        { value: 'professional', labelKey: 'registration.interview.writingStyles.professional', icon: 'briefcase' },
        { value: 'casual', labelKey: 'registration.interview.writingStyles.casual', icon: 'smile' },
        { value: 'technical', labelKey: 'registration.interview.writingStyles.technical', icon: 'code' },
        { value: 'friendly', labelKey: 'registration.interview.writingStyles.friendly', icon: 'heart' },
        { value: 'authoritative', labelKey: 'registration.interview.writingStyles.authoritative', icon: 'shield' },
        { value: 'conversational', labelKey: 'registration.interview.writingStyles.conversational', icon: 'message-circle' },
      ],
    },
    validation: {
      required: true,
    },
    aiPromptHint: 'Analyze the fetched blog posts to identify the writing style. Suggest the detected style to the user and let them confirm or choose differently.',
    allowedActions: ['ANALYZE_WRITING_STYLE'],
    autoActions: [
      { action: 'ANALYZE_WRITING_STYLE', triggerOn: 'display' }
    ],
    saveToField: 'writingStyle',
    isActive: true,
  },
  // Q9: Website Platform (crawl/AI detection + user confirmation)
  {
    order: 9,
    translationKey: 'registration.interview.questions.websitePlatform',
    questionType: 'SELECTION',
    inputConfig: {
      selectionMode: 'cards',
      defaultFromCrawl: 'platform', // Pre-select detected platform
      detectFromCrawl: true, // Try to detect from crawl first
      detectWithAI: true, // If not found, use AI
      options: [
        { value: 'wordpress', labelKey: 'registration.interview.platforms.wordpress', icon: 'wordpress' },
        { value: 'shopify', labelKey: 'registration.interview.platforms.shopify', icon: 'shopping-bag' },
        { value: 'wix', labelKey: 'registration.interview.platforms.wix', icon: 'globe' },
        { value: 'squarespace', labelKey: 'registration.interview.platforms.squarespace', icon: 'square' },
        { value: 'webflow', labelKey: 'registration.interview.platforms.webflow', icon: 'layers' },
        { value: 'magento', labelKey: 'registration.interview.platforms.magento', icon: 'shopping-cart' },
        { value: 'drupal', labelKey: 'registration.interview.platforms.drupal', icon: 'droplet' },
        { value: 'joomla', labelKey: 'registration.interview.platforms.joomla', icon: 'box' },
        { value: 'custom', labelKey: 'registration.interview.platforms.custom', icon: 'code' },
        { value: 'other', labelKey: 'registration.interview.platforms.other', icon: 'more-horizontal' },
      ],
    },
    validation: {
      required: true,
    },
    aiPromptHint: 'The platform was detected from the website. Ask the user to confirm or select a different platform. If custom code, ask them to select "Custom".',
    allowedActions: ['DETECT_PLATFORM'],
    autoActions: [
      { action: 'DETECT_PLATFORM', triggerOn: 'display' }
    ],
    saveToField: 'websitePlatform',
    isActive: true,
  },
  // Q10: Internal Links per 1000 words (default from posts analysis)
  {
    order: 10,
    translationKey: 'registration.interview.questions.internalLinksCount',
    questionType: 'SLIDER',
    inputConfig: {
      min: 0,
      max: 10,
      step: 1,
      defaultFromArticles: true, // Calculate default from fetched articles
      defaultValue: 4, // Default to 4 (middle of recommended 3-5 range)
      showValue: true,
      unit: 'per1000Words',
      recommendedMin: 3,
      recommendedMax: 5,
      marks: [
        { value: 0, labelKey: 'common.numbers.zero' },
        { value: 3, labelKey: 'common.numbers.three' },
        { value: 5, labelKey: 'common.numbers.five' },
        { value: 10, labelKey: 'common.numbers.ten' },
      ],
    },
    validation: {
      required: true,
      min: 0,
      max: 10,
    },
    aiPromptHint: 'Ask how many internal links per 1000 words. The default is calculated from their existing posts. Explain SEO best practices: 3-5 internal links per 1000 words is optimal for SEO and user experience.',
    allowedActions: ['ANALYZE_INTERNAL_LINKS'],
    autoActions: null,
    saveToField: 'internalLinksPer1000Words',
    isActive: true,
  },
  // Q11: Favorite Articles (select 3 from 10 fetched)
  {
    order: 11,
    translationKey: 'registration.interview.questions.favoriteArticles',
    questionType: 'DYNAMIC',
    inputConfig: {
      selectionMode: 'cards',
      optionsSource: 'fetchedArticles', // Use the articles we fetched in Q6
      displayFields: ['title', 'excerpt', 'image'],
      maxSelections: 3,
      minSelections: 0,
    },
    validation: {
      required: false,
      maxSelections: 3,
    },
    aiPromptHint: 'Show the 10 articles we fetched and ask the user to select up to 3 that best represent their desired content style.',
    allowedActions: [],
    autoActions: null,
    saveToField: 'favoriteArticles',
    isActive: true,
  },
];

async function seedInterviewQuestions() {
  console.log('Seeding interview questions...\n');

  // Check for --reset flag to delete all existing questions
  const shouldReset = process.argv.includes('--reset');
  
  if (shouldReset) {
    console.log('🗑️  Resetting: Deleting all existing interview questions...');
    const deleted = await prisma.interviewQuestion.deleteMany({});
    console.log(`   Deleted ${deleted.count} questions\n`);
  }

  let created = 0;
  let skipped = 0;
  let errors = 0;

  for (const question of interviewQuestions) {
    try {
      // Check if question already exists
      const existing = await prisma.interviewQuestion.findUnique({
        where: { translationKey: question.translationKey },
      });

      if (existing) {
        console.log(`⏭️  Skipped (exists): ${question.translationKey}`);
        skipped++;
        continue;
      }

      // Create the question
      await prisma.interviewQuestion.create({
        data: question,
      });

      console.log(`✅ Created: ${question.translationKey}`);
      created++;
    } catch (error) {
      console.error(`❌ Error creating ${question.translationKey}:`, error.message);
      errors++;
    }
  }

  console.log('\n=== Summary ===');
  console.log(`Created: ${created}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Errors: ${errors}`);
}

seedInterviewQuestions()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    // Also seed bot actions needed for the interview
    await seedBotActions();
    await prisma.$disconnect();
  });

// Bot actions required for interview questions
const botActions = [
  {
    name: 'CRAWL_WEBSITE',
    description: 'Crawl a website URL and extract business information, SEO data, content, and detect language/platform',
    handler: 'crawlWebsite',
    parameters: {
      type: 'object',
      required: ['url'],
      properties: {
        url: { type: 'string', description: 'The website URL to crawl' },
      },
    },
    returns: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        crawledData: { type: 'object' },
        language: { type: 'string' },
        platform: { type: 'string' },
      },
    },
  },
  {
    name: 'GENERATE_KEYWORDS',
    description: 'Generate keyword suggestions based on crawled website content, category, and description',
    handler: 'generateKeywords',
    parameters: {
      type: 'object',
      properties: {
        usesCrawlData: { type: 'boolean', description: 'Use data from website crawl' },
      },
    },
    returns: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        keywords: { type: 'array' },
        topicClusters: { type: 'array' },
      },
    },
  },
  {
    name: 'FIND_COMPETITORS',
    description: 'Find competitors based on selected keywords. Searches for top 5 competitors per keyword (max 5 keywords)',
    handler: 'findCompetitors',
    parameters: {
      type: 'object',
      properties: {
        keywords: { type: 'array', description: 'Array of keywords to search competitors for (optional - will use context.interview.responses.keywords if not provided)' },
        maxKeywords: { type: 'number', description: 'Maximum number of keywords to search (default 5)' },
        competitorsPerKeyword: { type: 'number', description: 'Competitors to find per keyword (default 5)' },
      },
    },
    returns: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        competitors: { type: 'array' },
      },
    },
  },
  {
    name: 'FETCH_ARTICLES',
    description: 'Fetch the last N articles/blog posts from a website',
    handler: 'fetchArticles',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        limit: { type: 'number', description: 'Number of articles to fetch (default 10)' },
      },
    },
    returns: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        articles: { type: 'array' },
      },
    },
  },
  {
    name: 'ANALYZE_WRITING_STYLE',
    description: 'Analyze the writing style from fetched articles',
    handler: 'analyzeWritingStyle',
    parameters: {
      type: 'object',
      properties: {
        usesFetchedArticles: { type: 'boolean', description: 'Analyze from fetched articles' },
      },
    },
    returns: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        style: { type: 'object' },
        detectedStyle: { type: 'string' },
        confidence: { type: 'number' },
      },
    },
  },
  {
    name: 'DETECT_PLATFORM',
    description: 'Detect the CMS/platform of a website from crawl data or using AI',
    handler: 'detectPlatform',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The website URL to analyze' },
        useAI: { type: 'boolean', description: 'Use AI if crawl detection fails' },
      },
    },
    returns: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        platform: { type: 'string' },
        confidence: { type: 'number' },
        source: { type: 'string', description: 'crawl or ai' },
      },
    },
  },
  {
    name: 'ANALYZE_INTERNAL_LINKS',
    description: 'Analyze internal links ratio from fetched articles',
    handler: 'analyzeInternalLinks',
    parameters: {
      type: 'object',
      properties: {
        usesFetchedArticles: { type: 'boolean', description: 'Analyze from fetched articles' },
      },
    },
    returns: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        averageLinksPer1000Words: { type: 'number' },
        recommendation: { type: 'number' },
      },
    },
  },
];

async function seedBotActions() {
  console.log('\n🤖 Seeding bot actions...');

  let created = 0;
  let updated = 0;

  for (const action of botActions) {
    try {
      const result = await prisma.botAction.upsert({
        where: { name: action.name },
        update: {
          description: action.description,
          handler: action.handler,
          parameters: action.parameters,
          returns: action.returns,
          isActive: true,
        },
        create: {
          name: action.name,
          description: action.description,
          handler: action.handler,
          parameters: action.parameters,
          returns: action.returns,
          isActive: true,
        },
      });

      if (result.createdAt.getTime() === result.updatedAt.getTime()) {
        console.log(`✅ Created: ${action.name}`);
        created++;
      } else {
        console.log(`🔄 Updated: ${action.name}`);
        updated++;
      }
    } catch (error) {
      console.error(`❌ Error with ${action.name}:`, error.message);
    }
  }

  console.log(`\n=== Bot Actions Summary ===`);
  console.log(`Created: ${created}`);
  console.log(`Updated: ${updated}`);
}


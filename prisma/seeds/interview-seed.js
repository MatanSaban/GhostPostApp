/**
 * Interview System Seed Script
 * 
 * Run with: node prisma/seeds/interview-seed.js
 */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding interview questions and bot actions...');

  // Create bot actions first (so we can reference them in questions)
  const fetchUserAction = await prisma.botAction.upsert({
    where: { name: 'fetch_user_data' },
    update: {},
    create: {
      name: 'fetch_user_data',
      displayName: 'Fetch User Data',
      description: 'Retrieves current user data including email, name, and organization',
      category: 'data_fetch',
      actionSchema: {
        type: 'function',
        function: {
          name: 'fetch_user_data',
          description: 'Get the current user data',
          parameters: {
            type: 'object',
            properties: {},
            required: [],
          },
        },
      },
      implementation: {
        type: 'database_query',
        model: 'User',
        include: { organization: true },
      },
      isActive: true,
    },
  });

  const analyzeWebsiteAction = await prisma.botAction.upsert({
    where: { name: 'analyze_website' },
    update: {},
    create: {
      name: 'analyze_website',
      displayName: 'Analyze Website',
      description: 'Fetches and analyzes a website URL for SEO information',
      category: 'external_api',
      actionSchema: {
        type: 'function',
        function: {
          name: 'analyze_website',
          description: 'Analyze a website URL and extract SEO-relevant information',
          parameters: {
            type: 'object',
            properties: {
              url: {
                type: 'string',
                description: 'The website URL to analyze',
              },
            },
            required: ['url'],
          },
        },
      },
      implementation: {
        type: 'api_call',
        endpoint: '/api/internal/analyze-website',
        method: 'POST',
      },
      isActive: true,
    },
  });

  console.log('✅ Bot actions created');

  // Create interview questions
  const questions = [
    {
      translationKey: 'interviewWizard.questions.welcome',
      questionType: 'GREETING',
      order: 1,
      inputConfig: {
        confirmLabel: 'interviewWizard.questionTypes.greeting.continue',
      },
      validation: {},
      isActive: true,
    },
    {
      translationKey: 'interviewWizard.questions.websiteUrl',
      questionType: 'INPUT',
      order: 2,
      saveToField: 'website_url',
      inputConfig: {
        inputType: 'url',
        placeholder: 'https://example.com',
      },
      validation: {
        required: true,
        pattern: '^https?:\\/\\/.+',
        errorMessage: 'Please enter a valid URL starting with http:// or https://',
      },
      autoActions: [analyzeWebsiteAction.id],
      isActive: true,
    },
    {
      translationKey: 'interviewWizard.questions.businessType',
      questionType: 'SELECTION',
      order: 3,
      saveToField: 'business_type',
      inputConfig: {
        options: [
          { value: 'ecommerce', label: 'E-commerce' },
          { value: 'saas', label: 'SaaS / Software' },
          { value: 'blog', label: 'Blog / Media' },
          { value: 'local', label: 'Local Service' },
          { value: 'agency', label: 'Agency / Consulting' },
          { value: 'other', label: 'Other' },
        ],
      },
      validation: { required: true },
      isActive: true,
    },
    {
      translationKey: 'interviewWizard.questions.primaryProducts',
      questionType: 'INPUT',
      order: 4,
      saveToField: 'primary_products',
      inputConfig: {
        inputType: 'textarea',
        placeholder: 'Describe your main products or services...',
      },
      validation: {
        required: true,
        minLength: 20,
        maxLength: 1000,
      },
      isActive: true,
    },
    {
      translationKey: 'interviewWizard.questions.targetAudience',
      questionType: 'INPUT',
      order: 5,
      saveToField: 'target_audience',
      inputConfig: {
        inputType: 'textarea',
        placeholder: 'Describe your target audience...',
      },
      validation: {
        required: true,
        minLength: 20,
        maxLength: 1000,
      },
      aiConfig: {
        enabled: true,
        systemPrompt: 'Help the user describe their target audience based on their business type and products.',
      },
      isActive: true,
    },
    {
      translationKey: 'interviewWizard.questions.targetRegions',
      questionType: 'MULTI_SELECTION',
      order: 6,
      saveToField: 'target_regions',
      inputConfig: {
        options: [
          { value: 'israel', label: 'Israel' },
          { value: 'usa', label: 'United States' },
          { value: 'europe', label: 'Europe' },
          { value: 'asia', label: 'Asia' },
          { value: 'global', label: 'Global' },
        ],
      },
      validation: {
        required: true,
        minSelections: 1,
      },
      isActive: true,
    },
    {
      translationKey: 'interviewWizard.questions.seoGoals',
      questionType: 'MULTI_SELECTION',
      order: 7,
      saveToField: 'seo_goals',
      inputConfig: {
        options: [
          { value: 'traffic', label: 'Increase organic traffic' },
          { value: 'rankings', label: 'Improve search rankings' },
          { value: 'leads', label: 'Generate more leads' },
          { value: 'sales', label: 'Increase sales' },
          { value: 'brand', label: 'Build brand awareness' },
          { value: 'authority', label: 'Establish thought leadership' },
        ],
      },
      validation: {
        required: true,
        minSelections: 1,
        maxSelections: 3,
      },
      isActive: true,
    },
    {
      translationKey: 'interviewWizard.questions.monthlyBudget',
      questionType: 'SLIDER',
      order: 8,
      saveToField: 'monthly_budget',
      inputConfig: {
        min: 0,
        max: 10000,
        step: 500,
        defaultValue: 1000,
        displayFormat: '${value}',
      },
      validation: {
        required: true,
      },
      isActive: true,
    },
    {
      translationKey: 'interviewWizard.questions.competitors',
      questionType: 'INPUT',
      order: 9,
      saveToField: 'competitors',
      inputConfig: {
        inputType: 'textarea',
        placeholder: 'List your main competitor URLs, one per line...',
      },
      validation: {
        required: false,
      },
      isActive: true,
    },
    {
      translationKey: 'interviewWizard.questions.hasExistingContent',
      questionType: 'CONFIRMATION',
      order: 10,
      saveToField: 'has_existing_content',
      inputConfig: {
        confirmLabel: 'Yes, I have existing content',
        cancelLabel: 'No, starting fresh',
      },
      validation: {},
      isActive: true,
    },
    {
      translationKey: 'interviewWizard.questions.contentTypes',
      questionType: 'MULTI_SELECTION',
      order: 11,
      saveToField: 'content_types',
      showCondition: {
        operator: 'equals',
        field: 'has_existing_content',
        value: true,
      },
      inputConfig: {
        options: [
          { value: 'blog', label: 'Blog posts' },
          { value: 'product', label: 'Product descriptions' },
          { value: 'landing', label: 'Landing pages' },
          { value: 'guide', label: 'Guides & tutorials' },
          { value: 'video', label: 'Videos' },
        ],
      },
      validation: {
        required: true,
        minSelections: 1,
      },
      isActive: true,
    },
    {
      translationKey: 'interviewWizard.questions.publishingFrequency',
      questionType: 'SELECTION',
      order: 12,
      saveToField: 'publishing_frequency',
      showCondition: {
        operator: 'equals',
        field: 'has_existing_content',
        value: true,
      },
      inputConfig: {
        options: [
          { value: 'daily', label: 'Daily' },
          { value: 'weekly', label: 'Weekly' },
          { value: 'biweekly', label: 'Bi-weekly' },
          { value: 'monthly', label: 'Monthly' },
          { value: 'rarely', label: 'Rarely / Inconsistent' },
        ],
      },
      validation: { required: true },
      isActive: true,
    },
    {
      translationKey: 'interviewWizard.questions.brandVoice',
      questionType: 'AI_SUGGESTION',
      order: 13,
      saveToField: 'brand_voice',
      inputConfig: {},
      aiConfig: {
        enabled: true,
        systemPrompt: 'Based on the user\'s business type, products, and target audience, suggest a brand voice and tone. Consider professional vs casual, formal vs friendly, etc.',
      },
      validation: {
        required: true,
        minLength: 50,
      },
      isActive: true,
    },
    {
      translationKey: 'interviewWizard.questions.reviewSummary',
      questionType: 'EDITABLE_DATA',
      order: 14,
      inputConfig: {
        displayTemplate: 'interview_summary',
        allowEdit: true,
      },
      validation: {},
      isActive: true,
    },
    {
      translationKey: 'interviewWizard.questions.complete',
      questionType: 'GREETING',
      order: 15,
      inputConfig: {
        confirmLabel: 'Start Using Ghost Post',
      },
      validation: {},
      isActive: true,
    },
  ];

  for (const question of questions) {
    await prisma.interviewQuestion.upsert({
      where: { translationKey: question.translationKey },
      update: question,
      create: question,
    });
  }

  console.log(`✅ ${questions.length} interview questions created`);

  console.log('\n🎉 Seeding complete!');
  console.log('\nNext steps:');
  console.log('1. Start the development server: npm run dev');
  console.log('2. Visit /dashboard/admin/interview-flow to manage questions');
  console.log('3. Visit /dashboard/admin/bot-actions to manage actions');
  console.log('4. Start a new interview at /dashboard/site-interview');
}

main()
  .catch((e) => {
    console.error('Error seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

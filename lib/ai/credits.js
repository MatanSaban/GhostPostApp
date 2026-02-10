/**
 * AI Credits Pricing System
 * 
 * This module defines the pricing for AI operations in the Ghost Post platform.
 * 
 * Pricing Formula:
 * 1 AI Credit = 2,500 tokens
 * 
 * Operations and their costs:
 * | Operation              | Credits | Token Value | Typical Usage    |
 * |------------------------|---------|-------------|------------------|
 * | Image Alt Optimization | 1       | 2,500       | ~500 (Vision)    |
 * | Rewrite Paragraph      | 1       | 2,500       | ~300 (Flash)     |
 * | Competitor Analysis    | 50      | 125,000     | ~15,000 (Flash)  |
 * | Cannibalization Fix    | 50      | 125,000     | ~4,000 (Pro)     |
 * | Full Article Writing   | 100     | 250,000     | ~10,000 (Pro)    |
 */

// 1 credit = 2,500 tokens
export const TOKENS_PER_CREDIT = 2500;

/**
 * AI Operation Types with their credit costs
 */
export const AI_OPERATIONS = {
  // Simple operations (1 credit)
  IMAGE_ALT_OPTIMIZATION: {
    key: 'IMAGE_ALT_OPTIMIZATION',
    name: 'Image Alt Optimization',
    nameHe: 'אופטימיזציית תמונה (Alt)',
    credits: 1,
    tokenValue: 2500,
    typicalUsage: 500,
    model: 'vision',
  },
  REWRITE_PARAGRAPH: {
    key: 'REWRITE_PARAGRAPH',
    name: 'Rewrite Paragraph/Title',
    nameHe: 'שכתוב פסקה/כותרת',
    credits: 1,
    tokenValue: 2500,
    typicalUsage: 300,
    model: 'flash',
  },
  
  // Medium operations (50 credits)
  COMPETITOR_ANALYSIS: {
    key: 'COMPETITOR_ANALYSIS',
    name: 'Competitor Analysis (Page)',
    nameHe: 'ניתוח מתחרים (עמוד)',
    credits: 50,
    tokenValue: 125000,
    typicalUsage: 15000,
    model: 'flash',
  },
  CANNIBALIZATION_FIX: {
    key: 'CANNIBALIZATION_FIX',
    name: 'Cannibalization Solution',
    nameHe: 'פתרון קניבליזציה',
    credits: 50,
    tokenValue: 125000,
    typicalUsage: 4000,
    model: 'pro',
  },
  
  // Large operations (100 credits)
  FULL_ARTICLE: {
    key: 'FULL_ARTICLE',
    name: 'Full Article Writing',
    nameHe: 'כתיבת מאמר מלא',
    credits: 100,
    tokenValue: 250000,
    typicalUsage: 10000,
    model: 'pro',
  },
  
  // Interview/Onboarding operations
  INTERVIEW_CHAT: {
    key: 'INTERVIEW_CHAT',
    name: 'Interview Chat',
    nameHe: 'צ\'אט ראיון',
    credits: 1,
    tokenValue: 2500,
    typicalUsage: 500,
    model: 'flash',
  },
  CRAWL_WEBSITE: {
    key: 'CRAWL_WEBSITE',
    name: 'Website Crawl & Analysis',
    nameHe: 'סריקת אתר וניתוח',
    credits: 5,
    tokenValue: 12500,
    typicalUsage: 2000,
    model: 'flash',
  },
  GENERATE_KEYWORDS: {
    key: 'GENERATE_KEYWORDS',
    name: 'Keyword Generation',
    nameHe: 'יצירת מילות מפתח',
    credits: 10,
    tokenValue: 25000,
    typicalUsage: 3000,
    model: 'flash',
  },
  FIND_COMPETITORS: {
    key: 'FIND_COMPETITORS',
    name: 'Find Competitors',
    nameHe: 'חיפוש מתחרים',
    credits: 15,
    tokenValue: 37500,
    typicalUsage: 5000,
    model: 'flash',
  },
  ANALYZE_WRITING_STYLE: {
    key: 'ANALYZE_WRITING_STYLE',
    name: 'Writing Style Analysis',
    nameHe: 'ניתוח סגנון כתיבה',
    credits: 5,
    tokenValue: 12500,
    typicalUsage: 2000,
    model: 'flash',
  },
  FETCH_ARTICLES: {
    key: 'FETCH_ARTICLES',
    name: 'Fetch Blog Articles',
    nameHe: 'שליפת מאמרים מבלוג',
    credits: 2,
    tokenValue: 5000,
    typicalUsage: 1000,
    model: 'flash',
  },
  DETECT_PLATFORM: {
    key: 'DETECT_PLATFORM',
    name: 'Platform Detection',
    nameHe: 'זיהוי פלטפורמה',
    credits: 2,
    tokenValue: 5000,
    typicalUsage: 1000,
    model: 'flash',
  },
  COMPLETE_INTERVIEW: {
    key: 'COMPLETE_INTERVIEW',
    name: 'Complete Interview Summary',
    nameHe: 'סיכום ראיון',
    credits: 5,
    tokenValue: 12500,
    typicalUsage: 2000,
    model: 'flash',
  },
  ENTITY_REFRESH: {
    key: 'ENTITY_REFRESH',
    name: 'Entity Data Refresh',
    nameHe: 'רענון נתוני תוכן',
    credits: 1,
    tokenValue: 2500,
    typicalUsage: 500,
    model: 'flash',
  },
  
  // Competitor Analysis operations
  COMPETITOR_SCAN: {
    key: 'COMPETITOR_SCAN',
    name: 'Competitor Page Scan',
    nameHe: 'סריקת עמוד מתחרה',
    credits: 5,
    tokenValue: 12500,
    typicalUsage: 2000,
    model: 'flash',
  },
  COMPETITOR_GAP_ANALYSIS: {
    key: 'COMPETITOR_GAP_ANALYSIS',
    name: 'Content Gap Analysis',
    nameHe: 'ניתוח פערי תוכן',
    credits: 25,
    tokenValue: 62500,
    typicalUsage: 10000,
    model: 'flash',
  },
  SKYSCRAPER_OUTLINE: {
    key: 'SKYSCRAPER_OUTLINE',
    name: 'Skyscraper Outline Generation',
    nameHe: 'יצירת מתווה Skyscraper',
    credits: 25,
    tokenValue: 62500,
    typicalUsage: 8000,
    model: 'flash',
  },
  
  // Generic fallback
  GENERIC: {
    key: 'GENERIC',
    name: 'Generic AI Operation',
    nameHe: 'פעולת AI כללית',
    credits: 1,
    tokenValue: 2500,
    typicalUsage: 500,
    model: 'flash',
  },
};

/**
 * Calculate credits cost from tokens
 * @param {number} tokens - Number of tokens used
 * @returns {number} Credits cost (rounded up)
 */
export function tokensToCredits(tokens) {
  return Math.ceil(tokens / TOKENS_PER_CREDIT);
}

/**
 * Calculate token value from credits
 * @param {number} credits - Number of credits
 * @returns {number} Token value
 */
export function creditsToTokens(credits) {
  return credits * TOKENS_PER_CREDIT;
}

/**
 * Get operation config by key
 * @param {string} operationKey - Operation key
 * @returns {Object} Operation config
 */
export function getOperationConfig(operationKey) {
  return AI_OPERATIONS[operationKey] || AI_OPERATIONS.GENERIC;
}

/**
 * Log AI usage to console with detailed information
 * @param {Object} options
 * @param {string} options.operation - Operation key
 * @param {number} options.inputTokens - Input tokens used
 * @param {number} options.outputTokens - Output tokens used
 * @param {number} options.totalTokens - Total tokens used
 * @param {string} options.model - Model used
 * @param {Object} options.metadata - Additional metadata
 */
export function logAIUsage({
  operation,
  inputTokens = 0,
  outputTokens = 0,
  totalTokens = 0,
  model = 'unknown',
  metadata = {},
}) {
  const operationConfig = getOperationConfig(operation);
  const total = totalTokens || (inputTokens + outputTokens);
  const actualCreditsUsed = tokensToCredits(total);
  const chargedCredits = operationConfig.credits;
  const profit = chargedCredits - actualCreditsUsed;
  const profitPercentage = actualCreditsUsed > 0 
    ? ((chargedCredits / actualCreditsUsed) * 100 - 100).toFixed(1) 
    : 0;

  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║                    🤖 AI OPERATION LOG                       ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log(`║ Operation:       ${operationConfig.name.padEnd(43)}║`);
  console.log(`║ Model:           ${model.padEnd(43)}║`);
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log('║ TOKEN USAGE                                                  ║');
  console.log(`║   Input Tokens:  ${String(inputTokens).padEnd(43)}║`);
  console.log(`║   Output Tokens: ${String(outputTokens).padEnd(43)}║`);
  console.log(`║   Total Tokens:  ${String(total).padEnd(43)}║`);
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log('║ CREDITS                                                      ║');
  console.log(`║   Charged to Customer: ${String(chargedCredits + ' credits').padEnd(37)}║`);
  console.log(`║   Actual Cost:         ${String(actualCreditsUsed + ' credits').padEnd(37)}║`);
  console.log(`║   Token Value:         ${String(creditsToTokens(chargedCredits) + ' tokens').padEnd(37)}║`);
  console.log(`║   Profit Margin:       ${String(profit + ' credits (' + profitPercentage + '%)').padEnd(37)}║`);
  console.log('╠══════════════════════════════════════════════════════════════╣');
  
  if (Object.keys(metadata).length > 0) {
    console.log('║ METADATA                                                     ║');
    for (const [key, value] of Object.entries(metadata)) {
      const valueStr = typeof value === 'object' ? JSON.stringify(value) : String(value);
      console.log(`║   ${key}: ${valueStr.substring(0, 50).padEnd(50)}║`);
    }
  }
  
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
  
  return {
    operation: operationConfig.key,
    inputTokens,
    outputTokens,
    totalTokens: total,
    chargedCredits,
    actualCreditsUsed,
    profit,
    profitPercentage,
    model,
    timestamp: new Date().toISOString(),
  };
}

const aiCredits = {
  TOKENS_PER_CREDIT,
  AI_OPERATIONS,
  tokensToCredits,
  creditsToTokens,
  getOperationConfig,
  logAIUsage,
};

export default aiCredits;

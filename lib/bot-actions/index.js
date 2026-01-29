/**
 * Bot Action Handlers Registry
 * 
 * Central registry for all bot action handlers.
 * Each handler receives:
 * - parameters: The validated parameters from AI
 * - context: { interviewId, userId, interview, prisma }
 * 
 * Each handler returns:
 * - { success: boolean, ...data } or { success: false, error: string }
 */

import { crawlWebsite } from './handlers/crawl-website';
import { saveField } from './handlers/save-field';
import { createSiteAccount } from './handlers/create-site-account';
import { updateSiteAccount } from './handlers/update-site-account';
import { fetchKeywords } from './handlers/fetch-keywords';
import { detectPlatform } from './handlers/detect-platform';
import { analyzeWritingStyle } from './handlers/analyze-writing-style';
import { analyzeCompetitors } from './handlers/analyze-competitors';
import { generateKeywords } from './handlers/generate-keywords';
import { findCompetitors } from './handlers/find-competitors';
import { fetchArticles } from './handlers/fetch-articles';
import { analyzeInternalLinks } from './handlers/analyze-internal-links';
import { completeInterview } from './handlers/complete-interview';

// Handler registry - maps handler names to functions
const handlers = {
  crawlWebsite,
  saveField,
  createSiteAccount,
  updateSiteAccount,
  fetchKeywords,
  detectPlatform,
  analyzeWritingStyle,
  analyzeCompetitors,
  generateKeywords,
  findCompetitors,
  fetchArticles,
  analyzeInternalLinks,
  completeInterview,
};

/**
 * Get a handler function by name
 */
export function getHandler(handlerName) {
  return handlers[handlerName] || null;
}

/**
 * Get all available handler names
 */
export function getAvailableHandlers() {
  return Object.keys(handlers);
}

/**
 * Check if a handler exists
 */
export function hasHandler(handlerName) {
  return handlerName in handlers;
}

export default handlers;

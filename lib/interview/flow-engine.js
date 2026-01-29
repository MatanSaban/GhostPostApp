/**
 * Interview Flow Engine
 * 
 * This module manages the interview flow logic including:
 * - Question ordering and navigation
 * - Conditional display of questions
 * - Dependencies between questions
 * - Auto-actions execution
 * - Progress tracking
 */

import prisma from '@/lib/prisma';
import { executeAction } from '@/lib/bot-actions/executor';
import { generateStructuredResponse } from '@/lib/ai/gemini';
import { z } from 'zod';

/**
 * Get the next question to display based on current state
 * 
 * @param {string} interviewId - The interview ID
 * @returns {Promise<Object|null>} Next question or null if complete
 */
export async function getNextQuestion(interviewId) {
  const interview = await prisma.userInterview.findUnique({
    where: { id: interviewId },
  });

  if (!interview || interview.status === 'COMPLETED') {
    return null;
  }

  const questions = await prisma.interviewQuestion.findMany({
    where: { isActive: true },
    orderBy: { order: 'asc' },
  });

  const currentIndex = interview.currentStep || 0;
  
  // Find next valid question
  for (let i = currentIndex; i < questions.length; i++) {
    const question = questions[i];
    
    // Check if question should be shown
    if (await shouldShowQuestion(question, interview.responses || {})) {
      return question;
    }
  }

  return null; // No more questions
}

/**
 * Check if a question should be displayed based on conditions
 * 
 * @param {Object} question - The question to check
 * @param {Object} responses - Current interview responses
 * @returns {Promise<boolean>}
 */
export async function shouldShowQuestion(question, responses) {
  // Check dependency first
  if (question.dependsOn) {
    const dependentResponse = responses[question.dependsOn];
    if (dependentResponse === undefined || dependentResponse === null) {
      return false;
    }
  }

  // Check show condition
  if (question.showCondition) {
    try {
      const condition = typeof question.showCondition === 'string' 
        ? JSON.parse(question.showCondition) 
        : question.showCondition;
      
      return evaluateCondition(condition, responses);
    } catch (e) {
      console.error('Error evaluating show condition:', e);
      return true; // Default to showing if condition is invalid
    }
  }

  return true;
}

/**
 * Evaluate a condition against responses
 * 
 * @param {Object} condition - The condition to evaluate
 * @param {Object} responses - Current responses
 * @returns {boolean}
 */
export function evaluateCondition(condition, responses) {
  if (!condition || !condition.field) {
    return true;
  }

  const fieldValue = responses[condition.field];
  const { operator, value } = condition;

  switch (operator) {
    case 'equals':
      return fieldValue === value;
    
    case 'notEquals':
      return fieldValue !== value;
    
    case 'contains':
      if (Array.isArray(fieldValue)) {
        return fieldValue.includes(value);
      }
      return String(fieldValue).includes(value);
    
    case 'notContains':
      if (Array.isArray(fieldValue)) {
        return !fieldValue.includes(value);
      }
      return !String(fieldValue).includes(value);
    
    case 'exists':
      return fieldValue !== null && fieldValue !== undefined && fieldValue !== '';
    
    case 'notExists':
      return fieldValue === null || fieldValue === undefined || fieldValue === '';
    
    case 'greaterThan':
      return Number(fieldValue) > Number(value);
    
    case 'lessThan':
      return Number(fieldValue) < Number(value);
    
    case 'greaterThanOrEqual':
      return Number(fieldValue) >= Number(value);
    
    case 'lessThanOrEqual':
      return Number(fieldValue) <= Number(value);
    
    case 'in':
      if (Array.isArray(value)) {
        return value.includes(fieldValue);
      }
      return false;
    
    case 'notIn':
      if (Array.isArray(value)) {
        return !value.includes(fieldValue);
      }
      return true;
    
    case 'and':
      if (Array.isArray(condition.conditions)) {
        return condition.conditions.every(c => evaluateCondition(c, responses));
      }
      return true;
    
    case 'or':
      if (Array.isArray(condition.conditions)) {
        return condition.conditions.some(c => evaluateCondition(c, responses));
      }
      return false;
    
    default:
      console.warn(`Unknown condition operator: ${operator}`);
      return true;
  }
}

/**
 * Execute auto-actions for a question
 * 
 * @param {Object} question - The question with auto-actions
 * @param {Object} context - Execution context
 * @returns {Promise<Object>} Results of all auto-actions
 */
export async function executeAutoActions(question, context) {
  if (!question.autoActions || question.autoActions.length === 0) {
    return {};
  }

  const results = {};

  for (const autoAction of question.autoActions) {
    // Extract action name - autoAction can be a string or an object with { action, triggerOn }
    const actionName = typeof autoAction === 'string' ? autoAction : autoAction.action;
    const triggerOn = typeof autoAction === 'object' ? autoAction.triggerOn : 'submit';
    
    // Skip if trigger condition doesn't match (default to 'submit')
    if (context.trigger && triggerOn !== context.trigger) {
      continue;
    }
    
    try {
      // Extract the response for this question
      // Use saveToField if available, otherwise use question ID
      const responseKey = question.saveToField || question.id;
      const questionResponse = context.responses?.[responseKey] || context.responses?.[question.id];
      
      // Build params from the current question's response
      // The handler can use params.url or context.responses.websiteUrl
      const params = {
        url: questionResponse, // Pass the response directly as URL for CRAWL_WEBSITE
        response: questionResponse,
      };
      
      console.log(`[Flow Engine] Executing auto-action: ${actionName}`, { params, responseKey });
      
      const result = await executeAction(actionName, params, context);
      results[actionName] = {
        success: result.success,
        result: result.data || result.result,
        error: result.error,
      };
      
      console.log(`[Flow Engine] Auto-action result:`, results[actionName]);
    } catch (error) {
      console.error(`Error executing auto-action ${actionName}:`, error);
      results[actionName] = {
        success: false,
        error: error.message,
      };
    }
  }

  return results;
}

/**
 * Calculate interview progress
 * 
 * @param {string} interviewId - The interview ID
 * @returns {Promise<Object>} Progress information
 */
export async function getInterviewProgress(interviewId) {
  const interview = await prisma.userInterview.findUnique({
    where: { id: interviewId },
  });

  if (!interview) {
    return { total: 0, completed: 0, percentage: 0 };
  }

  const questions = await prisma.interviewQuestion.findMany({
    where: { isActive: true },
  });

  const responses = interview.responses || {};
  
  // Count visible questions and answered questions
  let visibleCount = 0;
  let answeredCount = 0;

  for (const question of questions) {
    if (await shouldShowQuestion(question, responses)) {
      visibleCount++;
      
      const responseKey = question.saveToField || question.id;
      if (responses[responseKey] !== undefined && responses[responseKey] !== null) {
        answeredCount++;
      }
    }
  }

  return {
    total: visibleCount,
    completed: answeredCount,
    percentage: visibleCount > 0 ? Math.round((answeredCount / visibleCount) * 100) : 0,
    isComplete: interview.status === 'COMPLETED',
  };
}

/**
 * Try to guess what URL the user meant from their input
 * Uses AI to interpret business names, typos, or partial URLs
 * 
 * @param {string} userInput - The user's input that doesn't look like a valid URL
 * @returns {Promise<Object>} Result with success flag and suggested URL
 */
async function guessUrlFromUserInput(userInput) {
  // Skip if input is too short or looks like gibberish
  if (!userInput || userInput.length < 2) {
    return { success: false, url: null };
  }
  
  // Common quick fixes without AI
  const quickFixes = [
    // Missing dot before TLD
    { pattern: /^([a-zA-Z0-9-]+)(com|co\.il|org|net|io|dev)$/i, fix: (m) => `${m[1]}.${m[2]}` },
    // Space instead of dot
    { pattern: /^([a-zA-Z0-9-]+)\s+(com|co\.il|org|net|io|dev)$/i, fix: (m) => `${m[1]}.${m[2]}` },
    // Common typos
    { pattern: /^([a-zA-Z0-9-]+)\.(con|cpm|ocm)$/i, fix: (m) => `${m[1]}.com` },
    { pattern: /^([a-zA-Z0-9-]+)\.(co\.il|coil)$/i, fix: (m) => `${m[1]}.co.il` },
  ];
  
  for (const { pattern, fix } of quickFixes) {
    const match = userInput.match(pattern);
    if (match) {
      return { success: true, url: fix(match) };
    }
  }
  
  try {
    const schema = z.object({
      isValidWebsite: z.boolean().describe('True if this looks like a business name or website reference'),
      suggestedUrl: z.string().nullable().describe('The most likely website URL in format: domain.tld (e.g., example.com, example.co.il). Return null if cannot determine.'),
      confidence: z.enum(['high', 'medium', 'low']).describe('Confidence level in the suggestion'),
    });
    
    const result = await generateStructuredResponse({
      system: 'You help users enter correct website URLs. Given unclear input, guess what website they meant. For Israeli businesses, prefer .co.il domains. Be conservative - only suggest if reasonably confident.',
      prompt: `The user tried to enter a website URL but typed: "${userInput}"

This doesn't look like a valid URL. Try to guess what they meant:
- If it's a business name, guess the likely domain (e.g., "red ghost" → "red-ghost.co.il" or "redghost.com")
- If it's a typo, fix it (e.g., "gogle.com" → "google.com")
- If it has spaces, convert to valid domain format
- If it's in Hebrew, try to find the English domain name or transliterate

Only suggest a URL if you're reasonably confident. If the input is gibberish or unclear, return null.`,
      schema,
      temperature: 0.2,
    });
    
    console.log('[URL Guess] AI result for input:', userInput, '→', result);
    
    if (result.suggestedUrl && result.confidence !== 'low') {
      // Clean up the suggestion
      let url = result.suggestedUrl.trim().toLowerCase();
      url = url.replace(/^https?:\/\//, '').replace(/^www\./, '');
      
      // Validate the suggestion looks like a domain
      if (/^[a-z0-9][a-z0-9-]*[a-z0-9]?\.[a-z]{2,}(\.[a-z]{2,})?$/.test(url)) {
        return { success: true, url };
      }
    }
    
    return { success: false, url: null };
  } catch (error) {
    console.log('[URL Guess] AI error:', error.message);
    return { success: false, url: null };
  }
}

/**
 * Validate a response against question validation rules
 * 
 * @param {Object} question - The question with validation rules
 * @param {any} response - The response to validate
 * @returns {Object} Validation result with isValid and error
 */
export async function validateResponse(question, response) {
  const validation = question.validation || {};

  // Required check
  if (validation.required) {
    if (response === null || response === undefined || response === '') {
      return {
        isValid: false,
        error: validation.errorMessage || 'This field is required',
      };
    }
    
    if (Array.isArray(response) && response.length === 0) {
      return {
        isValid: false,
        error: validation.errorMessage || 'Please select at least one option',
      };
    }
  }

  // String validations
  if (typeof response === 'string') {
    // Min length
    if (validation.minLength && response.length < validation.minLength) {
      return {
        isValid: false,
        error: validation.errorMessage || `Minimum length is ${validation.minLength} characters`,
      };
    }

    // Max length
    if (validation.maxLength && response.length > validation.maxLength) {
      return {
        isValid: false,
        error: validation.errorMessage || `Maximum length is ${validation.maxLength} characters`,
      };
    }

    // Pattern validation - skip for URL input types since we'll handle URL fixing later
    if (validation.pattern && question.inputConfig?.inputType !== 'url') {
      try {
        const regex = new RegExp(validation.pattern);
        if (!regex.test(response)) {
          return {
            isValid: false,
            error: validation.errorMessage || 'Invalid format',
          };
        }
      } catch (e) {
        console.error('Invalid validation pattern:', e);
      }
    }

    // Email validation
    if (validation.email || question.inputConfig?.inputType === 'email') {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(response)) {
        return {
          isValid: false,
          error: validation.errorMessage || 'Invalid email address',
        };
      }
    }

    // URL validation - be lenient here, allow domain-like strings
    // The crawl function will fix and validate the URL properly
    if (validation.url || question.inputConfig?.inputType === 'url') {
      // Check if it looks like a URL or domain (has at least one dot and some text)
      const looksLikeUrl = /^(https?:\/\/)?[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)+/.test(response.trim());
      if (!looksLikeUrl) {
        // Try AI to guess what the user meant
        const aiGuess = await guessUrlFromUserInput(response.trim());
        if (aiGuess.success && aiGuess.url) {
          return {
            isValid: false,
            error: `Did you mean: ${aiGuess.url}?`,
            suggestion: aiGuess.url,
            canAutoCorrect: true,
          };
        }
        return {
          isValid: false,
          error: "Please enter a valid website address (e.g., example.com or https://example.com)",
        };
      }
    }
  }

  // Number validations
  if (typeof response === 'number' || question.inputConfig?.inputType === 'number') {
    const numValue = Number(response);
    
    if (validation.min !== undefined && numValue < validation.min) {
      return {
        isValid: false,
        error: validation.errorMessage || `Minimum value is ${validation.min}`,
      };
    }

    if (validation.max !== undefined && numValue > validation.max) {
      return {
        isValid: false,
        error: validation.errorMessage || `Maximum value is ${validation.max}`,
      };
    }
  }

  // Array validations
  if (Array.isArray(response)) {
    const config = question.inputConfig || {};
    
    if (config.minSelect && response.length < config.minSelect) {
      return {
        isValid: false,
        error: validation.errorMessage || `Select at least ${config.minSelect} options`,
      };
    }

    if (config.maxSelect && response.length > config.maxSelect) {
      return {
        isValid: false,
        error: validation.errorMessage || `Select at most ${config.maxSelect} options`,
      };
    }
  }

  return { isValid: true, error: null };
}

/**
 * Get dynamic options for a DYNAMIC question type
 * 
 * @param {Object} question - The dynamic question
 * @param {Object} context - Execution context
 * @returns {Promise<any>} Dynamic data from source action
 */
export async function getDynamicQuestionData(question, context) {
  const config = question.inputConfig || {};
  
  if (!config.sourceAction) {
    return null;
  }

  try {
    const result = await executeAction(config.sourceAction, {}, context);
    if (result.success) {
      return result.result;
    }
  } catch (error) {
    console.error('Error getting dynamic question data:', error);
  }

  return null;
}

/**
 * Complete an interview and trigger completion actions
 * 
 * @param {string} interviewId - The interview ID
 * @param {Object} context - Execution context
 * @returns {Promise<Object>} Completion result
 */
export async function completeInterview(interviewId, context) {
  const interview = await prisma.userInterview.update({
    where: { id: interviewId },
    data: {
      status: 'COMPLETED',
      completedAt: new Date(),
    },
  });

  // Execute COMPLETE_INTERVIEW action if available
  try {
    await executeAction('COMPLETE_INTERVIEW', { interviewId }, context);
  } catch (error) {
    console.error('Error executing complete interview action:', error);
  }

  return interview;
}

/**
 * Build interview summary from responses
 * 
 * @param {string} interviewId - The interview ID
 * @returns {Promise<Object>} Summary of all responses
 */
export async function getInterviewSummary(interviewId) {
  const interview = await prisma.userInterview.findUnique({
    where: { id: interviewId },
    include: {
      user: {
        select: { id: true, email: true, name: true },
      },
    },
  });

  if (!interview) {
    return null;
  }

  const questions = await prisma.interviewQuestion.findMany({
    where: { isActive: true },
    orderBy: { order: 'asc' },
  });

  const summary = {
    interview: {
      id: interview.id,
      status: interview.status,
      startedAt: interview.createdAt,
      completedAt: interview.completedAt,
    },
    user: interview.user,
    responses: {},
    externalData: interview.externalData,
  };

  // Map responses to questions
  for (const question of questions) {
    const responseKey = question.saveToField || question.id;
    const response = interview.responses?.[responseKey];
    
    if (response !== undefined) {
      summary.responses[question.translationKey] = {
        questionType: question.questionType,
        value: response,
        savedAs: question.saveToField || null,
      };
    }
  }

  return summary;
}

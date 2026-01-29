/**
 * URL Validation Function
 * 
 * Uses AI to validate and fix user-entered URLs.
 * Handles typos, missing protocols, and common mistakes.
 */

import { generateStructuredResponse } from '@/lib/ai/gemini.js';
import { z } from 'zod';

/**
 * Validate and fix a URL using AI
 * 
 * @param {string} userInput - The raw user input (could be URL, domain, or typo)
 * @returns {Promise<Object>} Validation result with fixed URL if applicable
 */
export async function validateAndFixUrl(userInput) {
  if (!userInput || typeof userInput !== 'string') {
    return {
      isValid: false,
      originalInput: userInput,
      fixedUrl: null,
      error: 'No input provided',
      needsConfirmation: false,
    };
  }

  const trimmedInput = userInput.trim();
  
  // First, try quick validation for obvious valid URLs
  const quickValidation = quickUrlValidation(trimmedInput);
  if (quickValidation.isValid) {
    console.log('[URL Validator] Quick validation passed:', quickValidation.url);
    return {
      isValid: true,
      originalInput: userInput,
      fixedUrl: quickValidation.url,
      error: null,
      needsConfirmation: false,
      wasFixed: quickValidation.wasFixed,
    };
  }

  // If quick validation failed, use AI to analyze and potentially fix
  console.log('[URL Validator] Quick validation failed, using AI...');
  
  const schema = z.object({
    isValidUrl: z.boolean().describe('Whether the input appears to be a valid website URL or can be fixed to one'),
    fixedUrl: z.string().nullable().describe('The corrected URL with proper format (https://domain.com), or null if not fixable'),
    confidence: z.number().min(0).max(100).describe('Confidence score 0-100 that the fix is correct'),
    issues: z.array(z.string()).describe('List of issues found with the input'),
    suggestedAction: z.enum(['use_fixed', 'ask_user', 'reject']).describe('What action to take'),
    explanation: z.string().describe('Brief explanation for the user'),
  });

  const prompt = `Analyze this website URL input from a user and determine if it's valid or can be fixed.

User input: "${trimmedInput}"

Common issues to check:
1. Missing protocol (http:// or https://)
2. Typos in common domains (googel -> google, gmial -> gmail)
3. Wrong TLD (like .con instead of .com)
4. Extra spaces or special characters
5. Just a company name without domain (e.g., "my company" instead of "mycompany.com")
6. Invalid format (e.g., "website dot com")

If the input looks like a website URL or domain name, fix it to the proper format: https://domain.com
If it's just a company name or unclear text, set isValidUrl to false.

Examples:
- "google.com" -> "https://google.com" (add protocol)
- "https://www.example.com" -> "https://www.example.com" (already valid)
- "www.test.com" -> "https://www.test.com" (add protocol)
- "googel.com" -> "https://google.com" (fix typo, but low confidence)
- "my website" -> null (not a URL)
- "example.con" -> "https://example.com" (fix TLD typo)`;

  try {
    const result = await generateStructuredResponse({
      system: 'You are a URL validation expert. Analyze user inputs and determine if they are valid URLs or can be corrected. Be helpful and try to fix common mistakes.',
      prompt,
      schema,
      temperature: 0.2, // Low temperature for consistent results
    });

    console.log('[URL Validator] AI result:', result);

    // Validate the AI-suggested URL with our own validation
    if (result.fixedUrl) {
      const aiUrlValidation = quickUrlValidation(result.fixedUrl);
      if (!aiUrlValidation.isValid) {
        // AI suggested URL failed our validation
        return {
          isValid: false,
          originalInput: userInput,
          fixedUrl: null,
          error: result.explanation || 'Could not parse as a valid URL',
          needsConfirmation: false,
        };
      }
    }

    // Determine if we need user confirmation
    const needsConfirmation = result.suggestedAction === 'ask_user' || 
      (result.confidence < 80 && result.fixedUrl !== trimmedInput);

    return {
      isValid: result.isValidUrl && result.fixedUrl !== null,
      originalInput: userInput,
      fixedUrl: result.fixedUrl,
      confidence: result.confidence,
      issues: result.issues,
      error: result.isValidUrl ? null : result.explanation,
      needsConfirmation,
      explanation: result.explanation,
      wasFixed: result.fixedUrl !== trimmedInput && result.fixedUrl !== `https://${trimmedInput}`,
    };
  } catch (error) {
    console.error('[URL Validator] AI error:', error);
    
    // Fallback: Try to fix common issues without AI
    const fallbackResult = fallbackUrlFix(trimmedInput);
    if (fallbackResult.isValid) {
      return {
        isValid: true,
        originalInput: userInput,
        fixedUrl: fallbackResult.url,
        error: null,
        needsConfirmation: false,
        wasFixed: fallbackResult.wasFixed,
      };
    }
    
    // Determine if it looks like gibberish or a real attempt at a URL
    const looksLikeUrl = /[a-zA-Z0-9]+\.[a-zA-Z]{2,}/.test(trimmedInput);
    const hasExcessiveSpecialChars = /[!@#$%^&*()+=\[\]{}|\\:;"'<>,?]+/.test(trimmedInput);
    
    let errorMessage;
    if (hasExcessiveSpecialChars || !looksLikeUrl) {
      // Gibberish input
      errorMessage = "I couldn't recognize that as a website address. Please enter a valid URL like example.com or https://example.com";
    } else {
      // Looks like a URL attempt but couldn't validate
      errorMessage = "I couldn't validate that website address. Please make sure it's in the format: example.com or https://example.com";
    }
    
    return {
      isValid: false,
      originalInput: userInput,
      fixedUrl: null,
      error: errorMessage,
      needsConfirmation: false,
    };
  }
}

/**
 * Fallback URL fix without AI - handles common simple cases
 * 
 * @param {string} input - The input to try to fix
 * @returns {Object} Fix result
 */
function fallbackUrlFix(input) {
  let url = input.trim().toLowerCase();
  
  // Remove leading/trailing special characters
  url = url.replace(/^[^a-zA-Z0-9]+/, '').replace(/[^a-zA-Z0-9\/]+$/, '');
  
  // If it has a protocol, extract and validate
  if (url.startsWith('http://') || url.startsWith('https://')) {
    try {
      const parsed = new URL(url);
      if (parsed.hostname.includes('.')) {
        return { isValid: true, url: parsed.href, wasFixed: input !== parsed.href };
      }
    } catch {
      // Continue with other fixes
    }
  }
  
  // Remove accidental protocol typos
  url = url.replace(/^https?:?\/?\/?\/?/i, '');
  url = url.replace(/^www\./i, '');
  
  // Check if it looks like a domain now
  const domainPattern = /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)+$/;
  if (domainPattern.test(url)) {
    const finalUrl = `https://${url}`;
    try {
      new URL(finalUrl);
      return { isValid: true, url: finalUrl, wasFixed: true };
    } catch {
      return { isValid: false };
    }
  }
  
  return { isValid: false };
}

/**
 * Quick URL validation without AI for obvious cases
 * 
 * @param {string} input - The input to validate
 * @returns {Object} Quick validation result
 */
function quickUrlValidation(input) {
  let url = input.trim();
  let wasFixed = false;
  const originalInput = input;

  // Check if input already has protocol
  if (url.startsWith('http://') || url.startsWith('https://')) {
    try {
      const parsed = new URL(url);
      // Ensure it has a valid hostname with TLD
      if (parsed.hostname.includes('.') && parsed.hostname.split('.').pop().length >= 2) {
        return { isValid: true, url: url, wasFixed: false };
      }
    } catch {
      return { isValid: false };
    }
  }

  // Remove www. prefix if present (but not protocol)
  let cleanUrl = url.replace(/^www\./i, '');
  
  // Check if it looks like a domain - support multi-level TLDs like .co.il, .com.br
  // Pattern: domain-name.tld or domain-name.second-level.tld
  const domainPattern = /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)+$/;
  const pathPattern = /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)+(\/.*)?$/;
  
  if (domainPattern.test(cleanUrl) || pathPattern.test(cleanUrl)) {
    // It's a valid domain, add https://
    const finalUrl = `https://${cleanUrl}`;
    wasFixed = originalInput !== finalUrl;
    
    try {
      new URL(finalUrl); // Final validation
      return { isValid: true, url: finalUrl, wasFixed };
    } catch {
      return { isValid: false };
    }
  }

  return { isValid: false };
}

/**
 * Check if a URL is reachable
 * 
 * @param {string} url - The URL to check
 * @returns {Promise<Object>} Reachability result
 */
export async function checkUrlReachable(url) {
  try {
    const response = await fetch(url, {
      method: 'HEAD',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; GhostPostBot/1.0)',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });

    return {
      reachable: true,
      statusCode: response.status,
      finalUrl: response.url, // After redirects
      redirected: response.redirected,
    };
  } catch (error) {
    return {
      reachable: false,
      error: error.message,
    };
  }
}

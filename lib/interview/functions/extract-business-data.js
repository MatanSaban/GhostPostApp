/**
 * AI-powered Business Data Extraction
 * 
 * Uses AI to extract structured business information from crawled website HTML.
 * Validates and normalizes data (phone numbers, emails, etc.)
 * Falls back gracefully when AI is unavailable.
 */

import { generateStructuredResponse } from '@/lib/ai/gemini.js';
import { z } from 'zod';

/**
 * Extract business data from multiple pages using AI
 * 
 * @param {Object} pagesData - Object containing HTML from different pages
 * @param {string} pagesData.homeHtml - Homepage HTML
 * @param {string} pagesData.aboutHtml - About page HTML (optional)
 * @param {string} pagesData.contactHtml - Contact page HTML (optional)
 * @param {string} url - The website URL
 * @param {Object} basicPageData - Basic extracted page data (title, description, etc.)
 * @returns {Promise<Object>} Extracted business data
 */
export async function extractBusinessDataWithAI(pagesData, url, basicPageData) {
  const homeHtml = typeof pagesData === 'string' ? pagesData : pagesData.homeHtml;
  const aboutHtml = pagesData.aboutHtml || '';
  const contactHtml = pagesData.contactHtml || '';
  
  if (!homeHtml || homeHtml.length < 100) {
    return {
      success: false,
      error: 'Insufficient HTML content',
      data: null,
    };
  }

  // Extract text content from all pages for AI analysis
  const homeText = extractTextContent(homeHtml);
  const aboutText = extractTextContent(aboutHtml);
  const contactText = extractTextContent(contactHtml);
  
  // Combine all text content
  const combinedText = [
    '--- HOMEPAGE ---',
    homeText.substring(0, 5000),
    aboutText ? '\n--- ABOUT PAGE ---\n' + aboutText.substring(0, 3000) : '',
    contactText ? '\n--- CONTACT PAGE ---\n' + contactText.substring(0, 2000) : '',
  ].filter(Boolean).join('\n');
  
  // If total text content is too short, skip AI
  if (combinedText.length < 100) {
    return {
      success: false,
      error: 'Insufficient text content',
      data: null,
    };
  }

  // Detect the primary language from the content
  const detectedLang = detectPrimaryLanguage(combinedText);
  const languageInstruction = getLanguageInstruction(detectedLang);

  const schema = z.object({
    businessName: z.string().describe('The ACTUAL business/company name only. NOT the page title. Extract just the business name without taglines or extra text.'),
    description: z.string().describe(`A comprehensive description of what the business does, their services, and value proposition (2-4 sentences). Write this as a proper "About Us" text. IMPORTANT: Write this description in ${languageInstruction}.`),
    category: z.string().describe(`The main business category/industry (e.g., "Web Development", "Restaurant", "Law Firm", "Marketing Agency", "Retail", "Healthcare"). Write in ${languageInstruction}.`),
    detectedLanguage: z.string().describe('The primary language code of the website (e.g., "he" for Hebrew, "en" for English, "es" for Spanish, etc.)'),
    address: z.string().nullable().describe('Full physical business address if found anywhere on the pages, or null if not available'),
    phone: z.string().nullable().describe('Primary contact phone number (digits only, no formatting) if found, or null'),
    email: z.string().nullable().describe('Primary contact email if found, or null'),
    servicesOrProducts: z.array(z.string()).describe(`List of main services or products offered (max 5 items). Write in ${languageInstruction}.`),
    targetAudience: z.string().nullable().describe(`Brief description of target audience/customers. Write in ${languageInstruction}.`),
  });

  const prompt = `You are a business analyst AI. Analyze this website content and extract accurate business information.

Website URL: ${url}
Page Title: ${basicPageData?.title || 'Unknown'}
Meta Description: ${basicPageData?.description || 'Not available'}
Detected Language Hint: ${detectedLang}

${combinedText}

CRITICAL INSTRUCTIONS:

**LANGUAGE**: First, detect the primary language of the website content. Then write ALL text fields (description, category, servicesOrProducts, targetAudience) in that same language. For example, if the website is in Hebrew, write the description in Hebrew.

1. **businessName**: Extract ONLY the actual company/business name. 
   - Example: For title "חברה לבניית אתרים ופיתוח מערכות מתקדמות | Red Ghost", the business name is just "Red Ghost"
   - Strip out taglines, descriptions, page types (Home, About, etc.)
   - Look for the brand name, logo text, or footer company name

2. **description**: Write a proper "About Us" paragraph based on the content.
   - Don't just copy the meta description
   - Summarize what the business does, their expertise, and value
   - Make it sound professional and informative (2-4 sentences)
   - If about page content is available, use it as the primary source
   - **WRITE IN THE SAME LANGUAGE AS THE WEBSITE (${languageInstruction})**

3. **detectedLanguage**: Return the language code (e.g., "he", "en", "es", "fr", etc.)

4. **category**: Choose ONE specific main category that best describes the business
   - Be specific (e.g., "Web Development Agency" not just "Technology")
   - **WRITE IN THE SAME LANGUAGE AS THE WEBSITE**

5. **address**: Look for street addresses, city names, zip codes
   - Check the contact page and footer areas
   - Format as a complete address string

6. **phone**: Extract the PRIMARY phone number
   - Return ONLY digits (e.g., "0527984133" not "052-798-4133")
   - Prefer main business line over individual contacts

7. **email**: Extract the PRIMARY business email
   - Prefer info@ or contact@ emails over personal emails

8. **servicesOrProducts**: List main offerings (max 5) - **IN THE WEBSITE'S LANGUAGE**

CRITICAL: Only extract contact information (email, phone, address) that ACTUALLY EXISTS in the provided text. DO NOT invent or guess any contact data. If you cannot find it, return null.`;

  try {
    const result = await generateStructuredResponse({
      system: `You are a business analyst AI that extracts accurate, structured business information from website content. Be precise and thorough. For the business name, extract ONLY the actual company name, not taglines or page titles. IMPORTANT: Write all descriptive text in the same language as the website content. CRITICAL: Never invent or hallucinate contact information - only extract what actually exists in the content.`,
      prompt,
      schema,
      temperature: 0.1, // Lower temperature for more consistent extraction
    });

    console.log('[ExtractBusinessData] AI extraction result:', result);

    // Validate and normalize the extracted data
    // For email/phone - verify they actually exist in the source HTML to prevent hallucination
    const allHtml = (homeHtml + aboutHtml + contactHtml).toLowerCase();
    
    let validatedEmail = validateEmail(result.email);
    if (validatedEmail && !allHtml.includes(validatedEmail.toLowerCase())) {
      console.log('[ExtractBusinessData] AI email NOT found in HTML, discarding:', validatedEmail);
      validatedEmail = null;
    }
    
    let validatedPhone = normalizePhoneNumber(result.phone);
    if (validatedPhone && !allHtml.includes(validatedPhone.substring(0, 7))) {
      console.log('[ExtractBusinessData] AI phone NOT found in HTML, discarding:', validatedPhone);
      validatedPhone = null;
    }
    
    let normalizedData = {
      businessName: result.businessName?.trim() || null,
      description: result.description?.trim() || null,
      category: result.category?.trim() || null,
      detectedLanguage: result.detectedLanguage?.trim() || detectedLang,
      address: result.address?.trim() || null,
      phone: validatedPhone,
      email: validatedEmail,
      servicesOrProducts: result.servicesOrProducts || [],
      targetAudience: result.targetAudience?.trim() || null,
    };

    // Fallback chain for missing contact info
    if (!normalizedData.email || !normalizedData.phone || !normalizedData.address) {
      console.log('[ExtractBusinessData] Missing contact info, trying fallback extraction...');
      const fallbackContact = await extractContactInfoWithFallback(
        contactHtml || homeHtml,
        url,
        {
          needEmail: !normalizedData.email,
          needPhone: !normalizedData.phone,
          needAddress: !normalizedData.address,
        }
      );
      
      // Merge fallback results
      normalizedData = {
        ...normalizedData,
        email: normalizedData.email || fallbackContact.email,
        phone: normalizedData.phone || fallbackContact.phone,
        address: normalizedData.address || fallbackContact.address,
      };
      console.log('[ExtractBusinessData] After fallback:', { 
        email: normalizedData.email, 
        phone: normalizedData.phone, 
        address: normalizedData.address 
      });
    }

    return {
      success: true,
      data: normalizedData,
    };
  } catch (error) {
    console.error('[ExtractBusinessData] AI extraction error:', error);
    
    // Fallback: Try to extract basic data without AI
    console.log('[ExtractBusinessData] Using fallback extraction...');
    let fallbackData = extractFallbackBusinessData(homeHtml, basicPageData, detectedLang);
    
    // Also try fallback contact extraction from contact page
    if (!fallbackData.email || !fallbackData.phone || !fallbackData.address) {
      console.log('[ExtractBusinessData] Trying contact fallback from contact page...');
      const contactFallback = await extractContactInfoWithFallback(
        contactHtml || homeHtml,
        url,
        {
          needEmail: !fallbackData.email,
          needPhone: !fallbackData.phone,
          needAddress: !fallbackData.address,
        }
      );
      fallbackData = {
        ...fallbackData,
        email: fallbackData.email || contactFallback.email,
        phone: fallbackData.phone || contactFallback.phone,
        address: fallbackData.address || contactFallback.address,
      };
    }
    
    console.log('[ExtractBusinessData] Fallback data:', fallbackData);
    
    return {
      success: false,
      error: error.message,
      data: fallbackData,
    };
  }
}

/**
 * Normalize phone number to digits only
 * Handles formats like: 052-798-4133, +972-52-798-4133, (052) 798-4133
 * 
 * @param {string|null} phone - Raw phone number
 * @returns {string|null} Normalized phone (digits only) or null
 */
export function normalizePhoneNumber(phone) {
  if (!phone) return null;
  
  // Remove all non-digit characters
  let normalized = phone.replace(/\D/g, '');
  
  // Handle Israeli numbers with country code
  if (normalized.startsWith('972')) {
    normalized = '0' + normalized.substring(3);
  }
  
  // Validate length (Israeli mobile: 10 digits, landline: 9 digits)
  if (normalized.length < 9 || normalized.length > 15) {
    return null;
  }
  
  return normalized;
}

/**
 * Validate email format
 * 
 * @param {string|null} email - Email to validate
 * @returns {string|null} Valid email or null
 */
export function validateEmail(email) {
  if (!email) return null;
  
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  const trimmed = email.trim().toLowerCase();
  
  return emailRegex.test(trimmed) ? trimmed : null;
}

/**
 * Extract clean text content from HTML
 * 
 * @param {string} html - Raw HTML content
 * @returns {string} Clean text content
 */
function extractTextContent(html) {
  if (!html) return '';
  
  return html
    // Remove script and style blocks
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    // Remove HTML comments
    .replace(/<!--[\s\S]*?-->/g, '')
    // Remove SVG content
    .replace(/<svg[^>]*>[\s\S]*?<\/svg>/gi, '')
    // Remove noscript
    .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '')
    // Replace HTML tags with spaces
    .replace(/<[^>]+>/g, ' ')
    // Decode common HTML entities
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lrm;/g, '')
    .replace(/&rlm;/g, '')
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Fallback chain for extracting contact info when AI misses it
 * 
 * Strategy:
 * 1. Try regex extraction from HTML
 * 2. If still missing, try dedicated AI call for contact page
 * 
 * @param {string} html - Page HTML (preferably contact page)
 * @param {string} url - Website URL
 * @param {Object} needs - What info is needed
 * @returns {Promise<Object>} Extracted contact info
 */
async function extractContactInfoWithFallback(html, url, needs) {
  const result = { email: null, phone: null, address: null };
  
  if (!html) return result;
  
  console.log('[ContactFallback] Starting fallback extraction. Needs:', needs);
  
  // Step 1: Try regex extraction from HTML
  console.log('[ContactFallback] Step 1: Regex extraction...');
  
  if (needs.needEmail) {
    const emails = extractEmailsFromHtml(html);
    // Filter out common non-business emails
    const businessEmails = emails.filter(e => {
      const lower = e.toLowerCase();
      return !lower.includes('noreply') && 
             !lower.includes('no-reply') &&
             !lower.includes('example.com') &&
             !lower.includes('wixpress.com') &&
             !lower.includes('wordpress.com');
    });
    if (businessEmails.length > 0) {
      // Prefer info@, contact@, office@ emails
      const priorityEmail = businessEmails.find(e => 
        e.toLowerCase().startsWith('info@') || 
        e.toLowerCase().startsWith('contact@') ||
        e.toLowerCase().startsWith('office@')
      ) || businessEmails[0];
      result.email = validateEmail(priorityEmail);
      console.log('[ContactFallback] Found email via regex:', result.email);
    }
  }
  
  if (needs.needPhone) {
    const phones = extractPhonesFromHtml(html);
    if (phones.length > 0) {
      result.phone = normalizePhoneNumber(phones[0]);
      console.log('[ContactFallback] Found phone via regex:', result.phone);
    }
  }
  
  if (needs.needAddress) {
    const address = extractAddressFromHtml(html);
    if (address) {
      result.address = address;
      console.log('[ContactFallback] Found address via regex:', result.address);
    }
  }
  
  // Step 2: If still missing items, try dedicated AI call for contact extraction
  const stillNeedsEmail = needs.needEmail && !result.email;
  const stillNeedsPhone = needs.needPhone && !result.phone;
  const stillNeedsAddress = needs.needAddress && !result.address;
  
  if (stillNeedsEmail || stillNeedsPhone || stillNeedsAddress) {
    console.log('[ContactFallback] Step 2: Dedicated AI extraction for contact info...');
    
    try {
      const contactSchema = z.object({
        email: z.string().nullable().describe('Primary business contact email (e.g., info@, contact@, office@). Look for mailto: links and email patterns.'),
        phone: z.string().nullable().describe('Primary business phone number (digits only). Look for tel: links and phone patterns.'),
        address: z.string().nullable().describe('Full physical business address including street, city, and postal code if available.'),
      });
      
      const contactText = extractTextContent(html).substring(0, 4000);
      
      const contactResult = await generateStructuredResponse({
        system: 'You are an expert at finding contact information in web pages. Extract emails, phone numbers, and addresses. Be thorough and check the entire content.',
        prompt: `Find contact information in this page content from ${url}:

${contactText}

CRITICAL: Only extract information that ACTUALLY EXISTS in the text above. Do NOT invent or guess any data.

INSTRUCTIONS:
1. Look for email addresses - check for mailto: links, text with @ symbol, contact forms
2. Look for phone numbers - check for tel: links, numbers with area codes, mobile patterns
3. Look for physical addresses - street names, city names, postal codes

Return the PRIMARY business contact info (prefer info@, contact@, office@ for email).
For phone, return ONLY digits (no formatting).
If you cannot find an email/phone/address in the text, return null - DO NOT GUESS.`,
        schema: contactSchema,
        temperature: 0.1,
      });
      
      console.log('[ContactFallback] AI contact extraction result:', contactResult);
      
      // IMPORTANT: Validate that AI-extracted data actually exists in the HTML to prevent hallucination
      if (stillNeedsEmail && contactResult.email) {
        const validatedEmail = validateEmail(contactResult.email);
        // Check if this email actually exists in the HTML (case-insensitive)
        if (validatedEmail && html.toLowerCase().includes(validatedEmail.toLowerCase())) {
          result.email = validatedEmail;
          console.log('[ContactFallback] AI email validated in HTML:', result.email);
        } else {
          console.log('[ContactFallback] AI email NOT found in HTML, discarding:', contactResult.email);
        }
      }
      if (stillNeedsPhone && contactResult.phone) {
        const normalizedPhone = normalizePhoneNumber(contactResult.phone);
        // Check if at least part of the phone number exists in HTML
        if (normalizedPhone && html.includes(normalizedPhone.substring(0, 7))) {
          result.phone = normalizedPhone;
          console.log('[ContactFallback] AI phone validated in HTML:', result.phone);
        } else {
          console.log('[ContactFallback] AI phone NOT found in HTML, discarding:', contactResult.phone);
        }
      }
      if (stillNeedsAddress && contactResult.address) {
        result.address = contactResult.address?.trim() || null;
      }
    } catch (error) {
      console.log('[ContactFallback] AI contact extraction failed:', error.message);
    }
  }
  
  console.log('[ContactFallback] Final result:', result);
  return result;
}

/**
 * Detect the primary language of the text content
 * 
 * @param {string} text - Text content to analyze
 * @returns {string} Language code (e.g., 'he', 'en', 'ar')
 */
function detectPrimaryLanguage(text) {
  if (!text) return 'en';
  
  // Count characters in different scripts
  const hebrewChars = (text.match(/[\u0590-\u05FF]/g) || []).length;
  const arabicChars = (text.match(/[\u0600-\u06FF]/g) || []).length;
  const cyrillicChars = (text.match(/[\u0400-\u04FF]/g) || []).length;
  const chineseChars = (text.match(/[\u4E00-\u9FFF]/g) || []).length;
  const japaneseChars = (text.match(/[\u3040-\u30FF]/g) || []).length;
  const latinChars = (text.match(/[a-zA-Z]/g) || []).length;
  
  const counts = [
    { lang: 'he', count: hebrewChars },
    { lang: 'ar', count: arabicChars },
    { lang: 'ru', count: cyrillicChars },
    { lang: 'zh', count: chineseChars },
    { lang: 'ja', count: japaneseChars },
    { lang: 'en', count: latinChars },
  ];
  
  // Find the language with the most characters
  const dominant = counts.reduce((max, curr) => curr.count > max.count ? curr : max, { lang: 'en', count: 0 });
  
  return dominant.lang;
}

/**
 * Get a human-readable language instruction for the AI
 * 
 * @param {string} langCode - Language code
 * @returns {string} Language instruction
 */
function getLanguageInstruction(langCode) {
  const languageNames = {
    'he': 'Hebrew (עברית)',
    'en': 'English',
    'ar': 'Arabic (العربية)',
    'ru': 'Russian (Русский)',
    'es': 'Spanish (Español)',
    'fr': 'French (Français)',
    'de': 'German (Deutsch)',
    'pt': 'Portuguese (Português)',
    'it': 'Italian (Italiano)',
    'zh': 'Chinese (中文)',
    'ja': 'Japanese (日本語)',
  };
  
  return languageNames[langCode] || 'the same language as the website content';
}

/**
 * Extract fallback business data without AI
 * Used when AI is unavailable
 * 
 * @param {string} html - Homepage HTML
 * @param {Object} basicPageData - Basic extracted page data
 * @param {string} detectedLang - Detected language code
 * @returns {Object} Fallback business data
 */
function extractFallbackBusinessData(html, basicPageData, detectedLang = 'en') {
  // Try to extract a clean business name from title
  const businessName = extractBusinessNameFromTitle(basicPageData?.title);
  
  // Extract phone numbers and normalize the first one
  const phones = extractPhonesFromHtml(html);
  const phone = phones.length > 0 ? normalizePhoneNumber(phones[0]) : null;
  
  // Extract emails and validate the first one
  const emails = extractEmailsFromHtml(html);
  const email = emails.length > 0 ? validateEmail(emails[0]) : null;
  
  return {
    businessName: businessName,
    description: basicPageData?.description || null,
    category: null,
    detectedLanguage: detectedLang,
    address: extractAddressFromHtml(html),
    phone: phone,
    email: email,
    servicesOrProducts: [],
    targetAudience: null,
  };
}

/**
 * Try to extract a clean business name from a page title
 * 
 * @param {string} title - Page title
 * @returns {string|null} Extracted business name or null
 */
function extractBusinessNameFromTitle(title) {
  if (!title) return null;
  
  // Common patterns to clean up:
  // "Home | Business Name" -> "Business Name"
  // "Business Name - Home" -> "Business Name"
  // "Welcome to Business Name" -> "Business Name"
  // "חברה לבניית אתרים | Red Ghost" -> "Red Ghost"
  
  let cleaned = title;
  
  // Split by common separators and try to find the business name part
  const separators = [' | ', ' - ', ' – ', ' — ', ' :: ', ' // '];
  for (const sep of separators) {
    if (cleaned.includes(sep)) {
      const parts = cleaned.split(sep);
      // Filter out common generic parts
      const filtered = parts.filter(p => {
        const lower = p.toLowerCase().trim();
        const hebrewGeneric = ['דף הבית', 'בית', 'ברוכים הבאים', 'אודות'];
        return !['home', 'homepage', 'welcome', 'official site', 'official website', 'main', 'about', 'contact'].includes(lower)
          && !hebrewGeneric.includes(lower);
      });
      
      // Usually the shortest non-generic part is the business name
      if (filtered.length > 0) {
        // Prefer shorter parts (likely to be just the name)
        filtered.sort((a, b) => a.length - b.length);
        cleaned = filtered[0].trim();
        break;
      }
    }
  }
  
  // Remove common prefixes
  cleaned = cleaned
    .replace(/^welcome to\s+/i, '')
    .replace(/^the\s+/i, '')
    .replace(/^ברוכים הבאים ל/i, '')
    .trim();
  
  return cleaned || null;
}

/**
 * Extract phone numbers from HTML
 */
function extractPhonesFromHtml(html) {
  const text = extractTextContent(html);
  const phoneRegex = /(?:\+?[0-9]{1,3}[-.\s]?)?\(?[0-9]{2,4}\)?[-.\s]?[0-9]{2,4}[-.\s]?[0-9]{2,4}/g;
  const matches = text.match(phoneRegex);
  if (!matches) return [];
  
  return [...new Set(matches.filter(p => {
    const digits = p.replace(/\D/g, '');
    return digits.length >= 9 && digits.length <= 15;
  }))].slice(0, 5);
}

/**
 * Extract emails from HTML
 * Looks for mailto: links first, then falls back to regex patterns
 */
function extractEmailsFromHtml(html) {
  const emails = new Set();
  
  // Strategy 1: Look for mailto: links (most reliable)
  const mailtoRegex = /mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi;
  let match;
  while ((match = mailtoRegex.exec(html)) !== null) {
    emails.add(match[1].toLowerCase());
  }
  
  // Strategy 2: Look for href="mailto:..." pattern
  const hrefMailtoRegex = /href=["']mailto:([^"'?]+)/gi;
  while ((match = hrefMailtoRegex.exec(html)) !== null) {
    const email = match[1].trim().toLowerCase();
    if (email.includes('@')) {
      emails.add(email);
    }
  }
  
  // Strategy 3: Text content email pattern
  const text = extractTextContent(html);
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const textMatches = text.match(emailRegex);
  if (textMatches) {
    textMatches.forEach(e => emails.add(e.toLowerCase()));
  }
  
  return [...emails].slice(0, 5);
}

/**
 * Try to extract an address from HTML
 * Uses multiple strategies: city names, address patterns, structured data
 */
function extractAddressFromHtml(html) {
  const text = extractTextContent(html);
  
  // Strategy 1: Look for common address patterns in Hebrew and English
  
  // Israeli city names
  const israeliCities = [
    'תל אביב', 'תל-אביב', 'ירושלים', 'חיפה', 'באר שבע', 'נתניה', 'אשדוד', 'רמת גן', 
    'פתח תקווה', 'חולון', 'בני ברק', 'ראשון לציון', 'הרצליה', 'רעננה', 'כפר סבא', 
    'מודיעין', 'אילת', 'עכו', 'נהריה', 'טבריה', 'צפת', 'אשקלון', 'רחובות', 'לוד',
    'רמלה', 'נצרת', 'קריית גת', 'קריית שמונה', 'עפולה', 'יבנה', 'הוד השרון'
  ];
  
  // English city names and common address indicators
  const englishPatterns = [
    'Tel Aviv', 'Jerusalem', 'Haifa', 'Street', 'St.', 'Avenue', 'Ave.', 
    'Road', 'Rd.', 'Boulevard', 'Blvd.', 'Floor', 'Suite', 'Building'
  ];
  
  // Hebrew street indicators
  const hebrewStreetIndicators = ['רחוב', 'רח\'', 'שד\'', 'שדרות', 'דרך', 'קומה', 'בניין'];
  
  // Strategy 2: Look for structured address (street + number + city)
  // Pattern: "רחוב X מספר Y, עיר Z" or similar
  const hebrewAddressPattern = /(?:רחוב|רח'|שד'|שדרות|דרך)\s*[א-ת\s]+\s*\d+(?:\s*,?\s*(?:קומה|דירה|בניין)?\s*\d*)?\s*,?\s*[א-ת\s-]+/g;
  const hebrewMatches = text.match(hebrewAddressPattern);
  if (hebrewMatches && hebrewMatches.length > 0) {
    const cleaned = hebrewMatches[0].replace(/\s+/g, ' ').trim();
    if (cleaned.length > 10 && cleaned.length < 150) {
      return cleaned;
    }
  }
  
  // Strategy 3: English address pattern
  const englishAddressPattern = /\d+\s+[A-Za-z\s]+(?:Street|St\.?|Avenue|Ave\.?|Road|Rd\.?|Boulevard|Blvd\.?)[,\s]+[A-Za-z\s]+(?:,\s*[A-Za-z\s]+)?/gi;
  const englishMatches = text.match(englishAddressPattern);
  if (englishMatches && englishMatches.length > 0) {
    const cleaned = englishMatches[0].replace(/\s+/g, ' ').trim();
    if (cleaned.length > 10 && cleaned.length < 150) {
      return cleaned;
    }
  }
  
  // Strategy 4: Fall back to city name search
  for (const city of [...israeliCities, ...englishPatterns.filter(p => p.length > 5)]) {
    const cityIndex = text.indexOf(city);
    if (cityIndex !== -1) {
      // Try to extract surrounding text as address
      const start = Math.max(0, cityIndex - 60);
      const end = Math.min(text.length, cityIndex + city.length + 40);
      const potential = text.substring(start, end).trim();
      
      // Check if this looks like an address (has numbers or street indicators)
      const hasNumber = /\d/.test(potential);
      const hasStreetIndicator = hebrewStreetIndicators.some(s => potential.includes(s)) ||
                                 englishPatterns.some(p => potential.toLowerCase().includes(p.toLowerCase()));
      
      if (hasNumber || hasStreetIndicator) {
        const cleaned = potential.replace(/\s+/g, ' ').trim();
        if (cleaned.length > 10 && cleaned.length < 150) {
          return cleaned;
        }
      }
    }
  }
  
  return null;
}

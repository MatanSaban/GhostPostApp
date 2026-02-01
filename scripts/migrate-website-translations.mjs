/**
 * Migration script to import gp-ws translations into the database
 * 
 * This script:
 * 1. Reads the JSON files from gp-ws/i18n/dictionaries/
 * 2. Flattens nested keys (e.g., hero.title -> hero.title)
 * 3. Creates I18nKey records with application=WEBSITE
 * 4. Creates I18nTranslation records for each locale
 * 
 * Usage: node scripts/migrate-website-translations.mjs
 */

import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const prisma = new PrismaClient();

// Path to gp-ws dictionaries (relative to gp-platform)
const DICTIONARIES_PATH = path.join(__dirname, '../../gp-ws/i18n/dictionaries');

// Locales to import
const LOCALES = ['en', 'fr', 'he'];

// RTL locales
const RTL_LOCALES = ['he', 'ar'];

/**
 * Flatten a nested object into dot-notation keys
 * @param {object} obj - The object to flatten
 * @param {string} prefix - Current key prefix
 * @returns {object} - Flattened object with dot-notation keys
 */
function flattenObject(obj, prefix = '') {
  const result = {};
  
  for (const [key, value] of Object.entries(obj)) {
    const newKey = prefix ? `${prefix}.${key}` : key;
    
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      // Recursively flatten nested objects
      Object.assign(result, flattenObject(value, newKey));
    } else {
      // Store the value (including arrays as JSON strings)
      result[newKey] = Array.isArray(value) ? JSON.stringify(value) : String(value);
    }
  }
  
  return result;
}

/**
 * Extract namespace from a key (first segment)
 * e.g., "hero.title" -> "hero", "nav.home" -> "nav"
 */
function getNamespace(key) {
  return key.split('.')[0];
}

/**
 * Ensure languages exist in the database
 */
async function ensureLanguages() {
  console.log('📝 Ensuring languages exist...');
  
  for (const locale of LOCALES) {
    const existing = await prisma.i18nLanguage.findUnique({
      where: { locale }
    });
    
    if (!existing) {
      await prisma.i18nLanguage.create({
        data: {
          locale,
          name: locale === 'en' ? 'English' : locale === 'fr' ? 'French' : 'Hebrew',
          isRTL: RTL_LOCALES.includes(locale),
          fallback: locale !== 'en' ? ['en'] : []
        }
      });
      console.log(`  ✅ Created language: ${locale}`);
    } else {
      console.log(`  ⏭️ Language exists: ${locale}`);
    }
  }
}

/**
 * Load and flatten a dictionary file
 */
function loadDictionary(locale) {
  const filePath = path.join(DICTIONARIES_PATH, `${locale}.json`);
  
  if (!fs.existsSync(filePath)) {
    console.error(`  ❌ File not found: ${filePath}`);
    return null;
  }
  
  const content = fs.readFileSync(filePath, 'utf-8');
  const parsed = JSON.parse(content);
  return flattenObject(parsed);
}

/**
 * Main migration function
 */
async function migrate() {
  console.log('🚀 Starting gp-ws translations migration...\n');
  
  // Step 1: Ensure languages exist
  await ensureLanguages();
  
  // Step 2: Load all dictionaries
  console.log('\n📖 Loading dictionaries...');
  const dictionaries = {};
  
  for (const locale of LOCALES) {
    dictionaries[locale] = loadDictionary(locale);
    if (dictionaries[locale]) {
      const keyCount = Object.keys(dictionaries[locale]).length;
      console.log(`  ✅ Loaded ${locale}: ${keyCount} keys`);
    }
  }
  
  // Step 3: Get all unique keys from English (primary)
  const enDict = dictionaries['en'];
  if (!enDict) {
    throw new Error('English dictionary is required');
  }
  
  const allKeys = Object.keys(enDict);
  console.log(`\n📊 Total keys to migrate: ${allKeys.length}`);
  
  // Step 4: Get language IDs
  const languages = await prisma.i18nLanguage.findMany({
    where: { locale: { in: LOCALES } }
  });
  const langMap = Object.fromEntries(languages.map(l => [l.locale, l.id]));
  
  // Step 5: Check for existing WEBSITE keys to avoid duplicates
  const existingKeys = await prisma.i18nKey.findMany({
    where: { application: 'WEBSITE' },
    select: { key: true }
  });
  const existingKeySet = new Set(existingKeys.map(k => k.key));
  
  console.log(`  ⏭️ Existing WEBSITE keys: ${existingKeySet.size}`);
  
  // Step 6: Create keys and translations
  console.log('\n📝 Creating keys and translations...');
  
  let created = 0;
  let skipped = 0;
  let errors = 0;
  
  for (const key of allKeys) {
    // Skip if key already exists
    if (existingKeySet.has(key)) {
      skipped++;
      continue;
    }
    
    const namespace = getNamespace(key);
    
    try {
      // Create the key
      const i18nKey = await prisma.i18nKey.create({
        data: {
          key,
          namespace,
          application: 'WEBSITE',
          description: `Website translation: ${key}`
        }
      });
      
      // Create translations for each locale
      for (const locale of LOCALES) {
        const value = dictionaries[locale]?.[key];
        if (value !== undefined) {
          await prisma.i18nTranslation.create({
            data: {
              keyId: i18nKey.id,
              languageId: langMap[locale],
              key,
              namespace,
              application: 'WEBSITE',
              locale,
              value,
              status: 'APPROVED',
              version: 1,
              isLatest: true
            }
          });
        }
      }
      
      created++;
      
      // Progress indicator
      if (created % 50 === 0) {
        console.log(`  📦 Created ${created} keys...`);
      }
    } catch (error) {
      console.error(`  ❌ Error creating key "${key}":`, error.message);
      errors++;
    }
  }
  
  console.log('\n✅ Migration complete!');
  console.log(`  📦 Created: ${created}`);
  console.log(`  ⏭️ Skipped: ${skipped}`);
  console.log(`  ❌ Errors: ${errors}`);
}

// Run migration
migrate()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

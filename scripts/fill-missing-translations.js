/**
 * Script to fill missing translations in the database
 * Run with: node scripts/fill-missing-translations.js
 */

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

// Load JSON dictionaries
function loadDictionary(locale) {
  const filePath = path.join(__dirname, '..', 'i18n', 'dictionaries', `${locale}.json`);
  if (fs.existsSync(filePath)) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  }
  return null;
}

// Flatten nested object to dot notation keys
function flattenObject(obj, prefix = '') {
  const result = {};
  for (const key in obj) {
    const newKey = prefix ? `${prefix}.${key}` : key;
    if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
      Object.assign(result, flattenObject(obj[key], newKey));
    } else {
      result[newKey] = obj[key];
    }
  }
  return result;
}

async function main() {
  console.log('Loading dictionaries...');
  
  const enDict = loadDictionary('en');
  const heDict = loadDictionary('he');
  
  if (!enDict || !heDict) {
    console.error('Could not load dictionaries');
    process.exit(1);
  }
  
  const flatEn = flattenObject(enDict);
  const flatHe = flattenObject(heDict);
  
  console.log(`Loaded ${Object.keys(flatEn).length} English keys`);
  console.log(`Loaded ${Object.keys(flatHe).length} Hebrew keys`);
  
  // Get or create languages
  let enLang = await prisma.i18nLanguage.findUnique({ where: { locale: 'en' } });
  let heLang = await prisma.i18nLanguage.findUnique({ where: { locale: 'he' } });
  
  if (!enLang) {
    enLang = await prisma.i18nLanguage.create({
      data: { locale: 'en', name: 'English', isRTL: false }
    });
    console.log('Created English language');
  }
  
  if (!heLang) {
    heLang = await prisma.i18nLanguage.create({
      data: { locale: 'he', name: 'עברית', isRTL: true }
    });
    console.log('Created Hebrew language');
  }
  
  // Get all existing keys from DB
  const existingKeys = await prisma.i18nKey.findMany();
  const existingKeyMap = new Map(existingKeys.map(k => [k.key, k]));
  console.log(`Found ${existingKeys.length} existing keys in database`);
  
  // Get all existing translations
  const existingTranslations = await prisma.i18nTranslation.findMany({
    where: { isLatest: true }
  });
  
  // Create a set of existing translations (keyId + locale)
  const existingTransSet = new Set(
    existingTranslations.map(t => `${t.keyId}:${t.locale}`)
  );
  console.log(`Found ${existingTranslations.length} existing translations`);
  
  // Collect all unique keys from both dictionaries
  const allKeys = new Set([...Object.keys(flatEn), ...Object.keys(flatHe)]);
  console.log(`Total unique keys: ${allKeys.size}`);
  
  let keysCreated = 0;
  let translationsCreated = 0;
  let skipped = 0;
  
  for (const key of allKeys) {
    // Determine namespace from key (first part before first dot)
    const namespace = key.includes('.') ? key.split('.')[0] : 'common';
    
    // Get or create the key
    let keyRecord = existingKeyMap.get(key);
    if (!keyRecord) {
      keyRecord = await prisma.i18nKey.create({
        data: { key, namespace }
      });
      existingKeyMap.set(key, keyRecord);
      keysCreated++;
    }
    
    // Check if English translation exists
    const enValue = flatEn[key];
    if (enValue !== undefined && typeof enValue === 'string') {
      const enTransKey = `${keyRecord.id}:en`;
      if (!existingTransSet.has(enTransKey)) {
        await prisma.i18nTranslation.create({
          data: {
            keyId: keyRecord.id,
            languageId: enLang.id,
            key: key,
            namespace: namespace,
            locale: 'en',
            value: enValue,
            status: 'APPROVED',
            version: 1,
            isLatest: true
          }
        });
        existingTransSet.add(enTransKey);
        translationsCreated++;
      } else {
        skipped++;
      }
    }
    
    // Check if Hebrew translation exists
    const heValue = flatHe[key];
    if (heValue !== undefined && typeof heValue === 'string') {
      const heTransKey = `${keyRecord.id}:he`;
      if (!existingTransSet.has(heTransKey)) {
        await prisma.i18nTranslation.create({
          data: {
            keyId: keyRecord.id,
            languageId: heLang.id,
            key: key,
            namespace: namespace,
            locale: 'he',
            value: heValue,
            status: 'APPROVED',
            version: 1,
            isLatest: true
          }
        });
        existingTransSet.add(heTransKey);
        translationsCreated++;
      } else {
        skipped++;
      }
    }
  }
  
  console.log('\n=== Summary ===');
  console.log(`Keys created: ${keysCreated}`);
  console.log(`Translations created: ${translationsCreated}`);
  console.log(`Skipped (already exist): ${skipped}`);
  console.log('Done!');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
